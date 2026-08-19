/**
 * `ImportedRecordCommitPort` over Prisma — the four rows a reviewed statement
 * line becomes, written on a transaction somebody else opened.
 *
 * ## Why a class named for a statement commit lives in the transactions module
 *
 * It writes `public.transactions`, `public.transaction_revisions`,
 * `public.transaction_provenance` and `public.transaction_category_assignments`,
 * and this module owns all four. It used to live in
 * `modules/statement-imports`, which was recorded there as boundary debt
 * rather than left to be discovered; this is the move that closes it, on the
 * same precedent as `PrismaFinancialRecordEraser` — that class also lives
 * here and satisfies a need another module declares, so that module never has
 * to reach into these tables.
 *
 * The name is the ingestion module's word for the operation, exactly as
 * `PrismaFinancialRecordEraser` uses the accounts module's word for a
 * transaction. Naming an adapter after the need it fills is clearer than
 * naming it after the table it touches.
 *
 * ## It does NOT open a transaction, and that is the entire point
 *
 * `TransactionRepository.commit` opens its own transaction per record. A
 * statement commit cannot be built out of those: the records, the staged
 * rows' links back to them, and the import's own state moves have to land as
 * ONE unit or a retry either writes everything twice or reports success over
 * records that do not exist. So the caller opens the unit, and this joins it.
 * A throw here aborts that unit, and there is no subset.
 *
 * The handle arrives opaque and is cast back HERE, by the layer that knows
 * what it is — the same discipline the outbox recorder uses, and the reason
 * the port can name a transaction without naming an ORM.
 *
 * ## The guarantees this leans on rather than reimplements
 *
 * The occurrence-ordinal rule and duplicate refusal are
 * `transactions_dedup_key` and `transactions_occurrence_guard` in migration
 * 0090. There is no pre-check here, unlike the single-record path: that one
 * checks first so its refusal can NAME the ordinal that would be accepted,
 * and a batch caller has already read the recorded occurrences to compute
 * every ordinal it is claiming. A second opinion inside the loop would be a
 * third definition of "is this a duplicate" — which is exactly what neither
 * module will have. The trigger is the guarantee; this file maps its refusals
 * to the module's own typed errors and adds nothing.
 */

import type { PrismaTransactionClient } from '@karar/platform/dist/db/principal-context.js';

import type {
  ImportedNarrativeColumns,
  ImportedRecordBatch,
  ImportedRecordCommitPort,
  RecordWriteUnit,
} from '../../application/ports/imported-record-commit.js';
import type { TransactionsPrincipal } from '../../application/ports/principal-context.js';
import { DuplicateTransactionError } from '../../application/ports/transaction-repository.js';
import { isUniqueViolation, rethrowTriggerRefusal } from './prisma-transaction-repository.js';
import { ownedBytes } from './row-mappers.js';

