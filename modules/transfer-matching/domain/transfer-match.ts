/**
 * ============================================================================
 * A TRANSFER MATCH IS A RELATIONSHIP, NOT A CONCLUSION
 * ============================================================================
 *
 * A wallet top-up from a bank account is ONE movement recorded TWICE, once on
 * each side. Left alone it reads as an expense and an income, so — ADR-0028 —
 * "a month in which someone moved their own money looks like a month in which
 * they earned and spent it".
 *
 * A `TransferMatch` says those two transactions are two sides of one thing.
 * **It does not rewrite either of them, and it does not compute anything.**
 * Both rows stay exactly as their sources reported them; nothing here nets
 * them off, totals them, recategorises them, or produces an insight. This type
 * has no amount field, and the only number on it is `version`, the
 * optimistic-concurrency token.
 *
 * ## A SUGGESTION CHANGES NOTHING
 *
 * `SUGGESTED` is a question the product asks. Nothing may read it as an
 * answer. Only `CONFIRMED` is authoritative, and **CONFIRMED requires a
 * recorded subject decision instant** — held here by `confirmMatch`, and held
 * again by the database, which is the control that matters:
 *
 * ```sql
 * CONSTRAINT transfer_matches_confirmed_requires_subject_decision
 *   CHECK (match_state <> 'CONFIRMED' OR subject_decided_at IS NOT NULL)
 * ```
 *
 * The asymmetry is not caution for its own sake. A wrong automatic match makes
 * two real movements disappear from a person's record of what they earned and
 * spent. Nothing on any screen says a pairing happened, so the person cannot
 * see it, cannot question it, and cannot undo what they never knew occurred.
 *
 * ## The suggestion rule, in full
 *
 * A pair may be SUGGESTED when ALL of these hold:
 *
 *   1. two DIFFERENT transactions (a transaction matched to itself would net a
 *      real expense to nothing);
 *   2. on two DIFFERENT accounts (two equal-and-opposite entries on ONE
 *      account are a reversal, a refund or a correction — calling one a
 *      transfer would erase a genuine refund from the record);
 *   3. both POSTED (a voided transaction is a record of something that did not
 *      happen);
 *   4. the SAME currency — checked BEFORE the amounts, because comparing minor
 *      units across currencies is a fabricated exchange rate of exactly 1.0;
 *   5. exactly equal and opposite (`domain/equal-and-opposite.ts`);
 *   6. booking dates within the declared window
 *      (`domain/suggestion-window.ts`).
 *
 * Rules 4, 1 and 2 are also CHECK constraints in migration 0099, so a writer
 * that skipped this module cannot produce the rows they forbid.
 *
 * ## Cross-currency cannot be suggested
 *
 * ADR-0028: cross-currency movements are not auto-matched without a
 * source-stated FX relationship. **No such relationship exists anywhere in
 * this platform** — no source states one, no column holds one, no rate table
 * is consulted — so a cross-currency pair simply cannot be suggested. Rule 4
 * refuses it here and `transfer_matches_same_currency_only` refuses it at the
 * database. When a source-stated relationship one day exists, the remedy is a
 * forward migration adding the column that carries the SOURCE'S OWN statement
 * plus a widened CHECK. It is never a code path that picks a rate.
 *
 * ## A fee is not part of the transfer
 *
 * A top-up of 100 with a 2 fee is THREE transactions and ONE match: the
 * outflow of 100, the inflow of 100, and a separate fee of 2 that stays an
 * ordinary expense matched to nothing. Nothing here special-cases that, and
 * that is the point — the equal-and-opposite rule finds no counterpart for the
 * fee, and a match names exactly two transactions with no room for a third.
 *
 * ## Purity
 *
 * No clock, no randomness, no I/O (architecture test 11). Instants and
 * identifiers arrive as arguments from the application layer.
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';
import type { CalendarDay } from '@karar/shared-kernel';

import type { TransferMatchRuleViolation } from './errors.js';
import { isEqualAndOpposite } from './equal-and-opposite.js';
import {
  SUGGESTION_WINDOW_DAYS,
  SUGGESTION_WINDOW_VERSION,
  calendarDaysBetween,
  isWithinSuggestionWindow,
} from './suggestion-window.js';
import {
  MatchedAccountRef,
  TransactionRef,
  type TransferMatchId,
} from './refs.js';

/**
 * Where a match stands.
 *
 * `SUGGESTED` changes nothing. `CONFIRMED` is the only authoritative state and
 * requires the person's recorded decision. `REJECTED` is KEPT rather than
 * deleted: without the row, the same wrong suggestion returns on every import
 * and the person is asked the same question forever.
 */
export const MATCH_STATES = ['SUGGESTED', 'CONFIRMED', 'REJECTED'] as const;
export type MatchState = (typeof MATCH_STATES)[number];

