/**
 * `FinancialAccountRepository` — the account store, declared INWARD.
 *
 * The interface lives in the application layer and infrastructure implements
 * it (clean-architecture.md §4; architecture test 5), so the use cases depend
 * on a shape this module owns rather than on Prisma, PostgreSQL, or any other
 * thing that might be replaced.
 *
 * **Every method takes the principal and nothing that names an owner.** There
 * is no `findById(id)` without a principal, no `listForUser(userId)`, and no
 * variant that takes a tenant. Implementations run every statement inside
 * `withPrincipalContext`, where RLS (migration 0088) is the boundary: an
 * account belonging to anyone else is not merely filtered out, it is not
 * visible to the transaction at all. A repository method that could be called
 * without a principal would be a hole no amount of careful calling closes.
 *
 * `null` from a lookup therefore means "not visible to you", which is exactly
 * what the use cases turn into the single, oracle-free `account_not_found`.
 */

import type {
  AccountNature,
  AccountOrigin,
  AccountStatus,
  AccountType,
  FinancialAccount,
  WalletKind,
} from '../../domain/financial-account.js';
import type { FinancialAccountId, InstitutionRef } from '../../domain/refs.js';
import type { AccountsPrincipal } from '../principal.js';

/** What an optimistic update did. `stale` means someone else moved first. */
export type AccountUpdateOutcome =
  | { readonly kind: 'updated'; readonly account: FinancialAccount }
  | { readonly kind: 'stale' }
  | { readonly kind: 'not_found' };

/** What a delete did. `not_found` covers "never existed" and "not yours" alike. */
export type AccountDeleteOutcome =
  | { readonly kind: 'deleted'; readonly snapshotsDeleted: number }
  | { readonly kind: 'stale' }
  | { readonly kind: 'not_found' };

/**
 * What one page of the principal's own accounts asks for.
 *
 * **Every filter is part of the QUERY rather than a predicate applied to the
 * answer, and the difference is not stylistic.** A page cut out of a filtered
 * set is only the page the caller asked for if the store did the filtering:
 * narrowing afterwards means the store read — and the process held — every
 * account the caller owns before discarding most of them, and the offset a
 * cursor carries would count rows in the wrong set. Nothing bounds this table
 * either; a person may hold as many accounts as they open.
 *
 * `institutionKind` is deliberately here beside the rest, even though it is a
 * fact about the ISSUER rather than about the account. An implementation
 * answers it from the catalogue row the account names, so an account naming
 * no catalogue issuer matches no kind — the same answer the predicate this
 * replaced gave, now decided where the rows are.
 *
 * `null` means "do not narrow on this". A value outside a vocabulary is not
 * this port's to refuse — it simply matches nothing, which is the honest
 * answer to a question about a value nothing has.
 */
export interface FinancialAccountPageQuery {
  readonly institutionRef: InstitutionRef | null;
  readonly institutionKind: string | null;
  readonly accountType: AccountType | null;
  readonly walletKind: WalletKind | null;
  readonly nature: AccountNature | null;
  readonly status: AccountStatus | null;
  readonly origin: AccountOrigin | null;
  readonly currencyCode: string | null;
  /** How many rows the caller's cursor has already consumed. */
  readonly offset: number;
  /** How many rows to return. */
  readonly limit: number;
}

/**
 * One page, and whether another exists.
 *
 * `hasMore` comes from one extra row rather than from a COUNT: the caller's
 * only question is whether to ask again, and a count is a second pass over
 * rows the page bound exists to avoid reading.
 */
export interface FinancialAccountPage {
  readonly accounts: readonly FinancialAccount[];
  readonly hasMore: boolean;
}

export interface FinancialAccountRepository {
  /**
   * One page of the acting principal's own accounts, oldest first, `id`
   * breaking ties so the order is TOTAL. Two accounts created in the same
   * instant are otherwise interchangeable, and a page boundary that falls
   * between two interchangeable rows drops one and repeats the other for
   * whoever walks the cursor.
   */
  pageOwn(
    actor: AccountsPrincipal,
    query: FinancialAccountPageQuery,
  ): Promise<FinancialAccountPage>;

  /** One of the acting principal's own accounts, or null when not visible. */
  findOwnById(
    actor: AccountsPrincipal,
    id: FinancialAccountId,
  ): Promise<FinancialAccount | null>;

  /**
   * Insert an account the caller owns. The row is bound to the acting
   * principal by the RLS WITH CHECK arm, so the database itself refuses a row
   * created for anybody else.
   */
  create(actor: AccountsPrincipal, account: FinancialAccount): Promise<FinancialAccount>;

  /**
   * Write an already-validated account state at an expected version.
   * Implementations issue `UPDATE ... WHERE id = ? AND version = ?` so a
   * concurrent edit loses the race visibly (`stale`) instead of being
   * overwritten. `next` carries the authoritative values and the incremented
   * version; the domain has already decided what may change.
   */
  update(
    actor: AccountsPrincipal,
    expectedVersion: number,
    next: FinancialAccount,
  ): Promise<AccountUpdateOutcome>;

  /**
   * Delete one of the caller's own accounts and the rows THIS MODULE owns
   * beneath it: the account and its balance snapshots. Nothing else.
   *
   * The narrower claim is deliberate and replaces a wrong one. This method
   * used to say it deleted "everything scoped to it", which it never did:
   * transactions, revisions, provenance and category assignments live in
   * another module, carry a raw `account_id` with no foreign key back here
   * (data-model.md §2), and survived untouched. Account-scoped records owned
   * by other modules are erased through `FinancialRecordEraserPort`, and
   * `DeleteOwnAccount` is what sequences the two — a repository cannot,
   * because reaching another module's store from an adapter is the coupling
   * the ports exist to prevent.
   *
   * The count of removed snapshots is returned so the caller can report what
   * was actually erased rather than assert it.
   */
  deleteOwn(
    actor: AccountsPrincipal,
    id: FinancialAccountId,
    expectedVersion: number,
  ): Promise<AccountDeleteOutcome>;
}
