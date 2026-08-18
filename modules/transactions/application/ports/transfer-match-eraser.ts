/**
 * `TransferMatchEraserPort` — erase every transfer match that names one of
 * this module's transactions, declared INWARD here and implemented by the
 * transfer-matching module.
 *
 * ## The defect this port closes
 *
 * `public.transfer_matches` says that two of one subject's transactions are
 * two sides of ONE movement of their own money. Its
 * `outflow_transaction_id`, `inflow_transaction_id`, `outflow_account_id` and
 * `inflow_account_id` are raw uuids with NO foreign keys back — no FK crosses
 * a module boundary (data-model.md §2) — so nothing cascaded to them from
 * either deletion path this module owns, and a match outlived the transaction
 * it named.
 *
 * **A dangling match is not a cosmetic problem.** It asserts that two
 * movements were one movement while one of them no longer exists, so the
 * surviving side is still explained away as a transfer and a real expense
 * stays hidden from the person's own record of what they spent. Deleting the
 * record without the relationship therefore does not merely leave residue; it
 * leaves a statement about the person's money that is now false.
 *
 * ## Why THIS module declares it, and why both scopes live on one port
 *
 * Ports are declared inward, by the module that owns the deletion path
 * (architecture test 5). This module owns BOTH of them:
 *
 *   * `DeleteOwnTransaction`, where a person removes one transaction; and
 *   * `PrismaFinancialRecordEraser`, which erases every record on an account
 *     and is what `modules/financial-accounts`' `DeleteOwnAccount` drives
 *     through `FinancialRecordEraserPort`.
 *
 * So one port carries both methods and one implementer satisfies it. The
 * accounts module could have declared the account-scoped half itself; it does
 * not need to, because it never reaches a transfer match except through the
 * record eraser, and a second declaration of one contract in a second module
 * is the duplication `financial-record-lifecycle.ts` records the cost of.
 *
 * ## Why the account-scoped method is NOT derived from the per-transaction one
 *
 * `PrismaFinancialRecordEraser` deletes an account's transactions in bulk,
 * inside one statement, WITHOUT ever enumerating their ids — that is what
 * lets it count and delete over a single snapshot. A caller holding only the
 * per-transaction method would have to read every transaction id on the
 * account first, turning one statement into a scan of a person's entire
 * history, and would then issue one erasure per row. The match carries both
 * account ids for exactly this reason, copied from a column this module's own
 * trigger freezes (migration 0090) so it cannot drift.
 *
 * ## Why the count is exact
 *
 * So a caller can REPORT what was erased instead of asserting it. An
 * implementation that cannot count what it removed cannot answer `erased`,
 * because "we deleted some things" is not evidence of erasure. The count is a
 * count of ROWS: a match holds no amount, and an erasure is the last place a
 * figure derived from one should appear.
 *
 * ## Atomicity, stated rather than implied
 *
 * This port cannot make cross-module deletion atomic. The implementer runs in
 * its own principal-scoped database transaction; this module's delete runs in
 * another. Nothing spans the two, and the only construct that would — passing
 * a live transaction handle through an application port — is infrastructure
 * leaking across the seam that exists to prevent it. Both call sites
 * therefore erase the matches FIRST, require this port to be IDEMPOTENT so a
 * retry converges, and report a partial outcome as a partial outcome.
 */

import type { TransactionId } from '../../domain/refs.js';
import type { TransactionsPrincipal } from './principal-context.js';

export type TransferMatchErasureOutcome =
  /**
   * Every match in scope is gone, and this is the exact count. The only arm a
   * caller may report as a successful erasure.
   */
  | { readonly kind: 'erased'; readonly transferMatchesDeleted: number }
  /**
   * Some matches were removed and some remain. Carries what WAS removed, so
   * the caller can say so honestly, and why it stopped. Never success: a
   * relationship left pointing at a record that is about to go is the state
   * this port exists to prevent.
   */
  | {
      readonly kind: 'incomplete';
      readonly transferMatchesDeleted: number;
      readonly reason: string;
    }
  /**
   * Nothing could be established — the store was unreachable, or the erasure
   * could not begin. Distinct from `incomplete` because the remedies differ:
   * this one is safe to retry immediately.
   */
  | { readonly kind: 'failed'; readonly reason: string };

export interface TransferMatchEraserPort {
  /**
   * Every match naming this transaction on EITHER side.
   *
   * **Idempotent by contract: a second call finds nothing and answers zero.**
   * That is what makes a retry after a failure converge instead of
   * compounding, and it is why `DeleteOwnTransaction` can call this before
   * removing the transaction without needing the two to be one transaction.
   *
   * **Principal-scoped, like every port here.** An implementation runs inside
   * the caller's own principal context, so another subject's matches under a
   * guessed id are not merely skipped, they are invisible.
   *
   * **`reason` is the implementer's own stable vocabulary, never a store's.**
   * A caller puts it in a caller-visible message, and driver text can carry a
   * connection string, the failing SQL, or a fragment of a person's record.
   * An implementation with a cause worth keeping attaches it non-enumerably
   * for the boundary logger rather than describing it here.
   */
  eraseTransferMatchesForTransaction(
    actor: TransactionsPrincipal,
    transactionId: TransactionId,
  ): Promise<TransferMatchErasureOutcome>;

  /**
   * Every match with either side on this account. Idempotent by contract, and
   * principal-scoped, exactly as above.
   *
   * `accountId` is a plain string rather than the accounts module's branded
   * `FinancialAccountId`: the only caller is `PrismaFinancialRecordEraser`,
   * which already holds the id as a string, and requiring a brand here would
   * buy a cast at the one call site instead of a type at any of them.
   */
  eraseTransferMatchesForAccount(
    actor: TransactionsPrincipal,
    accountId: string,
  ): Promise<TransferMatchErasureOutcome>;
}
