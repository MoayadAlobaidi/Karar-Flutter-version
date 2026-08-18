/**
 * `BalanceSnapshotRepository` — reported balances, declared INWARD.
 *
 * Reads are always scoped to the acting principal AND to one account; there
 * is no "all snapshots" method, because no surface in this module has a
 * reason for one and an unscoped read is the shape a leak takes.
 *
 * **There is no `update` method, deliberately.** A snapshot is a fact a
 * source asserted; a corrected figure is a NEW snapshot at a new `asOf`, so
 * the history of what was believed when stays readable. The database agrees:
 * `karar_app` holds no UPDATE grant on the table and a trigger raises on any
 * attempt, even for the owner (migration 0089).
 *
 * **There is no method that computes a balance, and there never will be.**
 * `countForAccount` answers "does this account hold any financial record?" —
 * the question the currency-immutability rule turns on — and nothing here
 * sums, nets, or projects anything.
 */

import type { BalanceSnapshot } from '../../domain/balance-snapshot.js';
import type { FinancialAccountId } from '../../domain/refs.js';
import type { AccountsPrincipal } from '../principal.js';

export interface BalanceSnapshotRepository {
  /**
   * The caller's own snapshots for one of their own accounts, most recently
   * true first. An account that is not visible yields an empty list — the
   * same answer an account with no snapshots gives, which is why the use case
   * checks account visibility first and reports `account_not_found` from
   * there rather than inferring it from emptiness.
   */
  listForOwnAccount(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<readonly BalanceSnapshot[]>;

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
