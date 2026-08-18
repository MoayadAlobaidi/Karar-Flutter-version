/**
 * DeleteOwnAccount — a person deletes an account they own, and every
 * financial record scoped to it.
 *
 * **This is a first-class use case, not an administrative escape hatch.** The
 * module declares `CASCADE_DELETE` as the erasure strategy for
 * `financial_accounts` and `financial_account_balance_snapshots`, and a
 * compulsory consent document promises customers they can delete individual
 * accounts. The legacy made that promise while exposing no delete at all
 * (legacy C4/M7); shipping the promise without the operation is the
 * contradiction this file exists to close.
 *
 * ## What this used to claim, and what it actually did
 *
 * Until the Phase 5 remediation this file said it deleted "an account they
 * own, and everything scoped to it". It deleted the account row and its
 * balance snapshots. Transactions, their revisions, their provenance, and
 * their category assignments carry a raw `account_id` with NO foreign key to
 * this module's table — no FK crosses a module boundary (data-model.md §2) —
 * so nothing cascaded to them and every one of those rows survived, orphaned,
 * while the person was told the account was gone. Two claims were wrong at
 * once: the operation's, and the module's `CASCADE_DELETE` declaration.
 * `FinancialRecordEraserPort` is how the claim becomes true; this file is
 * where the claim is now sized to what actually happens.
 *
 * ## Atomicity: what is achievable here, and what is not
 *
 * Cross-module deletion in this architecture is NOT atomic, and no amount of
 * ordering makes it so. The eraser runs inside the transactions module's own
 * principal-scoped database transaction; the account delete runs inside this
 * module's. Nothing spans both, and the only construct that would — passing a
 * live transaction handle through an application port — is infrastructure
 * leaking across the exact seam that exists to prevent it. That is a material
 * architecture change (a cross-module unit of work), not something this use
 * case can arrange, and pretending otherwise in a comment would repeat the
 * defect this file is fixing.
 *
 * So the residual window is stated, narrowed, and reported rather than
 * hidden. Four decisions do that work:
 *
 * 1. **Visibility and version are checked BEFORE anything is erased.** An
 *    account that is not the caller's, or that moved since they read it,
 *    refuses while every record is still intact. This is the ordering that
 *    matters most: erasing a person's transactions and then refusing the
 *    delete on a version conflict would destroy data to answer "try again".
 * 2. **Records are erased before the account row.** The reverse order would
 *    delete the anchor first and leave records orphaned if the eraser then
 *    failed — the precise state this change exists to end. Failing with the
 *    account still present leaves a coherent world the caller can retry into.
 * 3. **The eraser is idempotent by contract**, so a retry after any partial
 *    failure converges: the second call erases whatever remains (or nothing)
 *    and the delete completes.
 * 4. **A partial outcome is reported as a partial outcome.** If the eraser
 *    succeeds and the account delete then fails, the caller is told exactly
 *    that, with the counts already removed, under its own error kind. It is
 *    never reported as success, and never as "nothing happened".
 *
 * Delete cannot cross a user. The account is read under the caller's own
 * principal, the eraser runs under it, and the store's delete runs under it,
 * so another user's account is invisible at every step — answered by the same
 * oracle-free `account_not_found` as a guessed id. The RLS policy (migration
 * 0088) is what makes that structural rather than careful.
 */

import { Result } from '@karar/shared-kernel';

import type { FinancialAccountId } from '../../domain/refs.js';
import { ACCOUNT_NOT_FOUND, storeFailure, type DeleteOwnAccountError } from '../errors.js';
import type { FinancialAccountRepository } from '../ports/financial-account-repository.js';
import {
  NO_RECORDS_ERASED,
  totalErased,
  type FinancialRecordEraserPort,
  type FinancialRecordErasureCounts,
} from '../ports/financial-record-eraser.js';
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
  /** What the eraser actually removed, per kind. Measured, never assumed. */
  readonly recordsDeleted: FinancialRecordErasureCounts;
}

export class DeleteOwnAccount {
  constructor(
    private readonly accounts: FinancialAccountRepository,
    private readonly records: FinancialRecordEraserPort,
  ) {}

