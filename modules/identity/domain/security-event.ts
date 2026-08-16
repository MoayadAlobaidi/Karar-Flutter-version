/**
 * Authentication security-event vocabulary — the closed set of event names
 * the append-only ledger (`public.authentication_security_events`, migration
 * 0033) may hold. The ledger is both the investigation record and the
 * LOCKOUT COUNTER: lockout state is derived by counting rows, never kept as
 * a mutable field, which is what makes "the counter must not reset when the
 * lock applies" (legacy AUTHN-11) structural instead of disciplined.
 *
 * `login_locked` (an attempt while locked) is deliberately distinct from
 * `login_failed` (a failed credential check): only the latter counts toward
 * the lock, so a lock cannot extend itself; both preserve history.
 */

export const SECURITY_EVENT_TYPES = [
  'registration_duplicate',
  'verification_email_sent',
  'verification_failed',
  'email_verified',
  'login_succeeded',
  'login_failed',
  'login_locked',
  'account_disabled_login_attempt',
  'mfa_challenge_issued',
  'mfa_challenge_failed',
  'mfa_completed',
  'mfa_enrolled',
  'mfa_confirmed',
  'mfa_disabled',
  'recovery_code_used',
  'recovery_code_failed',
  'recovery_locked',
  'refresh_reuse_detected',
  'session_revoked',
  'sessions_revoked_bulk',
  'password_reset_requested',
  'password_reset_failed',
  'password_reset_completed',
  'password_changed',
  'account_disabled',
  'account_enabled',
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

/**
 * Guarded metadata: small scalar facts only. Credentials, codes, tokens,
 * secrets, raw addresses, and raw e-mail addresses are structurally absent —
 * the recorder's guard rejects suspicious keys as a defect at the call site.
 */
export type SecurityEventMetadata = Readonly<Record<string, string | number | boolean | null>>;

export interface SecurityEvent {
  /** Opaque account reference (the platform UserId), or null when unresolved. */
  readonly accountId: string | null;
  readonly eventType: SecurityEventType;
  readonly occurredAt: Date;
  /** HMAC digest of the client address — never a raw address. */
  readonly ipDigest: string | null;
  readonly metadata: SecurityEventMetadata | null;
}
