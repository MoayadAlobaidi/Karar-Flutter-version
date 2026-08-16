/**
 * PrismaUserProfileRepository — the UserProfileRepository port over the
 * platform's Prisma handle. Every method runs inside ONE
 * `withPrincipalContext` transaction: the GUCs bound there are what the 0040
 * RLS policies read, and THAT is the isolation boundary. The explicit
 * `tenantId`/`userId` filters below are Layer-2 convenience that catches
 * honest mistakes early (tenancy.md §2) — remove them all and cross-tenant
 * access would still be denied by policy.
 *
 * Prisma types stay inside infrastructure/persistence (architecture test 4);
 * rows are mapped to domain shapes before they leave.
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { uuidv7 } from './uuidv7.js';
import type { PrincipalActor } from '../../application/principal.js';
import {
  ProfileStoreError,
  type CreateOwnProfileInput,
  type OwnProfileFieldChanges,
  type OwnStatusTransition,
  type StatusTransitionOutcome,
  type UserProfileRepository,
} from '../../application/ports/user-profile-repository.js';
import {
  USER_STATUSES,
  type UserProfile,
  type UserStatus,
  type UserStatusChange,
} from '../../domain/user-profile.js';

interface ProfileRow {
  userId: string;
  tenantId: string;
  displayName: string;
  locale: string;
  status: string;
  residencyJurisdictionRef: string | null;
  contractingOperatingEntityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface HistoryRow {
  id: string;
  userId: string;
  tenantId: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  actor: string;
  occurredAt: Date;
}

function toStatus(value: string): UserStatus {
  if (!(USER_STATUSES as readonly string[]).includes(value)) {
    throw new ProfileStoreError(`user_profiles.status holds unknown value '${value}'`);
  }
  return value as UserStatus;
}

function toProfile(row: ProfileRow): UserProfile {
  return Object.freeze({
    userId: UserId.of(row.userId),
    tenantId: TenantId.of(row.tenantId),
    displayName: row.displayName,
    locale: row.locale,
    status: toStatus(row.status),
    residencyJurisdictionRef: row.residencyJurisdictionRef,
    contractingOperatingEntityId: row.contractingOperatingEntityId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toChange(row: HistoryRow): UserStatusChange {
  return Object.freeze({
    id: row.id,
    userId: UserId.of(row.userId),
    tenantId: TenantId.of(row.tenantId),
    fromStatus: toStatus(row.fromStatus),
    toStatus: toStatus(row.toStatus),
    reason: row.reason,
    actor: row.actor,
    occurredAt: row.occurredAt,
  });
}

export class PrismaUserProfileRepository implements UserProfileRepository {
  constructor(private readonly handle: PrismaHandle) {}

  private inContext<T>(
    actor: PrincipalActor,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    // Fails closed (typed error, before any query) when the principal is
    // incomplete — the second layer of the deny; the use case checked first.
    return withPrincipalContext(
      this.handle,
      {
        tenantId: actor.tenantId,
        userId: actor.userId,
        ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
        ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
      },
      fn,
      { require: ['tenantId', 'userId'] },
    );
  }

  findOwn(actor: PrincipalActor): Promise<UserProfile | null> {
    return this.inContext(actor, async (tx) => {
      const row = await tx.userProfile.findFirst({
        where: { userId: UserId.toString(actor.userId), tenantId: TenantId.toString(actor.tenantId) },
      });
      return row === null ? null : toProfile(row);
    });
  }

  createOwn(actor: PrincipalActor, input: CreateOwnProfileInput): Promise<UserProfile> {
    return this.inContext(actor, async (tx) => {
      const row = await tx.userProfile.create({
        data: {
          userId: UserId.toString(actor.userId),
          tenantId: TenantId.toString(actor.tenantId),
          displayName: input.displayName,
          locale: input.locale,
          status: 'ACTIVE',
          createdAt: input.occurredAt,
          updatedAt: input.occurredAt,
        },
      });
      return toProfile(row);
    });
  }

  updateOwnFields(
    actor: PrincipalActor,
    changes: OwnProfileFieldChanges,
  ): Promise<UserProfile | null> {
    return this.inContext(actor, async (tx) => {
      const where = {
        userId: UserId.toString(actor.userId),
        tenantId: TenantId.toString(actor.tenantId),
      };
      const updated = await tx.userProfile.updateMany({
        where,
        data: {
          ...(changes.displayName !== undefined ? { displayName: changes.displayName } : {}),
          ...(changes.locale !== undefined ? { locale: changes.locale } : {}),
          updatedAt: changes.occurredAt,
        },
      });
      if (updated.count === 0) {
        return null;
      }
      const row = await tx.userProfile.findFirst({ where });
      return row === null ? null : toProfile(row);
    });
  }

  transitionOwnStatus(
    actor: PrincipalActor,
    transition: OwnStatusTransition,
  ): Promise<StatusTransitionOutcome | null> {
    return this.inContext(actor, async (tx) => {
      const where = {
        userId: UserId.toString(actor.userId),
        tenantId: TenantId.toString(actor.tenantId),
      };
      // Conditional on the expected source status: a lost race updates zero
      // rows and the caller learns the truth instead of double-writing.
      const updated = await tx.userProfile.updateMany({
        where: { ...where, status: transition.expectedFrom },
        data: { status: transition.toStatus, updatedAt: transition.occurredAt },
      });
      if (updated.count === 0) {
        return null;
      }
      const historyRow = await tx.userStatusHistory.create({
        data: {
          id: uuidv7(),
          userId: where.userId,
          tenantId: where.tenantId,
          fromStatus: transition.expectedFrom,
          toStatus: transition.toStatus,
          reason: transition.reason,
          actor: `user:${where.userId}`,
          occurredAt: transition.occurredAt,
        },
      });
      const row = await tx.userProfile.findFirst({ where });
      if (row === null) {
        throw new ProfileStoreError('profile vanished inside its own status transition');
      }
      return { profile: toProfile(row), change: toChange(historyRow) };
    });
  }

  listOwnStatusHistory(actor: PrincipalActor): Promise<UserStatusChange[]> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.userStatusHistory.findMany({
        where: {
          userId: UserId.toString(actor.userId),
          tenantId: TenantId.toString(actor.tenantId),
        },
        orderBy: { occurredAt: 'asc' },
      });
      return rows.map(toChange);
    });
  }
}
