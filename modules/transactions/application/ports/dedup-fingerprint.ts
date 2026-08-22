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
 * accounting negatives), and what KIND of value the date is will all change.
 * A digest whose definition is unrecorded becomes uninterpretable the moment
 * the definition moves, and a silent redefinition either resurrects
 * duplicates or hides genuine new rows. The version travels with the value,
 * is stored on the row, and participates in the unique constraint — so a
 * version bump starts a fresh namespace instead of colliding with the old one.
 *
 * It has moved once already, for exactly that reason. The previous definition
 * took a booking INSTANT and truncated it to a UTC day; the day is now a
 * `CalendarDay` and enters the digest as its own `YYYY-MM-DD` string
 * (ADR-0027). That is a change to what the input IS, so it took a new
 * version rather than a quiet substitution — see the LOCAL adapter for the
 * identifier and the reasoning.
 *
 * ## Why the input carries NO occurrence ordinal
 *
 * Two genuinely identical purchases exist: the same coffee, the same price,
 * the same shop, twice in one day. That is a fact about how many times one
 * content identity occurred — not a fact about what the content IS. So the
 * discriminator is a separate explicit column (`occurrence_ordinal` on the
 * row, `occurrenceOrdinal` on `TransactionCommit`), and the digest stays
 * purely a statement about content.
 *
 * Keeping them apart is what makes each answerable. Fold the ordinal into the
 * digest and the second coffee acquires a second, unrelated content identity:
 * "have I seen this content before?" can no longer be asked without guessing
 * every ordinal it might have been recorded under, and the unique constraint
 * ends up enforcing something the digest no longer describes. Migration 0090
 * carries the same split — content identity, legitimate repeat, and duplicate
 * handling as three concepts — and the unique key is over the fingerprint AND
 * the ordinal, with the guard there refusing any ordinal but the next unused
 * one, so a high ordinal is not a way around duplicate review.
 */

import type { CalendarDay } from '@karar/shared-kernel';

import type { AccountRef } from '../../domain/refs.js';
import type { TransactionsPrincipal } from './principal-context.js';

/**
 * The content a fingerprint is computed over: **these five fields and nothing
 * else.** The list is exhaustive by design, and every absence below is a
 * decision rather than an omission.
 *
 *  - Nothing derived from a key, a ciphertext, or a row id may participate
 *    (packages/platform keys/custody.ts states the rule — ciphertext changes
 *    on rotation and on every fresh nonce, so an identifier derived from it
 *    would silently change identity, and an identifier derived from a row id
 *    would make every row unique and the constraint useless).
 *  - Nothing about OCCURRENCE. There is deliberately no `occurrenceOrdinal`
 *    field here; see the header.
 *  - **Nothing about the instant a movement happened.** There is deliberately
 *    no `eventOccurredAt` and no `sourceTimezone` field either. Those record
 *    WHEN something happened; the digest answers WHAT it is. One export of a
 *    statement may carry a time and the next may not, and both describe the
 *    same movement — folding the instant in would make the second import a
 *    new transaction rather than a duplicate.
 *  - **No timezone of any kind.** Not the server's, not the device's, and not
 *    one inferred from the account's country. The day arrives as a
 *    `CalendarDay`, which has no timezone to consult, so the same statement
 *    row cannot fingerprint differently in Doha and in Toronto.
 */
export interface FingerprintInput {
  readonly accountRef: AccountRef;
  /**
   * The source's booking day, as a calendar day. Enters the digest as its
   * `YYYY-MM-DD` string — nothing is truncated, because there is no time to
   * truncate and no midnight to invent (ADR-0027).
   */
  readonly bookingDate: CalendarDay;
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
