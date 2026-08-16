/**
 * MembershipRepository — memberships inside the caller's own tenant.
 * Implementations run under `withPrincipalContext`; RLS (0042) is the
 * boundary and the AZ2 lesson applies: the own-tenant roster must come back
 * NON-EMPTY for a legitimate member — adversarial tests assert the non-empty
 * case before any denial.
 */

import type { PrincipalActor } from '../principal.js';
import type { TenantMembership } from '../../domain/tenancy.js';

export interface MembershipRepository {
  /** The acting principal's own membership row, or null. */
  findOwn(actor: PrincipalActor): Promise<TenantMembership | null>;

  /** All memberships of the acting principal's tenant, oldest first. */
  listForTenant(actor: PrincipalActor): Promise<TenantMembership[]>;
}
