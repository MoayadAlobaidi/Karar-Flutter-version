/**
 * GenerateTransferMatchSuggestions — the platform asks the question, and
 * NOTHING ELSE happens.
 *
 * ## What this closes
 *
 * `SuggestTransferMatch` has always been able to write a `SUGGESTED` row from
 * two ids somebody already chose. Until this use case existed, nobody chose
 * them: MODULE.md recorded "**No automatic suggestion pass**" as a known
 * limitation, so a person's own money moving between their own accounts stayed
 * an expense plus an income until they hand-paired the two — which no screen
 * asked them to do. This is the thing that finds the pair.
 *
 * ## THE RULE THAT SHAPES THIS FILE: a client may never propose a match
 *
 * Suggestion generation is TRUSTED PLATFORM LOGIC. It is reached from inside
 * the platform, after a transaction has been written, and there is deliberately
 * **no HTTP verb anywhere that lets a caller propose a pairing**. The reason is
 * not tidiness: a caller-supplied pair is a caller asserting a relationship
 * between two records it did not observe, and the one thing this module must
 * never do is record such an assertion as though the platform found it. The
 * input below therefore carries ONE id — the transaction that was just written
 * — and the counterpart is found here, from the person's own rows, under the
 * person's own principal.
 *
 * `SuggestTransferMatch` is still reachable from this module's public API,
 * because THIS use case calls it. It is not mounted on any route, and the
 * composition root that mounts the financial surface mounts confirm, reject and
 * list — never suggest.
 *
 * ## A SUGGESTION STILL CHANGES NOTHING
 *
 * Everything the rest of this module says about `SUGGESTED` holds unchanged
 * here, and automating the question is exactly why it has to. A row this
 * produces nets nothing off, totals nothing, moves no category, and is not a
 * fact about anybody's money. **Only the subject's confirmation makes a match
 * authoritative**, and this use case cannot produce a confirmation: it delegates
 * to a constructor that has no state parameter and writes
 * `subjectDecidedAt: null` by construction, into a table whose CHECK constraint
 * refuses `CONFIRMED` without a recorded decision instant.
 *
 * ## The rules, and where each one is actually held
 *
 * | # | Rule | Held by |
 * |---|---|---|
 * | 1 | same subject — one tenant, one user | the principal, three times over: the anchor is resolved under it, the candidate window is read under it (RLS), and the delegated write resolves BOTH sides under it again |
 * | 2 | two DIFFERENT transactions | the window read excludes the anchor's own id, and `checkSuggestable` refuses it anyway |
 * | 3 | two DIFFERENT accounts | the window read excludes the anchor's account, and `checkSuggestable` refuses it anyway |
 * | 4 | the SAME currency | the window read narrows to the anchor's currency, and `checkSuggestable` refuses a mismatch before it compares any amount |
 * | 5 | equal and opposite | `domain/equal-and-opposite.ts`, over every row the window returned |
 * | 6 | inside the declared window | `suggestionWindowBounds` narrows the read and `isWithinSuggestionWindow` decides |
 * | 7 | both POSTED | the window read asks for POSTED and the anchor's status is checked here; the delegated write checks both again |
 * | 8 | neither already in a LIVE match | checked here for the anchor and for each surviving candidate, and enforced BY the write — two partial unique indexes, `transfer_matches_guard` (KAR42) and an advisory-lock claim settle what a pre-check cannot |
 *
 * **Nothing in the list above is decided by the store read.** Every narrowing
 * the query carries is also a rule in the domain, run again over what came
 * back. A reader that ignored one of them would return rows this use case then
 * refuses; it could not cause a wrong suggestion.
 *
 * ## A FEE IS NOT PART OF THE PAIR, and nothing here special-cases it
 *
 * A top-up of 100 with a 2 fee is three transactions and one match. The fee
 * finds no equal-and-opposite counterpart, so it falls out of rule 5 with no
 * code that knows what a fee is. Anchored ON the fee, this use case answers
 * `no_counterpart` for the same reason.
 *
 * ## Cross-currency is not merely skipped, it is unreachable
 *
 * Two currencies cannot be related without a rate, and this platform holds no
 * rate and must not invent one (ADR-0028). So there is no currency parameter to
 * widen, no conversion, and no FX reference type to reach for
 * (`domain/refs.ts` records why). The window read asks for the anchor's own
 * currency and the domain refuses a mismatch before any amount is compared.
 *
 * ## Idempotent, and safe against a second writer
 *
 * Running this twice over the same transaction produces ONE suggestion. The
 * second run finds the anchor already in a live match and stops before it reads
 * a window at all. Two runs racing do not both win: the delegated write claims
 * both transactions with a transaction-scoped advisory lock, and the loser
 * receives `transaction_already_matched` — the same typed refusal the serial
 * path produces — which arrives here as `already_matched` and not as a failure.
 *
 * ## Two answers that look like caution and are the design
 *
 * **`counterpart_ambiguous`** — more than one row in the window is equal and
 * opposite to the anchor. Nothing here picks one. A transaction belongs to at
 * most one live match, so choosing arbitrarily would OCCUPY both transactions
 * and stop the right pairing from ever being proposed until the person rejected
 * a suggestion they never should have been shown. Two identical transfers on
 * the same day are the ordinary case that produces this, and the honest answer
 * is to ask nothing.
 *
 * **`window_too_crowded`** — the window held more rows than the read cap. The
 * pass does not page onward, because a suggestion pass that walked page after
 * page would be scanning a person's history looking for something to say about
 * it. It suggests nothing instead, which is the state that writes nothing false.
 */

