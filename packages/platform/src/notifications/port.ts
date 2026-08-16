/**
 * Notification port — how the platform tells a subject something happened.
 *
 * Phase 3 scope: the identity flows (verification codes, reset tokens,
 * security notices). The port is transport-neutral on purpose — a real mail
 * or push provider implements it under a deployment profile in a later
 * phase; locally the only implementation is the LocalMailSink, which is a
 * capture buffer, not a delivery mechanism.
 *
 * Payload rule: a notification names WHAT happened, never the material that
 * makes it exploitable. Verification and reset messages carry their one-time
 * code — that is the message's entire purpose — but security notices carry
 * event names and coarse context only: no passwords, no hashes, no tokens,
 * no MFA secrets (docs/security/secrets.md §1). The identity module's
 * secret-leak regression test greps captured messages for exactly this.
 */

export const SECURITY_NOTICE_KINDS = [
  'password_changed',
  'password_reset_completed',
  'refresh_reuse_detected',
  'mfa_enrolled',
  'mfa_disabled',
  'account_disabled',
] as const;
export type SecurityNoticeKind = (typeof SECURITY_NOTICE_KINDS)[number];

export interface VerificationMessage {
  readonly to: string;
  /** The one-time code the subject must present. The message IS the delivery. */
  readonly code: string;
  readonly expiresAt: Date;
}

export interface PasswordResetMessage {
  readonly to: string;
  /** The one-time reset token. The message IS the delivery. */
  readonly token: string;
  readonly expiresAt: Date;
}

export interface SecurityNotice {
  readonly to: string;
  readonly kind: SecurityNoticeKind;
  /** Coarse, safe scalar context (e.g. userAgentSummary). Never secrets. */
  readonly context?: Readonly<Record<string, string>>;
}

/** Delivery failure as a value: the caller decides what its flow does without a notification. */
export interface NotificationError {
  readonly kind: 'unavailable' | 'rejected';
  readonly message: string;
}

export type NotificationResult =
  { readonly ok: true } | { readonly ok: false; readonly error: NotificationError };

export interface NotificationPort {
  sendVerificationCode(message: VerificationMessage): Promise<NotificationResult>;
  sendPasswordReset(message: PasswordResetMessage): Promise<NotificationResult>;
  sendSecurityNotice(notice: SecurityNotice): Promise<NotificationResult>;
}
