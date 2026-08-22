/**
 * DeleteOwnTransaction — a subject removes one of their own transactions, and
 * every relationship that named it.
 *
 * Deletion is real. The declared lifecycle for every table in this module is
 * `CASCADE_DELETE` (MODULE.md), and the schema enforces it with
 * `ON DELETE CASCADE` foreign keys rather than application code that walks
 * four tables and could forget one: revisions, provenance, and category
 * assignments go with the transaction, in the same statement, or nothing
 * goes. A "deleted" transaction whose provenance row survived would be a
 * residue of exactly the data the subject asked to be rid of.
 *
 * ## What the cascade could NOT reach, and why that was a defect
 *
 * `public.transfer_matches` — a relationship saying that two of the person's
 * transactions are two sides of one movement of their own money — carries
 * this transaction's id as a raw uuid with NO foreign key back, because no FK
 * crosses a module boundary (data-model.md §2). So nothing cascaded to it,
 * and deleting a transaction left a match naming a record that no longer
 * existed.
 *
 * **That is not untidiness.** A dangling match asserts that two movements
 * were one movement while one of them is gone, so the surviving side is still
 * explained away as a transfer and a real expense stays hidden from the
 * person's own record of what they spent. Deleting one row therefore made a
 * second row say something false. `TransferMatchEraserPort` is how the claim
 * this use case makes becomes true.
 *
 * ## Ordering, and what happens when it cannot be completed
 *
 * The matches go FIRST, before the transaction they name. The reverse order
 * has a window in which the match points at nothing, and if the run stops
 * there the residue is permanent — nothing later would know to look for it.
 * This order's window is the opposite and is harmless: a transaction that has
 * lost its matches is an ordinary unmatched transaction, which is what every
 * transaction is until somebody pairs it.
 *
 * Cross-module deletion is NOT atomic here. The eraser runs inside the
 * transfer-matching module's own principal-scoped transaction and this
 * delete runs inside this module's; nothing spans both, and the construct
 * that would — passing a live transaction handle through an application port
 * — is infrastructure leaking across the seam that exists to prevent it. So
 * the window is narrowed, stated, and reported:
 *
 *   * a throw or any non-`erased` outcome means the transaction is NOT
 *     deleted, under its own error arm, with an honest count of what did go;
 *   * the eraser is idempotent by contract, so a retry converges;
 *   * if the matches go and the delete then fails, that is reported as
 *     `DELETION_PARTIALLY_APPLIED` — never as success, and never as
 *     `NOT_FOUND`, which would tell a person nothing happened to a request
 *     that removed rows about their money.
 *
 * The legacy shipped a consent document promising subjects they could delete
 * individual accounts while exposing no delete path at all (legacy C4/M7).
 * That contradiction is not carried forward: this use case exists, it works,
 * and its integration test proves a delete cannot cross a user boundary.
 *
 * A transaction that is absent and one that belongs to somebody else both
 * answer `NOT_FOUND` — RLS makes the second case genuinely invisible rather
 * than deliberately masked, so id guessing yields nothing either way. The
 * eraser is principal-scoped for the same reason, so a caller who names a
 * stranger's transaction erases none of their matches: the answer is zero,
 * and zero is also what a never-minted id answers.
 *
 * No `userId`, no `tenantId`: the principal comes from context.
 */

import { Result } from '@karar/shared-kernel';

import { TransactionId } from '../../domain/refs.js';
import {
  principalContextMissing,
  toStoreFailure,
  type NotFound,
  type PrincipalContextMissing,
  type StoreFailure,
  type TransactionDeletionPartiallyApplied,
  type TransferMatchErasureIncomplete,
} from '../errors.js';
import type { PrincipalContextPort } from '../ports/principal-context.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';
import type { TransferMatchEraserPort } from '../ports/transfer-match-eraser.js';

export interface DeleteOwnTransactionInput {
  readonly transactionId: string;
}

export interface TransactionDeleted {
  readonly transactionId: string;
  /**
   * What the match eraser actually removed. Measured, never assumed — a
   * caller telling a person what happened needs the true number, and zero is
   * an answer.
   */
  readonly transferMatchesDeleted: number;
}

export type DeleteOwnTransactionError =
  | PrincipalContextMissing
  | NotFound
  | TransferMatchErasureIncomplete
  | TransactionDeletionPartiallyApplied
  | StoreFailure;

export class DeleteOwnTransaction {
  constructor(
    private readonly principals: PrincipalContextPort,
    private readonly transactions: TransactionRepository,
    private readonly transferMatches: TransferMatchEraserPort,
  ) {}

