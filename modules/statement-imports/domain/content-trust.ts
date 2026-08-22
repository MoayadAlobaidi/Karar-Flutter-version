/**
 * Statement-import specifics on top of the universal trust model.
 *
 * The classes, the origins, the constructors and the compile-time proofs live
 * in `@karar/content-trust`, because passwords, future chat, deep links and
 * tool output ask the same question a CSV cell does and identity cannot
 * import a statement parser to ask it. What stays here is what is genuinely
 * about STATEMENTS: which acquisition an uploaded file is, how a recorded
 * narrative's provenance maps to a class, and the wrapper the parser hands
 * around.
 *
 * Re-exported wholesale so every existing import keeps working and there is
 * still exactly one place a reader has to look.
 */
export * from '@karar/content-trust';

import {
  type ContentTrust,
  type ContentTrustClass,
  type PlatformFactDerivation,
  type TrustedPlatformInstruction,
  type TrustedStructuredPlatformFact,
  type UntrustedContentTrust,
  untrustedContent,
} from '@karar/content-trust';

export const UPLOADED_FILE_CONTENT: UntrustedContentTrust = untrustedContent(
  'SUBJECT_UPLOADED_FILE',
);

/** Text a person typed into Karar: an account label, a note, an issuer name. */
export const SUBJECT_TYPED_CONTENT: UntrustedContentTrust = untrustedContent('SUBJECT_TYPED');

/**
 * A figure, day, currency or direction this platform read out of untrusted
 * text under a named ruleset.
 *
 * The narrative it was read from stays untrusted and is unchanged by this
 * call. `1.234` becoming `123400` minor units under
 * `statement-csv/normalization/v1` does not make the cell trustworthy; it
 * makes the RESULT a fact whose derivation is recorded.
 */
export function structuredPlatformFact(input: {
  readonly derivation: PlatformFactDerivation;
  readonly rulesetVersion: string;
  readonly derivedFrom: UntrustedContentTrust;
}): TrustedStructuredPlatformFact {
  if (input.rulesetVersion === '') {
    throw new Error(
      'a derived fact must name the ruleset version that produced it; a figure whose rules are ' +
        'unrecorded becomes uninterpretable the moment those rules change',
    );
  }
  return Object.freeze({
    trust: 'TRUSTED_STRUCTURED_PLATFORM_FACT' as const,
    derivation: input.derivation,
    rulesetVersion: input.rulesetVersion,
    derivedFrom: input.derivedFrom,
  });
}

// ---------------------------------------------------------------------------
// Predicates — the single reading of the vocabulary
// ---------------------------------------------------------------------------

/**
 * True for the ONE class that may direct behaviour.
 *
 * Note what it does not do: it does not consult the origin's content, because
 * nothing here reads what an origin points at. It answers "was this authored
 * by the platform", which is the only question a type can answer — and it
 * answers `false` for a derived fact, which is trusted as a value and has no
 * authority whatsoever.
 */
export function carriesInstructionAuthority(
  trust: ContentTrust,
): trust is TrustedPlatformInstruction {
  return trust.trust === 'TRUSTED_PLATFORM_INSTRUCTION';
}

/** True for content that arrived rather than content this platform authored. */
export function isUntrusted(trust: ContentTrust): trust is UntrustedContentTrust {
  return trust.trust === 'UNTRUSTED_USER_CONTENT' || trust.trust === 'UNTRUSTED_EXTERNAL_CONTENT';
}

/** The class word, for a reader that needs one. Never an input to a decision. */
export function trustClassOf(trust: ContentTrust): ContentTrustClass {
  return trust.trust;
}

// ---------------------------------------------------------------------------
// The classification of a RECORDED narrative, derived rather than stored
// ---------------------------------------------------------------------------

/**
 * `transaction_provenance.source_kind` — the vocabulary migration 0091 already
 * enforces with a NOT NULL CHECK on every revision of every transaction.
 *
 * Restated here so the function below is exhaustive over the real column
 * rather than over a hopeful subset.
 */
export const RECORDED_NARRATIVE_ORIGINS = ['MANUAL', 'CSV'] as const;
export type RecordedNarrativeOrigin = (typeof RECORDED_NARRATIVE_ORIGINS)[number];

/**
 * The trust class of a stored narrative, computed from provenance that is
 * already persisted.
 *
 * **This function is why no `content_trust_class` column exists**, and the
 * reasoning is worth stating where the code is rather than only in the ADR.
 * Every canonical transaction already carries `source_kind`, NOT NULL, CHECKed
 * to exactly two values, on every revision. A trust column beside it would
 * hold a value derivable from it — which is to say, a second place for the
 * same fact to live and a first opportunity for the two to disagree. A denormalised
 * constant is not a control; it is a second thing to keep true.
 *
 * The `never` arm is the load-bearing part: a third `source_kind` added to
 * migration history fails the BUILD here rather than falling through to a
 * default. There is deliberately no `default:` returning something safe-looking
 * — a rail nobody classified is a rail nobody thought about.
 */
