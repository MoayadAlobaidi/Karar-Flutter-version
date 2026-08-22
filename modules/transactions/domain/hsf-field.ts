/**
 * `HsfField` — a `HIGHLY_SENSITIVE_FINANCIAL` text value the domain can hold
 * and reason about without ever rendering it by accident.
 *
 * Merchant, description, and note are the three free-text fields a
 * transaction carries, and all three are HSF: a merchant name plus an amount
 * plus a date is a behavioural record of a person. The domain still needs
 * them as VALUES — a correction compares old to new, a revision records what
 * changed, a fingerprint hashes normalised content — so they cannot simply be
 * "ciphertext the domain never sees".
 *
 * The split this type encodes: the domain holds PLAINTEXT in memory, in a
 * wrapper that cannot leak through a log line; encryption at rest is an
 * INFRASTRUCTURE concern behind the `HsfFieldEncryption` port, and the domain
 * knows nothing about keys, nonces, or algorithms.
 *
 * Every accidental rendering path yields a redaction marker, exactly as the
 * platform's `SecretValue` does for secrets: `toString`, `toJSON`,
 * `util.inspect`, and template-literal coercion. The real characters are
 * reachable only through `reveal()`, which is grep-able at call sites, and
 * the type is deliberately NOT a branded string — a branded string is still a
 * string, and `console.log(merchant)` would print it.
 */

export class InvalidHsfFieldError extends Error {
  override readonly name = 'InvalidHsfFieldError';
}

/** What a leaked rendering shows instead of the value. */
export const HSF_REDACTION = '[HIGHLY_SENSITIVE_FINANCIAL redacted]';

/**
 * Upper bound on a single field, in UTF-16 code units. Not a legal limit and
 * not a retention decision: a bound so an unbounded field cannot become an
 * unbounded ciphertext column. Statement narratives in the launch markets sit
 * far below this; anything above it is a parser accident, and rejecting is
 * the rule (reject, never truncate — a silently shortened financial record is
 * a wrong one that looks right).
 */
export const HSF_FIELD_MAX_LENGTH = 512;

export class HsfField {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  /**
   * Wraps plaintext. Rejects an empty or whitespace-only value: "present but
   * blank" and "absent" are the same fact, and letting both exist would put
   * two encodings of absence into storage and into every comparison.
   */
  static of(value: string): HsfField {
    if (typeof value !== 'string') {
      throw new InvalidHsfFieldError('an HSF field requires a string value');
    }
    if (value.trim() === '') {
      throw new InvalidHsfFieldError(
        'an HSF field requires a non-blank value; absence is expressed as null, not as an empty string',
      );
    }
    if (value.length > HSF_FIELD_MAX_LENGTH) {
      throw new InvalidHsfFieldError(
        `an HSF field is bounded at ${HSF_FIELD_MAX_LENGTH} characters; longer input is refused, never truncated`,
      );
    }
    if (value.includes('\0')) {
      throw new InvalidHsfFieldError('an HSF field may not contain a NUL character');
    }
    return new HsfField(value);
  }

  /** `null` in, `null` out — the optional-field constructor. */
  static optional(value: string | null | undefined): HsfField | null {
    return value === null || value === undefined ? null : HsfField.of(value);
  }

  /** Explicit, grep-able access to the plaintext. */
  reveal(): string {
    return this.#value;
  }

  /** Value equality on the plaintext, for correction detection. */
  equals(other: HsfField | null): boolean {
    return other !== null && other.#value === this.#value;
  }

  /** Character count — safe to expose; a length is not a narrative. */
  get length(): number {
    return this.#value.length;
  }

  toString(): string {
    return HSF_REDACTION;
  }

  toJSON(): string {
    return HSF_REDACTION;
  }

  /** `util.inspect` / `console.log` (symbol form avoids a node:util import). */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return HSF_REDACTION;
  }

  /** String coercion in template literals and `+`. */
  [Symbol.toPrimitive](): string {
    return HSF_REDACTION;
  }
}

/** True when two optional fields hold the same fact (both absent counts). */
export function hsfFieldsEqual(left: HsfField | null, right: HsfField | null): boolean {
  if (left === null) return right === null;
  return left.equals(right);
}
