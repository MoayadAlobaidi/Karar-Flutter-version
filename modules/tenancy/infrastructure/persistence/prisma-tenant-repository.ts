/**
 * PrismaTenantRepository — the TenantRepository port over the platform's
 * Prisma handle, inside withPrincipalContext. The 0041 policy exposes only
 * the row whose id equals the bound app.tenant_id; the 0081 member-arm
 * exposes only tenants the bound app.user_id actively belongs to. Explicit
 * id filters are Layer-2 convenience.
 */

import { TenantId } from '@karar/shared-kernel';
import { withPrincipalContext } from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type { AuthenticatedActor, PrincipalActor } from '../../application/principal.js';
import type {
  MemberTenantRepository,
  TenantRepository,
} from '../../application/ports/tenant-repository.js';
import { toTenant } from './row-mappers.js';
import type { Tenant } from '../../domain/tenancy.js';

export class PrismaTenantRepository implements TenantRepository, MemberTenantRepository {
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

  findForMember(actor: AuthenticatedActor, tenantId: TenantId): Promise<Tenant | null> {
    return withPrincipalContext(
      this.handle,
      {
        userId: actor.userId,
        ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
        ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
      },
      async (tx) => {
        const row = await tx.tenant.findFirst({ where: { id: TenantId.toString(tenantId) } });
        return row === null ? null : toTenant(row);
      },
      // Relaxation visible at the call site: tenant selection precedes any
      // tenant binding; the 0081 member-arm is the only thing admitting rows.
      { require: ['userId'] },
    );
  }
}
