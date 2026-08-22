/**
 * `PaymentInstrumentEraserPort` — erase every payment instrument that spends
 * from one account, declared INWARD here and implemented by the
 * payment-instruments module.
 *
 * ## The defect this port closes
 *
 * `public.payment_instruments` records what SPENDS from a balance-bearing
 * account — a physical card, a virtual card, a prepaid card, a tokenized card
 * or a QR payment identity — with an encrypted mask so the person can tell
 * their own two cards apart. Its `account_id` is a raw uuid with NO foreign
 * key back to `financial_accounts` — no FK crosses a module boundary
 * (data-model.md §2) — so deleting an account cascaded to none of them. A
 * subject was told their account was gone while rows naming it, and holding
 * the fragment they read off their own card, survived. The same two further
 * consequences followed as with source links: the module declares
 * `CASCADE_DELETE` for `financial_accounts`, which was false about these
 * rows, and an instrument left pointing at a deleted account is a way to
 * spend from something the person believes no longer exists.
 *
 * ## Why this is a SEPARATE port and not a kind on the record eraser
 *
 * The same argument `AccountSourceLinkEraserPort` makes, unchanged.
 * `FinancialRecordEraserPort` has exactly one implementer
 * (`modules/transactions`) and a composition root binds exactly one instance
 * of it, so adding a `PAYMENT_INSTRUMENT` kind to
 * `ERASABLE_FINANCIAL_RECORD_KINDS` would make the transactions module
 * responsible for deleting a third module's rows — reaching into a table it
 * does not own, cannot see under its own grants, and would have to keep in
 * step with someone else's schema. Three owners means three ports.
 *
 * ## Why the count is exact
 *
 * So a caller can REPORT what was erased instead of asserting it, exactly as
 * `snapshotsDeleted`, `accountSourceLinksDeleted` and the per-kind record
 * counts already do. An implementation that cannot count what it removed
 * cannot answer `erased`, because "we deleted some things" is not evidence of
 * erasure. A single number suffices where the record eraser needs a
 * breakdown: this is one table, and there is no second kind that could be
 * left behind while the first went. In particular the count is a count of
 * ROWS and never a figure derived from them — an instrument has no balance,
 * no limit and no amount, and an erasure is the last place one should appear.
 *
 * ## Atomicity, stated rather than implied
 *
 * This port cannot make cross-module deletion atomic any more than the other
 * two can. The implementer runs in its own principal-scoped database
 * transaction; this module's account delete runs in another; no unit of work
 * spans them, and creating one would mean passing a live transaction handle
 * across an application port. `DeleteOwnAccount` therefore orders the steps so
 * no window loses data silently, requires this port to be IDEMPOTENT so a
 * retry converges, and reports a partial outcome as a partial outcome. See
 * that file for the full argument, including why instruments are erased after
 * the source links and before the financial records.
 */

import type { FinancialAccountId } from '../../domain/refs.js';
import type { AccountsPrincipal } from '../principal.js';

export type PaymentInstrumentErasureOutcome =
  /**
   * Every instrument spending from the account is gone, and this is the exact
   * count. The only arm a caller may report as a successful erasure.
   */
  | { readonly kind: 'erased'; readonly paymentInstrumentsDeleted: number }
  /**
   * Some instruments were removed and some remain. Carries what WAS removed,
   * so the caller can say so honestly, and why it stopped. Never success: a
   * half-erased account is the state a person would most want to know about.
   */
  | {
      readonly kind: 'incomplete';
      readonly paymentInstrumentsDeleted: number;
      readonly reason: string;
    }
  /**
   * Nothing could be established — the store was unreachable, or the erasure
   * could not begin. Distinct from `incomplete` because the remedies differ:
   * this one is safe to retry immediately.
   */
  | { readonly kind: 'failed'; readonly reason: string };

export interface PaymentInstrumentEraserPort {
  /**
   * Erase every payment instrument spending from one of the acting
   * principal's own accounts.
   *
   * **Idempotent by contract: a second call finds nothing and answers zero.**
   * That is what makes a retry after a partial failure converge instead of
   * compounding, and it is why `DeleteOwnAccount` can call this before
   * deleting the account without needing the two to be one transaction.
   *
   * **Principal-scoped, like every port here.** An implementation runs inside
   * the caller's own principal context, so it can only erase instruments the
   * caller owns — another subject's instruments under a guessed account id
   * are not merely skipped, they are invisible.
   *
   * **`reason` is the implementer's own stable vocabulary, never a store's.**
   * `DeleteOwnAccount` puts it in a caller-visible message, and driver text
   * can carry a connection string, the failing SQL, or a fragment of the
   * ciphertext of the very mask being erased. An implementation with a cause
   * worth keeping attaches it non-enumerably for the boundary logger rather
   * than describing it here.
   */
  erasePaymentInstruments(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<PaymentInstrumentErasureOutcome>;
}
