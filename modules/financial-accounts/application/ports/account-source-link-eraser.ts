/**
 * `AccountSourceLinkEraserPort` — erase every source link feeding one
 * account, declared INWARD here and implemented by the financial-connections
 * module.
 *
 * ## The defect this port closes
 *
 * `public.account_source_links` records which data source feeds which
 * account, and carries the encrypted external account reference that lets the
 * same source account be recognised again. Its `account_id` is a raw uuid
 * with NO foreign key back to `financial_accounts` — no FK crosses a module
 * boundary (data-model.md §2) — so deleting an account cascaded to none of
 * them. A subject was told their account was gone while rows describing it,
 * and holding a protected external identity, survived. Two further
 * consequences followed from the same rows: the module declares
 * `CASCADE_DELETE` for `financial_accounts`, which was false about them, and
 * the next import through the surviving connection would have re-linked and
 * re-created the account the person had just deleted.
 *
 * ## Why this is a SEPARATE port and not a kind on the record eraser
 *
 * `FinancialRecordEraserPort` has exactly one implementer
 * (`modules/transactions`) and a composition root binds exactly one instance
 * of it. Adding `ACCOUNT_SOURCE_LINK` to `ERASABLE_FINANCIAL_RECORD_KINDS`
 * would therefore make the transactions module responsible for deleting
 * another module's rows — reaching across a boundary into a table it does not
 * own, cannot see under its own grants, and would have to keep in step with
 * someone else's schema. Two owners means two ports. The cost is one more
 * constructor argument; the alternative is a module quietly holding a DELETE
 * on a table that is not its own.
 *
 * ## Why the count is exact
 *
 * So a caller can REPORT what was erased instead of asserting it, exactly as
 * `snapshotsDeleted` and the per-kind record counts already do. An
 * implementation that cannot count what it removed cannot answer `erased`,
 * because "we deleted some things" is not evidence of erasure. A single
 * number suffices here where the record eraser needs a breakdown: this is one
 * table, and there is no second kind that could be left behind while the
 * first went.
 *
 * ## Atomicity, stated rather than implied
 *
 * This port cannot make cross-module deletion atomic any more than the record
 * eraser can. The implementer runs in its own principal-scoped database
 * transaction; this module's account delete runs in another; no unit of work
 * spans them, and creating one would mean passing a live transaction handle
 * across an application port. `DeleteOwnAccount` therefore orders the steps so
 * no window loses data silently, requires this port to be IDEMPOTENT so a
 * retry converges, and reports a partial outcome as a partial outcome. See
 * that file for the full argument, including why source links are erased
 * before financial records rather than after.
 */

import type { FinancialAccountId } from '../../domain/refs.js';
import type { AccountsPrincipal } from '../principal.js';

export type AccountSourceLinkErasureOutcome =
  /**
   * Every source link feeding the account is gone, and this is the exact
   * count. The only arm a caller may report as a successful erasure.
   */
  | { readonly kind: 'erased'; readonly accountSourceLinksDeleted: number }
  /**
   * Some links were removed and some remain. Carries what WAS removed, so the
   * caller can say so honestly, and why it stopped. Never success: a
   * half-erased account is the state a person would most want to know about.
   */
  | {
      readonly kind: 'incomplete';
      readonly accountSourceLinksDeleted: number;
      readonly reason: string;
    }
  /**
   * Nothing could be established — the store was unreachable, or the erasure
   * could not begin. Distinct from `incomplete` because the remedies differ:
   * this one is safe to retry immediately.
   */
  | { readonly kind: 'failed'; readonly reason: string };

export interface AccountSourceLinkEraserPort {
  /**
   * Erase every source link feeding one of the acting principal's own
   * accounts.
   *
   * **Idempotent by contract: a second call finds nothing and answers zero.**
   * That is what makes a retry after a partial failure converge instead of
   * compounding, and it is why `DeleteOwnAccount` can call this before
   * deleting the account without needing the two to be one transaction.
   *
   * **Principal-scoped, like every port here.** An implementation runs inside
   * the caller's own principal context, so it can only erase links the caller
   * owns — another subject's links under a guessed account id are not merely
   * skipped, they are invisible.
   *
   * **`reason` is the implementer's own stable vocabulary, never a store's.**
   * `DeleteOwnAccount` puts it in a caller-visible message, and driver text
   * can carry a connection string, the failing SQL, or a fragment of the very
   * row being erased. An implementation with a cause worth keeping attaches it
   * non-enumerably for the boundary logger rather than describing it here.
   */
  eraseAccountSourceLinks(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<AccountSourceLinkErasureOutcome>;
}
