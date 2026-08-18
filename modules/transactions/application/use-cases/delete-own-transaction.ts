/**
 * DeleteOwnTransaction — a subject removes one of their own transactions.
 *
 * Deletion is real. The declared lifecycle for every table in this module is
 * `CASCADE_DELETE` (MODULE.md), and the schema enforces it with
 * `ON DELETE CASCADE` foreign keys rather than application code that walks
 * four tables and could forget one: revisions, provenance, and category
 * assignments go with the transaction, in the same statement, or nothing
 * goes. A "deleted" transaction whose provenance row survived would be a
 * residue of exactly the data the subject asked to be rid of.
 *
 * The legacy shipped a consent document promising subjects they could delete
 * individual accounts while exposing no delete path at all (legacy C4/M7).
 * That contradiction is not carried forward: this use case exists, it works,
 * and its integration test proves a delete cannot cross a user boundary.
 *
 * A transaction that is absent and one that belongs to somebody else both
 * answer `NOT_FOUND` — RLS makes the second case genuinely invisible rather
 * than deliberately masked, so id guessing yields nothing either way.
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
} from '../errors.js';
import type { PrincipalContextPort } from '../ports/principal-context.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';

export interface DeleteOwnTransactionInput {
  readonly transactionId: string;
}

export interface TransactionDeleted {
  readonly transactionId: string;
}

export type DeleteOwnTransactionError = PrincipalContextMissing | NotFound | StoreFailure;

export class DeleteOwnTransaction {
  constructor(
    private readonly principals: PrincipalContextPort,
    private readonly transactions: TransactionRepository,
  ) {}

  async execute(
    input: DeleteOwnTransactionInput,
  ): Promise<Result<TransactionDeleted, DeleteOwnTransactionError>> {
    const principal = this.principals.current();
    if (principal === null) return Result.err(principalContextMissing());
    const id = TransactionId.of(input.transactionId);

    try {
      const removed = await this.transactions.delete(principal, id);
      if (!removed) {
        return Result.err({ kind: 'NOT_FOUND', resource: 'transaction', id });
      }
      return Result.ok({ transactionId: id });
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
  }
}
