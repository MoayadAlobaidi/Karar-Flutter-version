/**
 * PrismaMembershipRepository — the MembershipRepository port under
 * withPrincipalContext. RLS (0042 + the 0080 self-arm) bounds every row to
 * the transaction's bound principal; explicit filters are Layer-2
 * convenience. Self-scoped reads bind app.user_id ONLY — deliberately no
 * tenant context exists before binding, and the 0080 arm exposes exactly the
 * caller's own rows.
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type { AuthenticatedActor, PrincipalActor } from '../../application/principal.js';
import type {
  MembershipRepository,
  OwnMembershipRepository,
} from '../../application/ports/membership-repository.js';
import { toMembership } from './row-mappers.js';
import type { TenantMembership } from '../../domain/tenancy.js';
import { uuidv7 } from './uuidv7.js';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

export class PrismaMembershipRepository implements MembershipRepository, OwnMembershipRepository {
  constructor(private readonly handle: PrismaHandle) {}

  private inContext<T>(
    actor: PrincipalActor,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
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

  private inSelfContext<T>(
    actor: AuthenticatedActor,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      {
        userId: actor.userId,
        ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
        ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
      },
      fn,
      // Relaxation is visible at the call site: pre-binding reads carry no
      // tenant, and the 0080 self-arm is the only thing that admits rows.
      { require: ['userId'] },
    );
  }

  findOwn(actor: PrincipalActor): Promise<TenantMembership | null> {
    return this.inContext(actor, async (tx) => {
      const row = await tx.tenantMember.findFirst({
        where: {
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
      });
      return row === null ? null : toMembership(row);
    });
  }

  listForTenant(actor: PrincipalActor): Promise<TenantMembership[]> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.tenantMember.findMany({
        where: { tenantId: TenantId.toString(actor.tenantId) },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toMembership);
    });
  }

  listOwnAcrossTenants(actor: AuthenticatedActor): Promise<TenantMembership[]> {
    return this.inSelfContext(actor, async (tx) => {
      const rows = await tx.tenantMember.findMany({
        where: { userId: UserId.toString(actor.userId) },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toMembership);
    });
  }

  findOwnInTenant(actor: AuthenticatedActor, tenantId: TenantId): Promise<TenantMembership | null> {
    return this.inSelfContext(actor, async (tx) => {
      const row = await tx.tenantMember.findFirst({
        where: {
          tenantId: TenantId.toString(tenantId),
          userId: UserId.toString(actor.userId),
        },
      });
      return row === null ? null : toMembership(row);
    });
  }

  createOwnMembership(input: {
    readonly userId: UserId;
    readonly tenantId: TenantId;
    readonly roleHint: string;
    readonly occurredAt: Date;
    readonly sessionId?: string;
    readonly requestId?: string;
  }): Promise<
    | { readonly kind: 'created'; readonly membership: TenantMembership }
    | { readonly kind: 'already_member'; readonly membership: TenantMembership | null }
  > {
    // FULL principal context: the 0042 INSERT policy requires BOTH arms
    // (tenant scope AND user_id = app.user_id), so the database itself
    // refuses a row for anyone but the acting principal — the same
    // guarantee invitation redemption relies on.
    return this.inContext(
      {
        tenantId: input.tenantId,
        userId: input.userId,
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      },
      async (tx) => {
        const tenantId = TenantId.toString(input.tenantId);
        const userId = UserId.toString(input.userId);
        const existing = await tx.tenantMember.findFirst({ where: { tenantId, userId } });
        if (existing !== null) {
          return { kind: 'already_member' as const, membership: toMembership(existing) };
        }
        try {
          const row = await tx.tenantMember.create({
            data: {
              id: uuidv7(),
              tenantId,
              userId,
              roleHint: input.roleHint,
              state: 'ACTIVE',
              effectiveFrom: input.occurredAt,
              createdAt: input.occurredAt,
              updatedAt: input.occurredAt,
            },
          });
          return { kind: 'created' as const, membership: toMembership(row) };
        } catch (error) {
          if (isUniqueViolation(error)) {
            // Lost a concurrent-enrolment race: idempotent outcome.
            const raced = await tx.tenantMember.findFirst({ where: { tenantId, userId } });
            return {
              kind: 'already_member' as const,
              membership: raced === null ? null : toMembership(raced),
            };
          }
          throw error;
        }
      },
    );
  }
}
