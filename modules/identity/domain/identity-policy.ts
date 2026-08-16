/**
 * Identity policy knobs with their platform defaults. A single object so
 * every threshold is named, testable, and overridable at composition — no
 * magic number lives inside a use case. (Retention periods are NOT here:
 * those belong to policy configuration per ADR-0026.)
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface IdentityPolicy {
  /** Access-token lifetime (claims `exp - iat`). */
  readonly accessTokenTtlMs: number;
  /** MFA challenge-token lifetime — the window between password and code. */
  readonly challengeTokenTtlMs: number;
  /** Each refresh token's own lifetime. */
  readonly refreshTokenTtlMs: number;
  /** Hard ceiling on a session regardless of activity. */
  readonly sessionAbsoluteTtlMs: number;
  /** Rolling idle expiry; null disables idle expiry (the default). */
  readonly sessionIdleTtlMs: number | null;
  /** Verification codes: lifetime, per-code attempt cap, per-account resend cooldown. */
  readonly verificationCodeTtlMs: number;
  readonly verificationMaxAttempts: number;
  readonly verificationResendCooldownMs: number;
  /** Reset tokens: lifetime, per-request attempt cap, per-account request cooldown. */
  readonly resetTokenTtlMs: number;
  readonly resetMaxAttempts: number;
  readonly resetRequestCooldownMs: number;
  /** Lockout: failed logins per (account, ip digest) inside the window. */
  readonly lockoutThreshold: number;
  readonly lockoutWindowMs: number;
  /** Recovery codes: failed attempts per account inside the window. */
  readonly recoveryLockThreshold: number;
  readonly recoveryLockWindowMs: number;
  /** Password shape bounds (NIST 800-63B posture: length, no composition rules). */
  readonly passwordMinLength: number;
  readonly passwordMaxLength: number;
}

export const DEFAULT_IDENTITY_POLICY: IdentityPolicy = Object.freeze({
  accessTokenTtlMs: 10 * MINUTE_MS,
  challengeTokenTtlMs: 5 * MINUTE_MS,
  refreshTokenTtlMs: 14 * DAY_MS,
  sessionAbsoluteTtlMs: 90 * DAY_MS,
  sessionIdleTtlMs: null,
  verificationCodeTtlMs: 30 * MINUTE_MS,
  verificationMaxAttempts: 5,
  verificationResendCooldownMs: 60 * 1000,
  resetTokenTtlMs: 30 * MINUTE_MS,
  resetMaxAttempts: 5,
  resetRequestCooldownMs: 60 * 1000,
  lockoutThreshold: 10,
  lockoutWindowMs: 15 * MINUTE_MS,
  recoveryLockThreshold: 5,
  recoveryLockWindowMs: 15 * MINUTE_MS,
  passwordMinLength: 8,
  passwordMaxLength: 512,
});
