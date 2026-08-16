/**
 * TenantRepository — read access to the caller's OWN tenant row, plus the
 * Phase 3.5 member-scoped read for tenant selection. There is no
 * cross-tenant surface: the 0041 policy exposes exactly the row whose id
 * equals the transaction's bound app.tenant_id, the 0081 member-arm exposes
 * exactly the tenants the caller holds an ACTIVE membership in, and
 * platform-admin cross-tenant reads arrive with the control plane, not here.
 */

import type { TenantId } from '@karar/shared-kernel';

import type { AuthenticatedActor, PrincipalActor } from '../principal.js';
import type { Tenant } from '../../domain/tenancy.js';

export interface TenantRepository {
  /** The acting principal's tenant, or null when the bound tenant does not resolve. */
  findOwn(actor: PrincipalActor): Promise<Tenant | null>;
}

/**
 * The member-scoped read, a SEPARATE port on purpose: tenant selection needs
 * exactly this one operation, and existing TenantRepository consumers stay
 * untouched.
 */
export interface MemberTenantRepository {
  /**
   * SELF scope (0081 arm, app.user_id only): one tenant the acting principal
   * actively belongs to, or null — an arbitrary/foreign tenant id resolves
   * to null, never to a row.
   */
  findForMember(actor: AuthenticatedActor, tenantId: TenantId): Promise<Tenant | null>;
}
