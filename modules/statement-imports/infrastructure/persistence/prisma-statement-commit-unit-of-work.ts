/**
 * `StatementCommitPort` over Prisma — the atomic unit of work.
 *
 * ## ONE transaction, and what is in it
 *
 * `withPrincipalContext` opens a single interactive transaction and binds the
 * principal GUCs as its first statement. Inside it, in this order:
 *
 *  1. the import is re-read, and an already-`COMMITTED` one short-circuits;
 *  2. the import moves to `COMMITTING`, under optimistic concurrency;
 *  3. the canonical records — transaction, revision 1, provenance and the
 *     deterministic category assignment — written by `@karar/transactions`
 *     ON THIS TRANSACTION (see below);
 *  4. the staged rows' write-once links back to what they produced;
 *  5. the source freshness observation on the account-source link;
 *  6. the identifier-only outbox notice;
 *  7. the import's `COMMITTED` state.
 *
 * Steps 2 and 7 are TWO writes, not one, because the lifecycle has no
 * `REVIEW_REQUIRED -> COMMITTED` edge — the database refuses it with SQLSTATE
 * `KAR51`. Both are inside the one transaction, so `COMMITTING` is a state the
 * write passes through rather than one anybody can observe half-finished.
 *
 * A throw at any point rolls all of it back. **There is no subset.**
 *
 * ## Why the canonical rows are written by another module, on this transaction
 *
 * `public.transactions`, `public.transaction_revisions`,
 * `public.transaction_provenance` and `public.transaction_category_assignments`
 * belong to `modules/transactions`. This module used to write them itself,
 * which was recorded as boundary debt; `PrismaStatementCommitWriter` now lives
 * in that module and satisfies `ImportedRecordCommitPort`, which THAT module
 * declares, and this file hands it the open transaction through the same
 * opaque handle the outbox recorder receives.
 *
 * The handle is what makes the move possible at all. The reason the debt
 * existed was that `PrismaTransactionRepository.commit` opens its OWN
 * transaction per record, and a commit spanning two transactions is not
 * atomic — which is the one property this port exists to guarantee. A port
 * that JOINS a caller's transaction has no such problem, and the module that
 * owns the tables is the one allowed to open or join a transaction over them.
 *
 * **Nothing in this module writes a table `modules/transactions` owns, and
 * nothing may start to.** `__tests__/module-boundary.test.ts` scans this
 * module's own source for exactly that and fails on it.
 *
 * ## Idempotency is decided inside the transaction, not before it
 *
 * Step 1 re-reads the import under the transaction's own snapshot. Checking
 * beforehand would leave a window: two callers could both read
 * `REVIEW_REQUIRED`, both proceed, and the second would be refused by the
 * unique dedup index with a confusing error rather than answered with the
 * first one's result. Inside, the second caller either sees `COMMITTED` and
 * returns the same answer, or loses the optimistic-concurrency update at step
 * 2 and rolls back having written nothing.
 *
 * ## The refusals it maps, and the ones it does not invent
 *
 * The occurrence-ordinal rule and duplicate refusal are
 * `transactions_dedup_key` and `transactions_occurrence_guard` in migration
 * 0090. They reach this file as `@karar/transactions`' own typed errors —
 * never as a SQLSTATE and never as driver text — and are mapped to the two
 * `StatementCommitConflictError` kinds a person can act on. This module adds
 * no third opinion about what a duplicate is, because a second definition of
 * "the same transaction" is exactly what it refuses to have.
 *
 * `UnitOfWork` is not one of the adapter-name suffixes architecture test 5
 * recognises. It says exactly what this class is, so it keeps the clearer
 * name and states its port explicitly instead.
 */

import {
  AccountRef,
  ActorRef,
  CategoryCode,
  DuplicateTransactionError,
  ImportRef,
  OccurrenceOrdinalNotNextError,
  RowRef,
  TransactionId,
  type ImportedRecordBatch,
  type ImportedRecordCommitPort,
  type TransactionsPrincipal,
} from '@karar/transactions';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type { ImportsPrincipal } from '../../application/principal.js';
import {
  StatementCommitConflictError,
  type StatementCommitPlan,
  type StatementCommitPort,
  type StatementCommitReceipt,
} from '../../application/ports/statement-commit.js';
import { StatementImportVersionConflictError } from '../../application/ports/statement-import-repository.js';
import type { StatementImportOutboxPort } from '../../application/ports/statement-import-outbox.js';
import type {
  CanonicalNarrativeEncryptorPort,
  EncryptedNarrativeColumns,
} from '../../application/ports/canonical-narrative-encryptor.js';
import { requiredCalendarDayToDate, statementImportUpdateData } from './row-mappers.js';

