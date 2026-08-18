/**
 * DeleteOwnAccount — a person deletes an account they own, and everything
 * scoped to it.
 *
 * **This is a first-class use case, not an administrative escape hatch.** The
 * module declares `CASCADE_DELETE` as the erasure strategy for
 * `financial_accounts` and `financial_account_balance_snapshots`, and a
 * compulsory consent document promises customers they can delete individual
 * accounts. The legacy made that promise while exposing no delete at all
 * (legacy C4/M7); shipping the promise without the operation is the
 * contradiction this file exists to close.
 *
 * Delete cannot cross a user. The account is read under the caller's own
 * principal first, and the store's delete runs inside the same principal
 * context, so another user's account is invisible at both steps — answered by
 * the same oracle-free `account_not_found` as a guessed id. The RLS policy
 * (migration 0088) is what makes that structural rather than careful.
 *
 * The delete is version-checked like an edit: deleting an account someone
 * just changed on another device destroys work they have not seen the
 * outcome of, so a stale version reports `version_conflict` and the caller
 * re-reads.
 *
 * Erasure is reported, not asserted: the outcome carries how many snapshots
 * actually went with the account, so a caller can log what was erased instead
 * of claiming what should have been.
 */

import { Result } from '@karar/shared-kernel';

import type { FinancialAccountId } from '../../domain/refs.js';
import { ACCOUNT_NOT_FOUND, storeFailure, type DeleteOwnAccountError } from '../errors.js';
import type { FinancialAccountRepository } from '../ports/financial-account-repository.js';
import { requirePrincipal, type AccountsPrincipal } from '../principal.js';

/** Deliberately carries no owner identifier — the principal is context. */
export interface DeleteOwnAccountInput {
  readonly accountId: FinancialAccountId;
  readonly expectedVersion: number;
}

export interface AccountDeleted {
  readonly accountId: FinancialAccountId;
  /** What the cascade actually removed alongside the account. */
  readonly snapshotsDeleted: number;
}

export class DeleteOwnAccount {
  constructor(private readonly accounts: FinancialAccountRepository) {}

  async execute(
    input: DeleteOwnAccountInput,
    actor: AccountsPrincipal,
  ): Promise<Result<AccountDeleted, DeleteOwnAccountError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    try {
      const outcome = await this.accounts.deleteOwn(
        principal.value,
        input.accountId,
        input.expectedVersion,
      );
      if (outcome.kind === 'not_found') return Result.err(ACCOUNT_NOT_FOUND);
      if (outcome.kind === 'stale') {
        return Result.err({
          kind: 'version_conflict',
          expectedVersion: input.expectedVersion,
          message:
            `the account changed since version ${input.expectedVersion} was read — re-read it before ` +
            'deleting, because a delete is not recoverable and the change may be one the same person just made',
        });
      }
      return Result.ok({
        accountId: input.accountId,
        snapshotsDeleted: outcome.snapshotsDeleted,
      });
    } catch (error) {
      return Result.err(storeFailure('own-account deletion', error));
    }
  }
}
