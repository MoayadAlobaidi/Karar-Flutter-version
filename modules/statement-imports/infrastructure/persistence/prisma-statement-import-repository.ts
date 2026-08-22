/**
 * `StatementImportRepository` over Prisma — every statement inside the
 * platform's `withPrincipalContext` transaction.
 *
 * RLS on all four tables requires BOTH principal GUCs, so a call without them
 * returns and affects nothing: the policies fail closed. The explicit `where`
 * clauses are Layer-2 convenience — **RLS is the boundary**, and removing
 * every filter here would change nothing about which rows a caller can reach.
 *
 * ## Three database refusals that must arrive as typed outcomes
 *
 * Each is read STRUCTURALLY out of the driver-adapter cause Prisma attaches,
 * never by matching message text: a message is prose that a later edit
 * rewrites, and a mapping that depends on it fails silently the day somebody
 * improves the wording.
 *
 * - **`KAR54`** — a source row for an import whose retention question is
 *   still open. This is the gate, and reaching it means the application-level
 *   check was bypassed. It surfaces as a store failure rather than being
 *   swallowed, because a caller that got here has a bug rather than a
 *   condition.
 * - **`KAR51`** — an illegal state transition. Same reasoning.
 * - **`KAR57`** — staged rows written for an import that is not `PARSING`.
 *
 * ## `stageParse` replaces, and does so in one transaction
 *
 * Clearing the previous rows and writing the new ones are one unit, so a
 * re-parse cannot leave a half-replaced set for a person to review. The delete
 * runs first and the import is moved to its post-parse state last, which is
 * what keeps the rows' `KAR57` guard satisfied throughout: rows are written
 * while the import is still `PARSING`.
 */

import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type { HsfFieldEncryptionPort } from '../../application/ports/hsf-field-encryption.js';
import type { ImportsPrincipal } from '../../application/principal.js';
import type { RowError } from '../../domain/reason-codes.js';
import { isRowErrorReasonCode, isSafeField } from '../../domain/reason-codes.js';
import type { StoredSourceDescriptor } from '../../domain/encrypted-source.js';
import type { StatementImport } from '../../domain/statement-import.js';
import type { StatementImportId } from '../../domain/refs.js';
import {
  StatementImportVersionConflictError,
  type ParseStaging,
  type StagedRow,
  type StatementImportRepository,
} from '../../application/ports/statement-import-repository.js';
import {
  StatementImportStoreError,
  calendarDayToDate,
  encryptRowNarrative,
  ownedBytes,
  statementImportUpdateData,
  toStagedRow,
  toStatementImport,
  toStoredSourceDescriptor,
  type EncryptedRowNarrative,
  type StagedRowRecord,
  type StatementImportRow,
} from './row-mappers.js';
import { ingestionLimitPolicyFor } from '@karar/platform/dist/ingestion/limits.js';

/**
 * The staged row's encrypted columns as the driver wants them: `Buffer`s,
 * which are `Uint8Array`s over their own `ArrayBuffer`. A view over a shared
 * or pooled buffer is ciphertext something else can still write to after it
 * has been handed over.
 */
function narrativeColumns(narrative: EncryptedRowNarrative) {
  const owned = (value: Uint8Array | null): Uint8Array<ArrayBuffer> | null =>
    value === null ? null : ownedBytes(value);
  return {
    hsfAlgorithm: narrative.hsfAlgorithm,
    hsfKeyVersion: narrative.hsfKeyVersion,
    descriptionCiphertext: owned(narrative.descriptionCiphertext),
    descriptionNonce: owned(narrative.descriptionNonce),
    descriptionAuthTag: owned(narrative.descriptionAuthTag),
    merchantCiphertext: owned(narrative.merchantCiphertext),
    merchantNonce: owned(narrative.merchantNonce),
    merchantAuthTag: owned(narrative.merchantAuthTag),
    sourceReferenceCiphertext: owned(narrative.sourceReferenceCiphertext),
    sourceReferenceNonce: owned(narrative.sourceReferenceNonce),
    sourceReferenceAuthTag: owned(narrative.sourceReferenceAuthTag),
    instrumentMaskCiphertext: owned(narrative.instrumentMaskCiphertext),
    instrumentMaskNonce: owned(narrative.instrumentMaskNonce),
    instrumentMaskAuthTag: owned(narrative.instrumentMaskAuthTag),
  };
}

