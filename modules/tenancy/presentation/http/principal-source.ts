/**
 * TenancyPrincipalSource — where the tenancy controller gets its principals.
 *
 * TENANT RESOLUTION RULE (tenancy.md §6, asserted by test): tenant identity
 * comes ONLY from server-side session/membership state, resolved by the
 * identity layer and provided behind this token. Controllers read NOTHING
 * tenant- or user-identifying from query, body, or headers — `?tenantId=`,
 * `x-tenant-id`, and a body `tenantId` are ignored by construction.
 *
 * Two shapes: `fromRequest` for tenant-bound operations, and
 * `redeemerFromRequest` for invitation redemption, where the caller is
 * authenticated but need not be a member of any tenant yet — the tenant they
 * join comes from the invitation row, server-side.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

export interface AuthenticatedPrincipal {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly sessionId?: string;
  readonly requestId?: string;
}

export interface AuthenticatedRedeemer {
  readonly userId: UserId;
  readonly sessionId?: string;
  readonly requestId?: string;
}

export interface TenancyPrincipalSource {
  /** Tenant-bound principal, or null when unauthenticated or tenantless. */
  fromRequest(request: unknown): AuthenticatedPrincipal | null;
  /** Authenticated principal without a tenant requirement, or null. */
  redeemerFromRequest(request: unknown): AuthenticatedRedeemer | null;
}

/** DI token; the composition root binds the identity module's implementation. */
export const TENANCY_PRINCIPAL_SOURCE = 'karar.tenancy.principal-source';
