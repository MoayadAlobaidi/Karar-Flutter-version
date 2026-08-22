/**
 * `FinancialRecordEraserPort` — erase every financial record scoped to one
 * account, declared INWARD here and implemented by the transactions module.
 *
 * ## The defect this port closes
 *
 * `DeleteOwnAccount` documented itself as deleting "an account they own, and
 * everything scoped to it", and the repository method it calls documented
 * itself the same way. What it actually removed was the account row and its
 * balance snapshots. Transactions, their revisions, their provenance, and
 * their category assignments all carry a raw `account_id` and NO foreign key
 * to `financial_accounts` — no FK crosses a module boundary
 * (data-model.md §2) — so nothing cascaded, and every one of those rows
 * survived, orphaned, invisible to the person who had just been told their
 * account was deleted. The module declares `CASCADE_DELETE` and a compulsory
 * consent document promises subjects they can delete individual accounts;
 * "deleted the anchor and left the behaviour record" honours neither.
 *
 * ## Why the counts are per kind and exact
 *
 * So a caller can REPORT what was erased instead of asserting it — the same
 * reason `AccountDeleteOutcome` carries `snapshotsDeleted`. A single total
 * would hide the failure mode that matters: transactions gone, provenance
 * left behind. An implementation that cannot count what it removed cannot
 * answer `erased`, because "we deleted some things" is not evidence of
 * erasure.
 *
 * ## Why the record kinds are named abstractly
 *
 * `FINANCIAL_RECORD_PROVENANCE` rather than `transaction_provenance`: this
 * module owns the interface, so it owns the vocabulary too, exactly as
 * `modules/transactions` declares `account_reference_type` in its own
 * schema to say what an `account_id` points at without importing anything.
 * Naming the implementer's tables here would make its schema this module's
 * business and would have to change whenever theirs did.
 *
 * ## Atomicity, stated rather than implied
 *
 * This port CANNOT make cross-module deletion atomic, and pretending
 * otherwise in a comment would repeat the defect it exists to fix. The
 * implementer runs in its own principal-scoped database transaction; this
 * module's account delete runs in another. There is no unit of work spanning
 * both, and creating one would mean passing a live transaction handle across
 * an application port — infrastructure leaking through the seam that exists
 * to prevent exactly that. `DeleteOwnAccount` therefore orders the two steps
 * so no window loses data silently, requires this port to be IDEMPOTENT so a
 * retry converges, and reports a partial outcome as a partial outcome. See
 * that file for the full argument.
 */

import type { FinancialAccountId } from '../../domain/refs.js';
import type { AccountsPrincipal } from '../principal.js';

/**
 * The kinds of account-scoped record an erasure must account for. Closed:
 * a kind that is not listed is a kind nobody counted, which is how an orphan
 * survives a deletion that reported success.
 */
export const ERASABLE_FINANCIAL_RECORD_KINDS = [
  /** The canonical movement records themselves. */
  'FINANCIAL_RECORD',
  /** Their correction history. */
  'FINANCIAL_RECORD_REVISION',
  /** Where each record and each revision came from. */
  'FINANCIAL_RECORD_PROVENANCE',
  /** Category assignments attached to them, including superseded ones. */
  'FINANCIAL_RECORD_CATEGORY_ASSIGNMENT',
] as const;
export type ErasableFinancialRecordKind = (typeof ERASABLE_FINANCIAL_RECORD_KINDS)[number];

/** Exact rows removed, per kind. Every kind present; zero is an answer. */
export type FinancialRecordErasureCounts = Readonly<
  Record<ErasableFinancialRecordKind, number>
>;

/**
 * Rows that RELATE two financial records to each other and were erased
 * alongside them — today, the transfer matches saying that two of a person's
 * movements were one movement of their own money.
 *
 * ## Why the count travels back here rather than staying inside the eraser
 *
 * A relationship whose records are gone is not tidy-up. It asserts that two
 * movements were one movement while one of them no longer exists, so the
 * surviving side stays explained away as a transfer and a real expense stays
 * hidden from the person's own record of what they spent. The implementer
 * therefore erases them BEFORE the records they name, and reports how many
 * went, so `DeleteOwnAccount` can tell a person what was actually removed
 * instead of describing only the part this module happens to have vocabulary
 * for.
 *
 * ## Why it is NOT a fifth `ErasableFinancialRecordKind`
 *
 * The kinds are the tables the record eraser itself owns and deletes. A
 * relationship row belongs to a THIRD module, reached by the implementer
 * through a port of its own, and folding it into the closed set would say
 * this module's record eraser owns rows it does not — the same conflation
 * `AccountSourceLinkEraserPort` exists to avoid. Counting it and owning it
 * are different claims.
 *
 * ## Why OPTIONAL, and what `undefined` means
 *
 * `undefined` is "nothing measured this", `0` is "measured, and none went".
 * They are different claims and the port keeps them apart, for the same
 * reason `incomplete` and `failed` are separate arms: an implementation that
 * erases no relationships at all should not be made to write a zero it never
 * counted, and a caller must not read that zero as evidence.
 */
type WithRelationshipCount = {
  readonly financialRecordRelationshipsDeleted?: number;
};

export type FinancialRecordErasureOutcome =
  /**
   * Everything scoped to the account is gone, and these are the exact counts.
   * The only arm a caller may report as a successful erasure.
   */
  | ({ readonly kind: 'erased'; readonly deleted: FinancialRecordErasureCounts } &
      WithRelationshipCount)
  /**
   * Some rows were removed and some remain. Carries what WAS removed, so the
   * caller can say so honestly, and why it stopped. Never success: a
   * half-erased account is the state a person would most want to know about.
   */
  | ({
      readonly kind: 'incomplete';
      readonly deleted: FinancialRecordErasureCounts;
      readonly reason: string;
    } & WithRelationshipCount)
  /**
   * Nothing could be established — the store was unreachable, or the erasure
   * could not begin. Distinct from `incomplete` because the remedies differ:
   * this one is safe to retry immediately.
   */
  | { readonly kind: 'failed'; readonly reason: string };

export interface FinancialRecordEraserPort {
  /**
   * Erase every financial record scoped to one of the acting principal's own
   * accounts.
   *
   * **Idempotent by contract.** Called twice, the second call finds nothing
   * and answers `erased` with zeroes. That is what makes a retry after a
   * partial failure converge instead of compounding, and it is why
   * `DeleteOwnAccount` can call this before deleting the account without
   * needing the two to be one transaction.
   *
   * **Principal-scoped, like every port here.** An implementation runs inside
   * the caller's own principal context, so it can only erase records the
   * caller owns — another subject's records under a guessed account id are
   * not merely skipped, they are invisible.
   */
  eraseAccountScopedRecords(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<FinancialRecordErasureOutcome>;
}

/** Every count zero — the answer to erasing an account that held nothing. */
export const NO_RECORDS_ERASED: FinancialRecordErasureCounts = Object.freeze({
  FINANCIAL_RECORD: 0,
  FINANCIAL_RECORD_REVISION: 0,
  FINANCIAL_RECORD_PROVENANCE: 0,
  FINANCIAL_RECORD_CATEGORY_ASSIGNMENT: 0,
});

/** Total rows across every kind — for a log line, never for a decision. */
export function totalErased(counts: FinancialRecordErasureCounts): number {
  return ERASABLE_FINANCIAL_RECORD_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
}
