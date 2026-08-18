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
 * Account visibility is checked FIRST, and the reason is worth stating: the
 * snapshot repository returns an empty list both for an account with no
 * snapshots and for an account that is not the caller's. Inferring
 * "not found" from emptiness would make the two indistinguishable in the
 * wrong direction — a legitimate owner with no snapshots would be told their
 * account does not exist. So visibility is answered from the account, and
 * emptiness means exactly what it says.
 */

import { Result } from '@karar/shared-kernel';

import type { BalanceSnapshot } from '../../domain/balance-snapshot.js';
import type { FinancialAccountId } from '../../domain/refs.js';
import { ACCOUNT_NOT_FOUND, storeFailure, type ListOwnBalanceSnapshotsError } from '../errors.js';
import type { BalanceSnapshotRepository } from '../ports/balance-snapshot-repository.js';
import type { FinancialAccountRepository } from '../ports/financial-account-repository.js';
import { requirePrincipal, type AccountsPrincipal } from '../principal.js';

/** Deliberately carries no owner identifier — the principal is context. */
export interface ListOwnBalanceSnapshotsInput {
  readonly accountId: FinancialAccountId;
}

export class ListOwnBalanceSnapshots {
  constructor(
    private readonly accounts: FinancialAccountRepository,
    private readonly snapshots: BalanceSnapshotRepository,
  ) {}

  async execute(
    input: ListOwnBalanceSnapshotsInput,
    actor: AccountsPrincipal,
  ): Promise<Result<readonly BalanceSnapshot[], ListOwnBalanceSnapshotsError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    try {
      const account = await this.accounts.findOwnById(principal.value, input.accountId);
      if (account === null) return Result.err(ACCOUNT_NOT_FOUND);
      return Result.ok(await this.snapshots.listForOwnAccount(principal.value, input.accountId));
    } catch (error) {
      return Result.err(storeFailure('own balance-snapshot listing', error));
    }
  }
}
