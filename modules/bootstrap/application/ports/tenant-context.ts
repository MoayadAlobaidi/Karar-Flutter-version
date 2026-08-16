/**
 * Tenant-context ports — this module's seams onto the tenancy module's
 * Phase 3.5 use cases (ResolveTenantContext, SwitchTenant) and the identity
 * module's binding mechanics (BindSessionTenant, RevokeSession). DECLARED
 * HERE, IN THE CONSUMER (ports are declared inward): the real implementations
 * satisfy these shapes structurally and the composition root binds them —
 * bootstrap's runtime code imports nothing from either module.
 *
 * Tenant identity rules the ports carry:
 * - resolution/switch operate on the caller's OWN server-verified
 *   memberships; a tenant id handed to `switchTenant` or `bindSession` has
 *   been (or will be, server-side) verified against those memberships —
 *   never trusted from a client.
 * - `bindSession` (first bind) performs NO token rotation; `switchTenant`
 *   revokes the current session + refresh families and returns the NEW
 *   session's tokens.
 */

import type { Result, TenantId, UserId } from '@karar/shared-kernel';

/** The authenticated (possibly tenantless) actor, as tenancy expects it. */
export interface TenantContextActor {
  readonly userId: UserId;
  readonly sessionId?: string;
  readonly requestId?: string;
}

/** Digested/summarized client facts — never raw addresses or user agents. */
export interface BindingClientContext {
  readonly ipDigest: string | null;
  readonly userAgentSummary: string | null;
}

/** A selectable tenant, safe fields only (tenancy filters; we project). */
export interface TenantChoiceView {
  readonly tenantId: string;
  readonly name: string;
  readonly roleHint: string;
}

export type TenantResolutionView =
  | { readonly kind: 'UNBOUND' }
  | {
      readonly kind: 'AUTO_BIND';
      readonly tenantId: string;
      readonly choice: TenantChoiceView;
    }
  | {
      readonly kind: 'TENANT_SELECTION_REQUIRED';
      readonly choices: readonly TenantChoiceView[];
    };

export interface ContextDenial {
  readonly kind: string;
  readonly message?: string;
}

export interface ResolveTenantContextPort {
  execute(actor: TenantContextActor): Promise<Result<TenantResolutionView, ContextDenial>>;
}

/** The switched-session tokens, surfaced once to the caller. */
export interface SwitchedSessionView {
  readonly sessionId: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: Date;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

export interface SwitchTenantPort {
  execute(
    input: { readonly targetTenantId: string; readonly client: BindingClientContext },
    actor: TenantContextActor,
  ): Promise<
    Result<
      {
        readonly session: SwitchedSessionView;
        readonly previousTenantId: string | null;
        readonly tenantId: string;
      },
      ContextDenial
    >
  >;
}

export interface BindSessionPort {
  execute(input: {
    readonly accountId: UserId;
    readonly sessionId: string;
    readonly tenantId: TenantId;
    readonly client: BindingClientContext;
  }): Promise<Result<unknown, ContextDenial>>;
}

export interface RevokeSessionPort {
  execute(input: {
    readonly accountId: UserId;
    readonly sessionId: string;
    readonly client: BindingClientContext;
  }): Promise<Result<unknown, ContextDenial>>;
}
