/**
 * Session-binding ports — tenancy's seams onto the identity module's
 * session-tenant machinery (Phase 3.5, KAR-RSK-021). DECLARED HERE, IN THE
 * CONSUMER (ports are declared inward): the identity module's
 * `BindSessionTenant` / `RebindSessionTenant` / `RevokeSession` use cases
 * satisfy these shapes STRUCTURALLY and the composition root binds them —
 * tenancy takes no dependency on identity's package.
 *
 * The contract tenancy relies on:
 *
 * - `bind` (first bind, null → tenant): NO token rotation; per-request
 *   server-side re-reads pick the binding up. Refuses on a bound session.
 * - `rebind` (switch): ATOMICALLY revokes the caller's current session and
 *   its refresh-token families, then issues a brand-new session carrying the
 *   new binding; the returned view holds the NEW tokens. Old access tokens
 *   die with the revoked sid; old refresh tokens die with the family.
 * - `revoke`: kills one of the caller's own sessions — tenancy's compensating
 *   action when a membership vanishes mid-switch (fail closed: better a
 *   signed-out caller than a session bound without membership).
 *
 * Tenant ids handed to these ports are ALWAYS server-verified memberships —
 * never client input; identity stores the value opaquely.
 */

import type { Result, TenantId, UserId } from '@karar/shared-kernel';

/** Digested/summarized client facts, forwarded for the security ledger. */
export interface BindingClientContext {
  readonly ipDigest: string | null;
  readonly userAgentSummary: string | null;
}

/** The replacement session a switch returns — new sid, new refresh family. */
export interface ReboundSessionView {
  readonly sessionId: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: Date;
  /** RAW refresh token — surfaced once to the caller, never stored. */
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

/** Denials are machine-readable kinds; tenancy maps them, never parses text. */
export interface SessionBindingDenial {
  readonly kind: string;
}

export interface BindSessionTenantPort {
  execute(input: {
    readonly accountId: UserId;
    readonly sessionId: string;
    readonly tenantId: TenantId;
    readonly client: BindingClientContext;
  }): Promise<Result<unknown, SessionBindingDenial>>;
}

export interface RebindSessionTenantPort {
  execute(input: {
    readonly accountId: UserId;
    readonly sessionId: string;
    readonly newTenantId: TenantId | null;
    readonly client: BindingClientContext;
  }): Promise<
    Result<
      {
        readonly session: ReboundSessionView;
        /** The binding the revoked session carried — DB truth for the audit. */
        readonly previousBinding: string | null;
      },
      SessionBindingDenial
    >
  >;
}

export interface RevokeSessionPort {
  execute(input: {
    readonly accountId: UserId;
    readonly sessionId: string;
    readonly client: BindingClientContext;
  }): Promise<Result<unknown, SessionBindingDenial>>;
}
