/**
 * ListOwnBalanceSnapshots — what sources have reported about one of the
 * caller's accounts, most recently true first.
 *
 * **Every figure returned here is a reported fact.** Nothing in this path
 * sums transactions, nets anything, or projects a balance forward; the list
 * is the history of what sources said, with the provenance that lets a person
 * ask why a number is what it is. A derived running balance is a different
 * concept and will arrive under its own name, with its own honest label.
 *
 * **The answer is a PAGE, and the store cuts it.** Nothing that arrives here
 * is bigger than the page a caller asked for: this table is append-only, has
 * no ceiling and is never pruned, so reading it whole and then trimming would
 * make the cost of one request a function of how long a person has held the
 * account. The bound goes into the query instead, and the extra row the store
 * reads is what tells the caller whether to ask again.
 *
 * Account visibility is checked FIRST, and the reason is worth stating: the
 * snapshot repository returns an empty list both for an account with no
 * snapshots and for an account that is not the caller's. Inferring
 * "not found" from emptiness would make the two indistinguishable in the
 * wrong direction — a legitimate owner with no snapshots would be told their
 * account does not exist. So visibility is answered from the account, and
 * emptiness means exactly what it says.
 */

import { Result } from '@karar/shared-kernel';

import type { FinancialAccountId } from '../../domain/refs.js';
import { ACCOUNT_NOT_FOUND, storeFailure, type ListOwnBalanceSnapshotsError } from '../errors.js';
import type {
  BalanceSnapshotPage,
  BalanceSnapshotRepository,
} from '../ports/balance-snapshot-repository.js';
import type { FinancialAccountRepository } from '../ports/financial-account-repository.js';
import { requirePrincipal, type AccountsPrincipal } from '../principal.js';

/**
 * Deliberately carries no owner identifier — the principal is context.
 *
 * The page is part of the QUESTION rather than something a caller applies to
 * the answer, and every field is required. An optional bound is a default
 * waiting to be written somewhere further out, and the somewhere further out
 * is where it stops being visible: the caller states the window it wants and
 * the store reads that window.
 */
export interface ListOwnBalanceSnapshotsInput {
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

export class ListOwnBalanceSnapshots {
  constructor(
    private readonly accounts: FinancialAccountRepository,
    private readonly snapshots: BalanceSnapshotRepository,
  ) {}

  async execute(
    input: ListOwnBalanceSnapshotsInput,
    actor: AccountsPrincipal,
  ): Promise<Result<BalanceSnapshotPage, ListOwnBalanceSnapshotsError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    try {
      const account = await this.accounts.findOwnById(principal.value, input.accountId);
      if (account === null) return Result.err(ACCOUNT_NOT_FOUND);
      return Result.ok(
        await this.snapshots.pageForOwnAccount(principal.value, {
          accountId: input.accountId,
          balanceKind: input.balanceKind,
          sourceKind: input.sourceKind,
          offset: input.offset,
          limit: input.limit,
        }),
      );
    } catch (error) {
      return Result.err(storeFailure('own balance-snapshot listing', error));
    }
  }
}
