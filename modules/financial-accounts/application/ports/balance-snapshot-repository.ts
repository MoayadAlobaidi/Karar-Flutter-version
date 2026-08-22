/**
 * `BalanceSnapshotRepository` — reported balances, declared INWARD.
 *
 * Reads are always scoped to the acting principal AND to one account; there
 * is no "all snapshots" method, because no surface in this module has a
 * reason for one and an unscoped read is the shape a leak takes.
 *
 * **There is no UNPAGED read either, and that is the same argument applied to
 * volume rather than to ownership.** A reported balance is never deleted and
 * never updated — a corrected figure is a new row — so this is the one table
 * in the module that grows for as long as an account exists. A read that
 * answered with all of it would be correct on the day it was written and a
 * way to exhaust a process later, with no code change in between to notice.
 *
 * **There is no `update` method, deliberately.** A snapshot is a fact a
 * source asserted; a corrected figure is a NEW snapshot at a new `asOf`, so
 * the history of what was believed when stays readable. The database agrees:
 * `karar_app` holds no UPDATE grant on the table and a trigger raises on any
 * attempt, even for the owner (migration 0089).
 *
 * **There is no method that computes a balance, and there never will be.**
 * `countForAccount` answers "does this account hold any REPORTED BALANCE?"
 * and nothing here sums, nets, or projects anything.
 *
 * That is HALF of what the currency-immutability rule turns on, and treating
 * it as the whole answer was a defect: transactions are financial records
 * too, and they live in another module. `UpdateOwnAccount` asks both this
 * count and `FinancialRecordPresencePort`, and either one answering yes
 * freezes the currency.
 */

import type { BalanceSnapshot } from '../../domain/balance-snapshot.js';
import type { FinancialAccountId } from '../../domain/refs.js';
import type { AccountsPrincipal } from '../principal.js';

/**
 * What one page of an account's reported balances asks for.
 *
 * **The bound travels INTO the query, and that is the whole point of this
 * type.** This table has no ceiling: one row per reported balance, per
 * account, forever, with nothing that prunes it. A method answering with
 * "every snapshot for this account" is therefore a method whose cost grows
 * without limit for the longest-lived account on the platform, and trimming
 * the answer after it arrives bounds the response while leaving the read
 * unbounded. So the page is a parameter of the read, and an implementation
 * may fetch no more than `limit + 1` rows.
 *
 * **The two kind filters are the CALLER'S words, passed through untouched.**
 * Nothing here defaults one, coalesces one, or answers a question about one
 * kind with another kind's row: a value no source ever reported matches
 * nothing rather than widening the answer.
 */
export interface BalanceSnapshotPageQuery {
  readonly accountId: FinancialAccountId;
  /** Narrow to one reported kind; `null` reads every kind. */
  readonly balanceKind: string | null;
  /** Narrow to one source kind; `null` reads every source. */
  readonly sourceKind: string | null;
  /** How many rows the caller's cursor has already consumed. */
  readonly offset: number;
  /** How many rows to return. */
  readonly limit: number;
}

/**
 * One page, and whether another exists.
 *
 * `hasMore` comes from the ONE extra row an implementation reads, never from
 * a separate COUNT: a count over a table nothing prunes is a second full
 * scan of the very data the page bound exists to avoid touching, and the only
 * question a caller actually has is whether to ask again.
 */
export interface BalanceSnapshotPage {
  readonly snapshots: readonly BalanceSnapshot[];
  readonly hasMore: boolean;
}

export interface BalanceSnapshotRepository {
  /**
   * One page of the caller's own snapshots for one of their own accounts,
   * most recently true first.
   *
   * **The ordering is TOTAL, and it has to be.** Two reports true at the same
   * instant and captured at the same instant are otherwise interchangeable,
   * so the store is free to return them in either order — and a page boundary
   * falling between two interchangeable rows drops one row and repeats the
   * other for a caller walking the cursor. The row id closes the order.
   *
   * An account that is not visible yields an empty page — the same answer an
   * account with no snapshots gives, which is why the use case checks account
   * visibility first and reports `account_not_found` from there rather than
   * inferring it from emptiness.
   */
  pageForOwnAccount(
    actor: AccountsPrincipal,
    query: BalanceSnapshotPageQuery,
  ): Promise<BalanceSnapshotPage>;

  /**
   * How many financial records the caller's account holds. Used by the
   * currency-immutability rule; never used to derive a balance.
   */
  countForAccount(actor: AccountsPrincipal, accountId: FinancialAccountId): Promise<number>;

  /**
   * Record what a source reported. Append-only: there is no update path, and
   * the row is bound to the acting principal by the RLS WITH CHECK arm.
   */
  append(actor: AccountsPrincipal, snapshot: BalanceSnapshot): Promise<BalanceSnapshot>;
}
