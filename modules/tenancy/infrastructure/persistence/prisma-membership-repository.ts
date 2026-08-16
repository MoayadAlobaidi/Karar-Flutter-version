/**
 * PrismaMembershipRepository — the MembershipRepository port under
 * withPrincipalContext. RLS (0042) bounds every row to the transaction's
 * bound tenant; explicit filters are Layer-2 convenience.
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type { PrincipalActor } from '../../application/principal.js';
import type { MembershipRepository } from '../../application/ports/membership-repository.js';
import { toMembership } from './row-mappers.js';
import type { TenantMembership } from '../../domain/tenancy.js';

export class PrismaMembershipRepository implements MembershipRepository {
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
}
