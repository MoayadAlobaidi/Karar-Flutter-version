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
 *  3. the canonical transactions;
 *  4. their revision 1;
 *  5. their provenance, naming this import and this row;
 *  6. the deterministic category assignments, where an exact rule applied;
 *  7. the staged rows' write-once links back to what they produced;
 *  8. the source freshness observation on the account-source link;
 *  9. the identifier-only outbox notice;
 * 10. the import's `COMMITTED` state.
 *
 * Steps 2 and 10 are TWO writes, not one, because the lifecycle has no
 * `REVIEW_REQUIRED -> COMMITTED` edge — the database refuses it with
 * SQLSTATE `KAR51`. Both are inside the one transaction, so `COMMITTING` is a
 * state the write passes through rather than one anybody can observe
 * half-finished.
 *
 * A throw at any point rolls all of it back. **There is no subset.**
 *
 * ## Idempotency is decided inside the transaction, not before it
 *
 * Step 1 re-reads the import under the transaction's own snapshot. Checking
 * beforehand would leave a window: two callers could both read
 * `REVIEW_REQUIRED`, both proceed, and the second would be refused by the
 * unique dedup index with a confusing error rather than answered with the
 * first one's result. Inside, the second caller either sees `COMMITTED` and
 * returns the same answer, or loses the optimistic-concurrency update at step
 * 9 and rolls back having written nothing.
 *
 * ## Why this file is in the wrong module, deliberately
 *
 * Steps 2 to 5 write rows `modules/transactions` owns. The natural home for
 * this implementation is there — exactly as `PrismaFinancialRecordEraser`
 * lives in that module and satisfies a port `modules/financial-accounts`
 * declares. It is here because `PrismaTransactionRepository.commit` opens its
 * OWN transaction, and a commit spanning two transactions is not atomic,
 * which is the one property this port exists to guarantee.
 *
 * **This is recorded debt, not a pattern.** MODULE.md names the move as work
 * the lead owns: this class should become `PrismaStatementCommitWriter` in
 * `modules/transactions`, satisfying the port declared here, and this file
 * should be deleted. Nothing else in this module writes another module's
 * tables, and nothing else may start to.
 *
 * ## The guarantees this file leans on rather than reimplements
 *
 * The occurrence-ordinal rule and duplicate refusal are `transactions_dedup_key`
 * and `transactions_occurrence_guard` (`KAR01`) in migration 0090 —
 * `modules/transactions` states that the trigger is the guarantee and its own
 * pre-check exists only for the message. This file maps both refusals to
 * typed outcomes and adds no third opinion, because a second implementation
 * of "is this a duplicate" is exactly what this module refuses to have.
 */

import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type { HsfFieldEncryptionPort } from '../../application/ports/hsf-field-encryption.js';
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
import {
  calendarDayToDate,
  ownedBytes,
  requiredCalendarDayToDate,
  statementImportUpdateData,
} from './row-mappers.js';
import { sqlStateOf } from './prisma-statement-import-repository.js';

/** Migration 0090's guards: duplicate content, and a non-next ordinal. */
const DUPLICATE_SQLSTATE = 'KAR02';
const ORDINAL_NOT_NEXT_SQLSTATE = 'KAR01';
const UNIQUE_VIOLATION = '23505';
const PRISMA_UNIQUE_VIOLATION = 'P2002';

