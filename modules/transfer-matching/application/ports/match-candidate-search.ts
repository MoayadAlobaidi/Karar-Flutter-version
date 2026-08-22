/**
 * `MatchCandidateSearchPort` — the ONE query a suggestion pass may run over a
 * person's transactions, declared inward (architecture test 5).
 *
 * ## Why a second port, next to `MatchableTransactionAccessPort`
 *
 * That port answers "what are the five facts about THIS transaction" and takes
 * an id a caller already holds. It is what makes a match unable to span two
 * subjects, and it is deliberately incapable of enumerating anything.
 *
 * A suggestion pass needs the other question — "which of this person's own
 * transactions could be the counterpart of that one" — and the two are not the
 * same question wearing different arguments. Enumeration is the dangerous one,
 * so it is declared separately, with its bound and its narrowing written into
 * the type rather than left to whoever calls it.
 *
 * ## Every narrowing here is a REFUSAL made cheap, never a rule
 *
 * The query carries the currency, the two window days, the anchor's own
 * transaction and the anchor's own account. Each of those is already a rule in
 * `domain/transfer-match.ts`, and each is enforced there over every candidate
 * this port returns. **Sending them down with the read decides nothing** — it
 * only stops the store handing back rows the rule is about to refuse anyway.
 *
 * The distinction matters because it says what a wrong implementation can and
 * cannot do. An implementation that ignored `currencyCode` would return rows
 * `checkSuggestable` then refuses as cross-currency: wasteful, never wrong. An
 * implementation that returned another subject's rows would be caught by RLS
 * before it was caught by anything here — the read runs under the caller's own
 * principal context, exactly as every other read in this module does.
 *
 * **The amount is deliberately NOT part of the query.** Asking the store for
 * "the opposite of this amount" would require computing that opposite here,
 * which is a second arithmetic operation over a person's money in a module
 * whose entire claim is that it performs exactly one. So the window is read and
 * `isEqualAndOpposite` — the pinned comparison — decides. The bound below is
 * what keeps that affordable.
 *
 * ## The bound, and why it is not a page
 *
 * `limit` is a READ CAP, not a page size: nothing pages through candidates,
 * because a suggestion pass that walked page after page would be scanning a
 * person's history looking for something to say about it. The cap exists so
 * that one write cannot turn into an unbounded read, and `truncated` reports
 * when the window held more rows than the cap — which the use case treats as
 * "too many possible counterparts to be sure", never as "take the first ones".
 *
 * ## What it returns
 *
 * `MatchableTransactionSummary`, the same six-field shape the other port
 * returns: an account, a signed minor-unit amount, a currency, a booking day
 * and a status. **No merchant, no description, no note, no category, no
 * provenance.** A suggestion pass runs over many rows at once, which is the
 * worst possible place for a second read path into another context's subject
 * narrative — so the enumerating port carries even less reason to have one than
 * the single-row port does.
 */

import type { CalendarDay } from '@karar/shared-kernel';

import type { MatchedAccountRef, TransactionRef } from '../../domain/refs.js';
import type { MatchingPrincipal } from '../principal.js';
import type { MatchableTransactionSummary } from './matchable-transaction-access.js';

/**
 * One window read, fully specified. Every field narrows; none decides.
 */
export interface MatchCandidateQuery {
  /** The anchor itself, which can never be its own counterpart. */
  readonly excludedTransactionRef: TransactionRef;
  /** The anchor's account: a counterpart on it would be a refund, not a transfer. */
  readonly excludedAccountRef: MatchedAccountRef;
  /** ISO 4217 alphabetic. A denomination, never an amount. */
  readonly currencyCode: string;
  /** Inclusive earliest booking day, from `suggestionWindowBounds`. */
  readonly earliestBookingDate: CalendarDay;
  /** Inclusive latest booking day, from `suggestionWindowBounds`. */
  readonly latestBookingDate: CalendarDay;
  /** The read cap. An implementation never returns more than this many rows. */
  readonly limit: number;
}

/**
 * What one window read found.
 *
 * `truncated` is a BOOLEAN and not a remaining-row figure, for the reason
 * `TransferMatchPage.hasMore` is one: it answers "was the window fuller than
 * the cap", and a number here would be the first quantity this module ever
 * published about a person's transactions.
 */
export interface MatchCandidateWindow {
  readonly candidates: readonly MatchableTransactionSummary[];
  /** True when the window held more rows than `limit` allowed to be read. */
  readonly truncated: boolean;
}

export interface MatchCandidateSearchPort {
  /**
   * The principal's OWN transactions inside one window.
   *
   * Principal-scoped like every port here: an implementation runs inside the
   * caller's own principal context, so another subject's transactions are not
   * merely filtered out, they are invisible. That is what keeps a suggestion
   * pass from ever proposing a pair across two people — the enumeration
   * physically cannot reach a row the caller does not own.
   */
  findOwnCandidates(
    principal: MatchingPrincipal,
    query: MatchCandidateQuery,
  ): Promise<MatchCandidateWindow>;
}
