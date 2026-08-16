/**
 * MembershipRepository — memberships inside the caller's own tenant, plus the
 * Phase 3.5 SELF-scoped reads (tenant selection precedes binding).
 * Implementations run under `withPrincipalContext`; RLS (0042 + the 0080
 * self-arm) is the boundary and the AZ2 lesson applies: the own-tenant roster
 * and the own-membership list must come back NON-EMPTY for a legitimate
 * member — adversarial tests assert the non-empty case before any denial.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type { AuthenticatedActor, PrincipalActor } from '../principal.js';
import type { TenantMembership } from '../../domain/tenancy.js';

export interface MembershipRepository {
  /** The acting principal's own membership row, or null. */
  findOwn(actor: PrincipalActor): Promise<TenantMembership | null>;

  /** All memberships of the acting principal's tenant, oldest first. */
  listForTenant(actor: PrincipalActor): Promise<TenantMembership[]>;
}

/**
 * The SELF-scoped surface, a SEPARATE port on purpose: the Phase 3.5
 * binding/selection use cases need exactly these three operations and
 * nothing of the tenant-roster surface, and existing consumers of
 * MembershipRepository stay untouched.
 */
export interface OwnMembershipRepository {
  /**
   * SELF scope (0080 arm, app.user_id only): every membership row belonging
   * to the acting principal, across tenants, oldest first. State filtering
   * is the use case's business; the DB truth is what comes back.
   */
  listOwnAcrossTenants(actor: AuthenticatedActor): Promise<TenantMembership[]>;

  /**
   * SELF scope: the acting principal's own membership row in ONE tenant, or
   * null. The 0080 arm exposes only the caller's own rows, so an arbitrary
   * tenant id resolves to null rather than to someone else's row.
   */
  findOwnInTenant(actor: AuthenticatedActor, tenantId: TenantId): Promise<TenantMembership | null>;

  /**
   * First-party enrolment (§35 mechanism): INSERT the caller's own ACTIVE
   * membership row into the given tenant, under the FULL principal context
   * (tenantId + userId — the 0042 INSERT policy binds the row to the
   * authenticated principal at the RLS layer, exactly like redemption).
   * 'already_member' on the UNIQUE(tenant_id, user_id) collision.
   */
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
  >;
}