export class PrismaStatementCommitWriter implements ImportedRecordCommitPort {
  async writeImportedRecords(
    unit: RecordWriteUnit,
    principal: TransactionsPrincipal,
    batch: ImportedRecordBatch,
  ): Promise<void> {
    const tx = unit.unit as PrismaTransactionClient;

    for (const record of batch.records) {
      try {
        // The canonical transaction.
        await tx.transaction.create({
          data: {
            id: record.transactionId,
            tenantId: principal.tenantId,
            userId: principal.userId,
            accountId: record.accountRef.accountId,
            accountReferenceType: record.accountRef.referenceType,
            amountMinor: record.amountMinorUnits,
            currencyCode: record.currencyCode,
            // An imported line states one amount in one currency. A stated
            // original pair belongs to a source that reports both, and
            // inventing one from a single column would claim a conversion
            // nobody performed.
            originalAmountMinor: null,
            originalCurrencyCode: null,
            // `toUtcMidnight` is the one sanctioned transport for a `date`
            // column through a driver that models it as an instant (ADR-0027):
            // the day written is the day held, with no host timezone in the
            // path.
            bookingDate: record.bookingDate.toUtcMidnight(),
            valueDate: record.valueDate?.toUtcMidnight() ?? null,
            eventOccurredAt: record.eventOccurredAt,
            sourceTimezone: record.sourceTimezone,
            ...narrativeColumns(record.narrative),
            sourceKind: 'CSV',
            status: 'POSTED',
            dedupFingerprint: record.dedupFingerprint,
            fingerprintVersion: record.fingerprintVersion,
            occurrenceOrdinal: record.occurrenceOrdinal,
            createdAt: batch.committedAt,
            updatedAt: batch.committedAt,
            version: 1,
          },
        });

        // Revision 1 — the original, attributed to the import rather than to
        // a person, so a later correction stays distinguishable from what the
        // statement actually said.
        await tx.transactionRevision.create({
          data: {
            id: record.revisionId,
            transactionId: record.transactionId,
            tenantId: principal.tenantId,
            userId: principal.userId,
            revisionNumber: 1,
            attribution: 'SOURCE_IMPORT',
            actorRef: batch.actorRef,
            amountMinor: record.amountMinorUnits,
            currencyCode: record.currencyCode,
            bookingDate: record.bookingDate.toUtcMidnight(),
            valueDate: record.valueDate?.toUtcMidnight() ?? null,
            eventOccurredAt: record.eventOccurredAt,
            sourceTimezone: record.sourceTimezone,
            status: 'POSTED',
            ...narrativeColumns(record.revisionNarrative),
            changedFields: [],
            recordedAt: batch.committedAt,
            createdAt: batch.committedAt,
          },
        });

        // Provenance. This is what makes the record explainable back to a
        // statement line: the import, the row, and the four versions that
        // read it. A committed transaction with no provenance is the "just
        // there" record this platform does not permit.
        await tx.transactionProvenance.create({
          data: {
            id: record.provenanceId,
            transactionId: record.transactionId,
            tenantId: principal.tenantId,
            userId: principal.userId,
            revisionNumber: 1,
            sourceKind: 'CSV',
            importRef: batch.importRef,
            rowRef: record.rowRef,
            actorRef: batch.actorRef,
            accountId: record.accountRef.accountId,
            accountReferenceType: record.accountRef.referenceType,
            parserVersion: batch.versions.parserVersion,
            mappingVersion: batch.versions.mappingVersion,
            normalizationVersion: batch.versions.normalizationVersion,
            fingerprintVersion: batch.versions.fingerprintVersion,
            sourceDirection: record.sourceDirection,
            directionMapping: record.directionMapping,
            categoryAssignmentSource: record.categoryCode === null ? 'NONE' : 'RULE',
            createdAt: batch.committedAt,
          },
        });

        // The deterministic category, where an exact reviewed rule applied.
        // `null` writes nothing at all, which is the honest record of "no rule
        // matched" — an ACTIVE assignment with no decision behind it would be
        // indistinguishable from one a person made.
        if (record.categoryCode !== null) {
          await tx.transactionCategoryAssignment.create({
            data: {
              id: record.categoryAssignmentId,
              transactionId: record.transactionId,
              tenantId: principal.tenantId,
              userId: principal.userId,
              categoryCode: record.categoryCode,
              assignmentSource: 'RULE',
              ruleVersion: record.categoryRuleVersion,
              assignedBy: batch.actorRef,
              assignedAt: batch.committedAt,
              status: 'ACTIVE',
              supersededById: null,
              supersededAt: null,
              createdAt: batch.committedAt,
            },
          });
        }
      } catch (error) {
        // Mapped per record, so the refusal names the ordinal and the
        // fingerprint version of the line that was actually refused rather
        // than of the batch. The caller's unit is already doomed either way;
        // what differs is what it can tell the person.
        if (isUniqueViolation(error)) {
          throw new DuplicateTransactionError(
            record.fingerprintVersion,
            'this occurrence of this content is already recorded for this principal on this account',
          );
        }
        rethrowTriggerRefusal(error, {
          attemptedOrdinal: record.occurrenceOrdinal,
          fingerprintVersion: record.fingerprintVersion,
        });
      }
    }
  }
}

/**
 * The narrative columns as the driver wants them: `Uint8Array`s over their own
 * `ArrayBuffer`, plus the three note columns an import may not write.
 *
 * The driver's insistence on owned bytes is right rather than pedantic. A view
 * over a shared or pooled buffer is ciphertext that something else can still
 * write to after it has been handed over, and the window between "handed over"
 * and "flushed to the wire" is exactly where that would corrupt a financial
 * record.
 */
function narrativeColumns(narrative: ImportedNarrativeColumns) {
  return {
    hsfAlgorithm: narrative.hsfAlgorithm,
    hsfKeyVersion: narrative.hsfKeyVersion,
    descriptionCiphertext: ownedBytes(narrative.descriptionCiphertext),
    descriptionNonce: ownedBytes(narrative.descriptionNonce),
    descriptionAuthTag: ownedBytes(narrative.descriptionAuthTag),
    merchantCiphertext: ownedBytes(narrative.merchantCiphertext),
    merchantNonce: ownedBytes(narrative.merchantNonce),
    merchantAuthTag: ownedBytes(narrative.merchantAuthTag),
    // A note is a thing a person writes on a transaction. The port has no
    // field for one, so this is the only value they can take.
    noteCiphertext: null,
    noteNonce: null,
    noteAuthTag: null,
  };
}
