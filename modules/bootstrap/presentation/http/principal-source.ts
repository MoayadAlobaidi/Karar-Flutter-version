/**
 * BootstrapPrincipalSource — where the bootstrap controller gets its
 * authenticated principal.
 *
 * TENANT RESOLUTION RULE (tenancy.md §6, asserted by test): tenant identity
 * comes ONLY from server-side session state. The identity layer's
 * authentication resolves the principal at the edge (the enriched request
 * principal — the same source the users/tenancy controllers consume) and the
 * composition root provides it behind this token; the controller reads
 * NOTHING tenant- or user-identifying from the request's query, headers, or
 * body. A `?tenantId=`, an `x-tenant-id` header, and a body `tenantId` on
 * GET are ignored everywhere by construction; POST's body `tenantId` is a
 * SELECTION handed to the use case for server-side membership verification —
 * never an identity.
 *
 * `sessionId` and `emailVerified` are REQUIRED parts of the shape: binding
 * operations act on the caller's own session row, and the bootstrap view
 * reports the verified-email flag — both come from identity's authenticated
 * per-request read (AuthenticatedPrincipal), which the composition root's
 * adapter carries here. A request whose principal lacks them is answered
 * 401, never guessed at.
 */

import type { BootstrapPrincipal } from '../../application/principal.js';

export interface BootstrapPrincipalSource {
  /**
   * The principal the identity layer authenticated for this request, or
   * null when the request carries none (the controller answers 401 — there
   * is no anonymous fallback principal).
   */
  fromRequest(request: unknown): BootstrapPrincipal | null;

  /**
   * Digested/summarized client facts for the security ledger (HMAC IP
   * digest + coarse user-agent summary — never raw values), or nulls.
   */
  clientContextOf(request: unknown): {
    readonly ipDigest: string | null;
    readonly userAgentSummary: string | null;
  };
}

/** DI token; the composition root binds the identity-backed implementation. */
export const BOOTSTRAP_PRINCIPAL_SOURCE = 'karar.bootstrap.principal-source';
