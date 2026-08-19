/**
 * The transfer-matching module's only legal import surface (architecture test
 * 3). Nothing outside this module may reach past this file.
 *
 * Exported: the domain read shapes and rules, the application ports and
 * errors, the use cases, and the infrastructure implementations the
 * composition root needs to wire them.
 *
 * **Deliberately NOT exported, and worth stating so nobody adds it later:**
 *
 * - **no total, no net figure, no insight, no category change, and no
 *   function that could produce one.** A stored `TransferMatch` has no amount
 *   field, the repository has no `count`, `aggregate` or `groupBy`, and the
 *   whole module contains exactly ONE arithmetic operation — the negation in
 *   `isEqualAndOpposite`, which answers a boolean and produces no
 *   intermediate figure. ADR-0028 establishes relationships and not
 *   conclusions; `__tests__/no-money-arithmetic.test.ts` is what keeps that
 *   true, and it pins the one exception rather than pretending there is none.
 * - **no way to confirm a match without a recorded subject decision.**
 *   `confirmMatch` requires the instant and `ConfirmTransferMatch` takes it
 *   from the clock rather than from its input — a caller-supplied decision
 *   instant is a claim about when somebody decided something, and this column
 *   exists to be a fact. The database refuses the state besides, which is the
 *   control that matters.
 * - **no cross-currency match, and no way to build one.** `checkSuggestable`
 *   refuses two different currency codes before it compares any amounts, and
 *   `transfer_matches_same_currency_only` refuses the row. There is no rate,
 *   no conversion, no FX reference type (`domain/refs.ts` records why), and
 *   no port through which one could arrive.
 * - **no automatic confirmation of a suggestion.** `suggestTransferMatch`
 *   produces a `SUGGESTED` match and cannot produce any other state: there is
 *   no state parameter, and `subjectDecidedAt` is `null` by construction.
 * - **no use case that reads or writes somebody else's matches.** There is no
 *   `ListMatchesForUser`, no staff read, and no input type with a `userId` on
 *   it. The principal is context, never input.
 *
 * This module also exports no presentation layer this phase: the HTTP surface
 * and its composition belong to the API application, and nothing here assumes
 * a transport.
 *
 * **One port is declared here and implemented elsewhere in a real
 * deployment**: `TransferMatchRetentionDecisionPort`, satisfied by whatever
 * reads an approved policy pack. `MatchableTransactionAccessPort` is declared
 * here and satisfied by an adapter over `@karar/transactions`' public API —
 * this module depends on that one, and that one knows nothing about this one.
 *
 * **One port runs the other way, and it is now wired.**
 * `TransferMatchEraserPort` is declared by `@karar/transactions`, which owns
 * both deletion paths that need it, and `TransactionsTransferMatchEraser` is
 * the satisfying side. `DeleteOwnTransaction` calls the transaction-scoped
 * method before removing a transaction, and `PrismaFinancialRecordEraser` —
 * the adapter `modules/financial-accounts`' `DeleteOwnAccount` drives — calls
 * the account-scoped one before deleting an account's records. The export
 * below is an ALIAS of that declaration, kept so a composition root can name
 * the type it is binding; it was a mirror of ports that did not exist yet, and
 * neither deletion path leaves its matches behind any more.
 *
 * **The local retention provider is exported and is a refusal as much as an
 * implementation.** `LocalSyntheticRetentionDecisionProvider` throws outside
 * `KARAR_ENV=local`, and `resolveRetentionDecisionPort` throws in any other
 * environment that has not been given an approved provider. Exporting it is
 * what lets a composition root fail at boot instead of at the first write.
 */

// domain — read shapes and rules
export {
  AUTHORITATIVE_MATCH_STATES,
  LIVE_MATCH_STATES,
  MATCH_STATES,
  SUGGESTION_BASES,
  canTransition,
  checkSuggestable,
  confirmMatch,
  isAuthoritative,
  isLiveMatchState,
  isMatchState,
  isSuggestionBasis,
  rejectMatch,
  suggestTransferMatch,
  toStoredSide,
  type MatchCandidateSide,
  type MatchSide,
  type MatchState,
  type NewTransferMatch,
  type SuggestionBasis,
  type TransferMatch,
} from './domain/transfer-match.js';
export {
  isEqualAndOpposite,
  orientEqualAndOpposite,
} from './domain/equal-and-opposite.js';
export {
  SUGGESTION_WINDOW_DAYS,
  SUGGESTION_WINDOW_VERSION,
  TRANSFER_SUGGESTION_WINDOW,
  calendarDaysBetween,
  isWithinSuggestionWindow,
} from './domain/suggestion-window.js';
export {
  MATCHED_ACCOUNT_REFERENCE_TYPES,
  MatchedAccountRef,
  InvalidReferenceError,
  TRANSACTION_REFERENCE_TYPES,
  TransactionRef,
  TransferMatchId,
  type MatchedAccountReferenceType,
  type TransactionReferenceType,
} from './domain/refs.js';
export {
  TransferMatchesStoreError,
  type ConfirmationNeedsSubjectDecision,
  type CrossCurrencyNotMatchable,
  type NotEqualAndOpposite,
  type OutsideSuggestionWindow,
  type SameAccountOnBothSides,
  type SameTransactionOnBothSides,
  type StateTransitionNotAvailable,
  type TransactionNotMatchable,
  type TransferMatchRuleViolation,
  type UnknownVocabularyValue,
} from './domain/errors.js';

