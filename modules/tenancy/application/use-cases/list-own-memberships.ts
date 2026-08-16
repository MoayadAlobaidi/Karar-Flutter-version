/**
 * ListOwnMemberships — the authenticated (possibly still tenantless)
 * principal lists their OWN active memberships across tenants. Reads through
 * the 0080 self-arm with only app.user_id bound: RLS exposes exactly the
 * caller's rows, and the AZ2 lesson applies — the adversarial suite asserts
 * the caller's non-empty list FIRST, then other-user invisibility.
 *
 * "Active" is decided here, in one place: state ACTIVE and inside the
 * effective window at the evaluation instant. Never fabricates membership —
 * the DB rows are the only source.
 */

import { Result } from '@karar/shared-kernel';

import { requireAuthenticated, type AuthenticatedActor } from '../principal.js';
import type { ListOwnMembershipsError } from '../errors.js';
import type { OwnMembershipRepository } from '../ports/membership-repository.js';
import type { TenantMembership } from '../../domain/tenancy.js';

export function membershipActiveAt(membership: TenantMembership, at: Date): boolean {
  if (membership.state !== 'ACTIVE') return false;
  if (membership.effectiveFrom.getTime() > at.getTime()) return false;
  if (membership.effectiveTo !== null && membership.effectiveTo.getTime() <= at.getTime()) {
    return false;
  }
  return true;
}

export class ListOwnMemberships {
  constructor(
    private readonly memberships: OwnMembershipRepository,
    private readonly clock: { now(): Date },
  ) {}

  async execute(
    actor: AuthenticatedActor,
  ): Promise<Result<readonly TenantMembership[], ListOwnMembershipsError>> {
    const authenticated = requireAuthenticated(actor);
    if (!authenticated.ok) {
      return authenticated;
    }
    try {
      const now = this.clock.now();
      const rows = await this.memberships.listOwnAcrossTenants(authenticated.value);
      return Result.ok(rows.filter((membership) => membershipActiveAt(membership, now)));
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `own-membership read failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
