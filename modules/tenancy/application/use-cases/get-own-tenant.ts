/**
 * GetOwnTenant — the caller reads their own tenant and their own membership.
 * The tenant is whatever the server-side-resolved principal is bound to;
 * beneath the repositories, RLS exposes exactly that tenant's row (0041) and
 * roster rows (0042).
 */

import { Result } from '@karar/shared-kernel';

import { requirePrincipal, type PrincipalActor } from '../principal.js';
import type { GetOwnTenantError } from '../errors.js';
import type { TenantRepository } from '../ports/tenant-repository.js';
import type { MembershipRepository } from '../ports/membership-repository.js';
import type { Tenant, TenantMembership } from '../../domain/tenancy.js';

export interface OwnTenantView {
  readonly tenant: Tenant;
  readonly membership: TenantMembership;
}

export class GetOwnTenant {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly memberships: MembershipRepository,
  ) {}

  async execute(actor: PrincipalActor): Promise<Result<OwnTenantView, GetOwnTenantError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) {
      return principal;
    }
    try {
      const tenant = await this.tenants.findOwn(principal.value);
      if (tenant === null) {
        return Result.err({
          kind: 'tenant_not_found',
          message: 'the bound tenant does not resolve to a tenant record',
        });
      }
      const membership = await this.memberships.findOwn(principal.value);
      if (membership === null) {
        return Result.err({
          kind: 'membership_not_found',
          message: 'the authenticated principal holds no membership in the bound tenant',
        });
      }
      return Result.ok({ tenant, membership });
    } catch (error) {
      return Result.err({
        kind: 'store_failure',
        message: `tenant read failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