export function trustOfRecordedNarrative(
  sourceKind: RecordedNarrativeOrigin,
): UntrustedContentTrust {
  switch (sourceKind) {
    case 'MANUAL':
      return SUBJECT_TYPED_CONTENT;
    case 'CSV':
      return UPLOADED_FILE_CONTENT;
    default: {
      const unhandled: never = sourceKind;
      throw new Error(
        `no trust classification exists for source kind ${JSON.stringify(String(unhandled))}. ` +
          'A narrative whose origin nobody classified is not defaulted to anything: classify it ' +
          'here, deliberately, or the content has no boundary at all',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// The typed wrapper at the one boundary where raw file text escapes as a string
// ---------------------------------------------------------------------------

/** What an accidental rendering of untrusted source text shows instead. */
export const UNTRUSTED_REDACTION = '[UNTRUSTED_SOURCE_TEXT redacted]';

/**
 * Raw text from a source, carried as a value that cannot leak through a log
 * line and cannot be concatenated into anything by accident.
 *
 * ## Why this exists when `HsfField` already does
 *
 * `HsfField` wraps the three narrative fields a transaction carries and its
 * concern is SENSITIVITY: those values are `HIGHLY_SENSITIVE_FINANCIAL` and
 * must not reach a log. This wrapper's concern is AUTHORITY, and it applies to
 * text that is not necessarily sensitive at all — a CSV header saying
 * `Amount`, for instance. The two overlap on most fields and are not the same
 * question, and a header is precisely the value that proves it: harmless to
 * read, and dangerous the moment a mapping starts matching on its text.
 *
 * The header is the one place in this module where text from the file used to
 * escape as a bare `string[]`. `reason-codes.ts` already records why that is
 * the value to worry about: a header in a real export says
 * `Acct 4471-2299-0031 balance` as readily as it says `Amount`.
 *
 * ## Every accidental rendering path yields the redaction
 *
 * `toString`, `toJSON`, `util.inspect` and template-literal coercion, exactly
 * as `HsfField` and the platform's `SecretValue` do. The real characters are
 * reachable only through `reveal()`, which is grep-able at every call site.
 * It is deliberately NOT a branded string: a branded string is still a string,
 * and `console.log(header)` would print it, and `` `read ${header}` `` would
 * put it in an exception message that ends up in an error tracker.
 *
 * **It does not modify the text.** No trimming, no escaping, no prefixing, no
 * normalisation. What the file said is what `reveal()` returns, byte for byte.
 */
export class UntrustedSourceText {
  readonly #value: string;

  /** How this text arrived. Always an untrusted arm — the type says so. */
  readonly trust: UntrustedContentTrust;

  private constructor(value: string, trust: UntrustedContentTrust) {
    this.#value = value;
    this.trust = trust;
    Object.freeze(this);
  }

  /**
   * Wraps source text with its classification.
   *
   * The runtime check is belt-and-braces over a type that already forbids a
   * trusted arm: the failure it guards against is a cast, and a cast is what
   * somebody reaches for at the exact moment this rule is inconvenient.
   */
  static of(value: string, trust: UntrustedContentTrust): UntrustedSourceText {
    if (typeof value !== 'string') {
      throw new TypeError('untrusted source text requires a string value');
    }
    if (!isUntrusted(trust)) {
      throw new Error(
        'source text cannot be classified as trusted. Text that arrived is untrusted by ' +
          'definition, and a trusted classification attached to it would be this platform ' +
          'vouching for something it did not author',
      );
    }
    return new UntrustedSourceText(value, trust);
  }

  /** Explicit, grep-able access to the characters. Unmodified. */
  reveal(): string {
    return this.#value;
  }

  /** Character count. A length is not content. */
  get length(): number {
    return this.#value.length;
  }

  /** Value equality on the characters, for tests and comparisons. */
  equals(other: UntrustedSourceText | null): boolean {
    return other !== null && other.#value === this.#value;
  }

  toString(): string {
    return UNTRUSTED_REDACTION;
  }

  toJSON(): string {
    return UNTRUSTED_REDACTION;
  }

  /** `util.inspect` / `console.log` (symbol form avoids a node:util import). */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return UNTRUSTED_REDACTION;
  }

  /** String coercion in template literals and `+`. */
  [Symbol.toPrimitive](): string {
    return UNTRUSTED_REDACTION;
  }
}
