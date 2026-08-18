/**
 * `TransferMatchEraserPort` — the port this module IMPLEMENTS for
 * `modules/transactions`: "erase every match naming this transaction", and
 * "erase every match with either side on this account".
 *
 * ## One declaration, aliased — not a second copy
 *
 * The port is declared by the module that CONSUMES it, and `transactions`
 * owns BOTH deletion paths that need it: `DeleteOwnTransaction`, where a
 * person removes one transaction, and `PrismaFinancialRecordEraser`, which
 * `modules/financial-accounts`' `DeleteOwnAccount` drives through
 * `FinancialRecordEraserPort` when an account goes. This module SATISFIES that
 * need, so the abstraction belongs with the consumer and the implementer
 * depends on it — the ordinary direction of dependency inversion, and what
 * "ports are declared inward" (architecture test 5) asks for.
 *
 * **This file used to be a MIRROR**, written while neither `@karar/transactions`
 * nor `@karar/financial-accounts` declared such a port. It restated the shape
 * so the satisfying side — `EraseTransferMatches` and
 * `infrastructure/adapters/transactions-transfer-match-eraser.ts` — could be
 * built and tested ahead of the declaration, and MODULE.md carried the exact
 * TypeScript and the exact call sites. **The declaration has now landed**, in
 * `modules/transactions/application/ports/transfer-match-eraser.ts`, with both
 * scopes on one port and both call sites wired; the mirror is gone, and the
 * names below are ALIASES of that one declaration.
 *
 * Aliasing rather than restating is deliberate, and
 * `modules/transactions/application/ports/financial-record-lifecycle.ts`
 * records why after doing exactly this: two structurally identical
 * declarations do not FAIL when they drift, they diverge silently until an
 * adapter satisfies the local copy and no longer satisfies the real one.
 * There is no shape here to drift from the one in `@karar/transactions`.
 *
 * ## Why the accounts module does not declare the account-scoped half
 *
 * It never reaches a transfer match except through the record eraser, which
 * belongs to `transactions`. Declaring the half it does not call would be the
 * second declaration of one contract in a second module — the duplication
 * above — for no gain. The account-scoped method still exists, and is still
 * not derived from the per-transaction one, for the reason that made it worth
 * asking for: the record eraser deletes an account's transactions in bulk
 * without enumerating their ids, and a caller holding only the per-transaction
 * method would have to scan a person's entire history first.
 *
 * The dependency is one-way and the boundary rule is respected: this import
 * resolves through the other module's `public-api`, and `transactions`
 * imports nothing from here.
 */

import type {
  TransferMatchEraserPort as TransactionsTransferMatchEraserPort,
  TransferMatchErasureOutcome as TransactionsTransferMatchErasureOutcome,
} from '@karar/transactions';

export type TransferMatchEraserPort = TransactionsTransferMatchEraserPort;
export type TransferMatchErasureOutcome = TransactionsTransferMatchErasureOutcome;