/**
 * The only state that may be treated as a fact about the person's money.
 *
 * A value rather than a sentence, so a consumer asking "may I rely on this?"
 * gets a stated answer instead of inferring one from a state name — and so
 * `isAuthoritative` can be checked exhaustively over the vocabulary.
 */
export const AUTHORITATIVE_MATCH_STATES: readonly MatchState[] = Object.freeze(['CONFIRMED']);

/** True only for a match the SUBJECT confirmed. */
export function isAuthoritative(state: MatchState): boolean {
  return AUTHORITATIVE_MATCH_STATES.includes(state);
}

/**
 * The states that occupy a transaction, so it may not be half of another
 * match. A rejection is history and frees both sides.
 */
export const LIVE_MATCH_STATES: readonly MatchState[] = Object.freeze([
  'SUGGESTED',
  'CONFIRMED',
]);

export function isLiveMatchState(state: MatchState): boolean {
  return LIVE_MATCH_STATES.includes(state);
}

/**
 * ON WHAT BASIS a match was suggested. A closed vocabulary with ONE member
 * today, so a second basis is a reviewed migration and a visible widening
 * rather than a new string appearing in production rows.
 */
export const SUGGESTION_BASES = ['EQUAL_AND_OPPOSITE_SAME_CURRENCY_WITHIN_WINDOW'] as const;
export type SuggestionBasis = (typeof SUGGESTION_BASES)[number];

/**
 * The transitions a person can actually make.
 *
 * A suggestion may be answered either way; a confirmation may be withdrawn,
 * because a person who realises they answered wrongly must be able to say so.
 * A REJECTED match is never reopened — without the row the same wrong
 * suggestion returns on every import, and re-suggesting it is exactly what
 * keeping the row prevents. Nothing returns to SUGGESTED: a decision that has
 * been taken cannot become an unanswered question again.
 */
const STATE_TRANSITIONS: Readonly<Record<MatchState, readonly MatchState[]>> = Object.freeze({
  SUGGESTED: Object.freeze(['CONFIRMED', 'REJECTED'] as const),
  CONFIRMED: Object.freeze(['REJECTED'] as const),
  REJECTED: Object.freeze([] as const),
});

export function isMatchState(value: string): value is MatchState {
  return (MATCH_STATES as readonly string[]).includes(value);
}

export function isSuggestionBasis(value: string): value is SuggestionBasis {
  return (SUGGESTION_BASES as readonly string[]).includes(value);
}