/** SQLSTATEs this module's guards raise (migrations 0100, 0101). */
export const STATEMENT_IMPORT_SQLSTATES = Object.freeze({
  identityRewritten: 'KAR50',
  illegalTransition: 'KAR51',
  versionNotAdvanced: 'KAR52',
  retentionRewritten: 'KAR53',
  retentionUndecided: 'KAR54',
  sourceRewritten: 'KAR55',
  rowLinkRewritten: 'KAR56',
  rowsOutsideParsing: 'KAR57',
} as const);

/** The SQLSTATE a driver error carries, or null. Read structurally. */
export function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) return null;
  const adapterError = (meta as { driverAdapterError?: unknown }).driverAdapterError;
  if (typeof adapterError !== 'object' || adapterError === null) return null;
  const cause = (adapterError as { cause?: unknown }).cause;
  if (typeof cause !== 'object' || cause === null) return null;
  const code = (cause as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export class PrismaStatementImportRepository implements StatementImportRepository {
  constructor(
    private readonly handle: PrismaHandle,
    private readonly encryption: HsfFieldEncryptionPort,
  ) {}

  private inContext<T>(
    actor: ImportsPrincipal,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
    options: { readonly bulk?: boolean } = {},
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      {
        tenantId: actor.tenantId,
        userId: actor.userId,
        ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
        ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
      },
      fn,
      {
        require: ['tenantId', 'userId'],
        // A BULK write declares the bound it is already held to, so the number
        // in the limit policy is the number the database enforces. Without
        // this the transaction inherited Prisma's 5,000 ms default and staging
        // expired at roughly 3,000 rows against a declared ceiling of 50,000 —
        // answering a retryable 503 for a condition no retry could resolve.
        ...(options.bulk === true
          ? { timeoutMs: ingestionLimitPolicyFor('csv-statement-import').deadlineMs }
          : {}),
      },
    );
  }

  async create(actor: ImportsPrincipal, imported: StatementImport): Promise<void> {
    await this.inContext(actor, async (tx) => {
      await tx.statementImport.create({
        data: {
          ...statementImportUpdateData(imported),
          id: imported.id,
          tenantId: imported.tenantId,
          userId: imported.userId,
          accountId: imported.accountRef.accountId,
          accountReferenceType: imported.accountRef.referenceType,
          connectionId: imported.connectionRef?.connectionId ?? null,
          connectionReferenceType: imported.connectionRef?.referenceType ?? null,
          mediaType: imported.mediaType,
          createdAt: imported.createdAt,
        },
      });
    });
  }

  async findById(
    actor: ImportsPrincipal,
    id: StatementImportId,
  ): Promise<StatementImport | null> {
    const row = await this.inContext(actor, (tx) =>
      tx.statementImport.findFirst({
        where: { id, tenantId: actor.tenantId, userId: actor.userId },
      }),
    );
    return row === null ? null : toStatementImport(row as unknown as StatementImportRow);
  }

  async update(
    actor: ImportsPrincipal,
    imported: StatementImport,
    expectedVersion: number,
  ): Promise<void> {
    await this.inContext(actor, async (tx) => {
      await this.applyUpdate(tx, actor, imported, expectedVersion);
    });
  }

  /**
   * The optimistic-concurrency write, shared by every path that moves an
   * import.
   *
   * `updateMany` with the expected version in the `where` is what makes a
   * concurrent edit lose rather than win: zero rows affected means somebody
   * else moved first. The trigger also refuses a version that did not advance
   * by exactly one (`KAR52`), so the two controls answer different questions —
   * this one says "you were not looking at the current row", that one says
   * "the token was not advanced at all".
   */
  private async applyUpdate(
    tx: PrismaTransactionClient,
    actor: ImportsPrincipal,
    imported: StatementImport,
    expectedVersion: number,
  ): Promise<void> {
    const outcome = await tx.statementImport.updateMany({
      where: {
        id: imported.id,
        tenantId: actor.tenantId,
        userId: actor.userId,
        version: expectedVersion,
      },
      data: statementImportUpdateData(imported),
    });
    if (outcome.count === 0) {
      throw new StatementImportVersionConflictError(
        expectedVersion,
        'the statement import moved since it was read',
      );
    }
  }

  async attachSource(
    actor: ImportsPrincipal,
    importId: StatementImportId,
    sourceId: string,
    descriptor: StoredSourceDescriptor,
    storedAt: Date,
    imported: StatementImport,
    expectedVersion: number,
  ): Promise<void> {
    await this.inContext(actor, async (tx) => {
      // The source INSERT runs FIRST, while the import is still DRAFT with a
      // recorded decision. That is the order the guard reads: it looks at the
      // parent's `retention_state`, and a source row cannot exist unless that
      // already says DECIDED.
      await tx.statementImportSource.create({
        data: {
          id: sourceId,
          tenantId: actor.tenantId,
          userId: actor.userId,
          importId,
          mediaType: 'text/csv',
          byteLength: BigInt(descriptor.byteLength),
          storeKind: descriptor.storeKind,
          objectRef: descriptor.objectRef,
          encryptionAlgorithm: descriptor.algorithm,
          encryptionKeyVersion: descriptor.keyVersion,
          encryptionNonce: ownedBytes(descriptor.nonce),
          encryptionAuthTag: ownedBytes(descriptor.authTag),
          integrityChecksumAlgorithm: descriptor.integrityChecksumAlgorithm,
          integrityChecksum: ownedBytes(descriptor.integrityChecksum),
          fileFingerprint: descriptor.fileFingerprint,
          fileFingerprintVersion: descriptor.fileFingerprintVersion,
          storedAt,
        },
      });
      await this.applyUpdate(tx, actor, imported, expectedVersion);
    });
  }

  async findSource(
    actor: ImportsPrincipal,
    importId: StatementImportId,
  ): Promise<StoredSourceDescriptor | null> {
    const row = await this.inContext(actor, (tx) =>
      tx.statementImportSource.findFirst({
        where: { importId, tenantId: actor.tenantId, userId: actor.userId },
      }),
    );
    return row === null ? null : toStoredSourceDescriptor(row as never);
  }

  async stageParse(actor: ImportsPrincipal, staging: ParseStaging): Promise<void> {
    const importId = staging.parsedImport.id;
    // Encryption runs OUTSIDE the database transaction: it may call a key
    // provider, and holding a transaction open across a network call to a KMS
    // is how a connection pool starves under load.
    //
    // BOUNDED FAN-OUT, in batches of the CENTRAL `maxBatchSize` — the same
    // bound and the same reason as the commit path in
    // `prisma-statement-commit-unit-of-work.ts`, and it belongs here MORE than
    // there. This was one unbounded `Promise.all` over `staging.rows`, which
    // is four `encryptField` calls per row with no ceiling: a statement may
    // carry `maxRows` = 50,000, so one parse could put 200,000 key-provider
    // calls in flight — twice what the commit path was putting in flight when
    // that was recorded as a defect and fixed, on a path that runs FIRST and
    // carries a larger per-hour budget.
    //
    // The read path in this same file goes fully sequential 80 lines below and
    // says why in as many words: "a key-management provider is rate-limited
    // everywhere but local, and a statement can be thousands of rows". The
    // write path in between did the opposite, and
    // `LocalAesGcmFieldEncryptionProvider` being in-process is why nothing
    // local ever showed it — the same reason the commit-path defect survived.
    const batchSize = ingestionLimitPolicyFor('csv-statement-import').maxBatchSize;
    type StagedNarrative = Awaited<ReturnType<typeof encryptRowNarrative>>;
    const encrypted: Array<{ row: (typeof staging.rows)[number]; narrative: StagedNarrative }> = [];
    for (let offset = 0; offset < staging.rows.length; offset += batchSize) {
      const batch = staging.rows.slice(offset, offset + batchSize);
      encrypted.push(
        ...(await Promise.all(
          batch.map(async (row) => ({
            row,
            narrative: await encryptRowNarrative(this.encryption, actor, row.id, {
              description: row.description,
              merchant: row.merchant,
              sourceReference: row.sourceReference,
              instrumentMask: row.instrumentMask,
            }),
          })),
        )),
      );
    }

    await this.inContext(
      actor,
      async (tx) => {
        // REPLACE, not append. The errors go first: they reference rows.
      await tx.statementImportRowError.deleteMany({
        where: { importId, tenantId: actor.tenantId, userId: actor.userId },
      });
      await tx.statementImportRow.deleteMany({
        where: { importId, tenantId: actor.tenantId, userId: actor.userId },
      });

      for (const { row, narrative } of encrypted) {
        await tx.statementImportRow.create({
          data: {
            id: row.id,
            tenantId: actor.tenantId,
            userId: actor.userId,
            importId,
            rowNumber: row.rowNumber,
            rowState: row.rowState,
            bookingDate: calendarDayToDate(row.bookingDate),
            valueDate: calendarDayToDate(row.valueDate),
            eventOccurredAt: row.eventOccurredAt,
            sourceTimezone: row.sourceTimezone,
            amountMinor: row.amountMinorUnits,
            currencyCode: row.currencyCode,
            sourceDirection: row.sourceDirection,
            directionMapping: row.directionMapping,
            ...narrativeColumns(narrative),
            sourceBalanceMinor: row.sourceBalanceMinorUnits,
            sourceBalanceKind: row.sourceBalanceKind,
            stagedRowFingerprint: row.stagedRowFingerprint,
            stagedRowFingerprintVersion: row.stagedRowFingerprintVersion,
            stagedRowOrdinal: row.stagedRowOrdinal,
            updatedAt: staging.parsedImport.stateChangedAt,
          },
        });
      }

      const rowIdByNumber = new Map(staging.rows.map((row) => [row.rowNumber, row.id]));
      for (const error of staging.errors) {
        if (!isSafeField(error.safeField) || !isRowErrorReasonCode(error.reasonCode)) {
          throw new StatementImportStoreError(
            'a row error names a field or a reason outside this module’s closed vocabularies',
          );
        }
        await tx.statementImportRowError.create({
          data: {
            id: error.id,
            tenantId: actor.tenantId,
            userId: actor.userId,
            importId,
            rowId: rowIdByNumber.get(error.rowNumber) ?? null,
            rowNumber: error.rowNumber,
            safeField: error.safeField,
            reasonCode: error.reasonCode,
          },
        });
      }

        // LAST, so every row above was written while the import was PARSING —
        // which is exactly what `statement_import_rows_guard` (KAR57) requires.
        await this.applyUpdate(tx, actor, staging.parsedImport, staging.expectedVersion);
      },
      { bulk: true },
    );
  }

  async listRows(
    actor: ImportsPrincipal,
    importId: StatementImportId,
  ): Promise<readonly StagedRow[]> {
    const rows = await this.inContext(actor, (tx) =>
      tx.statementImportRow.findMany({
        where: { importId, tenantId: actor.tenantId, userId: actor.userId },
        orderBy: { rowNumber: 'asc' },
      }),
    );
    // Sequential rather than concurrent: a key-management provider is
    // rate-limited everywhere but local, and a statement can be thousands of
    // rows.
    const mapped: StagedRow[] = [];
    for (const row of rows) {
      mapped.push(await toStagedRow(row as unknown as StagedRowRecord, this.encryption, actor));
    }
    return mapped;
  }

  async listRowErrors(
    actor: ImportsPrincipal,
    importId: StatementImportId,
    limit: number,
  ): Promise<readonly RowError[]> {
    const rows = await this.inContext(actor, (tx) =>
      tx.statementImportRowError.findMany({
        where: { importId, tenantId: actor.tenantId, userId: actor.userId },
        orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }],
        take: limit,
      }),
    );
    return rows.map((row) => {
      if (!isSafeField(row.safeField) || !isRowErrorReasonCode(row.reasonCode)) {
        throw new StatementImportStoreError(
          'statement_import_row_errors holds a field or reason outside this module’s vocabularies',
        );
      }
      return Object.freeze({
        rowNumber: row.rowNumber,
        safeField: row.safeField,
        reasonCode: row.reasonCode,
      });
    });
  }

  countRowErrors(actor: ImportsPrincipal, importId: StatementImportId): Promise<number> {
    return this.inContext(actor, (tx) =>
      tx.statementImportRowError.count({
        where: { importId, tenantId: actor.tenantId, userId: actor.userId },
      }),
    );
  }

  async findCommittedImportWithFile(
    actor: ImportsPrincipal,
    fileFingerprintVersion: string,
    fileFingerprint: string,
  ): Promise<StatementImportId | null> {
    const row = await this.inContext(actor, (tx) =>
      tx.statementImportSource.findFirst({
        where: {
          tenantId: actor.tenantId,
          userId: actor.userId,
          fileFingerprintVersion,
          fileFingerprint,
          // ONLY a committed import counts. A rejected, failed or erased one
          // is a person retrying, and treating that as a duplicate would make
          // one bad upload permanently unrepeatable.
          import: { state: 'COMMITTED' },
        },
        select: { importId: true },
      }),
    );
    return row === null ? null : (row.importId as StatementImportId);
  }

  async deleteImport(actor: ImportsPrincipal, importId: StatementImportId): Promise<boolean> {
    const outcome = await this.inContext(actor, (tx) =>
      tx.statementImport.deleteMany({
        where: { id: importId, tenantId: actor.tenantId, userId: actor.userId },
      }),
    );
    return outcome.count > 0;
  }
}