/** One prepared row beside the two ciphertexts its narrative became. */
interface EncryptedRow {
  readonly row: StatementCommitPlan['rows'][number];
  readonly canonical: EncryptedNarrativeColumns;
  readonly revision: EncryptedNarrativeColumns;
}

export class PrismaStatementCommitUnitOfWork implements StatementCommitPort {
  constructor(
    private readonly handle: PrismaHandle,
    /**
     * The TRANSACTIONS module's HSF seam, for the canonical rows.
     *
     * Not this module's own encryptor, because the two bind different
     * domain-separation labels: a ciphertext written for
     * `statement_import_rows` must not authenticate against
     * `public.transactions`, or a staged row's narrative could be transplanted
     * onto a committed record.
     */
    private readonly canonicalEncryption: CanonicalNarrativeEncryptorPort,
    /** The transactions module's writer, joining the transaction opened here. */
    private readonly records: ImportedRecordCommitPort,
    private readonly outbox: StatementImportOutboxPort,
  ) {}

  async commit(
    actor: ImportsPrincipal,
    plan: StatementCommitPlan,
  ): Promise<StatementCommitReceipt> {
    // Encryption runs OUTSIDE the transaction: it may call a key provider, and
    // holding the widest transaction in the module open across a network call
    // to a KMS is how a connection pool starves under load.
    const narratives = await Promise.all(
      plan.rows.map(async (row) => ({
        row,
        canonical: await this.canonicalEncryption.encrypt(actor, row.transactionId, {
          description: row.description.reveal(),
          merchant: row.merchant?.reveal() ?? null,
        }),
        revision: await this.canonicalEncryption.encrypt(actor, row.revisionId, {
          description: row.description.reveal(),
          merchant: row.merchant?.reveal() ?? null,
        }),
      })),
    );
    // Built here too, for the same reason: every identifier is validated
    // before the transaction opens, so a malformed one is a refusal rather
    // than a rollback.
    const batch = importedRecordBatch(plan, narratives);

    try {
      return await withPrincipalContext(
        this.handle,
        { tenantId: actor.tenantId, userId: actor.userId },
        async (tx) => this.write(tx, actor, plan, batch),
        { require: ['tenantId', 'userId'] },
      );
    } catch (error) {
      // The two rules the database enforces on the canonical rows, arriving as
      // the transactions module's own typed errors. The wording is this
      // module's own and carries no driver text: what a person needs to know
      // is which line was refused and that nothing was written.
      if (error instanceof DuplicateTransactionError) {
        throw new StatementCommitConflictError(
          'duplicate_transaction',
          'one of these lines is already recorded for this principal on this account at the ' +
            'occurrence it claims. Nothing was written',
        );
      }
      if (error instanceof OccurrenceOrdinalNotNextError) {
        throw new StatementCommitConflictError(
          'occurrence_not_next',
          'one of these lines claimed an occurrence that is not the next unused one for its ' +
            'content. Nothing was written',
        );
      }
      throw error;
    }
  }

