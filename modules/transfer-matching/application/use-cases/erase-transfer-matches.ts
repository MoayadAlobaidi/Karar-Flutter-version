/**
 * EraseTransferMatches — every match that names one transaction, or that
 * touches one account, removed.
 *
 * ## Why this use case exists, and who is meant to call it
 *
 * ADR-0028: "erasure widens: deleting an account must take its source links,
 * instruments, transfer matches, staged source rows and artifacts with it, not
 * only its transactions". A match's four cross-module references are raw
 * uuids with no foreign keys back, because **no foreign key crosses a module
 * boundary** (data-model.md §2) — so nothing in the database makes either
 * deletion reach these rows, and something in the application layer must.
 *
 * **A dangling match is not a cosmetic problem.** It asserts that two
 * movements were one movement while one of them no longer exists, so the
 * surviving side is still explained away as a transfer and a real expense
 * stays hidden from the person's own record of what they spent.
 *
 * The callers are `modules/transactions`' `DeleteOwnTransaction` and
 * `PrismaFinancialRecordEraser`, and `modules/financial-accounts`'
 * `DeleteOwnAccount`, through ports **those modules declare** and this one
 * satisfies (ports are declared inward — architecture test 5). At the time
 * this module was written **neither declares such a port**, so this use case
 * and the adapter beside it are the SATISFYING side, complete and tested;
 * `application/ports/transfer-match-eraser.ts` is a mirror of what must be
 * declared, and MODULE.md carries the exact TypeScript and call sites. **Until
 * they land, a deleted transaction and a deleted account both leave their
 * matches behind** — stated here rather than discovered later.
 *
 * ## Two scopes, and why the second is not derived from the first
 *
 * `PrismaFinancialRecordEraser.eraseForAccount` deletes an account's
 * transactions in bulk without enumerating their ids. A caller that had only
 * the transaction-scoped method would have to read every transaction id on the
 * account first — turning one statement into a scan of a person's entire
 * history. The match row carries both account ids for exactly this reason,
 * copied from a column `public.transactions` freezes by trigger so it cannot
 * drift.
 *
 * ## Idempotent by contract
 *
 * A second call finds nothing and answers zero. An erasure that failed halfway
 * must be safe to retry, and a caller has to be able to retry without first
 * working out what the previous attempt managed.
 */

import { Result } from '@karar/shared-kernel';

import { MatchedAccountRef, TransactionRef } from '../../domain/refs.js';
import { storeFailure, type EraseTransferMatchesError } from '../errors.js';
import type { TransferMatchRepository } from '../ports/transfer-match-repository.js';
import { requirePrincipal, type MatchingPrincipal } from '../principal.js';

export interface EraseTransferMatchesForTransactionInput {
  readonly transactionId: string;
}

export interface EraseTransferMatchesForAccountInput {
  readonly accountId: string;
}

export interface TransferMatchesErased {
  /** The exact number of rows removed. Reported, never estimated. */
  readonly transferMatchesDeleted: number;
}

export class EraseTransferMatches {
  constructor(private readonly matches: TransferMatchRepository) {}

  /** Every match naming this transaction on EITHER side. */
  async forTransaction(
    input: EraseTransferMatchesForTransactionInput,
    actor: MatchingPrincipal,
  ): Promise<Result<TransferMatchesErased, EraseTransferMatchesError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    try {
      const deleted = await this.matches.eraseForTransaction(
        principal.value,
        TransactionRef.of(input.transactionId),
      );
      return Result.ok({ transferMatchesDeleted: deleted });
    } catch (error) {
      return Result.err(storeFailure('transfer match erasure for transaction', error));
    }
  }

  /** Every match with either side on this account. */
  async forAccount(
    input: EraseTransferMatchesForAccountInput,
    actor: MatchingPrincipal,
  ): Promise<Result<TransferMatchesErased, EraseTransferMatchesError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    try {
      const deleted = await this.matches.eraseForAccount(
        principal.value,
        MatchedAccountRef.of(input.accountId),
      );
      return Result.ok({ transferMatchesDeleted: deleted });
    } catch (error) {
      return Result.err(storeFailure('transfer match erasure for account', error));
    }
  }
}
