/**
 * AuthenticateRequest — what the HTTP guard (and any other entrance) calls
 * per request. The token proves WHO is asking; the DATABASE decides whether
 * that identity still stands: account status, token version, and session
 * liveness are re-read every time (access-control.md §7 — revocation is
 * immediate; admin/session state is never process memory, AUTHN-16).
 */

import { Result } from '@karar/shared-kernel';

import { isSessionLive, type SessionId } from '../../domain/session.js';
import type { IdentityDependencies } from '../identity-deps.js';

export interface AuthenticatedPrincipal {
  readonly accountId: string;
  readonly sessionId: SessionId;
  /**
   * The session's tenant scope (0031 `tenant_binding`), transported opaquely:
   * tenancy owns the semantics and the composition root resolves it into a
   * tenant-bound principal. Null — the Phase 3 issuance state — means the
   * session is tenantless and every tenant-bound surface refuses it.
   */
  readonly tenantBinding: string | null;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly mfaRequired: boolean;
}

export type AuthenticateRequestError = { readonly kind: 'unauthenticated' };

export class AuthenticateRequest {
  constructor(private readonly deps: IdentityDependencies) {}

  async execute(
    accessToken: string,
  ): Promise<Result<AuthenticatedPrincipal, AuthenticateRequestError>> {
    const deps = this.deps;
    const unauthenticated = Result.err<AuthenticateRequestError>({ kind: 'unauthenticated' });
    const now = deps.clock.now();

    const claims = await deps.tokenSigner.verifyAccessToken(accessToken, now);
    if (!claims.ok) return unauthenticated;
    const { accountId, sessionId, tokenVersion } = claims.value;

    const account = await deps.accounts.findById(accountId);
    if (account === null || account.status !== 'active') return unauthenticated;
    // A bumped version (password change/reset, disable, global revocation)
    // makes every earlier access token stale, signature notwithstanding.
    if (account.tokenVersion !== tokenVersion) return unauthenticated;

    const session = await deps.sessions.findSession(accountId, sessionId as SessionId);
    if (session === null || !isSessionLive(session, now)) return unauthenticated;

    await deps.sessions.touchSession({
      accountId,
      sessionId: session.id,
      now,
      idleExpiresAt:
        deps.policy.sessionIdleTtlMs === null
          ? null
          : new Date(now.getTime() + deps.policy.sessionIdleTtlMs),
    });

    return Result.ok({
      accountId,
      sessionId: session.id,
      tenantBinding: session.tenantBinding,
      email: account.email,
      emailVerified: account.emailVerifiedAt !== null,
      mfaRequired: account.mfaRequired,
    });
  }
}
