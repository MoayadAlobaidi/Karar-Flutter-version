/**
 * ES256 JWTs via jose (TokenSigner port).
 *
 * Access-token claims — {sub, sid, iss:'karar', aud:'karar-api', iat, exp,
 * tv} and NOTHING else: no roles, no permissions, no e-mail. Authorization
 * is re-derived from the database on every request (access-control.md §7),
 * so a token cannot carry a stale grant, and the token version (`tv`) lets
 * the guard reject everything minted before a credential boundary.
 *
 * MFA challenge tokens are the same construction under a DIFFERENT audience
 * (`karar-mfa-challenge`) with a `purpose` claim — an access token can never
 * pass where a challenge is expected or vice versa.
 */

import { errors as joseErrors, jwtVerify, SignJWT, type CryptoKey } from 'jose';
import { Result, UserId } from '@karar/shared-kernel';

import type {
  AccessTokenClaims,
  SignedToken,
  TokenKeyProvider,
  TokenSigner,
  TokenVerificationError,
} from '../../application/ports/crypto-ports.js';

export const TOKEN_ISSUER = 'karar';
export const ACCESS_TOKEN_AUDIENCE = 'karar-api';
export const CHALLENGE_TOKEN_AUDIENCE = 'karar-mfa-challenge';

export interface JoseTokenSignerOptions {
  readonly keys: TokenKeyProvider;
  readonly accessTokenTtlMs: number;
  readonly challengeTokenTtlMs: number;
}

export class JoseTokenSigner implements TokenSigner {
  constructor(private readonly options: JoseTokenSignerOptions) {}

  async signAccessToken(claims: AccessTokenClaims, now: Date): Promise<SignedToken> {
    const expiresAt = new Date(now.getTime() + this.options.accessTokenTtlMs);
    const token = await new SignJWT({ sid: claims.sessionId, tv: claims.tokenVersion })
      .setProtectedHeader({ alg: this.options.keys.algorithm, kid: await this.options.keys.keyId() })
      .setSubject(claims.accountId)
      .setIssuer(TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign((await this.options.keys.signingKey()) as CryptoKey);
    return { token, expiresAt };
  }

  async verifyAccessToken(
    token: string,
    now: Date,
  ): Promise<Result<AccessTokenClaims, TokenVerificationError>> {
    const verified = await this.verify(token, ACCESS_TOKEN_AUDIENCE, now);
    if (!verified.ok) return verified;
    const payload = verified.value;
    const sub = typeof payload.sub === 'string' ? UserId.parse(payload.sub) : null;
    if (
      sub === null ||
      !sub.ok ||
      typeof payload.sid !== 'string' ||
      typeof payload.tv !== 'number'
    ) {
      return Result.err('invalid');
    }
    return Result.ok({
      accountId: sub.value,
      sessionId: payload.sid,
      tokenVersion: payload.tv,
    });
  }

  async signChallengeToken(accountId: UserId, now: Date): Promise<SignedToken> {
    const expiresAt = new Date(now.getTime() + this.options.challengeTokenTtlMs);
    const token = await new SignJWT({ purpose: 'mfa_challenge' })
      .setProtectedHeader({ alg: this.options.keys.algorithm, kid: await this.options.keys.keyId() })
      .setSubject(accountId)
      .setIssuer(TOKEN_ISSUER)
      .setAudience(CHALLENGE_TOKEN_AUDIENCE)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign((await this.options.keys.signingKey()) as CryptoKey);
    return { token, expiresAt };
  }

  async verifyChallengeToken(
    token: string,
    now: Date,
  ): Promise<Result<{ readonly accountId: UserId }, TokenVerificationError>> {
    const verified = await this.verify(token, CHALLENGE_TOKEN_AUDIENCE, now);
    if (!verified.ok) return verified;
    const payload = verified.value;
    const sub = typeof payload.sub === 'string' ? UserId.parse(payload.sub) : null;
    if (sub === null || !sub.ok || payload.purpose !== 'mfa_challenge') {
      return Result.err('invalid');
    }
    return Result.ok({ accountId: sub.value });
  }

  private async verify(token: string, audience: string, now: Date) {
    try {
      const { payload } = await jwtVerify(
        token,
        async (header) => {
          const key =
            header.kid === undefined
              ? null
              : await this.options.keys.verificationKey(header.kid);
          if (key === null) throw new Error('unknown signing key');
          return key as CryptoKey;
        },
        {
          issuer: TOKEN_ISSUER,
          audience,
          algorithms: [this.options.keys.algorithm],
          currentDate: now,
        },
      );
      return Result.ok(payload);
    } catch (error) {
      const kind: TokenVerificationError =
        error instanceof joseErrors.JWTExpired ? 'expired' : 'invalid';
      return Result.err(kind);
    }
  }
}
