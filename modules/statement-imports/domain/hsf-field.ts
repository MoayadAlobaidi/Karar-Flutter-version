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
 *
 * Reimplemented here rather than imported from `modules/transactions`, for the
 * reason that module gives about its own copy: nothing crosses a module
 * boundary except through `public-api.ts` (architecture test 3), and a shared
 * domain type would be a coupling no module's boundary admits. In THIS module
 * it wraps a statement line's description and merchant, the source's own
 * transaction reference, and any instrument mask the file named — the last two
 * being another party's identifiers for this subject, which is exactly the
 * category that must never reach a log line, a preview, or an error.
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

/**
 * Upper bound on an instrument mask, in UTF-8 BYTES.
 *
 * `statement_import_rows.instrument_mask_ciphertext` carries this same bound
 * in SQL, for a reason the column comment states plainly: so the column
 * cannot quietly become storage for a full card number. AES-256-GCM
 * preserves length, so a byte bound on the ciphertext is a byte bound on the
 * plaintext, and the two numbers must stay equal.
 *
 * It is repeated here rather than left to PostgreSQL alone because a bound
 * enforced only at INSERT arrives as an untyped store failure that ends the
 * whole import, when what actually happened is that ONE cell in ONE row was
 * too long. Refusing it in the domain turns that into an ordinary row error
 * — `(row, INSTRUMENT_MASK, FIELD_TOO_LARGE)` — and the other rows import.
 *
 * Bytes, not characters: {@link HSF_FIELD_MAX_LENGTH} counts UTF-16 code
 * units, but the column counts bytes, so a short string of multi-byte
 * characters can satisfy the character bound and still break the byte one.
 * `statement-row-mask-bound.test.ts` holds this equal to the migration.
 */
export const INSTRUMENT_MASK_MAX_BYTES = 32;

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
