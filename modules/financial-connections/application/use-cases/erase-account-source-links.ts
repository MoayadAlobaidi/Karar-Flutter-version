/**
 * EraseAccountSourceLinks — remove every source link feeding one account.
 *
 * ## Why this exists, and what it is waiting for
 *
 * `modules/financial-accounts` declares `CASCADE_DELETE` for
 * `financial_accounts` and states what that reaches: the account row, its
 * balance snapshots, and every account-scoped record in other modules, erased
 * through an inward port before the account row is removed. Source links are
 * now among those records — `account_source_links.account_id` is a raw uuid
 * with no foreign key back, because no FK crosses a module boundary — so
 * without this path a deleted account would leave its source links orphaned,
 * and the next import through the surviving connection would recreate an
 * account the person had just deleted.
 *
 * **The port that calls this is DECLARED by `modules/financial-accounts`**,
 * because that module owns the interfaces its deletion path depends on
 * (architecture test 5: ports are declared inward) and this module cannot add
 * one to it. That port —
 * `financial-accounts/application/ports/account-source-link-eraser.ts` — is
 * satisfied by `FinancialAccountsSourceLinkEraser` in this module's
 * `infrastructure/adapters/`, which is a delegation to this class and nothing
 * more. `DeleteOwnAccount` calls it before the account row is removed and
 * folds the count into the outcome it reports.
 *
 * For one phase the port did not exist and this use case was reachable only
 * by a composition root that called it directly, so an account deleted
 * through `DeleteOwnAccount` left its links behind. Recording that here is
 * what made it fixable: `modules/financial-accounts` documented a cascade
 * that reached less than it claimed for an entire phase, and the lesson
 * recorded there was that the claim being written down is what made it
 * invisible.
 *
 * ## Idempotent by contract
 *
 * Called twice, the second call finds nothing and answers zero. That is what
 * lets an account erasure retry after a partial failure and converge without
 * the two modules sharing a transaction — which they cannot, because no unit
 * of work crosses an application port.
 */

import { Result } from '@karar/shared-kernel';

import { CanonicalAccountRef } from '../../domain/refs.js';
import { storeFailure, type EraseAccountSourceLinksError } from '../errors.js';
import type { AccountSourceLinkRepository } from '../ports/account-source-link-repository.js';
import { requirePrincipal, type ConnectionsPrincipal } from '../principal.js';

export interface EraseAccountSourceLinksInput {
  readonly accountId: string;
}

/** Exact rows removed. Zero is an answer, never an absence of one. */
export interface AccountSourceLinksErased {
  readonly accountId: string;
  readonly accountSourceLinksDeleted: number;
}

export class EraseAccountSourceLinks {
  constructor(private readonly links: AccountSourceLinkRepository) {}

  async execute(
    input: EraseAccountSourceLinksInput,
    actor: ConnectionsPrincipal,
  ): Promise<Result<AccountSourceLinksErased, EraseAccountSourceLinksError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;
    try {
      const deleted = await this.links.eraseForAccount(
        principal.value,
        CanonicalAccountRef.of(input.accountId),
      );
      return Result.ok({ accountId: input.accountId, accountSourceLinksDeleted: deleted });
    } catch (error) {
      return Result.err(storeFailure('account source link erasure', error));
    }
  }
}
