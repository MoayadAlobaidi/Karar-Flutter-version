/**
 * ResolveTenantContext — from the authenticated principal's ACTIVE
 * memberships to a binding decision:
 *
 *   0 usable memberships → UNBOUND
 *   exactly 1            → AUTO_BIND(tenantId)
 *   more than 1          → TENANT_SELECTION_REQUIRED(choices)
 *
 * A membership is USABLE only when the membership itself is active AND its
 * tenant resolves through the 0081 member-arm AND that tenant's status is
 * ACTIVE — a SUSPENDED/CLOSED (disabled) tenant invalidates the choice, so a
 * principal whose only tenant was disabled resolves UNBOUND rather than
 * half-bound. Choices carry SAFE FIELDS ONLY (tenantId, name, roleHint):
 * no status internals, no operating-entity references, no membership row
 * plumbing. Never fabricates membership; the DB rows are the only source.
 */

import { Result, TenantId } from '@karar/shared-kernel';

import { requireAuthenticated, type AuthenticatedActor } from '../principal.js';
import type { ResolveTenantContextError } from '../errors.js';
import type { OwnMembershipRepository } from '../ports/membership-repository.js';
import type { MemberTenantRepository } from '../ports/tenant-repository.js';
import { membershipActiveAt } from './list-own-memberships.js';

/** A selectable tenant, safe fields only. */
export interface TenantChoice {
  readonly tenantId: string;
  readonly name: string;
  readonly roleHint: string;
}

export type TenantContextResolution =
  | { readonly kind: 'UNBOUND' }
  | { readonly kind: 'AUTO_BIND'; readonly tenantId: TenantId; readonly choice: TenantChoice }
  | { readonly kind: 'TENANT_SELECTION_REQUIRED'; readonly choices: readonly TenantChoice[] };

export class ResolveTenantContext {
  constructor(
    private readonly memberships: OwnMembershipRepository,
    private readonly tenants: MemberTenantRepository,
    private readonly clock: { now(): Date },
  ) {}

  async execute(
    actor: AuthenticatedActor,
  ): Promise<Result<TenantContextResolution, ResolveTenantContextError>> {
    const authenticated = requireAuthenticated(actor);
    if (!authenticated.ok) {
      return authenticated;
    }
    try {
      const now = this.clock.now();
      const own = await this.memberships.listOwnAcrossTenants(authenticated.value);
      const active = own.filter((membership) => membershipActiveAt(membership, now));

      const choices: Array<{ readonly tenantId: TenantId; readonly choice: TenantChoice }> = [];
      for (const membership of active) {
        const tenant = await this.tenants.findForMember(authenticated.value, membership.tenantId);
        // Unresolvable (RLS says no) or non-ACTIVE tenants are not choices:
        // a disabled tenant invalidates the membership as a binding target.
        if (tenant === null || tenant.status !== 'ACTIVE') continue;
        choices.push({
          tenantId: membership.tenantId,
          choice: {
            tenantId: TenantId.toString(membership.tenantId),
            name: tenant.name,
            roleHint: membership.roleHint,
          },
        });
      }

      if (choices.length === 0) {
        return Result.ok({ kind: 'UNBOUND' });
      }
      const [first] = choices;
      if (choices.length === 1 && first !== undefined) {
        return Result.ok({
          kind: 'AUTO_BIND',
          tenantId: first.tenantId,
          choice: first.choice,
        });
      }
      return Result.ok({
        kind: 'TENANT_SELECTION_REQUIRED',
        choices: choices.map((entry) => entry.choice),
      });
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `tenant-context resolution failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
