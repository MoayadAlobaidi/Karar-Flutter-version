/**
 * ListMembers — the tenant roster, for the caller's own tenant only.
 *
 * Layer order (tenancy.md §2): (1) the caller must hold an ACTIVE membership
 * in the bound tenant — membership state is server-side truth, not a claim;
 * (2) PolicyService must allow `tenancy.member.read` — deny-by-default,
 * role_hint is never consulted; (3) the repository lists under
 * withPrincipalContext, where RLS bounds rows to the caller's tenant no
 * matter what the code above decided.
 *
 * The AZ2 lesson: for an authorized member this returns the NON-EMPTY roster
 * of their own tenant; the adversarial suite asserts that before any denial.
 */

import { Result } from '@karar/shared-kernel';

import { requirePrincipal, type PrincipalActor } from '../principal.js';
import type { ListMembersError } from '../errors.js';
import type { MembershipRepository } from '../ports/membership-repository.js';
import type { PolicyService } from '../ports/policy-service.js';
import type { TenantMembership } from '../../domain/tenancy.js';

export class ListMembers {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly policy: PolicyService,
  ) {}

  async execute(actor: PrincipalActor): Promise<Result<TenantMembership[], ListMembersError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) {
      return principal;
    }
    try {
      const own = await this.memberships.findOwn(principal.value);
      if (own === null || own.state !== 'ACTIVE') {
        return Result.err({
          kind: 'membership_not_found',
          message: 'listing members requires an active membership in the bound tenant',
        });
      }
      const decision = await this.policy.authorize(
        { tenantId: principal.value.tenantId, userId: principal.value.userId },
        'tenancy.member.read',
      );
      if (!decision.allowed) {
        return Result.err({
          kind: 'not_authorized',
          permission: 'tenancy.member.read',
          message: decision.reason,
        });
      }
      return Result.ok(await this.memberships.listForTenant(principal.value));
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `member list failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