import { Result } from '@karar/shared-kernel';

import { checkSuggestable, type MatchCandidateSide, type TransferMatch } from '../../domain/transfer-match.js';
import { orientEqualAndOpposite } from '../../domain/equal-and-opposite.js';
import { suggestionWindowBounds } from '../../domain/suggestion-window.js';
import { TransactionRef } from '../../domain/refs.js';
import {
  retentionUnresolved,
  storeFailure,
  transactionAccessUnavailable,
  type RetentionUnresolved,
  type StoreFailure,
  type SuggestTransferMatchError,
  type TransactionAccessUnavailable,
} from '../errors.js';
import type { MatchCandidateSearchPort } from '../ports/match-candidate-search.js';
import {
  isMatchableStatus,
  type MatchableTransactionAccessPort,
  type MatchableTransactionStatus,
  type MatchableTransactionSummary,
} from '../ports/matchable-transaction-access.js';
import type { TransferMatchRepository } from '../ports/transfer-match-repository.js';
import {
  permitsDurableWrite,
  type TransferMatchRetentionDecisionPort,
} from '../ports/transfer-match-retention-decision.js';
import {
  requirePrincipal,
  type MatchingPrincipal,
  type MissingPrincipalContext,
} from '../principal.js';
import type { SuggestTransferMatch } from './suggest-transfer-match.js';

/**
 * How many rows one window read may return.
 *
 * A READ CAP, not a page size — see `MatchCandidateSearchPort`. It bounds the
 * work one written transaction can cause: a window is seven calendar days wide
 * (three each way plus the anchor's own day) and narrowed to one currency on
 * accounts other than the anchor's, so a person would have to have recorded
 * more than two hundred such movements in a week to reach it. Reaching it
 * answers `window_too_crowded` and suggests nothing, which is the conservative
 * direction: an unread row can only cost a question that was never asked, while
 * an unbounded read costs the person's whole history on every write.
 *
 * It is NOT an ingestion bound and is deliberately not in
 * `INGESTION_LIMIT_POLICIES`: nothing here parses a file, accepts an upload or
 * serves a page, and the central registry describes ingestion paths.
 */
export const CANDIDATE_WINDOW_READ_CAP = 200;

export interface GenerateTransferMatchSuggestionsInput {
  /**
   * The transaction that was just written. ONE id, and no counterpart: the
   * counterpart is what this use case finds, and a caller that could name it
   * would be a caller proposing a match.
   */
  readonly anchorTransactionId: string;
}

/**
 * What one generation pass settled as.
 *
 * Every arm other than `suggested` means NOTHING WAS WRITTEN. None of them
 * carries a figure about the person's transactions — not a candidate count, not
 * a window size — for the reason `TransferMatchPage.hasMore` is a boolean: a
 * number here would be the first quantity this module ever published about
 * somebody's money.
 */
