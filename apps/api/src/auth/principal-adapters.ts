/**
 * Principal-source adapters — the composition root's implementations of the
 * consumer modules' principal ports (users PrincipalSource, tenancy
 * TenancyPrincipalSource, authorization AuthorizationPrincipalSource), all
 * reading the request principal the PrincipalEnrichmentGuard attached.
 *
 * The shapes are the modules' OWN port declarations; assignment into each
 * ApiModule's options is where TypeScript checks the contract. Nothing here
 * reads tenant or user identity from query, body, or header — only the
 * enriched request key, which itself derives from the session row.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type { EnrichedRequest, KararRequestPrincipal } from './request-principal.js';

function principalOf(request: unknown): KararRequestPrincipal | null {
  return (request as EnrichedRequest).kararPrincipal ?? null;
}

export interface TenantBoundPrincipal {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly sessionId?: string;
}

export interface SessionOnlyPrincipal {
  readonly userId: UserId;
  readonly sessionId?: string;
}

/** users' PrincipalSource and tenancy's fromRequest: tenant-bound or null. */
export function tenantBoundPrincipalFrom(request: unknown): TenantBoundPrincipal | null {
  const principal = principalOf(request);
  if (principal === null || principal.tenantId === null) {
    return null;
  }
  return {
    tenantId: principal.tenantId,
    userId: principal.userId,
    sessionId: principal.sessionId,
  };
}

/** tenancy's redeemerFromRequest: authenticated, tenant NOT required. */
export function sessionOnlyPrincipalFrom(request: unknown): SessionOnlyPrincipal | null {
  const principal = principalOf(request);
  if (principal === null) {
    return null;
  }
  return { userId: principal.userId, sessionId: principal.sessionId };
}

/**
 * bootstrap's BootstrapPrincipal: session-scoped, tenant OPTIONAL (the whole
 * point of the surface is reporting and changing the binding state), and
 * carrying the email-verified flag from the same authenticated read.
 */
export function bootstrapPrincipalFrom(request: unknown): {
  readonly userId: UserId;
  readonly sessionId: string;
  readonly tenantId: TenantId | null;
  readonly emailVerified: boolean;
} | null {
  const principal = principalOf(request);
  if (principal === null) {
    return null;
  }
  return {
    userId: principal.userId,
    sessionId: principal.sessionId,
    tenantId: principal.tenantId,
    emailVerified: principal.emailVerified,
  };
}

/** authorization's PolicyActor: tenant present only when the session binds one. */
export function policyActorFrom(request: unknown): {
  readonly userId: UserId;
  readonly tenantId?: TenantId;
  readonly sessionId?: string;
} | null {
  const principal = principalOf(request);
  if (principal === null) {
    return null;
  }
  return {
    userId: principal.userId,
    ...(principal.tenantId !== null ? { tenantId: principal.tenantId } : {}),
    sessionId: principal.sessionId,
  };
}