  async execute(
    input: DeleteOwnTransactionInput,
  ): Promise<Result<TransactionDeleted, DeleteOwnTransactionError>> {
    const principal = this.principals.current();
    if (principal === null) return Result.err(principalContextMissing());
    const id = TransactionId.of(input.transactionId);

    // Step 1: the relationships that name this transaction, before the
    // transaction itself. See the header for why this order and not the other.
    let erasure;
    try {
      erasure = await this.transferMatches.eraseTransferMatchesForTransaction(principal, id);
    } catch (error) {
      // A throw is not a partial erasure — nothing is known to have gone — so
      // the count is zero and the transaction stands. The throw comes from
      // another module's store; its text can carry a connection string, SQL,
      // or a fragment of a record, so it is attached non-enumerably for the
      // boundary logger and never described here.
      return Result.err(
        matchErasureIncomplete(
          0,
          'failed',
          'the transaction was NOT deleted: erasing the transfer matches that name it failed. ' +
            'Deleting it now would leave a match asserting that this movement was one side of a ' +
            'transfer whose other side no longer exists, which hides a real expense from the ' +
            "person's own record; retry, because the erasure is idempotent. The failure is logged " +
            'once at the boundary, against this request',
          error,
        ),
      );
    }
    if (erasure.kind !== 'erased') {
      return Result.err(
        matchErasureIncomplete(
          erasure.kind === 'incomplete' ? erasure.transferMatchesDeleted : 0,
          erasure.kind,
          `the transaction was NOT deleted: erasing the transfer matches that name it reported ` +
            `'${erasure.kind}' — ${erasure.reason}. The transaction is left in place deliberately, ` +
            'so any match that remains still names a movement that exists and a retry can finish ' +
            'the job',
          (erasure as { cause?: unknown }).cause,
        ),
      );
    }
    const transferMatchesDeleted = erasure.transferMatchesDeleted;

    // Step 2: the transaction, and by cascade its revisions, provenance and
    // category assignments.
    let removed: boolean;
    try {
      removed = await this.transactions.delete(principal, id);
    } catch (error) {
      // The matches really did go, so this is not a plain store failure: a
      // caller told "the store did not answer" would reasonably assume the
      // request left no trace.
      if (transferMatchesDeleted > 0) {
        return Result.err(
          partiallyApplied(
            transferMatchesDeleted,
            'the store did not answer when the transaction itself was removed',
            error,
          ),
        );
      }
      return Result.err(toStoreFailure(error));
    }

    if (!removed) {
      if (transferMatchesDeleted > 0) {
        // Matches went and the transaction was already absent: the dangling
        // relationships this port exists to prevent, cleaned up by a repeat of
        // a delete that had previously stopped halfway. Reported honestly
        // rather than as `NOT_FOUND`, which would claim nothing happened.
        return Result.err(
          partiallyApplied(
            transferMatchesDeleted,
            'the transaction was no longer visible when the delete ran',
            undefined,
          ),
        );
      }
      // Nothing was erased and nothing was there: absent, or somebody else's,
      // answered identically so the refusal is not an existence oracle.
      return Result.err({ kind: 'NOT_FOUND', resource: 'transaction', id });
    }
    return Result.ok({ transactionId: id, transferMatchesDeleted });
  }
}

function matchErasureIncomplete(
  transferMatchesDeleted: number,
  outcome: 'incomplete' | 'failed',
  message: string,
  cause: unknown,
): TransferMatchErasureIncomplete {
  const failure = {
    kind: 'TRANSFER_MATCH_ERASURE_INCOMPLETE' as const,
    transferMatchesDeleted,
    outcome,
    message,
  };
  // Attached only when there is one. Defining `cause: undefined` would make
  // the field present-but-empty, which reads as "we looked and there was
  // nothing to log" rather than "there was nothing to attach".
  if (cause !== undefined) {
    Object.defineProperty(failure, 'cause', { value: cause, enumerable: false, writable: false });
  }
  return failure;
}

function partiallyApplied(
  transferMatchesDeleted: number,
  because: string,
  cause: unknown,
): TransactionDeletionPartiallyApplied {
  const failure = {
    kind: 'DELETION_PARTIALLY_APPLIED' as const,
    transferMatchesDeleted,
    message:
      `the transfer matches naming this transaction were erased (${transferMatchesDeleted} rows) ` +
      `but the transaction itself was NOT deleted: ${because}. Cross-module deletion is not atomic ` +
      'in this architecture and this is the window that leaves; re-issuing the delete completes it, ' +
      'and the erasure is idempotent so nothing is erased twice. Any reason beyond this sentence ' +
      'comes from the database driver and is logged once at the boundary, against this request',
  };
  if (cause !== undefined) {
    Object.defineProperty(failure, 'cause', { value: cause, enumerable: false, writable: false });
  }
  return failure;
}
