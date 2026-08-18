/**
 * Persistence ports for the transaction aggregate — declared inward
 * (architecture test 5), named by no implementation.
 *
 * A transaction, its revision history, and its provenance are ONE aggregate
 * and are written together or not at all. That is why `commit` and
 * `correct` take all three parts rather than exposing three repositories a
 * caller could use out of step: a transaction without provenance, or a
 * correction without its revision, is exactly the unexplainable financial
 * fact this module exists to make impossible. The atomicity is the port's
 * contract, not the caller's discipline.
 *
 * Every method takes the acting principal, and the implementation runs each
 * statement inside a principal-context transaction (transaction-local
 * `app.tenant_id` / `app.user_id` GUCs bound from the caller's own record,
 * never from client input — tenancy.md §2). Without that context the RLS
 * policies match nothing: reads return empty, writes affect zero rows.
 *
 * The principal is a parameter HERE, at the port, because the repository has
 * to bind it into the database session. It is never a parameter on a use-case
 * INPUT — see `principal-context.ts` for why that distinction is the whole
 * isolation argument.
 */

import type { Transaction } from '../../domain/transaction.js';
import type { TransactionProvenance } from '../../domain/provenance.js';
import type { TransactionRevision } from '../../domain/revision.js';
import type { AccountRef, TransactionId } from '../../domain/refs.js';
import type { DedupFingerprint } from './dedup-fingerprint.js';
import type { TransactionsPrincipal } from './principal-context.js';

/**
 * Everything one commit writes. The fingerprint travels beside the
 * transaction because it is a storage-level uniqueness fact, not a domain
 * property of the movement of money.
 */
export interface TransactionCommit {
  readonly transaction: Transaction;
  readonly revision: TransactionRevision;
  readonly provenance: TransactionProvenance;
  readonly fingerprint: DedupFingerprint;
  /** Discriminates a genuine repeat of an identical movement. 1 for the first. */
  readonly occurrenceOrdinal: number;
}

/** Everything one accepted correction writes. */
export interface TransactionCorrectionCommit {
  readonly transaction: Transaction;
  readonly revision: TransactionRevision;
  readonly provenance: TransactionProvenance;
  /** The version the caller read; the write refuses if the row has moved on. */
  readonly expectedVersion: number;
}

/**
 * Keyset page request. Ordering is `bookingDate DESC, id DESC` — a total
 * order, so a page boundary never drops or repeats a row the way an
 * `OFFSET` page does when a concurrent insert shifts everything by one.
 */
export interface TransactionPageQuery {
  /** Narrow to one account; `null` reads every account the principal owns. */
  readonly accountRef: AccountRef | null;
  /** Exclusive lower bound in the ordering, from a previous page's cursor. */
  readonly after: TransactionCursor | null;
  /** Rows to return. The use case bounds this against the declared page limits. */
  readonly limit: number;
}

/** The position a page ended at. Opaque to callers; encoded by the use case. */
export interface TransactionCursor {
  readonly bookingDate: Date;
  readonly id: TransactionId;
}

export interface TransactionPage {
  readonly transactions: readonly Transaction[];
  /** The position to resume from, or `null` when the page is the last one. */
  readonly nextCursor: TransactionCursor | null;
}

/**
 * Raised by an implementation when the dedup unique constraint refuses a
 * commit. A typed error rather than a leaked driver error, so the use case
 * can turn it into the `DUPLICATE_TRANSACTION` outcome a user can act on.
 */
export class DuplicateTransactionError extends Error {
  override readonly name = 'DuplicateTransactionError';

  constructor(readonly fingerprintVersion: string, message: string) {
    super(message);
  }
}

/** Raised when the row moved between the caller's read and its write. */
export class TransactionVersionConflictError extends Error {
  override readonly name = 'TransactionVersionConflictError';

  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number,
    message: string,
  ) {
    super(message);
  }
}

export interface TransactionRepository {
  /**
   * Atomically inserts the transaction, its first revision, and its
   * provenance. Throws `DuplicateTransactionError` when an identical
   * movement is already recorded for this principal on this account under the
   * same fingerprint version.
   */
  commit(principal: TransactionsPrincipal, commit: TransactionCommit): Promise<void>;

  /** The principal's own row, or `null` — another subject's id is `null` too. */
  findById(principal: TransactionsPrincipal, id: TransactionId): Promise<Transaction | null>;

  /** One keyset page of the principal's own transactions. */
  page(principal: TransactionsPrincipal, query: TransactionPageQuery): Promise<TransactionPage>;

  /**
   * Atomically updates the transaction, appends the correction revision, and
   * writes the provenance of the corrected values. Throws
   * `TransactionVersionConflictError` when the stored version is not
   * `expectedVersion`.
   */
  correct(
    principal: TransactionsPrincipal,
    commit: TransactionCorrectionCommit,
  ): Promise<void>;

  /**
   * Deletes the principal's own transaction. Revisions, provenance, and
   * category assignments go with it by `ON DELETE CASCADE`, which is the
   * declared `CASCADE_DELETE` lifecycle (MODULE.md) enforced by the schema
   * rather than by application code that could forget a table.
   *
   * Returns `false` when nothing matched — absent, or another subject's.
   */
  delete(principal: TransactionsPrincipal, id: TransactionId): Promise<boolean>;

  /** The append-only revision history, oldest first. */
  listRevisions(
    principal: TransactionsPrincipal,
    id: TransactionId,
  ): Promise<readonly TransactionRevision[]>;

  /** The provenance records, one per revision, oldest first. */
  listProvenance(
    principal: TransactionsPrincipal,
    id: TransactionId,
  ): Promise<readonly TransactionProvenance[]>;
}