export class PrismaStatementCommitWriter implements StatementCommitPort {
  constructor(
    private readonly handle: PrismaHandle,
    /** This module's HSF port, for the staged rows it owns. */
    private readonly encryption: HsfFieldEncryptionPort,
    /**
     * The transactions module's HSF port, for the canonical rows.
     *
     * A SECOND port rather than the same one, because the two modules bind
     * different domain-separation labels: a ciphertext written for
     * `statement_import_rows` must not authenticate against
     * `public.transactions`, or a staged row's narrative could be transplanted
     * onto a committed record.
     */
    private readonly canonicalEncryption: CanonicalNarrativeEncryptorPort,
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
    void this.encryption;

    try {
      return await withPrincipalContext(
        this.handle,
        { tenantId: actor.tenantId, userId: actor.userId },
        async (tx) => this.write(tx, actor, plan, narratives),
        { require: ['tenantId', 'userId'] },
      );
    } catch (error) {
      const state = sqlStateOf(error);
      if (
        state === UNIQUE_VIOLATION ||
        state === DUPLICATE_SQLSTATE ||
        (error as { code?: unknown }).code === PRISMA_UNIQUE_VIOLATION
      ) {
        throw new StatementCommitConflictError(
          'duplicate_transaction',
          'one of these lines is already recorded for this principal on this account at the ' +
            'occurrence it claims. Nothing was written',
        );
      }
      if (state === ORDINAL_NOT_NEXT_SQLSTATE) {
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
    narratives: readonly {
      readonly row: StatementCommitPlan['rows'][number];
      readonly canonical: EncryptedNarrativeColumns;
      readonly revision: EncryptedNarrativeColumns;
    }[],
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

    for (const { row, canonical, revision } of narratives) {
      // STEP 3 — the canonical transaction.
      await tx.transaction.create({
        data: {
          id: row.transactionId,
          tenantId: actor.tenantId,
          userId: actor.userId,
          accountId: row.accountRef.accountId,
          accountReferenceType: row.accountRef.referenceType,
          amountMinor: row.amountMinorUnits,
          currencyCode: row.currencyCode,
          originalAmountMinor: null,
          originalCurrencyCode: null,
          bookingDate: requiredCalendarDayToDate(row.bookingDate),
          valueDate: calendarDayToDate(row.valueDate),
          eventOccurredAt: row.eventOccurredAt,
          sourceTimezone: row.sourceTimezone,
          ...narrativeColumns(canonical),
          sourceKind: 'CSV',
          status: 'POSTED',
          dedupFingerprint: row.dedupFingerprint,
          fingerprintVersion: row.fingerprintVersion,
          occurrenceOrdinal: row.occurrenceOrdinal,
          createdAt: plan.committedAt,
          updatedAt: plan.committedAt,
          version: 1,
        },
      });

      // STEP 4 — revision 1. The original, attributed to the import.
      await tx.transactionRevision.create({
        data: {
          id: row.revisionId,
          transactionId: row.transactionId,
          tenantId: actor.tenantId,
          userId: actor.userId,
          revisionNumber: 1,
          attribution: 'SOURCE_IMPORT',
          actorRef: plan.actorId,
          amountMinor: row.amountMinorUnits,
          currencyCode: row.currencyCode,
          bookingDate: requiredCalendarDayToDate(row.bookingDate),
          valueDate: calendarDayToDate(row.valueDate),
          eventOccurredAt: row.eventOccurredAt,
          sourceTimezone: row.sourceTimezone,
          status: 'POSTED',
          ...narrativeColumns(revision),
          changedFields: [],
          recordedAt: plan.committedAt,
          createdAt: plan.committedAt,
        },
      });

      // STEP 5 — provenance. This is what makes the record explainable back to
      // a statement line: the import, the row, and the four versions that read
      // it. A committed transaction with no provenance is the "just there"
      // record this platform does not permit.
      await tx.transactionProvenance.create({
        data: {
          id: row.provenanceId,
          transactionId: row.transactionId,
          tenantId: actor.tenantId,
          userId: actor.userId,
          revisionNumber: 1,
          sourceKind: 'CSV',
          importRef: importId,
          rowRef: String(row.rowNumber),
          actorRef: plan.actorId,
          accountId: row.accountRef.accountId,
          accountReferenceType: row.accountRef.referenceType,
          parserVersion: plan.versions.parserVersion,
          mappingVersion: plan.versions.mappingVersion,
          normalizationVersion: plan.versions.normalizationVersion,
          fingerprintVersion: plan.versions.fingerprintVersion,
          sourceDirection: row.sourceDirection,
          directionMapping: row.directionMapping,
          categoryAssignmentSource: row.categoryCode === null ? 'NONE' : 'RULE',
          createdAt: plan.committedAt,
        },
      });

      // STEP 6 — the deterministic category, where an exact reviewed rule
      // applied. `null` is the ordinary answer and writes nothing: an absent
      // assignment is honest, and a guessed one applied four hundred times in
      // one action is not.
      if (row.categoryCode !== null) {
        await tx.transactionCategoryAssignment.create({
          data: {
            id: row.categoryAssignmentId,
            transactionId: row.transactionId,
            tenantId: actor.tenantId,
            userId: actor.userId,
            categoryCode: row.categoryCode,
            assignmentSource: 'RULE',
            ruleVersion: row.categoryRuleVersion,
            assignedBy: plan.actorId,
            assignedAt: plan.committedAt,
            status: 'ACTIVE',
            supersededById: null,
            supersededAt: null,
            createdAt: plan.committedAt,
          },
        });
      }

      // STEP 7 — the write-once link. This is what makes a retry idempotent,
      // and migration 0101 (KAR56) makes it unforgeable.
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

    // STEP 8 — source freshness. Best-effort by design: the link belongs to
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

    // STEP 9 — the identifier-only notice, on THIS transaction. An event for a
    // change that did not commit, or a commit whose event was lost, are the
    // two failures the transactional outbox exists to make impossible
    // (ADR-0012).
    await this.outbox.record({ unit: tx }, actor, plan.notice);

    // STEP 10 — COMMITTING -> COMMITTED, at the version step 2 produced.
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
 * The narrative columns as the driver wants them: `Uint8Array`s over their
 * own `ArrayBuffer`.
 *
 * The driver's insistence is right rather than pedantic. A view over a shared
 * or pooled buffer is ciphertext that something else can still write to after
 * it has been handed over, and the window between "handed over" and "flushed
 * to the wire" is exactly where that would corrupt a financial record.
 */
function narrativeColumns(narrative: EncryptedNarrativeColumns) {
  return {
    hsfAlgorithm: narrative.hsfAlgorithm,
    hsfKeyVersion: narrative.hsfKeyVersion,
    descriptionCiphertext: ownedBytes(narrative.descriptionCiphertext),
    descriptionNonce: ownedBytes(narrative.descriptionNonce),
    descriptionAuthTag: ownedBytes(narrative.descriptionAuthTag),
    merchantCiphertext:
      narrative.merchantCiphertext === null ? null : ownedBytes(narrative.merchantCiphertext),
    merchantNonce: narrative.merchantNonce === null ? null : ownedBytes(narrative.merchantNonce),
    merchantAuthTag:
      narrative.merchantAuthTag === null ? null : ownedBytes(narrative.merchantAuthTag),
    noteCiphertext: null,
    noteNonce: null,
    noteAuthTag: null,
  };
}
