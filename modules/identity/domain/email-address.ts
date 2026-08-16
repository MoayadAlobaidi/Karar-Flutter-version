/**
 * E-mail normalization and shape validation.
 *
 * Normalization is the module's ONE canonical form — trim, lowercase, NFC —
 * applied at every boundary before comparison, storage, or digesting, so
 * `User@Example.com ` and `user@example.com` are the same account
 * everywhere (the 0030 CHECK constraint makes a bypassed normalization a
 * hard database error rather than a duplicate).
 *
 * Validation is deliberately pragmatic: one non-space local part, one `@`,
 * a dotted domain. RFC 5321 pathologies (quoted locals, address literals)
 * are rejected — an address this platform cannot later send mail to is not
 * an identity it should mint.
 */

import { Result } from '@karar/shared-kernel';

export type NormalizedEmail = string & { readonly __brand: 'NormalizedEmail' };

export class InvalidEmailError extends Error {
  override readonly name = 'InvalidEmailError';

  constructor() {
    // Deliberately value-free: raw input never rides an error message.
    super('the supplied e-mail address is not acceptable');
  }
}

const MAX_EMAIL_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFC');
}

/** Normalize, then validate. External input path — a `Result`, never a throw. */
export function parseEmail(raw: string): Result<NormalizedEmail, InvalidEmailError> {
  const normalized = normalizeEmail(raw);
  if (normalized.length === 0 || normalized.length > MAX_EMAIL_LENGTH) {
    return Result.err(new InvalidEmailError());
  }
  if (!EMAIL_SHAPE.test(normalized)) {
    return Result.err(new InvalidEmailError());
  }
  return Result.ok(normalized as NormalizedEmail);
}
