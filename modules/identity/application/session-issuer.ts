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

/** A fully-minted (not yet persisted) session bundle plus its raw token. */
export interface MintedSessionBundle {
  readonly session: Session;
  readonly family: RefreshTokenFamily;
  readonly firstToken: RefreshTokenRecord;
  /** The RAW refresh token backing firstToken.tokenHash — returned once. */
  readonly rawRefreshToken: string;
}

export class SessionIssuer {
  constructor(private readonly deps: IdentityDependencies) {}

  /**
   * Mint (without persisting) a complete session/family/token bundle. The
   * ONE construction path for session state: `issue` persists it via
   * createSession; the tenant-switch rebind persists it atomically with the
   * old session's revocation. `tenantBinding` defaults to null — the Phase 3
   * issuance state; a non-null value is only ever a server-resolved tenant
   * (tenancy owns the semantics; this module transports it opaquely).
   */
  mint(
    account: IdentityAccount,
    client: ClientContext,
    tenantBinding: string | null = null,
  ): MintedSessionBundle {
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
      tenantBinding,
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
    return { session, family, firstToken, rawRefreshToken };
  }

  /** Sign the access token for a minted bundle and assemble the issue result. */
  async issuedFrom(
    minted: MintedSessionBundle,
    tokenVersion: number,
  ): Promise<IssuedSession> {
    const access = await this.deps.tokenSigner.signAccessToken(
      {
        accountId: minted.session.accountId,
        sessionId: minted.session.id,
        tokenVersion,
      },
      this.deps.clock.now(),
    );
    return {
      sessionId: minted.session.id,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: minted.rawRefreshToken,
      refreshTokenExpiresAt: minted.firstToken.expiresAt,
      absoluteExpiresAt: minted.session.absoluteExpiresAt,
    };
  }

  async issue(account: IdentityAccount, client: ClientContext): Promise<IssuedSession> {
    const minted = this.mint(account, client);
    await this.deps.sessions.createSession({
      session: minted.session,
      family: minted.family,
      firstToken: minted.firstToken,
    });
    return this.issuedFrom(minted, account.tokenVersion);
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
