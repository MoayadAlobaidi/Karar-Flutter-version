/**
 * RefreshSession — one-time rotation with reuse detection.
 *
 * Presenting a refresh token that was ALREADY used or superseded is treated
 * as theft evidence, not as an error to shrug at: the whole family and its
 * session are revoked, a `refresh_reuse_detected` ledger event is recorded,
 * and the account is notified. The one-time claim is atomic in SQL (the
 * repository's `UPDATE … WHERE used_at IS NULL`), so two concurrent
 * presentations of the same token resolve to exactly one rotation — the
 * loser lands on the reuse path.
 *
 * The caller sees two failures only: 'invalid_token' (unknown, expired,
 * revoked family, dead session, stale account) and — deliberately identical
 * in HTTP shape — 'reuse_detected', kept distinct internally for tests and
 * the ledger.
 */

import { Result, type UserId } from '@karar/shared-kernel';

import { isSessionLive } from '../../domain/session.js';
import type { RefreshTokenId, RefreshTokenRecord, SessionId } from '../../domain/session.js';
import { RATE_LIMIT_POLICIES } from '@karar/platform/dist/ratelimit/index.js';
import { recordSecurity, type ClientContext, type IdentityDependencies } from '../identity-deps.js';
import { SessionIssuer } from '../session-issuer.js';

export interface RefreshSessionInput {
  readonly refreshToken: string;
  readonly client: ClientContext;
}

export interface RefreshedSession {
  readonly kind: 'refreshed';
  readonly accessToken: string;
  readonly accessTokenExpiresAt: Date;
  /** The successor token — the presented one is now dead. */
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Date;
  readonly sessionId: string;
}

export type RefreshSessionError =
  { readonly kind: 'invalid_token' } | { readonly kind: 'reuse_detected' };

export class RefreshSession {
  private readonly issuer: SessionIssuer;

  constructor(private readonly deps: IdentityDependencies) {
    this.issuer = new SessionIssuer(deps);
  }

  async execute(
    input: RefreshSessionInput,
  ): Promise<Result<RefreshedSession, RefreshSessionError>> {
    const deps = this.deps;
    const invalid = Result.err<RefreshSessionError>({ kind: 'invalid_token' });
    const tokenHash = deps.digester.refreshTokenDigest(input.refreshToken);

    // Refresh is the one fail-open-fallback policy (see platform policy.ts);
    // keyed on the token digest — a per-credential budget, no identity leak.
    await deps.rateLimits.assertWithinLimit(
      RATE_LIMIT_POLICIES.refresh,
      deps.rateLimitKeys.idKey(tokenHash),
      deps.clock.now(),
    );

    // Bootstrap read: the token names the family names the account.
    const presented = await deps.sessions.findByTokenHash(tokenHash);
    if (presented === null) return invalid;

    const { token, family, session } = presented;
    const accountId = family.accountId;
    const now = deps.clock.now();

    // Used or superseded BEFORE any liveness question: reuse of a rotated
    // token is the signal we exist to catch, even on a revoked family.
    if (token.usedAt !== null || token.supersededBy !== null) {
      await this.onReuseDetected(accountId, family.id, session.id, input.client);
      return Result.err({ kind: 'reuse_detected' });
    }

    if (family.revokedAt !== null) return invalid;
    if (token.expiresAt.getTime() <= now.getTime()) return invalid;
    if (!isSessionLive(session, now)) return invalid;

    const account = await deps.accounts.findById(accountId);
    if (account === null || account.status !== 'active') return invalid;

    // Mint the successor and claim the presented token atomically.
    const rawSuccessor = deps.secretSource.refreshToken();
    const successor: RefreshTokenRecord = {
      id: deps.secretSource.id() as RefreshTokenId,
      familyId: family.id,
      tokenHash: deps.digester.refreshTokenDigest(rawSuccessor),
      createdAt: now,
      expiresAt: this.issuer.refreshExpiry(now, session.absoluteExpiresAt),
      usedAt: null,
      supersededBy: null,
    };
    const claimed = await deps.sessions.rotateToken({
      accountId,
      presentedTokenId: token.id,
      successor,
      now,
    });
    if (claimed === 'already_used') {
      // Lost the race to a concurrent presentation of the SAME token: that
      // concurrent use is exactly what reuse detection is for.
      await this.onReuseDetected(accountId, family.id, session.id, input.client);
      return Result.err({ kind: 'reuse_detected' });
    }

    await deps.sessions.touchSession({
      accountId,
      sessionId: session.id,
      now,
      idleExpiresAt:
        deps.policy.sessionIdleTtlMs === null
          ? null
          : new Date(now.getTime() + deps.policy.sessionIdleTtlMs),
    });

    const access = await this.issuer.accessTokenFor(accountId, session.id, account.tokenVersion);
    return Result.ok({
      kind: 'refreshed',
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: rawSuccessor,
      refreshTokenExpiresAt: successor.expiresAt,
      sessionId: session.id,
    });
  }

  private async onReuseDetected(
    accountId: UserId,
    familyId: string,
    sessionId: SessionId,
    client: ClientContext,
  ): Promise<void> {
    const deps = this.deps;
    await deps.sessions.revokeFamilyAndSession({
      accountId,
      familyId,
      sessionId,
      reason: 'refresh_reuse_detected',
      now: deps.clock.now(),
    });
    await recordSecurity(deps, {
      accountId,
      eventType: 'refresh_reuse_detected',
      ipDigest: client.ipDigest,
      metadata: { familyId, sessionId },
    });
    const account = await deps.accounts.findById(accountId);
    if (account !== null) {
      await deps.notifications.sendSecurityNotice({
        to: account.email,
        kind: 'refresh_reuse_detected',
      });
    }
  }
}
