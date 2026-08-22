/**
 * Where the financial surface gets its principal — and the only place it
 * could.
 *
 * THE RULE (tenancy.md §6, ADR-0028): the subject and the tenant come
 * EXCLUSIVELY from the session's server-side binding, resolved once at the
 * edge by `PrincipalEnrichmentGuard` and read here. Nothing on this surface
 * reads identity from a path, a query, a header, or a body. There is no
 * `userId` parameter and no `tenantId` parameter on any financial operation,
 * so a `?userId=`, an `x-tenant-id` header, or a body `tenantId` names
 * nothing — not because a handler filters it out, but because no code path
 * exists that would consult it.
 *
 * A request with no principal is answered 401, and one whose session is not
 * bound to a tenant is answered 403. There is no anonymous fallback and no
 * default tenant: an unbound session has no RLS context to read a financial
 * row under, and every repository on this surface binds that context per
 * transaction.
 *
 * ONE SHAPE, FIVE MODULES. `AccountsPrincipal`, `InstrumentsPrincipal`,
 * `ConnectionsPrincipal`, `ImportsPrincipal` and `MatchingPrincipal` are five
 * separate, non-interchangeable declarations that happen to agree
 * structurally. This function returns the shape they share; TypeScript checks
 * the fit at each call site, which is where a divergence would show up.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import { tenantBoundPrincipalFrom } from '../auth/principal-adapters.js';

export interface FinancialPrincipal {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly sessionId?: string;
}

/**
 * Why the request carries no usable principal, so the caller answers 401 and
 * 403 differently. They are different remedies: sign in, versus choose a
 * tenant.
 */
export type PrincipalRefusal = 'AUTHENTICATION_REQUIRED' | 'TENANT_BINDING_REQUIRED';

/** The composition root binds this; controllers never construct one. */
export interface FinancialPrincipalSource {
  fromRequest(request: unknown): FinancialPrincipal | PrincipalRefusal;
}

export const FINANCIAL_PRINCIPAL_SOURCE = 'karar.api.financial.principal-source';

/**
 * The real implementation, over the enriched request.
 *
 * The distinction between "no principal at all" and "a principal with no
 * tenant binding" is made HERE rather than by each controller, because a
 * surface that answered 401 for an unbound session would send a signed-in
 * person back to the sign-in screen for a problem the sign-in screen cannot
 * fix.
 */
export const requestPrincipalSource: FinancialPrincipalSource = {
  fromRequest(request: unknown): FinancialPrincipal | PrincipalRefusal {
    const bound = tenantBoundPrincipalFrom(request);
    if (bound !== null) return bound;
    // `tenantBoundPrincipalFrom` returns null both for an absent principal
    // and for an unbound one; the enriched request tells them apart.
    const enriched = request as { kararPrincipal?: unknown };
    return enriched.kararPrincipal === undefined
      ? 'AUTHENTICATION_REQUIRED'
      : 'TENANT_BINDING_REQUIRED';
  },
};

/** True when `fromRequest` refused rather than resolving. */
export function isPrincipalRefusal(
  value: FinancialPrincipal | PrincipalRefusal,
): value is PrincipalRefusal {
  return typeof value === 'string';
}
