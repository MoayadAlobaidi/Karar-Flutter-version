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
 *  5. the source freshness observation on the account-source links, written
 *     by `@karar/financial-connections` ON THIS TRANSACTION (see below);
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
 * ## Why other modules' rows are written by those modules, on this transaction
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
 * **Step 5 is the same story on a second table, and it was the last one.**
 * `public.account_source_links` belongs to `modules/financial-connections`,
 * and this file used to `updateMany` it directly — recorded honestly as the
 * one remaining cross-module write, which is what made it fixable.
 * `PrismaSourceObservationWriter` now lives in that module and satisfies
 * `SourceObservationWriterPort`, which THAT module declares, and it receives
 * the same opaque handle. This file says a delivery landed; what that means
 * in columns — which rows, which token, which of the table's own CHECKs
 * decide whether a row may move at all — is decided over there.
 *
 * **The observation stays inside this transaction rather than becoming an
 * event, and the direction of the risk is why.** A stale
 * `last_successful_import_at` after a commit is a report that lags; a fresh
 * one after a rollback is a claim that a person's statement was imported when
 * it was not. Only the second is a lie, and putting the write in the
 * transaction whose success it describes is what makes it unwritable. It
 * costs one statement against an indexed predicate — no key provider, no
 * policy pack, no service call — so it breaks none of the rules the rest of
 * this file keeps about what may happen while this transaction is open.
 *
 * **Nothing in this module writes a table another module owns, and nothing
 * may start to.** `__tests__/module-boundary.test.ts` scans this module's own
 * source for exactly that and fails on it.
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
  CanonicalAccountRef as SourceLinkAccountRef,
  FinancialConnectionId,
  PrismaSourceObservationWriter,
  type ConnectionsPrincipal,
  type ObservedSourceDelivery,
  type SourceObservationWriterPort,
} from '@karar/financial-connections';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import { ingestionLimitPolicyFor } from '@karar/platform/dist/ingestion/limits.js';
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
import { statementImportUpdateData } from './row-mappers.js';

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
    /**
     * The connections module's writer for step 5, joining the same
     * transaction.
     *
     * It has a default, and the default is the REAL writer from the module
     * that owns `public.account_source_links` — never a no-op. A do-nothing
     * default would let a composition root drop a person's source freshness
     * by omission, which is the failure mode `DeleteOwnAccount` refuses by
     * making its three erasers required; here the same protection comes from
     * the default being the only honest implementation there is. A
     * composition root should still bind it explicitly, so that what a
     * deployment writes is visible where everything else it writes is listed.
     */
    private readonly sourceObservations: SourceObservationWriterPort =
      new PrismaSourceObservationWriter(),
  ) {}

  async commit(
    actor: ImportsPrincipal,
    plan: StatementCommitPlan,
  ): Promise<StatementCommitReceipt> {
    // Encryption runs OUTSIDE the transaction: it may call a key provider, and
    // holding the widest transaction in the module open across a network call
    // to a KMS is how a connection pool starves under load.
    //
    // BOUNDED FAN-OUT, in batches of the CENTRAL `maxBatchSize`. This was one
    // unbounded `Promise.all` over `plan.rows`, which is two encryptions per
    // row with no ceiling: a statement may carry `maxRows` = 50,000, so one
    // HTTP request could put 100,000 simultaneous key-provider calls in
    // flight. The READ path in prisma-statement-import-repository.ts already
    // refuses to do that, in as many words -- "a key-management provider is
    // rate-limited everywhere but local, and a statement can be thousands of
    // rows" -- and went fully sequential. This path did the opposite, and
    // LocalAesGcmFieldEncryptionProvider being in-process is why nothing local
    // ever showed it.
    //
    // Batching rather than going sequential keeps the throughput the batch
    // gives while making the ceiling a declared number instead of the row
    // count. `maxBatchSize` was declared, validated as required, and cited as
    // the rationale for the `financial_commit` rate-limit budget while being
    // read by NO production code; this is the first thing that reads it.
    const batchSize = ingestionLimitPolicyFor('csv-statement-import').maxBatchSize;
    type EncryptedNarrative = Awaited<ReturnType<CanonicalNarrativeEncryptorPort['encrypt']>>;
    const narratives: Array<{
      row: (typeof plan.rows)[number];
      canonical: EncryptedNarrative;
      revision: EncryptedNarrative;
    }> = [];
    for (let offset = 0; offset < plan.rows.length; offset += batchSize) {
      const batch = plan.rows.slice(offset, offset + batchSize);
      narratives.push(
        ...(await Promise.all(
          batch.map(async (row) => ({
            row,
            // The TABLE is named at each call, because the transactions
            // module's readers bind it: `toTransaction` opens the canonical
            // row under `transactions` and `toRevision` opens the revision
            // row under `transaction_revisions`. Both calls used to pass a
            // row id alone and the adapter sealed both under `transactions`,
            // which left every imported revision narrative unopenable.
            canonical: await this.canonicalEncryption.encrypt(
              actor,
              { table: 'transactions', rowId: row.transactionId },
              {
                description: row.description.reveal(),
                merchant: row.merchant?.reveal() ?? null,
              },
            ),
            revision: await this.canonicalEncryption.encrypt(
              actor,
              { table: 'transaction_revisions', rowId: row.revisionId },
              {
                description: row.description.reveal(),
                merchant: row.merchant?.reveal() ?? null,
              },
            ),
          })),
        )),
      );
    }
    // Built here too, for the same reason: every identifier is validated
    // before the transaction opens, so a malformed one is a refusal rather
    // than a rollback.
    const batch = importedRecordBatch(plan, narratives);
    const delivery = observedDelivery(plan);

    try {
      return await withPrincipalContext(
        this.handle,
        { tenantId: actor.tenantId, userId: actor.userId },
        async (tx) => this.write(tx, actor, plan, batch, delivery),
        {
          require: ['tenantId', 'userId'],
          // A COMMIT writes four rows plus an update per record inside one
          // transaction, so it needs the bound this path is already declared
          // to obey rather than Prisma's 5,000 ms default. Under that default
          // a commit expired at roughly 700 rows against a declared ceiling of
          // 50,000, and the caller was answered a RETRYABLE 503 for a
          // condition no retry could resolve. The rollback was clean — nothing
          // partial was ever written — which is why it read as an outage
          // rather than as a limit.
          timeoutMs: ingestionLimitPolicyFor('csv-statement-import').deadlineMs,
        },
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
    delivery: ObservedSourceDelivery | null,
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

    // STEP 5 — source freshness, written by the module that owns
    // `public.account_source_links`, on THIS transaction. Best-effort by
    // design: the link may not exist, and an import must not fail because the
    // route it arrived through was deleted. The count is deliberately ignored
    // — zero is the ordinary answer for a person who imported a file without
    // ever linking its source, and there is nothing for this module to decide
    // about a number describing another module's rows.
    if (delivery !== null) {
      await this.sourceObservations.recordDeliveryObserved(
        { unit: tx },
        connectionsPrincipal(actor),
        delivery,
      );
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
 * The acting subject in the connections module's own vocabulary.
 *
 * Restated field by field for the same reason `transactionsPrincipal` is: a
 * cast would keep compiling if either principal shape gained a field, and in
 * that module the principal is also what the source-account fingerprint key is
 * derived from — getting it wrong there is not a scoping mistake but a
 * cross-subject one.
 */
function connectionsPrincipal(actor: ImportsPrincipal): ConnectionsPrincipal {
  return {
    tenantId: actor.tenantId,
    userId: actor.userId,
    ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
    ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
  };
}

/**
 * The freshness observation as the delivery the connections module accepts,
 * or `null` when this import has nothing to report.
 *
 * Built BEFORE the transaction opens, like the record batch: the connection
 * and the account cross as that module's own branded references rather than
 * as bare strings, so a malformed identifier is a refusal instead of a
 * rollback three writes into somebody's commit.
 *
 * The coverage days cross as `CalendarDay` and are never turned into an
 * instant here. Which midnight in which timezone a `date` column is written
 * through is a decision belonging to the module that owns the column
 * (ADR-0027), and this module no longer takes it.
 */
function observedDelivery(plan: StatementCommitPlan): ObservedSourceDelivery | null {
  if (plan.freshness === null) return null;
  return {
    connectionId: FinancialConnectionId.of(plan.freshness.connectionId),
    accountRef: SourceLinkAccountRef.of(
      plan.committedImport.accountRef.accountId,
      plan.committedImport.accountRef.referenceType,
    ),
    observedAt: plan.freshness.observedAt,
    historyCoverage: {
      start: plan.freshness.coverageStart,
      end: plan.freshness.coverageEnd,
    },
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
