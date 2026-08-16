/**
 * PrismaTenantRepository — the TenantRepository port over the platform's
 * Prisma handle, inside withPrincipalContext. The 0041 policy exposes only
 * the row whose id equals the bound app.tenant_id; the explicit id filter is
 * Layer-2 convenience.
 */

import { TenantId } from '@karar/shared-kernel';
import { withPrincipalContext } from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type { PrincipalActor } from '../../application/principal.js';
import type { TenantRepository } from '../../application/ports/tenant-repository.js';
import { toTenant } from './row-mappers.js';
import type { Tenant } from '../../domain/tenancy.js';

export class PrismaTenantRepository implements TenantRepository {
  constructor(private readonly handle: PrismaHandle) {}

  findOwn(actor: PrincipalActor): Promise<Tenant | null> {
    return withPrincipalContext(
      this.handle,
      {
        tenantId: actor.tenantId,
        userId: actor.userId,
        ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
        ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
      },
      async (tx) => {
        const row = await tx.tenant.findFirst({
          where: { id: TenantId.toString(actor.tenantId) },
        });
        return row === null ? null : toTenant(row);
      },
      { require: ['tenantId', 'userId'] },
    );
  }
}