export type TransferSuggestionOutcome =
  /** One `SUGGESTED` row was written. It changes nothing until the person answers. */
  | { readonly kind: 'suggested'; readonly match: TransferMatch }
  /** The anchor is not visible to this principal — absent, or another subject's. */
  | { readonly kind: 'anchor_not_visible' }
  /** The anchor may not be half of a movement; a voided record is the case that matters. */
  | { readonly kind: 'anchor_not_matchable'; readonly status: MatchableTransactionStatus }
  /**
   * One of the two transactions already belongs to a live match, so nothing was
   * written. This is the ORDINARY answer on a second run over the same
   * transaction, and it is what makes generation idempotent.
   */
  | { readonly kind: 'already_matched'; readonly conflictingMatchId: string }
  /** No row in the window is equal and opposite to the anchor. The common answer. */
  | { readonly kind: 'no_counterpart' }
  /** More than one row qualifies. Nothing here picks between them — see the header. */
  | { readonly kind: 'counterpart_ambiguous' }
  /** The window held more rows than the read cap allowed. Nothing was suggested. */
  | { readonly kind: 'window_too_crowded' }
  /**
   * The pair qualified on the read and was refused by the write, for a reason
   * that is neither a store failure nor a live match: the world moved between
   * the two. Surfaced rather than swallowed, so a refusal that should be
   * impossible is visible if it ever happens.
   */
  | { readonly kind: 'refused_on_write'; readonly refusal: SuggestTransferMatchError };

export type GenerateTransferMatchSuggestionsError =
  | MissingPrincipalContext
  | RetentionUnresolved
  | TransactionAccessUnavailable
  | StoreFailure;

/** A summary as the domain's candidate side — the status was the gate, and is dropped. */
function toCandidateSide(summary: MatchableTransactionSummary): MatchCandidateSide {
  return {
    transactionRef: summary.transactionRef,
    accountRef: summary.accountRef,
    amountMinorUnits: summary.amountMinorUnits,
    currencyCode: summary.currencyCode,
    bookingDate: summary.bookingDate,
  };
}

export class GenerateTransferMatchSuggestions {
  constructor(
    private readonly suggest: SuggestTransferMatch,
    private readonly matches: TransferMatchRepository,
    private readonly transactions: MatchableTransactionAccessPort,
    private readonly candidates: MatchCandidateSearchPort,
    private readonly retention: TransferMatchRetentionDecisionPort,
  ) {}

  async execute(
    input: GenerateTransferMatchSuggestionsInput,
    actor: MatchingPrincipal,
  ): Promise<Result<TransferSuggestionOutcome, GenerateTransferMatchSuggestionsError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    // GATE 1 — retention, before anything is READ and long before anything is
    // written. A pass that read a person's window and then discovered it may
    // write nothing has already done the reading, and the whole point of the
    // gate is that an unresolved legal decision stops the work rather than the
    // last step of it.
    let decision;
    try {
      decision = await this.retention.decideFor(principal.value, 'transfer_matches');
    } catch (error) {
      return Result.err(storeFailure('retention decision resolution', error));
    }
    if (!permitsDurableWrite(decision)) {
      return Result.err(retentionUnresolved('transfer_matches', decision));
    }

    const anchorRef = TransactionRef.of(input.anchorTransactionId);

    // GATE 2 — the anchor, resolved under the CALLER'S OWN principal. Another
    // subject's transaction resolves as absent, indistinguishably from an id
    // nobody minted, which is the layer that catches a real foreign id.
    let anchor: MatchableTransactionSummary | null;
    try {
      anchor = await this.transactions.resolveOwnTransaction(principal.value, anchorRef);
    } catch (error) {
      return Result.err(transactionAccessUnavailable(error));
    }
    if (anchor === null) return Result.ok({ kind: 'anchor_not_visible' });
    if (!isMatchableStatus(anchor.status)) {
      return Result.ok({ kind: 'anchor_not_matchable', status: anchor.status });
    }

    // GATE 3 — is the anchor already spoken for? This is the short-circuit that
    // makes a second run cheap as well as idempotent: it stops before a window
    // is read at all.
    const anchorLive = await this.liveMatchFor(principal.value, anchorRef);
    if (!anchorLive.ok) return anchorLive;
    if (anchorLive.value !== null) {
      return Result.ok({ kind: 'already_matched', conflictingMatchId: anchorLive.value });
    }

