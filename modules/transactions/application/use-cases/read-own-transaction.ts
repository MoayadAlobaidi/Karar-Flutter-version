/**
 * ReadOwnTransaction — one transaction WITH the evidence that explains it.
 *
 * The read deliberately returns the revision history and the provenance
 * records alongside the current values, because the product's claim is not
 * "here is a number" but "here is a number and where it came from". A read
 * that returned only the current row would make the explanation a separate,
 * optional request — and an explanation nobody fetches is an explanation
 * nobody checks.
 *
 * A transaction belonging to somebody else answers `NOT_FOUND`, exactly as an
 * id that does not exist does. RLS makes that the natural outcome rather than
 * a deliberate mask: the row is simply not visible in the principal's
 * session. A distinguishable "forbidden" would turn id guessing into an
 * existence oracle over another person's finances.
 */

import { Result } from '@karar/shared-kernel';

import type { TransactionCategoryAssignment } from '../../domain/category-assignment.js';
import type { TransactionProvenance } from '../../domain/provenance.js';
import { divergesFromSource, type TransactionRevision } from '../../domain/revision.js';
import { TransactionId } from '../../domain/refs.js';
import type { Transaction } from '../../domain/transaction.js';
import {
  principalContextMissing,
  toStoreFailure,
  type NotFound,
  type PrincipalContextMissing,
  type StoreFailure,
} from '../errors.js';
import type { CategoryAssignmentRepository } from '../ports/category-repository.js';
import type { PrincipalContextPort } from '../ports/principal-context.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';

export interface ReadOwnTransactionInput {
  readonly transactionId: string;
}

export interface OwnTransactionView {
  readonly transaction: Transaction;
  /** Oldest first; the earliest revision holds the values the source supplied. */
  readonly revisions: readonly TransactionRevision[];
  readonly provenance: readonly TransactionProvenance[];
  readonly activeCategory: TransactionCategoryAssignment | null;
  /**
   * True when a person has corrected a value away from what the source
   * supplied. Surfaced explicitly so a screen can say "edited" rather than
   * presenting a user's own figure as the bank's.
   */
  readonly divergesFromSource: boolean;
}

export type ReadOwnTransactionError = PrincipalContextMissing | NotFound | StoreFailure;

export class ReadOwnTransaction {
  constructor(
    private readonly principals: PrincipalContextPort,
    private readonly transactions: TransactionRepository,
    private readonly assignments: CategoryAssignmentRepository,
  ) {}

  async execute(
    input: ReadOwnTransactionInput,
  ): Promise<Result<OwnTransactionView, ReadOwnTransactionError>> {
    const principal = this.principals.current();
    if (principal === null) return Result.err(principalContextMissing());
    const id = TransactionId.of(input.transactionId);

    try {
      const transaction = await this.transactions.findById(principal, id);
      if (transaction === null) {
        return Result.err({ kind: 'NOT_FOUND', resource: 'transaction', id });
      }
      const [revisions, provenance, activeCategory] = await Promise.all([
        this.transactions.listRevisions(principal, id),
        this.transactions.listProvenance(principal, id),
        this.assignments.findActive(principal, id),
      ]);
      return Result.ok({
        transaction,
        revisions,
        provenance,
        activeCategory,
        divergesFromSource: divergesFromSource(revisions),
      });
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
  }
}
