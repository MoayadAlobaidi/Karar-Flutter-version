/**
 * Domain rule violations, as values.
 *
 * These are EXPECTED outcomes, not defects: two movements in different
 * currencies, two movements that are not equal and opposite, a pair too far
 * apart in time, a rejection somebody tried to reopen. The kernel's rule
 * applies (backend.md §9; `Result` doc comment) — expected outcomes are
 * `Result`, and only genuine precondition violations throw. Every kind is
 * machine-readable so a presentation layer can map it to RFC 7807 without
 * re-deriving meaning from a message string.
 *
 * **No message here carries an amount.** The refusals are about a person's
 * money and the messages describe the RULE rather than the figures: an error
 * string that quotes two amounts puts financial values into log lines and
 * error bodies, and this module's whole claim is that it does not handle
 * amounts beyond the one comparison a suggestion needs.
 */

import type { MatchState } from './transfer-match.js';

/**
 * The two sides are denominated differently, so no suggestion is possible.
 *
 * **The most consequential refusal in the module.** ADR-0028 permits a
 * cross-currency match only on a source-stated FX relationship; no source
 * states one anywhere in this platform, so there is nothing to match ON.
 * Carrying both codes is safe — a currency code is a word from a registry,
 * not subject data — and it is what lets a caller say which two currencies
 * rather than "these do not match".
 */
export interface CrossCurrencyNotMatchable {
  readonly kind: 'cross_currency_not_matchable';
  readonly outflowCurrencyCode: string;
  readonly inflowCurrencyCode: string;
  readonly message: string;
}

/**
 * The two amounts are not exactly equal and opposite.
 *
 * Deliberately carries NO amounts. A caller that needs to show the person why
 * has both transactions already; an error type is not where a person's
 * figures should travel.
 */
export interface NotEqualAndOpposite {
  readonly kind: 'not_equal_and_opposite';
  readonly message: string;
}

/** The two booking dates are further apart than the declared window. */
export interface OutsideSuggestionWindow {
  readonly kind: 'outside_suggestion_window';
  readonly windowDays: number;
  readonly windowVersion: string;
  readonly daysApart: number;
  readonly message: string;
}

/** A transaction was matched to itself. */
export interface SameTransactionOnBothSides {
  readonly kind: 'same_transaction_on_both_sides';
  readonly message: string;
}

/**
 * Both sides are on ONE account, so this is a reversal, a refund or a
 * correction — not money moving between the person's own accounts.
 */
export interface SameAccountOnBothSides {
  readonly kind: 'same_account_on_both_sides';
  readonly message: string;
}

/** A transaction that is not POSTED may not be half of a movement. */
export interface TransactionNotMatchable {
  readonly kind: 'transaction_not_matchable';
  readonly status: string;
  readonly message: string;
}

/** A state transition nobody can make. */
export interface StateTransitionNotAvailable {
  readonly kind: 'state_transition_not_available';
  readonly from: MatchState;
  readonly to: MatchState;
  readonly message: string;
}

/**
 * A match was asked to become CONFIRMED without a recorded subject decision
 * instant. The database refuses this too
 * (`transfer_matches_confirmed_requires_subject_decision`); this rule is what
 * turns that refusal into an answer that names the real problem rather than a
 * 23514 from the driver.
 */
export interface ConfirmationNeedsSubjectDecision {
  readonly kind: 'confirmation_needs_subject_decision';
  readonly message: string;
}

/** A value outside a closed vocabulary this module owns. */
export interface UnknownVocabularyValue {
  readonly kind: 'unknown_vocabulary_value';
  readonly vocabulary:
    | 'matchState'
    | 'suggestionBasis'
    | 'transactionReferenceType'
    | 'matchedAccountReferenceType';
  readonly value: string;
  readonly message: string;
}

/** Everything the domain rules can refuse. */
export type TransferMatchRuleViolation =
  | CrossCurrencyNotMatchable
  | NotEqualAndOpposite
  | OutsideSuggestionWindow
  | SameTransactionOnBothSides
  | SameAccountOnBothSides
  | TransactionNotMatchable
  | StateTransitionNotAvailable
  | ConfirmationNeedsSubjectDecision
  | UnknownVocabularyValue;

/**
 * A store returned a row this module's vocabulary cannot name. That is a
 * defect in the schema, the migration, or the mapper — never a user outcome —
 * so it throws rather than becoming a `Result` arm someone has to handle.
 */
export class TransferMatchesStoreError extends Error {
  override readonly name = 'TransferMatchesStoreError';
}
