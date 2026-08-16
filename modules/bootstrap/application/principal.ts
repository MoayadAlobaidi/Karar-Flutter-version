/**
 * The bootstrap principal — what the composition root's enriched request
 * principal provides for this surface. Tenant identity comes EXCLUSIVELY
 * from the session row's server-side binding (surfaced by identity's
 * AuthenticateRequest); the email-verified flag comes from the same
 * authenticated read. Nothing here is ever built from query, header, or
 * body values.
 *
 * `sessionId` is REQUIRED: every bootstrap operation acts on (or reports on)
 * the caller's own session row, and the binding endpoints mutate it.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

export interface BootstrapPrincipal {
  readonly userId: UserId;
  readonly sessionId: string;
  /** The session's server-side tenant binding, or null while unbound. */
  readonly tenantId: TenantId | null;
  readonly emailVerified: boolean;
  readonly requestId?: string;
}
