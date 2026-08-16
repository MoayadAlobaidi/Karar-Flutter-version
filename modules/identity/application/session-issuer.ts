/**
 * SessionIssuer — the ONE place a session comes into being. Login and MFA
 * completion both finish here, so expiry arithmetic, family creation, token
 * minting, and metadata minimization cannot drift between the two doors.
 */

import type { UserId } from '@karar/shared-kernel';

import type { IdentityAccount } from '../domain/identity-account.js';
import type {
  RefreshTokenFamily,
  RefreshTokenFamilyId,
  RefreshTokenId,
  RefreshTokenRecord,
  Session,
  SessionId,
} from '../domain/session.js';
import type { ClientContext, IdentityDependencies } from './identity-deps.js';

export interface IssuedSession {
  readonly sessionId: SessionId;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: Date;
  /** The RAW refresh token — returned once, stored only as a SHA-256 hash. */
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

export class SessionIssuer {
  constructor(private readonly deps: IdentityDependencies) {}

  async issue(account: IdentityAccount, client: ClientContext): Promise<IssuedSession> {
    const deps = this.deps;
    const now = deps.clock.now();
    const sessionId = deps.secretSource.id() as SessionId;
    const absoluteExpiresAt = new Date(now.getTime() + deps.policy.sessionAbsoluteTtlMs);
    const idleExpiresAt =
      deps.policy.sessionIdleTtlMs === null
        ? null
        : new Date(now.getTime() + deps.policy.sessionIdleTtlMs);

    const session: Session = {
      id: sessionId,
      accountId: account.id,
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt,
      idleExpiresAt,
      revokedAt: null,
      revokedReason: null,
      ipDigest: client.ipDigest,
      userAgentSummary: client.userAgentSummary,
      tenantBinding: null,
    };
    const family: RefreshTokenFamily = {
      id: deps.secretSource.id() as RefreshTokenFamilyId,
      sessionId,
      accountId: account.id,
      createdAt: now,
      revokedAt: null,
      revokedReason: null,
    };
    const rawRefreshToken = deps.secretSource.refreshToken();
    const firstToken: RefreshTokenRecord = {
      id: deps.secretSource.id() as RefreshTokenId,
      familyId: family.id,
      tokenHash: deps.digester.refreshTokenDigest(rawRefreshToken),
      createdAt: now,
      expiresAt: this.refreshExpiry(now, absoluteExpiresAt),
      usedAt: null,
      supersededBy: null,
    };

    await deps.sessions.createSession({ session, family, firstToken });

    const access = await deps.tokenSigner.signAccessToken(
      { accountId: account.id, sessionId, tokenVersion: account.tokenVersion },
      now,
    );

    return {
      sessionId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt: firstToken.expiresAt,
      absoluteExpiresAt,
    };
  }

  /** A refresh token never outlives its session's absolute ceiling. */
  refreshExpiry(now: Date, absoluteExpiresAt: Date): Date {
    const candidate = now.getTime() + this.deps.policy.refreshTokenTtlMs;
    return new Date(Math.min(candidate, absoluteExpiresAt.getTime()));
  }

  /** Access token for an existing session (refresh path). */
  async accessTokenFor(accountId: UserId, sessionId: SessionId, tokenVersion: number) {
    return this.deps.tokenSigner.signAccessToken(
      { accountId, sessionId, tokenVersion },
      this.deps.clock.now(),
    );
  }
}
