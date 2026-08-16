/**
 * TenantRepository — read access to the caller's OWN tenant row. There is no
 * cross-tenant surface: the 0041 policy exposes exactly the row whose id
 * equals the transaction's bound app.tenant_id, and platform-admin
 * cross-tenant reads arrive with the control plane, not here.
 */

import type { PrincipalActor } from '../principal.js';
import type { Tenant } from '../../domain/tenancy.js';

export interface TenantRepository {
  /** The acting principal's tenant, or null when the bound tenant does not resolve. */
  findOwn(actor: PrincipalActor): Promise<Tenant | null>;
}