  async execute(
    input: DeleteOwnAccountInput,
    actor: AccountsPrincipal,
  ): Promise<Result<AccountDeleted, DeleteOwnAccountError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    // Step 1: visibility and version, while everything is still intact. The
    // repository re-checks both inside its own transaction — this read is not
    // the guard, it is what keeps the guard from firing after the erasure.
    let current;
    try {
      current = await this.accounts.findOwnById(principal.value, input.accountId);
    } catch (error) {
      return Result.err(storeFailure('own-account read', error));
    }
    if (current === null) return Result.err(ACCOUNT_NOT_FOUND);
    if (current.version !== input.expectedVersion) {
      return Result.err(staleVersion(input.expectedVersion));
    }

    // Step 2: the records other modules hold, before this module's own row.
    let erasure;
    try {
      erasure = await this.records.eraseAccountScopedRecords(principal.value, input.accountId);
    } catch (error) {
      // A throw is not a partial erasure — nothing is known to have been
      // removed — so the counts reported are zeroes and the account stands.
      // The caught throw comes from the other module's store. Its text can
      // carry a connection string, SQL, or a fragment of the very financial
      // records this operation exists to erase, so it is attached
      // non-enumerably for the boundary logger and never described here.
      const failure = {
        kind: 'erasure_incomplete' as const,
        deleted: NO_RECORDS_ERASED,
        outcome: 'failed' as const,
        message:
          'the account was NOT deleted: erasing the financial records scoped to it failed. ' +
          'Deleting the account now would orphan those records and report a completeness that did ' +
          'not happen; retry, because the erasure is idempotent. The failure is logged once at the ' +
          'boundary, against this request',
      };
      Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
      return Result.err(failure);
    }
    if (erasure.kind !== 'erased') {
      return Result.err({
        kind: 'erasure_incomplete',
        deleted: erasure.kind === 'incomplete' ? erasure.deleted : NO_RECORDS_ERASED,
        outcome: erasure.kind,
        message:
          `the account was NOT deleted: erasing the financial records scoped to it reported ` +
          `'${erasure.kind}' — ${erasure.reason}. The account row is left in place deliberately, so ` +
          'the records still have their anchor and a retry can finish the job',
      });
    }

    // Step 3: this module's own rows. The snapshots go with the account, by
    // the repository's explicit delete and by the FK cascade behind it.
    let outcome;
    try {
      outcome = await this.accounts.deleteOwn(
        principal.value,
        input.accountId,
        input.expectedVersion,
      );
    } catch (error) {
      return Result.err(partiallyApplied(erasure.deleted, storeFailure('deletion', error).message));
    }

    if (outcome.kind === 'deleted') {
      return Result.ok({
        accountId: input.accountId,
        snapshotsDeleted: outcome.snapshotsDeleted,
        recordsDeleted: erasure.deleted,
      });
    }

    // Everything below here means the account row survived a successful
    // erasure — the one window step 1 narrows but cannot close. Reported as
    // its own kind: not success, and not "nothing happened".
    if (totalErased(erasure.deleted) === 0 && outcome.kind === 'not_found') {
      // Nothing was erased and the account is already gone: a repeat of a
      // delete that previously completed. Idempotent, and answered exactly as
      // a delete of a never-existing account is, so it stays oracle-free.
      return Result.err(ACCOUNT_NOT_FOUND);
    }
    return Result.err(
      partiallyApplied(
        erasure.deleted,
        outcome.kind === 'stale'
          ? 'the account changed between the version check and the delete, so the row was left in place'
          : 'the account row was no longer visible when the delete ran',
      ),
    );
  }
}

function staleVersion(expectedVersion: number): DeleteOwnAccountError {
  return {
    kind: 'version_conflict',
    expectedVersion,
    message:
      `the account changed since version ${expectedVersion} was read — re-read it before deleting, ` +
      'because a delete is not recoverable and the change may be one the same person just made',
  };
}

function partiallyApplied(
  deleted: FinancialRecordErasureCounts,
  because: string,
): DeleteOwnAccountError {
  return {
    kind: 'deletion_partially_applied',
    deleted,
    message:
      `the financial records scoped to this account were erased (${totalErased(deleted)} rows) but ` +
      `the account row itself was NOT deleted: ${because}. Cross-module deletion is not atomic in ` +
      'this architecture and this is the window that leaves; re-issuing the delete at the current ' +
      'version completes it, and the erasure is idempotent so nothing is erased twice',
  };
}
