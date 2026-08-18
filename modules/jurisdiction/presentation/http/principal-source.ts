/**
 * JurisdictionPrincipalSource — where the self-declaration controller gets
 * its authenticated principal.
 *
 * THE RULE (tenancy.md §6): subject and tenant identity come ONLY from
 * server-side session state. The controller reads NOTHING identifying from
 * the request's query, headers, or body — the only body field it reads is the
 * declared jurisdiction code, which is reference DATA validated against the
 * register, never an identity. A `?userId=`, an `x-tenant-id` header, or a
 * body `userId`/`tenantId` is ignored by construction.
 *
 * A request with no principal is answered 401. There is no anonymous
 * fallback: an unbound session has no RLS context to write an assignment
 * under, so a missing tenant binding is a refusal, not a default.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

export interface JurisdictionPrincipal {
  readonly userId: UserId;
  /** The session's server-side tenant binding. Null while unbound. */
  readonly tenantId: TenantId | null;
  readonly requestId?: string;
}

export interface JurisdictionPrincipalSource {
  fromRequest(request: unknown): JurisdictionPrincipal | null;
}

/** DI token; the composition root binds the identity-backed implementation. */
export const JURISDICTION_PRINCIPAL_SOURCE = 'karar.jurisdiction.principal-source';
