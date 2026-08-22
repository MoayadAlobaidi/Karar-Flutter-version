/**
 * `TransferSuggestionTriggerPort` — the port this module IMPLEMENTS for the
 * two paths that write transactions: "these were just written, look for the
 * movements among them".
 *
 * ## One declaration, aliased — not a second copy
 *
 * The port is declared by the module that CONSUMES it, and
 * `@karar/transactions` owns what a written transaction IS. Both write paths
 * call it from there: that module's own `CreateManualTransaction`, and
 * `modules/statement-imports`' `CommitStatementImport`, which imports the same
 * declaration rather than restating it. This module SATISFIES the need, so the
 * abstraction belongs with the consumer and the implementer depends on it —
 * the ordinary direction of dependency inversion, and what "ports are declared
 * inward" (architecture test 5) asks for.
 *
 * Aliasing rather than restating is the lesson `transfer-match-eraser.ts`
 * records after this module learned it the expensive way: two structurally
 * identical declarations do not FAIL when they drift, they diverge silently
 * until an adapter satisfies the local copy and no longer satisfies the real
 * one. There is no shape here to drift from.
 *
 * ## Why a caller hands over ids and never a pairing
 *
 * A client may never submit a suggestion. The parameter is a list of
 * transactions that were WRITTEN; the counterpart of each is found on THIS side
 * of the port, from the subject's own rows, under the subject's own principal.
 * A caller that could name two ids as a pair would be asserting a relationship
 * between two records it did not observe — and this module would be recording
 * that assertion as though the platform had found it. There is deliberately no
 * HTTP verb that reaches either side.
 *
 * The dependency is one-way and the boundary rule is respected: this import
 * resolves through the other module's `public-api`, and `transactions` imports
 * nothing from here.
 */

import type {
  TransferSuggestionPassOutcome as TransactionsTransferSuggestionPassOutcome,
  TransferSuggestionTriggerPort as TransactionsTransferSuggestionTriggerPort,
} from '@karar/transactions';

export type TransferSuggestionPassOutcome = TransactionsTransferSuggestionPassOutcome;
export type TransferSuggestionTriggerPort = TransactionsTransferSuggestionTriggerPort;
