/**
 * Cryptographic capability ports, declared inward (architecture test 5).
 * Application code names WHAT it needs — hashing, signing, digesting,
 * randomness, TOTP, secret encryption — and stays deterministic under test;
 * the adapters under infrastructure/ own argon2, jose, otplib, node:crypto,
 * and the platform EncryptionProvider.
 */

import type { Result, UserId } from '@karar/shared-kernel';

// --- password hashing ------------------------------------------------------

export interface PasswordHasher {
  /** argon2id under the CURRENT parameter set; returns the PHC string + set version. */
  hash(password: string): Promise<{ readonly passwordHash: string; readonly paramsVersion: number }>;
  /** Constant-time verification (library-provided). */
  verify(passwordHash: string, password: string): Promise<boolean>;
  /** True when the stored set predates the current one (upgrade-on-login). */
  needsRehash(paramsVersion: number): boolean;
  /**
   * Burns one full verification against a fixed dummy hash — called on the
   * unknown-account and missing-credential paths so their timing matches a
   * real verification instead of advertising account existence.
   */
  dummyVerify(): Promise<void>;
}

// --- token signing ---------------------------------------------------------

export interface AccessTokenClaims {
  readonly accountId: UserId;
  readonly sessionId: string;
  readonly tokenVersion: number;
}

export interface SignedToken {
  readonly token: string;
  readonly expiresAt: Date;
}

export type TokenVerificationError = 'invalid' | 'expired';

export interface TokenSigner {
  signAccessToken(claims: AccessTokenClaims, now: Date): Promise<SignedToken>;
  verifyAccessToken(token: string, now: Date): Promise<Result<AccessTokenClaims, TokenVerificationError>>;
  /** The short-lived intermediate between password success and MFA proof. */
  signChallengeToken(accountId: UserId, now: Date): Promise<SignedToken>;
  verifyChallengeToken(token: string, now: Date): Promise<Result<{ readonly accountId: UserId }, TokenVerificationError>>;
}

/**
 * Where signing keys come from. The local implementation generates an ES256
 * keypair at boot and THROWS outside `KARAR_ENV=local`; a deployment-profile
 * KMS adapter replaces it in a later phase. Key material is opaque here —
 * only the signer's jose adapter knows the concrete types.
 */
export interface TokenKeyProvider {
  readonly algorithm: 'ES256';
  /** Stable key id, stamped into every token header. */
  keyId(): Promise<string>;
  signingKey(): Promise<unknown>;
  verificationKey(kid: string): Promise<unknown | null>;
}

// --- digests ---------------------------------------------------------------

export interface CredentialDigester {
  /** HMAC-SHA256 under the verification pepper — for LOW-entropy one-time codes. */
  verificationCodeDigest(code: string): string;
  /** HMAC-SHA256 under the verification pepper — reset tokens share the pepper. */
  resetTokenDigest(token: string): string;
  /** Plain SHA-256 hex — refresh tokens and recovery codes are >=128-bit random. */
  refreshTokenDigest(token: string): string;
  recoveryCodeDigest(code: string): string;
  /** HMAC-SHA256 under the digest pepper — the ONLY form an address is stored in. */
  ipDigest(clientIp: string): string;
  /** Constant-time equality of two hex digests. */
  digestsEqual(a: string, b: string): boolean;
}

// --- randomness ------------------------------------------------------------

export interface SecretSource {
  /** UUID v7 — time-ordered ids for rows (data-model.md §2). */
  id(): string;
  /** 32 random bytes, base64url — refresh tokens and reset tokens. */
  refreshToken(): string;
  resetToken(): string;
  /** 8-char Crockford-base32 (40 bits) — human-typable verification codes. */
  verificationCode(): string;
  /** 128-bit random, base32 — recovery codes. */
  recoveryCode(): string;
}

// --- TOTP ------------------------------------------------------------------

export interface TotpService {
  /** Fresh base32 shared secret. */
  generateSecret(): string;
  /** 30s step, ±1 step window. Constant-time compare inside the adapter. */
  verify(code: string, secret: string, now: Date): Promise<boolean>;
  /** otpauth:// URL for the enrol response's QR code. */
  otpauthUrl(secret: string, accountLabel: string): string;
}

// --- MFA secret encryption -------------------------------------------------

export interface EncryptedSecret {
  readonly ciphertext: Uint8Array;
  /** KeyVersionRef provenance string (ADR-0017). */
  readonly keyVersion: string;
}

export interface MfaSecretCipher {
  encrypt(plaintextSecret: string): Promise<EncryptedSecret>;
  decrypt(secret: EncryptedSecret): Promise<string>;
}
