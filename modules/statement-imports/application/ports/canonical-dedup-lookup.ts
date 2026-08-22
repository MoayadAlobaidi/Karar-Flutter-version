/**
 * `CanonicalDedupLookupPort` — "have I already recorded this content, and how
 * many times?", asked of the canonical transactions.
 *
 * ## Why a lookup port and not a second fingerprint
 *
 * The fingerprint itself is `modules/transactions`' `DedupFingerprintPort`,
 * reused through that module's public API. **There is no second algorithm in
 * this module and there must never be one.** What this port adds is the other
 * half of the question, which is a READ over rows that module owns: given a
 * digest, which occurrence ordinals of it already exist for this principal on
 * this account?
 *
 * Both halves are needed and they are different concepts, exactly as
 * `dedup-fingerprint.ts` sets out: the digest says WHAT the content is, and
 * the ordinal says how many times that content occurred. Two identical
 * coffees in one day are one content identity occurring twice. So a staged
 * row is:
 *
 * - `EXACT_DUPLICATE` when the digest AND the ordinal it would claim are both
 *   already recorded — this exact line is already in the ledger;
 * - `VALID` at ordinal N+1 when the digest exists but this file contains a
 *   genuinely further occurrence — the second coffee;
 * - `VALID` at ordinal 1 when the digest is new.
 *
 * ## Why the whole batch is asked at once
 *
 * A statement has thousands of lines and each would otherwise be a query.
 * Batching is not only performance: it makes the answer a single consistent
 * snapshot, so two lines with the same content in one file cannot both be
 * told "you would be ordinal 2".
 *
 * ## What this port must never do
 *
 * It returns ordinals, never rows. No narrative, no amount, no date, no
 * transaction id — a preview built from this must be able to say "12 of these
 * lines are already recorded" without being able to say anything about the
 * records they match.
 */

import type { CanonicalAccountRef } from '../../domain/refs.js';
import type { ImportsPrincipal } from '../principal.js';

/** The occurrences already recorded for one content identity. */
export interface RecordedOccurrences {
  readonly fingerprint: string;
  /** Ascending. Empty means the content has never been recorded. */
  readonly ordinals: readonly number[];
}

export interface CanonicalDedupLookupPort {
  /**
   * For each fingerprint, the ordinals already recorded for this principal on
   * this account under this fingerprint version.
   *
   * A fingerprint with no recorded occurrences may be omitted from the result
   * or returned with an empty `ordinals`; callers treat the two identically,
   * because "absent" and "present with none" are the same fact and forcing an
   * implementation to choose would make the contract depend on how it
   * happened to build its map.
   */
  recordedOccurrences(
    actor: ImportsPrincipal,
    accountRef: CanonicalAccountRef,
    fingerprintVersion: string,
    fingerprints: readonly string[],
  ): Promise<readonly RecordedOccurrences[]>;
}