/** Whether one state may follow another. `true` for a no-op transition. */
export function canTransition(from: MatchState, to: MatchState): boolean {
  if (from === to) return true;
  return (STATE_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * One side of a CANDIDATE pair — everything the suggestion rule needs, and
 * nothing else.
 *
 * Five fields, and the absences are the design: **no merchant, no description,
 * no note, no category** — all of those are `HIGHLY_SENSITIVE_FINANCIAL`
 * narrative belonging to another bounded context, and no rule here could use
 * them. The amount is present because rule 5 needs it, and it is signed minor
 * units rather than a `Money`, so that no arithmetic type enters this module
 * at all.
 *
 * This type exists ONLY while a suggestion is being decided. What is stored
 * is `MatchSide` below, which has neither the amount nor the booking date —
 * see the note there.
 */
export interface MatchCandidateSide {
  readonly transactionRef: TransactionRef;
  readonly accountRef: MatchedAccountRef;
  /** Signed minor units; negative is money leaving (the canonical convention). */
  readonly amountMinorUnits: bigint;
  /** ISO 4217 alphabetic. A denomination, never an amount. */
  readonly currencyCode: string;
  /** What the institution wrote (ADR-0027), never an instant. */
  readonly bookingDate: CalendarDay;
}

/**
 * One side of a STORED match. Three fields, and the two that are missing are
 * the point.
 *
 * **The amount is not stored.** It was needed to decide whether to ask the
 * question; it is not needed to record the answer, and keeping it would put a
 * figure on a row whose entire design is that it has none — where something
 * would eventually total it. The transactions themselves are where the
 * amounts live, unchanged and unrewritten, which is the whole premise of
 * modelling this as a relationship.
 *
 * **The booking dates are not stored either.** The window rule ran once, at
 * suggestion time, and its verdict is recorded as `suggestionWindow` — the
 * DECLARED RULE that produced the suggestion — rather than as the two inputs
 * that satisfied it. Storing the inputs would invite somebody to re-run the
 * rule against a row a person has already answered, under whatever the
 * constant says today.
 *
 * The currency IS stored, on both sides, because migration 0099's
 * `transfer_matches_same_currency_only` checks that two independent facts
 * agree — which one shared column would assert instead of checking.
 */
export interface MatchSide {
  readonly transactionRef: TransactionRef;
  readonly accountRef: MatchedAccountRef;
  /** ISO 4217 alphabetic. A denomination, never an amount. */
  readonly currencyCode: string;
}

/**
 * One transfer match, as this module holds it.
 *
 * Read the field list as the guarantee it is: two sides, a state, the basis
 * and window that produced it, the person's decision instant, and a
 * concurrency token. **No amount, no net, no total, no category, no score.**
 */
export interface TransferMatch {
  readonly id: TransferMatchId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  /** The side money LEFT. */
  readonly outflow: MatchSide;
  /** The side money ARRIVED. */
  readonly inflow: MatchSide;
  readonly state: MatchState;
  readonly suggestionBasis: SuggestionBasis;
  /** WHICH declared window produced it — a version label, not a number. */
  readonly suggestionWindow: string;
  /** The instant the SUBJECT decided. Null while the question is unanswered. */
  readonly subjectDecidedAt: Date | null;
  readonly firstSuggestedAt: Date;
  /** Optimistic-concurrency token; the store increments it by exactly one. */
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** What a caller supplies to suggest a match. Candidate sides, not stored ones. */
export interface NewTransferMatch {
  readonly id: TransferMatchId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly outflow: MatchCandidateSide;
  readonly inflow: MatchCandidateSide;
  readonly suggestedAt: Date;
}

/** A candidate side, reduced to what a stored row carries. */
export function toStoredSide(candidate: MatchCandidateSide): MatchSide {
  return Object.freeze({
    transactionRef: candidate.transactionRef,
    accountRef: candidate.accountRef,
    currencyCode: candidate.currencyCode,
  });
}

/**
 * The suggestion rule, as one function, in the order the header states.
 *
 * Returns `null` when the pair may be suggested. The ORDER is load-bearing
 * rather than cosmetic: the currency check runs before the amount check,
 * because comparing minor units across currencies would treat 100 of one and
 * 100 of another as equal-and-opposite — a fabricated exchange rate of exactly
 * 1.0, which is the precise error the same-currency rule exists to prevent.
 * A refusal that named the amounts as "not equal and opposite" would also send
 * the caller to the wrong remedy.
 */
export function checkSuggestable(
  outflow: MatchCandidateSide,
  inflow: MatchCandidateSide,
): TransferMatchRuleViolation | null {
  if (TransactionRef.equals(outflow.transactionRef, inflow.transactionRef)) {
    return {
      kind: 'same_transaction_on_both_sides',
      message:
        'a transaction cannot be both sides of a movement. A row pointing at itself would net a ' +
        'real expense to nothing, and the person would see one movement disappear from what they ' +
        'spent',
    };
  }
  if (MatchedAccountRef.equals(outflow.accountRef, inflow.accountRef)) {
    return {
      kind: 'same_account_on_both_sides',
      message:
        'both movements are on the same account, so this is a reversal, a refund or a ' +
        "correction — not money moving between the person's own accounts. Calling it a transfer " +
        'would erase a genuine refund from their record',
    };
  }
  if (outflow.currencyCode !== inflow.currencyCode) {
    return {
      kind: 'cross_currency_not_matchable',
      outflowCurrencyCode: outflow.currencyCode,
      inflowCurrencyCode: inflow.currencyCode,
      message:
        'these two movements are in different currencies, so they cannot be suggested as one ' +
        'transfer. A cross-currency pairing needs an exchange relationship the SOURCE stated, ' +
        'and no source states one anywhere in this platform — a rate chosen here would turn ' +
        '"you moved your own money" into "you moved your own money and lost some of it, ' +
        'according to us" (ADR-0028). The database refuses the pairing as well',
    };
  }
  if (!isEqualAndOpposite(outflow.amountMinorUnits, inflow.amountMinorUnits)) {
    return {
      kind: 'not_equal_and_opposite',
      message:
        'these two movements are not exactly equal and opposite, so they are not two sides of ' +
        'one movement. A fee, a partial transfer or a rounded figure is a separate fact and ' +
        'stays one; nothing here approximates, and nothing here adds a difference to make two ' +
        'figures agree',
    };
  }
  if (!isWithinSuggestionWindow(outflow.bookingDate, inflow.bookingDate)) {
    return {
      kind: 'outside_suggestion_window',
      windowDays: SUGGESTION_WINDOW_DAYS,
      windowVersion: SUGGESTION_WINDOW_VERSION,
      daysApart: calendarDaysBetween(outflow.bookingDate, inflow.bookingDate),
      message:
        `these two movements are further apart than the declared window of ` +
        `${SUGGESTION_WINDOW_DAYS} calendar days (${SUGGESTION_WINDOW_VERSION}). The window is a ` +
        'named constant rather than a number chosen at a call site, so widening it is a ' +
        'reviewed change and every stored match keeps saying which rule suggested it',
    };
  }
  return null;
}

/**
 * Validates and freezes a new match, born SUGGESTED and carrying no decision.
 *
 * A suggestion changes nothing, so this constructor cannot produce a
 * CONFIRMED match under any input — there is no state parameter, and
 * `subjectDecidedAt` is `null` by construction. Confirming is a separate act
 * with its own function and its own recorded instant.
 */
export function suggestTransferMatch(
  input: NewTransferMatch,
): Result<TransferMatch, TransferMatchRuleViolation> {
  const refusal = checkSuggestable(input.outflow, input.inflow);
  if (refusal !== null) return Result.err(refusal);

  return Result.ok(
    Object.freeze({
      id: input.id,
      tenantId: input.tenantId,
      userId: input.userId,
      outflow: toStoredSide(input.outflow),
      inflow: toStoredSide(input.inflow),
      state: 'SUGGESTED' as MatchState,
      suggestionBasis: 'EQUAL_AND_OPPOSITE_SAME_CURRENCY_WITHIN_WINDOW' as SuggestionBasis,
      suggestionWindow: SUGGESTION_WINDOW_VERSION,
      subjectDecidedAt: null,
      firstSuggestedAt: input.suggestedAt,
      version: 1,
      createdAt: input.suggestedAt,
      updatedAt: input.suggestedAt,
    }),
  );
}

function transitionRefusal(from: MatchState, to: MatchState): TransferMatchRuleViolation {
  return {
    kind: 'state_transition_not_available',
    from,
    to,
    message:
      `a transfer match that is ${from} may not become ${to}. A suggestion may be confirmed or ` +
      'rejected and a confirmation may be withdrawn, but a rejection is a record of what did ' +
      'NOT happen and is never reopened — without it the same wrong suggestion returns on every ' +
      'import — and no decided match becomes an unanswered question again. The database refuses ' +
      'the move as well (SQLSTATE KAR43)',
  };
}

/**
 * The person says yes.
 *
 * `decidedAt` is REQUIRED and is the instant the subject decided. It is not
 * defaulted, not derived from a clock inside this function, and never written
 * by a rule: the whole authority of a confirmed match rests on this value
 * being a record of something a person did.
 */
export function confirmMatch(
  current: TransferMatch,
  decidedAt: Date,
): Result<TransferMatch, TransferMatchRuleViolation> {
  if (!(decidedAt instanceof Date) || Number.isNaN(decidedAt.getTime())) {
    return Result.err({
      kind: 'confirmation_needs_subject_decision',
      message:
        'a confirmation requires the instant the SUBJECT decided. Only the person’s confirmation ' +
        'makes a match authoritative, so a confirmation with no recorded decision is not a ' +
        'weaker confirmation — it is an assertion made on their behalf. The database refuses it ' +
        'too (transfer_matches_confirmed_requires_subject_decision)',
    });
  }
  if (!canTransition(current.state, 'CONFIRMED')) {
    return Result.err(transitionRefusal(current.state, 'CONFIRMED'));
  }
  if (current.state === 'CONFIRMED') return Result.ok(current);

  return Result.ok(
    Object.freeze({
      ...current,
      state: 'CONFIRMED' as MatchState,
      subjectDecidedAt: decidedAt,
      version: current.version + 1,
      updatedAt: decidedAt,
    }),
  );
}

/**
 * The person says no — or withdraws a confirmation they gave.
 *
 * The row is KEPT. Deleting it would bring the same wrong suggestion back on
 * every subsequent import, and the person would answer the same question
 * forever with no way to make it stop.
 */
export function rejectMatch(
  current: TransferMatch,
  decidedAt: Date,
): Result<TransferMatch, TransferMatchRuleViolation> {
  if (!(decidedAt instanceof Date) || Number.isNaN(decidedAt.getTime())) {
    return Result.err({
      kind: 'confirmation_needs_subject_decision',
      message:
        'a rejection requires the instant the SUBJECT decided, for the same reason a ' +
        'confirmation does: it is a record of something a person did, and the row is kept so ' +
        'the same wrong suggestion does not come back the next time data arrives',
    });
  }
  if (!canTransition(current.state, 'REJECTED')) {
    return Result.err(transitionRefusal(current.state, 'REJECTED'));
  }
  if (current.state === 'REJECTED') return Result.ok(current);

  return Result.ok(
    Object.freeze({
      ...current,
      state: 'REJECTED' as MatchState,
      subjectDecidedAt: decidedAt,
      version: current.version + 1,
      updatedAt: decidedAt,
    }),
  );
}