    // The window comes from the DECLARED constant, never from a number written
    // here — see `domain/suggestion-window.ts`.
    const bounds = suggestionWindowBounds(anchor.bookingDate);
    let window;
    try {
      window = await this.candidates.findOwnCandidates(principal.value, {
        excludedTransactionRef: anchorRef,
        excludedAccountRef: anchor.accountRef,
        currencyCode: anchor.currencyCode,
        earliestBookingDate: bounds.earliest,
        latestBookingDate: bounds.latest,
        limit: CANDIDATE_WINDOW_READ_CAP,
      });
    } catch (error) {
      return Result.err(storeFailure('transfer match candidate search', error));
    }
    if (window.truncated) return Result.ok({ kind: 'window_too_crowded' });

    // THE RULE, run over every row the window returned. The store's narrowing
    // is not trusted to have applied any of it.
    const qualifying: MatchableTransactionSummary[] = [];
    for (const candidate of window.candidates) {
      if (!isMatchableStatus(candidate.status)) continue;
      // Which side is which is decided from the SIGNS, exactly as
      // `SuggestTransferMatch` decides it, never from the order the store
      // happened to return the rows in.
      const orientation = orientEqualAndOpposite(
        anchor.amountMinorUnits,
        candidate.amountMinorUnits,
      );
      const anchorIsOutflow = orientation !== 'SECOND_IS_OUTFLOW';
      const outflow = toCandidateSide(anchorIsOutflow ? anchor : candidate);
      const inflow = toCandidateSide(anchorIsOutflow ? candidate : anchor);
      if (checkSuggestable(outflow, inflow) !== null) continue;

      // Only now, and only for a row that already qualifies: is IT spoken for?
      const taken = await this.liveMatchFor(principal.value, candidate.transactionRef);
      if (!taken.ok) return taken;
      if (taken.value !== null) continue;
      qualifying.push(candidate);
      // Two is already the answer; a third changes nothing and the read stops.
      if (qualifying.length > 1) return Result.ok({ kind: 'counterpart_ambiguous' });
    }

    const counterpart = qualifying[0];
    if (counterpart === undefined) return Result.ok({ kind: 'no_counterpart' });

    // The WRITE goes through `SuggestTransferMatch` rather than around it. That
    // is the whole reason the rules above cannot drift from the rules a
    // hand-made suggestion is held to: both sides are resolved again under this
    // principal, the domain rule runs again, the orientation is decided again
    // from the signs, and the row is created through the repository that claims
    // both transactions before it inserts.
    const written = await this.suggest.execute(
      {
        firstTransactionId: anchorRef.transactionId,
        secondTransactionId: counterpart.transactionRef.transactionId,
      },
      principal.value,
    );
    if (written.ok) return Result.ok({ kind: 'suggested', match: written.value });

    const refusal = written.error;
    switch (refusal.kind) {
      case 'transaction_already_matched':
        // The race, settled by the database. Not a failure: the transaction is
        // spoken for, and a pass is built on the difference between "already
        // spoken for, skip it" and "the store broke, stop".
        return Result.ok({
          kind: 'already_matched',
          conflictingMatchId: refusal.conflictingMatchId,
        });
      case 'missing_principal_context':
      case 'retention_unresolved':
      case 'transaction_access_unavailable':
      case 'store_failure':
        return Result.err(refusal);
      default:
        return Result.ok({ kind: 'refused_on_write', refusal });
    }
  }

  /**
   * The id of the live match a transaction already belongs to, or `null`.
   *
   * A REJECTED match does not occupy either side: a person may reject one
   * pairing and later accept a different one involving the same transaction,
   * which is the ordinary case rather than an edge — the product suggested the
   * wrong counterpart and the right one is still out there.
   */
  private async liveMatchFor(
    principal: MatchingPrincipal,
    transactionRef: TransactionRef,
  ): Promise<Result<string | null, GenerateTransferMatchSuggestionsError>> {
    let existing;
    try {
      existing = await this.matches.findOwnForTransaction(principal, transactionRef);
    } catch (error) {
      return Result.err(storeFailure('transfer match lookup by transaction', error));
    }
    const live = existing.find((match) => match.state !== 'REJECTED');
    return Result.ok(live === undefined ? null : live.id);
  }
}
