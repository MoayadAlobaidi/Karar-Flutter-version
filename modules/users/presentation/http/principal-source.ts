/**
 * PrincipalSource — where the controller gets its authenticated principal.
 *
 * TENANT RESOLUTION RULE (tenancy.md §6, asserted by test): tenant identity
 * comes ONLY from server-side session/membership state. The identity module's
 * authentication guard resolves the principal at the edge and the composition
 * root provides it behind this token; controllers read NOTHING tenant- or
 * user-identifying from the request's query, body, or headers. A
 * `?tenantId=`, an `x-tenant-id` header, or a body `tenantId` field is
 * ignored everywhere, by construction.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

export interface AuthenticatedPrincipal {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly sessionId?: string;
  readonly requestId?: string;
}

export interface PrincipalSource {
  /**
   * The principal the identity layer authenticated for this request, or null
   * when the request carries no authenticated principal (the controller
   * answers 401 — there is no anonymous fallback principal).
   */
  fromRequest(request: unknown): AuthenticatedPrincipal | null;
}

/** DI token; the composition root binds the identity module's implementation. */
export const USERS_PRINCIPAL_SOURCE = 'karar.users.principal-source';