  private async write(
    tx: PrismaTransactionClient,
    actor: ImportsPrincipal,
    plan: StatementCommitPlan,
    batch: ImportedRecordBatch,
  ): Promise<StatementCommitReceipt> {
    const importId = plan.committedImport.id;

    // STEP 1 — idempotency, decided under this transaction's own snapshot.
    const existing = await tx.statementImport.findFirst({
      where: { id: importId, tenantId: actor.tenantId, userId: actor.userId },
      select: { state: true, committedTransactionCount: true },
    });
    if (existing === null) {
      throw new StatementImportVersionConflictError(
        plan.expectedVersion,
        'the statement import is no longer visible',
      );
    }
    if (existing.state === 'COMMITTED') {
      const rows = await tx.statementImportRow.findMany({
        where: { importId, tenantId: actor.tenantId, userId: actor.userId },
        select: { committedTransactionId: true },
      });
      return {
        committedTransactionCount: existing.committedTransactionCount,
        alreadyCommitted: true,
        transactionIds: rows
          .map((row) => row.committedTransactionId)
          .filter((id): id is string => id !== null),
      };
    }

    // STEP 2 — REVIEW_REQUIRED -> COMMITTING. A concurrent caller that reached
    // here loses this update and rolls back having written nothing.
    const started = await tx.statementImport.updateMany({
      where: {
        id: importId,
        tenantId: actor.tenantId,
        userId: actor.userId,
        version: plan.expectedVersion,
      },
      data: statementImportUpdateData(plan.committingImport),
    });
    if (started.count === 0) {
      throw new StatementImportVersionConflictError(
        plan.expectedVersion,
        'the statement import moved before the commit could start',
      );
    }

    // STEP 3 — the canonical records, written by the module that owns those
    // four tables, on THIS transaction. A refusal there aborts this unit, so
    // the import's state moves and the row links below cannot survive it.
    await this.records.writeImportedRecords({ unit: tx }, transactionsPrincipal(actor), batch);

    // STEP 4 — the write-once links. This is what makes a retry idempotent,
    // and migration 0101 (KAR56) makes it unforgeable.
    for (const row of plan.rows) {
      await tx.statementImportRow.updateMany({
        where: { id: row.rowId, tenantId: actor.tenantId, userId: actor.userId },
        data: {
          rowState: 'COMMITTED',
          committedTransactionId: row.transactionId,
          committedAt: plan.committedAt,
          updatedAt: plan.committedAt,
        },
      });
    }

    // STEP 5 — source freshness. Best-effort by design: the link belongs to
    // `modules/financial-connections` and may not exist, and an import must
    // not fail because the route it arrived through was deleted. `updateMany`
    // over zero rows is the correct no-op.
    if (plan.freshness !== null) {
      await tx.accountSourceLink.updateMany({
        where: {
          tenantId: actor.tenantId,
          userId: actor.userId,
          connectionId: plan.freshness.connectionId,
          accountId: plan.committedImport.accountRef.accountId,
        },
        data: {
          lastObservedAt: plan.freshness.observedAt,
          lastSuccessfulImportAt: plan.freshness.observedAt,
          historyCoverageStart: requiredCalendarDayToDate(plan.freshness.coverageStart),
          historyCoverageEnd: requiredCalendarDayToDate(plan.freshness.coverageEnd),
        },
      });
    }

    // STEP 6 — the identifier-only notice, on THIS transaction. An event for a
    // change that did not commit, or a commit whose event was lost, are the
    // two failures the transactional outbox exists to make impossible
    // (ADR-0012).
    await this.outbox.record({ unit: tx }, actor, plan.notice);

    // STEP 7 — COMMITTING -> COMMITTED, at the version step 2 produced.
    const moved = await tx.statementImport.updateMany({
      where: {
        id: importId,
        tenantId: actor.tenantId,
        userId: actor.userId,
        version: plan.committingImport.version,
      },
      data: statementImportUpdateData(plan.committedImport),
    });
    if (moved.count === 0) {
      throw new StatementImportVersionConflictError(
        plan.expectedVersion,
        'the statement import moved while the commit was running',
      );
    }

    return {
      committedTransactionCount: plan.rows.length,
      alreadyCommitted: false,
      transactionIds: plan.rows.map((row) => row.transactionId),
    };
  }
}

/**
 * The acting subject in the transactions module's own vocabulary.
 *
 * Restated field by field rather than cast, for the reason the narrative and
 * account adapters give: a cast would keep compiling if either principal shape
 * gained a field, and the field it silently dropped would be one that scopes a
 * person's financial records.
 */
function transactionsPrincipal(actor: ImportsPrincipal): TransactionsPrincipal {
  return {
    tenantId: actor.tenantId,
    userId: actor.userId,
    ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
    ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
  };
}

/**
 * The prepared rows as the batch the transactions module accepts.
 *
 * Every identifier crosses as that module's own branded reference rather than
 * as a bare string, so a row id passed where a transaction id belongs — or a
 * category code that is not one — is refused here, before the transaction
 * opens, instead of becoming a row nobody can explain.
 */
function importedRecordBatch(
  plan: StatementCommitPlan,
  narratives: readonly EncryptedRow[],
): ImportedRecordBatch {
  return {
    records: narratives.map(({ row, canonical, revision }) => ({
      transactionId: TransactionId.of(row.transactionId),
      revisionId: row.revisionId,
      provenanceId: row.provenanceId,
      categoryAssignmentId: row.categoryAssignmentId,
      accountRef: AccountRef.of(row.accountRef.accountId, row.accountRef.referenceType),
      bookingDate: row.bookingDate,
      valueDate: row.valueDate,
      eventOccurredAt: row.eventOccurredAt,
      sourceTimezone: row.sourceTimezone,
      amountMinorUnits: row.amountMinorUnits,
      currencyCode: row.currencyCode,
      narrative: canonical,
      revisionNarrative: revision,
      sourceDirection: row.sourceDirection,
      directionMapping: row.directionMapping,
      dedupFingerprint: row.dedupFingerprint,
      fingerprintVersion: row.fingerprintVersion,
      occurrenceOrdinal: row.occurrenceOrdinal,
      // The line number within the DATA rows, which is what makes "explain
      // this number" answerable back to one line of one uploaded file.
      rowRef: RowRef.of(String(row.rowNumber)),
      categoryCode: row.categoryCode === null ? null : CategoryCode.of(row.categoryCode),
      categoryRuleVersion: row.categoryRuleVersion,
    })),
    importRef: ImportRef.of(plan.committedImport.id),
    actorRef: ActorRef.of(plan.actorId),
    versions: plan.versions,
    committedAt: plan.committedAt,
  };
}
