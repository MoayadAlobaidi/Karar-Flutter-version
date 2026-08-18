/**
 * The deduplication fingerprint port — declared here, for the statement
 * ingestion workstream to consume.
 *
 * This module owns the transactions the CSV pipeline commits into, so it owns
 * the definition of "the same transaction". The pipeline computes a
 * fingerprint through this port and hands it over; the unique constraint in
 * migration 0090 is what actually makes a duplicate commit impossible under
 * concurrency, and this port is what makes the value in that constraint
 * mean something.
 *
 * ## Why KEYED, and not a plain hash of the obvious fields
 *
 * The obvious implementation is `sha256(date | amount | merchant)`. It is
 * also a **confirmation oracle over highly sensitive financial data**. The
 * input space is small and entirely guessable: a date within a plausible
 * range, an amount to two or three decimals, and a merchant name from a short
 * list. Anyone who can read the fingerprint column — a backup, a replica, a
 * support export, a compromised read-only credential — can test "did this
 * person pay 45.00 QAR at this merchant on this day?" offline and get a
 * definitive yes. Every other HSF field on the row is encrypted precisely so
 * that reading the table does not reveal behaviour; an unkeyed digest of
 * those same fields hands the behaviour back in a form that survives
 * encryption entirely.
 *
 * A keyed MAC removes the oracle: without the key the digest cannot be
 * recomputed, so it cannot be tested against a guess.
 *
 * ## Why the key is derived PER SUBJECT
 *
 * A single platform key would still let identical transactions belonging to
 * different people produce identical digests, turning the column into a
 * cross-subject join key inside a shared table — "these two accounts bought
 * the same thing at the same time" without decrypting anything. Deriving the
 * MAC key per `(tenantId, userId)` makes two subjects' identical purchases
 * unrelated values, so the column can only ever answer the one question it
 * exists to answer: is this row already present for THIS subject on THIS
 * account.
 *
 * ## Why VERSIONED
 *
 * The fingerprint definition is not eternal: which fields participate, how
 * narrative is normalised (Arabic-Indic digits, U+066B/U+066C separators,
 * accounting negatives), and how dates are truncated will all change. A
 * digest whose definition is unrecorded becomes uninterpretable the moment
 * the definition moves, and a silent redefinition either resurrects
 * duplicates or hides genuine new rows. The version travels with the value,
 * is stored on the row, and participates in the unique constraint — so a
 * version bump starts a fresh namespace instead of colliding with the old one.
 *
 * ## Why the input carries an occurrence ordinal
 *
 * Two genuinely identical purchases exist: the same coffee, the same price,
 * the same shop, twice in one day. Without a discriminator, "exact duplicates
 * are impossible" would also make the second real purchase impossible. The
 * ordinal is that discriminator, and it is supplied explicitly — a reviewed
 * import or a person says "this is the second one", rather than the system
 * guessing that a repeat is legitimate.
 */

import type { AccountRef } from '../../domain/refs.js';
import type { TransactionsPrincipal } from './principal-context.js';

/**
 * The content a fingerprint is computed over. Content only: nothing derived
 * from a key, a ciphertext, or a row id may participate (packages/platform
 * keys/custody.ts states the rule — ciphertext changes on rotation and on
 * every fresh nonce, so an identifier derived from it would silently change
 * identity, and an identifier derived from a row id would make every row
 * unique and the constraint useless).
 */
export interface FingerprintInput {
  readonly accountRef: AccountRef;
  /** The booking instant; the implementation truncates it per its version's rule. */
  readonly bookingDate: Date;
  /** Exact minor units, signed under the canonical convention. */
  readonly amountMinorUnits: bigint;
  readonly currencyCode: string;
  /**
   * The narrative AFTER the normalisation the version names. Supplied by the
   * caller rather than normalised here: normalisation is the ingestion
   * workstream's ruleset, versioned separately, and duplicating it here would
   * create two rulesets that must agree forever.
   */
  readonly normalizedNarrative: string;
  /** 1 for the first occurrence; 2 for a genuine second identical movement. */
  readonly occurrenceOrdinal: number;
}

/** An opaque digest plus the definition that produced it. */
export interface DedupFingerprint {
  readonly version: string;
  /** Opaque; the only supported operation is equality against another of the same version. */
  readonly value: string;
}

export interface DedupFingerprintPort {
  /** The version this implementation mints. Stored with every value it produces. */
  readonly version: string;

  /**
   * The fingerprint of `input` for `principal`. Deterministic for a fixed
   * principal, version, and input — the constraint depends on it, so an
   * implementation that folded in a nonce or a clock reading would make every
   * commit a new row.
   */
  fingerprint(
    principal: TransactionsPrincipal,
    input: FingerprintInput,
  ): Promise<DedupFingerprint>;
}
