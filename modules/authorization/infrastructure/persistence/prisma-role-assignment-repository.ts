/**
 * PrismaRoleAssignmentRepository — the RoleAssignmentRepository port under
 * withPrincipalContext. RLS (0052) bounds every row to the transaction's
 * bound principal; explicit filters are Layer-2 convenience.
 *
 * Contexts, per the port's contract:
 * - reads bind the CALLER (self-read arms);
 * - writes bind the TARGET (privileged-write pattern; the use case already
 *   authorized the actor under the actor's own context). `require` is
 *   ['userId'] — tenantId is bound when the assignment is tenant-scoped and
 *   deliberately empty for platform-scoped work; the relaxation is visible
 *   here, at the call site (principal-context.ts).
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type { PolicyActor } from '../../application/actor.js';
import {
  RoleAssignmentConflictError,
  type RoleAssignmentGrant,
  type RoleAssignmentRepository,
  type RoleAssignmentRevocation,
  type WriteContext,
} from '../../application/ports/role-assignment-repository.js';
import type { RoleAssignment } from '../../domain/role-assignment.js';
import { toRoleAssignment } from './row-mappers.js';
import { uuidv7 } from './uuidv7.js';

function isUniqueViolation(error: unknown): boolean {
  // Prisma surfaces PostgreSQL 23505 as P2002; matched structurally so the
  // Prisma error class never leaves infrastructure (architecture test 4).
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export class PrismaRoleAssignmentRepository implements RoleAssignmentRepository {
  constructor(private readonly handle: PrismaHandle) {}

  private inContext<T>(
    principal: {
      userId: UserId;
      tenantId?: TenantId;
      sessionId?: string;
      requestId?: string;
    },
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(this.handle, principal, fn, { require: ['userId'] });
  }

  listOwnActive(actor: PolicyActor, at: Date): Promise<RoleAssignment[]> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.roleAssignment.findMany({
        where: {
          userId: UserId.toString(actor.userId),
          status: 'ACTIVE',
          revokedAt: null,
          effectiveFrom: { lte: at },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
        },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toRoleAssignment);
    });
  }

  async create(grant: RoleAssignmentGrant, context: WriteContext): Promise<RoleAssignment> {
    try {
      return await this.inContext(
        {
          userId: grant.userId,
          ...(grant.tenantId !== null ? { tenantId: grant.tenantId } : {}),
          ...(context.sessionId !== undefined ? { sessionId: context.sessionId } : {}),
          ...(context.requestId !== undefined ? { requestId: context.requestId } : {}),
        },
        async (tx) => {
          const row = await tx.roleAssignment.create({
            data: {
              id: uuidv7(),
              userId: UserId.toString(grant.userId),
              roleId: grant.roleId,
              tenantId: grant.tenantId === null ? null : TenantId.toString(grant.tenantId),
              status: 'ACTIVE',
              grantedBy: UserId.toString(grant.grantedBy),
              reason: grant.reason,
              effectiveFrom: grant.effectiveFrom,
            },
          });
          return toRoleAssignment(row);
        },
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RoleAssignmentConflictError(
          `an ACTIVE assignment of '${grant.roleId}' for this principal and scope already exists`,
        );
      }
      throw error;
    }
  }

  revokeActive(
    revocation: RoleAssignmentRevocation,
    context: WriteContext,
  ): Promise<RoleAssignment | null> {
    return this.inContext(
      {
        userId: revocation.userId,
        ...(revocation.tenantId !== null ? { tenantId: revocation.tenantId } : {}),
        ...(context.sessionId !== undefined ? { sessionId: context.sessionId } : {}),
        ...(context.requestId !== undefined ? { requestId: context.requestId } : {}),
      },
      async (tx) => {
        const active = await tx.roleAssignment.findFirst({
          where: {
            userId: UserId.toString(revocation.userId),
            roleId: revocation.roleId,
            tenantId: revocation.tenantId === null ? null : TenantId.toString(revocation.tenantId),
            status: 'ACTIVE',
          },
        });
        if (active === null) {
          return null;
        }
        // Conditional on status so a concurrent revoke loses cleanly (0 rows)
        // instead of tripping the immutability trigger.
        const updated = await tx.roleAssignment.updateMany({
          where: { id: active.id, status: 'ACTIVE' },
          data: {
            status: 'REVOKED',
            revokedAt: revocation.revokedAt,
            revokedBy: UserId.toString(revocation.revokedBy),
            effectiveTo: revocation.revokedAt,
          },
        });
        if (updated.count === 0) {
          return null;
        }
        const row = await tx.roleAssignment.findUnique({ where: { id: active.id } });
        return row === null ? null : toRoleAssignment(row);
      },
    );
  }
}
