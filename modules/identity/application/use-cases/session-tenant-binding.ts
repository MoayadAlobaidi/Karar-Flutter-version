/**
 * Session-tenant binding — the identity-side mechanics that close the Phase 3
 * dormant surface (KAR-RSK-021): sessions were issued with
 * `tenant_binding = null` and nothing set it.
 *
 * Two deliberately different doors:
 *
 * - `BindSessionTenant` (first bind, null → tenant): sets tenant_binding on
 *   the caller's OWN live session row with NO token rotation — the session
 *   gains context, existing tokens keep working, and per-request server-side
 *   re-reads (AuthenticateRequest) pick the binding up immediately. Guarded:
 *   only a null → value transition succeeds; a bound session refuses (switch
 *   is the other path).
 *
 * - `RebindSessionTenant` (switch, A → B or A → null): ATOMICALLY revokes the
 *   current session AND its refresh-token families, then issues a brand-new
 *   session (new sid, new refresh family) carrying the new binding. Old
 *   access tokens die with the revoked sid on the next per-request
 *   re-validation; old refresh tokens die with the family. This reuses the
 *   Phase 3 machinery — session revocation + family revocation + issuance —
 *   in one transaction, so no interleaving can observe a principal holding
 *   two live sessions or a live session with a half-switched binding.
 *
 * WHO MAY CALL: callers pass a server-resolved (accountId, sessionId) — the
 * authenticated principal's own session, never client input. Tenant ids
 * arrive as the kernel's branded TenantId: identity stores the value opaquely
 * (tenancy owns the semantics and MUST have verified membership before
 * calling — the tenancy SwitchTenant / bootstrap use cases are those
 * callers, consuming these use cases through ports they declare).
 */

import { Result, TenantId, type UserId } from '@karar/shared-kernel';

import { isSessionLive, type SessionId } from '../../domain/session.js';
import {
  auditOrFail,
  recordSecurity,
  type ClientContext,
  type IdentityDependencies,
} from '../identity-deps.js';
import { SessionIssuer, type IssuedSession } from '../session-issuer.js';

export interface BindSessionTenantInput {
  readonly accountId: UserId;
  readonly sessionId: SessionId;
  /** Server-resolved tenant — the caller has verified membership already. */
  readonly tenantId: TenantId;
  readonly client: ClientContext;
}

export type BindSessionTenantError =
  | { readonly kind: 'session_not_found' }
  | { readonly kind: 'already_bound'; readonly currentBinding: string }
  | { readonly kind: 'bind_conflict' };

export interface SessionTenantBound {
  readonly kind: 'bound';
  readonly sessionId: SessionId;
  readonly tenantId: string;
}

export class BindSessionTenant {
  constructor(private readonly deps: IdentityDependencies) {}

  async execute(
    input: BindSessionTenantInput,
  ): Promise<Result<SessionTenantBound, BindSessionTenantError>> {
    const deps = this.deps;
    const now = deps.clock.now();

    const session = await deps.sessions.findSession(input.accountId, input.sessionId);
    if (session === null || !isSessionLive(session, now)) {
      return Result.err({ kind: 'session_not_found' });
    }
    if (session.tenantBinding !== null) {
      // Only null → value transitions; a bound session switches instead.
      return Result.err({ kind: 'already_bound', currentBinding: session.tenantBinding });
    }

    const tenantId = TenantId.toString(input.tenantId);
    const claimed = await deps.sessions.setTenantBinding({
      accountId: input.accountId,
      sessionId: input.sessionId,
      tenantBinding: tenantId,
      now,
    });
    if (claimed === 'not_bindable') {
      // Lost a race: bound or revoked between the read and the claim.
      return Result.err({ kind: 'bind_conflict' });
    }

    await recordSecurity(deps, {
      accountId: input.accountId,
      eventType: 'session_tenant_bound',
      ipDigest: input.client.ipDigest,
      metadata: { sessionId: input.sessionId, tenantId },
    });
    await auditOrFail(deps, {
      action: 'identity.session.tenant_bound',
      accountId: input.accountId,
      resourceType: 'identity_session',
      resourceId: input.sessionId,
      outcome: 'SUCCESS',
      metadata: { tenantId },
    });

    return Result.ok({ kind: 'bound', sessionId: input.sessionId, tenantId });
  }
}

export interface RebindSessionTenantInput {
  readonly accountId: UserId;
  readonly sessionId: SessionId;
  /** The new binding — a verified tenant, or null (switch back to unbound). */
  readonly newTenantId: TenantId | null;
  readonly client: ClientContext;
}

export type RebindSessionTenantError =
  | { readonly kind: 'session_not_found' }
  | { readonly kind: 'not_bound' }
  | { readonly kind: 'account_not_active' }
  | { readonly kind: 'rebind_conflict' };

export interface SessionTenantRebound {
  readonly kind: 'rebound';
  /** The replacement session — brand-new sid and refresh family. */
  readonly session: IssuedSession;
  readonly previousBinding: string;
  readonly newBinding: string | null;
}

export class RebindSessionTenant {
  private readonly issuer: SessionIssuer;

  constructor(private readonly deps: IdentityDependencies) {
    this.issuer = new SessionIssuer(deps);
  }

  async execute(
    input: RebindSessionTenantInput,
  ): Promise<Result<SessionTenantRebound, RebindSessionTenantError>> {
    const deps = this.deps;
    const now = deps.clock.now();

    const account = await deps.accounts.findById(input.accountId);
    if (account === null || account.status !== 'active') {
      return Result.err({ kind: 'account_not_active' });
    }
    const session = await deps.sessions.findSession(input.accountId, input.sessionId);
    if (session === null || !isSessionLive(session, now)) {
      return Result.err({ kind: 'session_not_found' });
    }
    if (session.tenantBinding === null) {
      // An unbound session takes the first-bind path; there is nothing to
      // switch away from, and rotation would be cost without meaning.
      return Result.err({ kind: 'not_bound' });
    }
    const previousBinding = session.tenantBinding;
    const newBinding = input.newTenantId === null ? null : TenantId.toString(input.newTenantId);

    const minted = this.issuer.mint(account, input.client, newBinding);
    const outcome = await deps.sessions.rebindSession({
      accountId: input.accountId,
      oldSessionId: input.sessionId,
      reason: 'tenant_switch',
      bundle: { session: minted.session, family: minted.family, firstToken: minted.firstToken },
      now,
    });
    if (outcome === 'stale_session') {
      // The old session died concurrently (logout, admin revocation): the
      // transaction wrote NOTHING — no orphan replacement session exists.
      return Result.err({ kind: 'rebind_conflict' });
    }

    await recordSecurity(deps, {
      accountId: input.accountId,
      eventType: 'session_tenant_rebound',
      ipDigest: input.client.ipDigest,
      metadata: {
        oldSessionId: input.sessionId,
        newSessionId: minted.session.id,
        oldTenantId: previousBinding,
        newTenantId: newBinding,
      },
    });
    await auditOrFail(deps, {
      action: 'identity.session.tenant_rebound',
      accountId: input.accountId,
      resourceType: 'identity_session',
      resourceId: minted.session.id,
      outcome: 'SUCCESS',
      metadata: {
        oldSessionId: input.sessionId,
        oldTenantId: previousBinding,
        newTenantId: newBinding,
      },
    });

    const issued = await this.issuer.issuedFrom(minted, account.tokenVersion);
    return Result.ok({
      kind: 'rebound',
      session: issued,
      previousBinding,
      newBinding,
    });
  }
}
