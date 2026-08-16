/**
 * MFA shapes. The TOTP secret appears in domain and application code ONLY as
 * plaintext-in-flight during enrolment and verification — at rest it is an
 * EncryptionProvider envelope (ciphertext + key-version provenance,
 * ADR-0017), and nothing here serializes, logs, or returns it after
 * confirmation.
 */

import type { UserId } from '@karar/shared-kernel';

export interface MfaEnrolment {
  readonly accountId: UserId;
  readonly type: 'totp';
  readonly secretCiphertext: Uint8Array;
  /** KeyVersionRef string that produced the ciphertext (ADR-0017 provenance). */
  readonly keyVersion: string;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
  readonly disabledAt: Date | null;
}

/** Enrolled, proven, and not turned off — the state that gates login on MFA. */
export function isMfaActive(enrolment: MfaEnrolment | null): enrolment is MfaEnrolment {
  return enrolment !== null && enrolment.confirmedAt !== null && enrolment.disabledAt === null;
}

export const RECOVERY_CODE_COUNT = 10;
