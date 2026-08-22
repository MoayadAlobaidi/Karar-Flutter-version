/**
 * `HsfField` — a `HIGHLY_SENSITIVE_FINANCIAL` text value this module can hold
 * and reason about without ever rendering it by accident.
 *
 * Two fields in this module are HSF: the mask a person recognises an
 * instrument by, and the name they gave it. The first is a fragment of a card
 * number and the second says which products someone holds; neither belongs in
 * a log line, an exception, or a serialized error body.
 *
 * Reimplemented here rather than imported from `modules/transactions`,
 * `modules/financial-accounts` or `modules/financial-connections`, for the
 * reason each of those gives about its own copy: nothing crosses a module
 * boundary except through `public-api.ts` (architecture test 3), and a shared
 * domain type would be a coupling no module's boundary admits.
 *
 * The domain holds PLAINTEXT in memory, inside a wrapper that cannot leak
 * through a log line; encryption at rest is an INFRASTRUCTURE concern behind
 * `HsfFieldEncryptionPort`, and nothing in the domain knows about keys,
 * nonces or algorithms. Every accidental rendering path yields a redaction
 * marker: `toString`, `toJSON`, `util.inspect`, and template-literal
 * coercion. The real characters are reachable only through `reveal()`, which
 * is grep-able at call sites, and the type is deliberately NOT a branded
 * string — a branded string is still a string, and `console.log(mask)` would
 * print it.
 */

export class InvalidHsfFieldError extends Error {
  override readonly name = 'InvalidHsfFieldError';
}

/** What a leaked rendering shows instead of the value. */
export const HSF_REDACTION = '[HIGHLY_SENSITIVE_FINANCIAL redacted]';

/**
 * Upper bound on a single field, in UTF-16 code units. Not a legal limit and
 * not a retention decision: a bound so an unbounded field cannot become an
 * unbounded ciphertext column, and so a field named for a LABEL cannot become
 * a place to keep notes the classification does not cover. Migration 0098
 * carries the matching 360-byte bound on the label ciphertext — 120
 * characters of UTF-8 in the worst case — and a far tighter EIGHT-byte bound
 * on the mask, which `MAX_INSTRUMENT_MASK_LENGTH` restates in characters.
 */
export const HSF_FIELD_MAX_LENGTH = 120;

export class HsfField {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  /**
   * Wraps plaintext. Throws rather than returning a `Result`, and that is
   * deliberate: by the time a value reaches here the domain rules have
   * already turned every EXPECTED refusal (empty, over-long, PAN-shaped) into
   * a `Result` arm the caller handles. Reaching this constructor with a value
   * those rules would reject is a defect in this module, not an outcome a
   * user produced.
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

  /** Value equality on the plaintext, for change detection on an edit. */
  equals(other: HsfField | null): boolean {
    return other !== null && other.#value === this.#value;
  }

  /** Character count — safe to expose; a length is not an identity. */
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