// application — principal, errors, ports
export {
  requirePrincipal,
  type MatchingPrincipal,
  type MissingPrincipalContext,
} from './application/principal.js';
export {
  MATCH_NOT_FOUND,
  retentionUnresolved,
  storeFailure,
  transactionAccessUnavailable,
  transactionNotFound,
  type ConfirmTransferMatchError,
  type EraseTransferMatchesError,
  type ListOwnTransferMatchesError,
  type MatchNotFound,
  type RejectTransferMatchError,
  type RetentionUnresolved,
  type RuleViolated,
  type StoreFailure,
  type SuggestTransferMatchError,
  type TransactionAccessUnavailable,
  type TransactionAlreadyMatched,
  type TransactionNotFound,
  type VersionConflict,
} from './application/errors.js';
export type { IdSource } from './application/ports/id-source.js';
export {
  MATCHABLE_STATUSES,
  MATCHABLE_TRANSACTION_STATUSES,
  isMatchableStatus,
  type MatchableTransactionAccessPort,
  type MatchableTransactionStatus,
  type MatchableTransactionSummary,
} from './application/ports/matchable-transaction-access.js';
export {
  RETENTION_GOVERNED_DATASETS,
  permitsDurableWrite,
  type FinancialRetentionDecision,
  type RetentionDecided,
  type RetentionGovernedDataset,
  type RetentionNotApplicable,
  type RetentionPendingLegalReview,
  type RetentionUnavailable,
  type TransferMatchRetentionDecisionPort,
} from './application/ports/transfer-match-retention-decision.js';
export type {
  TransferMatchCreateOutcome,
  TransferMatchPage,
  TransferMatchPageQuery,
  TransferMatchRepository,
  TransferMatchUpdateOutcome,
} from './application/ports/transfer-match-repository.js';
// An ALIAS of the port @karar/transactions declares and this module
// satisfies. See the header and MODULE.md.
export type {
  TransferMatchEraserPort,
  TransferMatchErasureOutcome,
} from './application/ports/transfer-match-eraser.js';

// application — use cases
export {
  SuggestTransferMatch,
  type SuggestTransferMatchInput,
} from './application/use-cases/suggest-transfer-match.js';
export {
  ConfirmTransferMatch,
  type ConfirmTransferMatchInput,
} from './application/use-cases/confirm-transfer-match.js';
export {
  RejectTransferMatch,
  type RejectTransferMatchInput,
} from './application/use-cases/reject-transfer-match.js';
export {
  ListOwnTransferMatches,
  type ListOwnTransferMatchesInput,
} from './application/use-cases/list-own-transfer-matches.js';
export {
  EraseTransferMatches,
  type EraseTransferMatchesForAccountInput,
  type EraseTransferMatchesForTransactionInput,
  type TransferMatchesErased,
} from './application/use-cases/erase-transfer-matches.js';

// infrastructure — implementations for the composition root
export { PrismaTransferMatchRepository } from './infrastructure/persistence/prisma-transfer-match-repository.js';
export { Uuidv7IdSource } from './infrastructure/persistence/uuidv7-id-source.js';
export { TransactionsMatchableTransactionAdapter } from './infrastructure/adapters/transactions-matchable-transaction-access.js';
export { TransactionsTransferMatchEraser } from './infrastructure/adapters/transactions-transfer-match-eraser.js';
export {
  LocalRetentionFixtureEnvironmentError,
  LocalRetentionFixtureMissingError,
  LocalSyntheticRetentionDecisionProvider,
  resolveRetentionDecisionPort,
} from './infrastructure/providers/local-synthetic-retention-decision-provider.js';
