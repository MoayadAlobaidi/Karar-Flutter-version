/**
 * `TransactionRepository` over Prisma.
 *
 * Every statement runs inside the platform's `withPrincipalContext`
 * transaction (packages/platform/src/db/principal-context.ts), which binds
 * `app.tenant_id` and `app.user_id` transaction-locally as its first
 * statement. The RLS policies on all three tables require BOTH, so a call
 * without context reads nothing and writes nothing — the policy fails closed
 * rather than the code remembering to filter. The explicit `where` clauses
 * below are defence in depth that catches honest mistakes early; RLS is the
 * boundary.
 *
 * `commit` and `correct` write the transaction, its revision, and its
 * provenance in ONE database transaction. That is the aggregate's atomicity
 * guarantee living where it can actually be enforced: a partial write would
 * leave a financial fact with no origin, which is the one state this module
 * exists to make impossible.
 *
 * Prisma types stay in this file (architecture test 4): the repository hands
 * structural row shapes to `row-mappers.ts` and returns domain values.
 */

import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';

import type { TransactionId } from '../../domain/refs.js';
import type { TransactionProvenance } from '../../domain/provenance.js';
import type { TransactionRevision } from '../../domain/revision.js';
import type { Transaction } from '../../domain/transaction.js';
import type { HsfFieldEncryptionPort } from '../../application/ports/hsf-field-encryption.js';
import type { TransactionsPrincipal } from '../../application/ports/principal-context.js';
import {
  DuplicateTransactionError,
  OccurrenceOrdinalNotNextError,
  TransactionVersionConflictError,
  type TransactionCommit,
  type TransactionCorrectionCommit,
  type TransactionPage,
  type TransactionPageQuery,
  type TransactionRepository,
} from '../../application/ports/transaction-repository.js';
import {
  encryptNarrative,
  toProvenance,
  toRevision,
  toTransaction,
  type ProvenanceRow,
  type RevisionRow,
  type TransactionRow,
} from './row-mappers.js';

/** PostgreSQL unique-violation, as Prisma reports it. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === PRISMA_UNIQUE_VIOLATION
  );
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(
    private readonly handle: PrismaHandle,
    private readonly encryption: HsfFieldEncryptionPort,
  ) {}

  private run<T>(
    principal: TransactionsPrincipal,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      { tenantId: principal.tenantId, userId: principal.userId },
      fn,
    );
  }

  async commit(principal: TransactionsPrincipal, commit: TransactionCommit): Promise<void> {
    const { transaction, revision, provenance, fingerprint } = commit;
    // Encryption happens OUTSIDE the database transaction: it may call a key
    // provider, and holding a database transaction open across a network call
    // to a KMS is how a connection pool starves under load.
    const narrative = await encryptNarrative(
      this.encryption,
      principal,
      'transactions',
      transaction.id,
      transaction,
    );
    const revisionNarrative = await encryptNarrative(
      this.encryption,
      principal,
      'transaction_revisions',
      revision.id,
      revision.values,
    );

    try {
      await this.run(principal, async (tx) => {
        // The next-ordinal rule, checked inside the writing transaction so
        // the refusal can name the ordinal that WOULD be accepted. The
        // migration's transactions_occurrence_guard enforces the same rule
        // for every writer including raw SQL; this check exists for the
        // message, that trigger exists for the guarantee, and the unique
        // constraint behind both is what settles a concurrent race (two
        // callers reading the same maximum both aim at the same ordinal, and
        // exactly one index entry can exist).
        const recorded = await tx.transaction.findMany({
          where: {
            tenantId: principal.tenantId,
            userId: principal.userId,
            accountId: transaction.accountRef.accountId,
            fingerprintVersion: fingerprint.version,
            dedupFingerprint: fingerprint.value,
          },
          select: { occurrenceOrdinal: true },
        });
        const ordinals = recorded.map((row) => row.occurrenceOrdinal);
        // "Already recorded" is checked before "not the next one", because
        // they are different messages to a person: resubmitting the same
        // occurrence is a duplicate, and being told to pick a different
        // number would invite exactly the bypass the rule exists to close.
        if (ordinals.includes(commit.occurrenceOrdinal)) {
          throw new DuplicateTransactionError(
            fingerprint.version,
            'this occurrence of this content is already recorded for this principal on this account',
          );
        }
        const nextOrdinal = Math.max(0, ...ordinals) + 1;
        if (commit.occurrenceOrdinal !== nextOrdinal) {
          throw new OccurrenceOrdinalNotNextError(
            commit.occurrenceOrdinal,
            nextOrdinal,
            'the occurrence ordinal must be the next unused one for this content identity',
          );
        }
        await tx.transaction.create({
          data: {
            id: transaction.id,
            tenantId: transaction.tenantId,
            userId: transaction.userId,
            accountId: transaction.accountRef.accountId,
            accountReferenceType: transaction.accountRef.referenceType,
            amountMinor: transaction.amount.minorUnits,
            currencyCode: transaction.amount.currency.code,
            originalAmountMinor: transaction.originalAmount?.amount.minorUnits ?? null,
            originalCurrencyCode: transaction.originalAmount?.currency.code ?? null,
            bookingDate: transaction.bookingDate,
            valueDate: transaction.valueDate,
            ...narrative,
            sourceKind: transaction.sourceKind,
            status: transaction.status,
            dedupFingerprint: fingerprint.value,
            fingerprintVersion: fingerprint.version,
            occurrenceOrdinal: commit.occurrenceOrdinal,
            createdAt: transaction.createdAt,
            updatedAt: transaction.createdAt,
            version: transaction.version,
          },
        });
        await tx.transactionRevision.create({
          data: revisionData(revision, revisionNarrative),
        });
        await tx.transactionProvenance.create({ data: provenanceData(provenance) });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateTransactionError(
          fingerprint.version,
          'this occurrence of this content is already recorded for this principal on this account',
        );
      }
      throw error;
    }
  }

  async findById(
    principal: TransactionsPrincipal,
    id: TransactionId,
  ): Promise<Transaction | null> {
    const row = await this.run(principal, (tx) =>
      tx.transaction.findFirst({
        where: { id, tenantId: principal.tenantId, userId: principal.userId },
      }),
    );
    return row === null ? null : toTransaction(this.encryption, principal, row as TransactionRow);
  }

  async page(
    principal: TransactionsPrincipal,
    query: TransactionPageQuery,
  ): Promise<TransactionPage> {
    // Keyset: strictly "older than the cursor" in the total order
    // (bookingDate DESC, id DESC). One extra row tells us whether another
    // page exists without a second count query.
    const after = query.after;
    const rows = await this.run(principal, (tx) =>
      tx.transaction.findMany({
        where: {
          tenantId: principal.tenantId,
          userId: principal.userId,
          ...(query.accountRef === null ? {} : { accountId: query.accountRef.accountId }),
          ...(after === null
            ? {}
            : {
                OR: [
                  { bookingDate: { lt: after.bookingDate } },
                  { bookingDate: after.bookingDate, id: { lt: after.id } },
                ],
              }),
        },
        orderBy: [{ bookingDate: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      }),
    );
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const transactions = await Promise.all(
      pageRows.map((row) => toTransaction(this.encryption, principal, row as TransactionRow)),
    );
    const last = transactions[transactions.length - 1];
    return {
      transactions,
      nextCursor:
        hasMore && last !== undefined ? { bookingDate: last.bookingDate, id: last.id } : null,
    };
  }

  async correct(
    principal: TransactionsPrincipal,
    commit: TransactionCorrectionCommit,
  ): Promise<void> {
    const { transaction, revision, provenance, expectedVersion } = commit;
    const narrative = await encryptNarrative(
      this.encryption,
      principal,
      'transactions',
      transaction.id,
      transaction,
    );
    const revisionNarrative = await encryptNarrative(
      this.encryption,
      principal,
      'transaction_revisions',
      revision.id,
      revision.values,
    );

    await this.run(principal, async (tx) => {
      // The version predicate IS the concurrency control: a compare-and-set
      // in the same statement, so two concurrent corrections cannot both
      // believe they moved version N to N+1.
      const updated = await tx.transaction.updateMany({
        where: {
          id: transaction.id,
          tenantId: principal.tenantId,
          userId: principal.userId,
          version: expectedVersion,
        },
        data: {
          amountMinor: transaction.amount.minorUnits,
          currencyCode: transaction.amount.currency.code,
          bookingDate: transaction.bookingDate,
          valueDate: transaction.valueDate,
          ...narrative,
          status: transaction.status,
          updatedAt: revision.recordedAt,
          version: transaction.version,
        },
      });
      if (updated.count === 0) {
        const current = await tx.transaction.findFirst({
          where: { id: transaction.id, tenantId: principal.tenantId, userId: principal.userId },
          select: { version: true },
        });
        throw new TransactionVersionConflictError(
          expectedVersion,
          current?.version ?? -1,
          'the transaction moved between the read and the write; nothing was changed',
        );
      }
      await tx.transactionRevision.create({
        data: revisionData(revision, revisionNarrative),
      });
      await tx.transactionProvenance.create({ data: provenanceData(provenance) });
    });
  }

  async delete(principal: TransactionsPrincipal, id: TransactionId): Promise<boolean> {
    // Revisions, provenance and category assignments go with it by
    // ON DELETE CASCADE (migrations 0091, 0093) — the declared CASCADE_DELETE
    // erasure enforced by the schema rather than by four statements here that
    // a future change could leave out of step.
    const removed = await this.run(principal, (tx) =>
      tx.transaction.deleteMany({
        where: { id, tenantId: principal.tenantId, userId: principal.userId },
      }),
    );
    return removed.count > 0;
  }

  async listRevisions(
    principal: TransactionsPrincipal,
    id: TransactionId,
  ): Promise<readonly TransactionRevision[]> {
    const rows = await this.run(principal, (tx) =>
      tx.transactionRevision.findMany({
        where: { transactionId: id, tenantId: principal.tenantId, userId: principal.userId },
        orderBy: [{ revisionNumber: 'asc' }],
      }),
    );
    return Promise.all(
      rows.map((row) => toRevision(this.encryption, principal, row as RevisionRow)),
    );
  }

  async listProvenance(
    principal: TransactionsPrincipal,
    id: TransactionId,
  ): Promise<readonly TransactionProvenance[]> {
    const rows = await this.run(principal, (tx) =>
      tx.transactionProvenance.findMany({
        where: { transactionId: id, tenantId: principal.tenantId, userId: principal.userId },
        orderBy: [{ revisionNumber: 'asc' }],
      }),
    );
    return rows.map((row) => toProvenance(row as ProvenanceRow));
  }
}

function revisionData(
  revision: TransactionRevision,
  narrative: Awaited<ReturnType<typeof encryptNarrative>>,
) {
  return {
    id: revision.id,
    transactionId: revision.transactionId,
    tenantId: revision.tenantId,
    userId: revision.userId,
    revisionNumber: revision.revisionNumber,
    attribution: revision.attribution,
    actorRef: revision.actorRef,
    amountMinor: revision.values.amount.minorUnits,
    currencyCode: revision.values.amount.currency.code,
    bookingDate: revision.values.bookingDate,
    valueDate: revision.values.valueDate,
    status: revision.values.status,
    ...narrative,
    changedFields: [...revision.changedFields],
    recordedAt: revision.recordedAt,
  };
}

function provenanceData(provenance: TransactionProvenance) {
  return {
    id: provenance.id,
    transactionId: provenance.transactionId,
    tenantId: provenance.tenantId,
    userId: provenance.userId,
    revisionNumber: provenance.revisionNumber,
    sourceKind: provenance.sourceKind,
    importRef: provenance.importRef,
    rowRef: provenance.rowRef,
    actorRef: provenance.actorRef,
    accountId: provenance.accountRef.accountId,
    accountReferenceType: provenance.accountRef.referenceType,
    parserVersion: provenance.versions.parserVersion,
    mappingVersion: provenance.versions.mappingVersion,
    normalizationVersion: provenance.versions.normalizationVersion,
    fingerprintVersion: provenance.versions.fingerprintVersion,
    sourceDirection: provenance.sourceDirection,
    directionMapping: provenance.directionMapping,
    categoryAssignmentSource: provenance.categoryAssignmentSource,
    createdAt: provenance.createdAt,
  };
}
