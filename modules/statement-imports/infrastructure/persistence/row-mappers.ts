/**
 * Row shapes and the conversions between them and this module's domain types.
 *
 * Two rules are enforced here rather than left to the repositories:
 *
 * **A `date` column becomes a `CalendarDay` and back, through UTC midnight
 * and nothing else.** Prisma models `@db.Date` as a JavaScript `Date`, which
 * is an instant, so the transport has to pin a moment. `toUtcMidnight` is the
 * one sanctioned direction (see `CalendarDay`), and reading back takes the UTC
 * date parts — so the day written is the day held, with no host timezone
 * anywhere in the path. Reading with `getDate()` instead of `getUTCDate()`
 * would move a booked day by one for anyone at a negative offset, and at a
 * month boundary would move it to the previous month.
 *
 * **An unknown vocabulary value is an error, not a cast.** Every closed set
 * this module writes is CHECK-constrained in the migrations, so a value
 * outside it means the database and this code disagree about what the column
 * means. Throwing names the column and the value; casting would let a row
 * nobody can interpret travel into a review screen.
 *
 * Nothing here logs. A row mapper sits between the database and the domain and
 * sees every field of both, which makes it the single worst place in the
 * module for a debug line to survive.
 */

import { CalendarDay } from '@karar/shared-kernel';

import type {
  EncryptedField,
  HsfFieldEncryptionPort,
  HsfFieldName,
} from '../../application/ports/hsf-field-encryption.js';
import type { ImportsPrincipal } from '../../application/principal.js';
import type {
  RowState,
  StagedRow,
} from '../../application/ports/statement-import-repository.js';
import { ROW_STATES } from '../../application/ports/statement-import-repository.js';
import { SOURCE_BALANCE_KINDS, type SourceBalanceKind } from '../../domain/column-mapping.js';
import { SourceObjectRef, type StoredSourceDescriptor } from '../../domain/encrypted-source.js';
import { HsfField } from '../../domain/hsf-field.js';
import { IMPORT_STATES, type ImportState } from '../../domain/import-state.js';
import { IMPORT_REFUSAL_CODES, type ImportRefusalCode } from '../../domain/reason-codes.js';
import {
  RECONCILIATION_STATUSES,
  type ReconciliationStatus,
} from '../../domain/reconciliation.js';
import {
  DIRECTION_MAPPINGS,
  SOURCE_DIRECTIONS,
  type DirectionMapping,
  type SourceDirection,
} from '../../domain/statement-row.js';
import { STATEMENT_BALANCE_KINDS, type StatementBalanceKind } from '../../domain/column-mapping.js';
import { NO_ROWS, type StatementImport } from '../../domain/statement-import.js';
import {
  CanonicalAccountRef,
  CommittedTransactionRef,
  ConnectionRef,
  StatementImportId,
  StatementImportRowId,
} from '../../domain/refs.js';

/** The single typed failure of this layer. Never carries a statement fragment. */
export class StatementImportStoreError extends Error {
  override readonly name = 'StatementImportStoreError';
}

function requireIn<T extends string>(
  allowed: readonly T[],
  column: string,
  value: string,
): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new StatementImportStoreError(
      `${column} holds '${value}', which is outside the closed set this module writes. The ` +
        'migration CHECK and this code disagree about what the column means, and a row nobody ' +
        'can interpret must not reach a review screen',
    );
  }
  return value as T;
}

/** `@db.Date` -> `CalendarDay`, through UTC parts only. */
export function dateToCalendarDay(value: Date | null): CalendarDay | null {
  if (value === null) return null;
  return CalendarDay.of(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

/** `CalendarDay` -> `@db.Date`, through UTC midnight only. */
export function calendarDayToDate(day: CalendarDay | null): Date | null {
  return day === null ? null : day.toUtcMidnight();
}

/** The same, for a NOT NULL column, so a null never reaches one by inference. */
export function requiredCalendarDayToDate(day: CalendarDay): Date {
  return day.toUtcMidnight();
}

/**
 * A `Uint8Array` backed by its own `ArrayBuffer`.
 *
 * The driver's types insist on it, and the insistence is right: a view over a
 * `SharedArrayBuffer` — or over a pooled `Buffer` that something else still
 * writes to — is ciphertext that can change after it was handed over.
 */
export function ownedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
  copy.set(value);
  return copy;
}

/** The `statement_imports` row this module reads. */
export interface StatementImportRow {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly accountId: string;
  readonly accountReferenceType: string;
  readonly connectionId: string | null;
  readonly connectionReferenceType: string | null;
  readonly state: string;
  readonly stateChangedAt: Date;
  readonly mediaType: string;
  readonly retentionState: string;
  readonly retentionDecidedAt: Date | null;
  readonly retentionPeriod: string | null;
  readonly retentionBasis: string | null;
  readonly retentionPackVersion: string | null;
  readonly parserVersion: string | null;
  readonly mappingVersion: string | null;
  readonly normalizationVersion: string | null;
  readonly stagedRowFingerprintVersion: string | null;
  readonly rowCount: number;
  readonly validRowCount: number;
  readonly invalidRowCount: number;
  readonly exactDuplicateCount: number;
  readonly probableDuplicateCount: number;
  readonly committedTransactionCount: number;
  readonly reconciliationStatus: string;
  readonly sourceReportedBalanceMinor: bigint | null;
  readonly sourceReportedBalanceKind: string | null;
  readonly sourceReportedBalanceCurrency: string | null;
  readonly refusalCode: string | null;
  readonly committedAt: Date | null;
  readonly erasedAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
}

export function toStatementImport(row: StatementImportRow): StatementImport {
  const versions =
    row.parserVersion !== null &&
    row.mappingVersion !== null &&
    row.normalizationVersion !== null &&
    row.stagedRowFingerprintVersion !== null
      ? {
          parserVersion: row.parserVersion,
          mappingVersion: row.mappingVersion,
          normalizationVersion: row.normalizationVersion,
          fingerprintVersion: row.stagedRowFingerprintVersion,
        }
      : null;

  const statedBalance =
    row.sourceReportedBalanceMinor !== null &&
    row.sourceReportedBalanceKind !== null &&
    row.sourceReportedBalanceCurrency !== null
      ? {
          minorUnits: row.sourceReportedBalanceMinor,
          kind: requireIn<StatementBalanceKind>(
            STATEMENT_BALANCE_KINDS,
            'statement_imports.source_reported_balance_kind',
            row.sourceReportedBalanceKind,
          ),
          currencyCode: row.sourceReportedBalanceCurrency,
        }
      : null;

  return Object.freeze({
    id: StatementImportId.of(row.id),
    tenantId: row.tenantId,
    userId: row.userId,
    accountRef: CanonicalAccountRef.of(row.accountId),
    connectionRef: row.connectionId === null ? null : ConnectionRef.of(row.connectionId),
    state: requireIn<ImportState>(IMPORT_STATES, 'statement_imports.state', row.state),
    stateChangedAt: row.stateChangedAt,
    mediaType: 'text/csv',
    retention:
      row.retentionState === 'DECIDED' &&
      row.retentionDecidedAt !== null &&
      row.retentionPeriod !== null &&
      row.retentionBasis !== null &&
      row.retentionPackVersion !== null
        ? {
            state: 'DECIDED' as const,
            decidedAt: row.retentionDecidedAt,
            retentionPeriod: row.retentionPeriod,
            basis: row.retentionBasis,
            packVersion: row.retentionPackVersion,
          }
        : { state: 'UNDECIDED' as const },
    versions,
    counts: {
      ...NO_ROWS,
      rowCount: row.rowCount,
      validRowCount: row.validRowCount,
      invalidRowCount: row.invalidRowCount,
      exactDuplicateCount: row.exactDuplicateCount,
      probableDuplicateCount: row.probableDuplicateCount,
      committedTransactionCount: row.committedTransactionCount,
    },
    reconciliationStatus: requireIn<ReconciliationStatus>(
      RECONCILIATION_STATUSES,
      'statement_imports.reconciliation_status',
      row.reconciliationStatus,
    ),
    statedBalance,
    refusalCode:
      row.refusalCode === null
        ? null
        : requireIn<ImportRefusalCode>(
            IMPORT_REFUSAL_CODES,
            'statement_imports.refusal_code',
            row.refusalCode,
          ),
    committedAt: row.committedAt,
    erasedAt: row.erasedAt,
    version: row.version,
    createdAt: row.createdAt,
  });
}

/** The write shape for `statement_imports`, minus the immutable identity. */
export function statementImportUpdateData(imported: StatementImport) {
  return {
    state: imported.state,
    stateChangedAt: imported.stateChangedAt,
    retentionState: imported.retention.state,
    retentionDecidedAt:
      imported.retention.state === 'DECIDED' ? imported.retention.decidedAt : null,
    retentionPeriod:
      imported.retention.state === 'DECIDED' ? imported.retention.retentionPeriod : null,
    retentionBasis: imported.retention.state === 'DECIDED' ? imported.retention.basis : null,
    retentionPackVersion:
      imported.retention.state === 'DECIDED' ? imported.retention.packVersion : null,
    parserVersion: imported.versions?.parserVersion ?? null,
    mappingVersion: imported.versions?.mappingVersion ?? null,
    normalizationVersion: imported.versions?.normalizationVersion ?? null,
    stagedRowFingerprintVersion: imported.versions?.fingerprintVersion ?? null,
    rowCount: imported.counts.rowCount,
    validRowCount: imported.counts.validRowCount,
    invalidRowCount: imported.counts.invalidRowCount,
    exactDuplicateCount: imported.counts.exactDuplicateCount,
    probableDuplicateCount: imported.counts.probableDuplicateCount,
    committedTransactionCount: imported.counts.committedTransactionCount,
    reconciliationStatus: imported.reconciliationStatus,
    sourceReportedBalanceMinor: imported.statedBalance?.minorUnits ?? null,
    sourceReportedBalanceKind: imported.statedBalance?.kind ?? null,
    sourceReportedBalanceCurrency: imported.statedBalance?.currencyCode ?? null,
    refusalCode: imported.refusalCode,
    committedAt: imported.committedAt,
    erasedAt: imported.erasedAt,
    version: imported.version,
    updatedAt: imported.stateChangedAt,
  };
}

/** The `statement_import_sources` row. */
export interface StatementImportSourceRow {
  readonly storeKind: string;
  readonly objectRef: string;
  readonly byteLength: bigint;
  readonly encryptionAlgorithm: string;
  readonly encryptionKeyVersion: string;
  readonly encryptionNonce: Uint8Array;
  readonly encryptionAuthTag: Uint8Array;
  readonly integrityChecksumAlgorithm: string;
  readonly integrityChecksum: Uint8Array;
  readonly fileFingerprint: string;
  readonly fileFingerprintVersion: string;
}

export function toStoredSourceDescriptor(row: StatementImportSourceRow): StoredSourceDescriptor {
  return Object.freeze({
    storeKind: requireIn(
      ['LOCAL_ENCRYPTED_BUFFER', 'EXTERNAL_ENCRYPTED_OBJECT'] as const,
      'statement_import_sources.store_kind',
      row.storeKind,
    ),
    objectRef: SourceObjectRef.of(row.objectRef),
    byteLength: Number(row.byteLength),
    algorithm: row.encryptionAlgorithm,
    keyVersion: row.encryptionKeyVersion,
    nonce: row.encryptionNonce,
    authTag: row.encryptionAuthTag,
    integrityChecksumAlgorithm: requireIn(
      ['SHA-256'] as const,
      'statement_import_sources.integrity_checksum_algorithm',
      row.integrityChecksumAlgorithm,
    ),
    integrityChecksum: row.integrityChecksum,
    fileFingerprint: row.fileFingerprint,
    fileFingerprintVersion: row.fileFingerprintVersion,
  });
}

/** The `statement_import_rows` row. */
export interface StagedRowRecord {
  readonly id: string;
  readonly rowNumber: number;
  readonly rowState: string;
  readonly bookingDate: Date | null;
  readonly valueDate: Date | null;
  readonly eventOccurredAt: Date | null;
  readonly sourceTimezone: string | null;
  readonly amountMinor: bigint | null;
  readonly currencyCode: string | null;
  readonly sourceDirection: string | null;
  readonly directionMapping: string | null;
  readonly hsfAlgorithm: string | null;
  readonly hsfKeyVersion: string | null;
  readonly descriptionCiphertext: Uint8Array | null;
  readonly descriptionNonce: Uint8Array | null;
  readonly descriptionAuthTag: Uint8Array | null;
  readonly merchantCiphertext: Uint8Array | null;
  readonly merchantNonce: Uint8Array | null;
  readonly merchantAuthTag: Uint8Array | null;
  readonly sourceReferenceCiphertext: Uint8Array | null;
  readonly sourceReferenceNonce: Uint8Array | null;
  readonly sourceReferenceAuthTag: Uint8Array | null;
  readonly instrumentMaskCiphertext: Uint8Array | null;
  readonly instrumentMaskNonce: Uint8Array | null;
  readonly instrumentMaskAuthTag: Uint8Array | null;
  readonly sourceBalanceMinor: bigint | null;
  readonly sourceBalanceKind: string | null;
  readonly stagedRowFingerprint: string | null;
  readonly stagedRowFingerprintVersion: string | null;
  readonly stagedRowOrdinal: number | null;
  readonly committedTransactionId: string | null;
}

/** Decrypts one optional HSF field, or `null` when the row carries none. */
async function decryptOptional(
  encryption: HsfFieldEncryptionPort,
  actor: ImportsPrincipal,
  rowId: string,
  field: HsfFieldName,
  parts: {
    readonly ciphertext: Uint8Array | null;
    readonly nonce: Uint8Array | null;
    readonly authTag: Uint8Array | null;
    readonly algorithm: string | null;
    readonly keyVersion: string | null;
  },
): Promise<HsfField | null> {
  if (
    parts.ciphertext === null ||
    parts.nonce === null ||
    parts.authTag === null ||
    parts.algorithm === null ||
    parts.keyVersion === null
  ) {
    return null;
  }
  return encryption.decryptField(
    actor,
    {
      ciphertext: parts.ciphertext,
      nonce: parts.nonce,
      authTag: parts.authTag,
      algorithm: parts.algorithm,
      keyVersion: parts.keyVersion,
    },
    { table: 'statement_import_rows', rowId, field },
  );
}

export async function toStagedRow(
  row: StagedRowRecord,
  encryption: HsfFieldEncryptionPort,
  actor: ImportsPrincipal,
): Promise<StagedRow> {
  const shared = { algorithm: row.hsfAlgorithm, keyVersion: row.hsfKeyVersion };
  const description = await decryptOptional(encryption, actor, row.id, 'description', {
    ciphertext: row.descriptionCiphertext,
    nonce: row.descriptionNonce,
    authTag: row.descriptionAuthTag,
    ...shared,
  });
  const merchant = await decryptOptional(encryption, actor, row.id, 'merchant', {
    ciphertext: row.merchantCiphertext,
    nonce: row.merchantNonce,
    authTag: row.merchantAuthTag,
    ...shared,
  });
  const sourceReference = await decryptOptional(encryption, actor, row.id, 'sourceReference', {
    ciphertext: row.sourceReferenceCiphertext,
    nonce: row.sourceReferenceNonce,
    authTag: row.sourceReferenceAuthTag,
    ...shared,
  });
  const instrumentMask = await decryptOptional(encryption, actor, row.id, 'instrumentMask', {
    ciphertext: row.instrumentMaskCiphertext,
    nonce: row.instrumentMaskNonce,
    authTag: row.instrumentMaskAuthTag,
    ...shared,
  });

  return Object.freeze({
    id: StatementImportRowId.of(row.id),
    rowNumber: row.rowNumber,
    rowState: requireIn<RowState>(ROW_STATES, 'statement_import_rows.row_state', row.rowState),
    bookingDate: dateToCalendarDay(row.bookingDate),
    valueDate: dateToCalendarDay(row.valueDate),
    eventOccurredAt: row.eventOccurredAt,
    sourceTimezone: row.sourceTimezone,
    amountMinorUnits: row.amountMinor,
    currencyCode: row.currencyCode,
    sourceDirection:
      row.sourceDirection === null
        ? null
        : requireIn<SourceDirection>(
            SOURCE_DIRECTIONS,
            'statement_import_rows.source_direction',
            row.sourceDirection,
          ),
    directionMapping:
      row.directionMapping === null
        ? null
        : requireIn<DirectionMapping>(
            DIRECTION_MAPPINGS,
            'statement_import_rows.direction_mapping',
            row.directionMapping,
          ),
    description,
    merchant,
    sourceReference,
    instrumentMask,
    sourceBalanceMinorUnits: row.sourceBalanceMinor,
    sourceBalanceKind:
      row.sourceBalanceKind === null
        ? null
        : requireIn<SourceBalanceKind>(
            SOURCE_BALANCE_KINDS,
            'statement_import_rows.source_balance_kind',
            row.sourceBalanceKind,
          ),
    stagedRowFingerprint: row.stagedRowFingerprint,
    stagedRowFingerprintVersion: row.stagedRowFingerprintVersion,
    stagedRowOrdinal: row.stagedRowOrdinal,
    committedTransactionRef:
      row.committedTransactionId === null
        ? null
        : CommittedTransactionRef.of(row.committedTransactionId),
  });
}

/** The encrypted columns for one staged row, all under one key version. */
export interface EncryptedRowNarrative {
  readonly hsfAlgorithm: string | null;
  readonly hsfKeyVersion: string | null;
  readonly descriptionCiphertext: Uint8Array | null;
  readonly descriptionNonce: Uint8Array | null;
  readonly descriptionAuthTag: Uint8Array | null;
  readonly merchantCiphertext: Uint8Array | null;
  readonly merchantNonce: Uint8Array | null;
  readonly merchantAuthTag: Uint8Array | null;
  readonly sourceReferenceCiphertext: Uint8Array | null;
  readonly sourceReferenceNonce: Uint8Array | null;
  readonly sourceReferenceAuthTag: Uint8Array | null;
  readonly instrumentMaskCiphertext: Uint8Array | null;
  readonly instrumentMaskNonce: Uint8Array | null;
  readonly instrumentMaskAuthTag: Uint8Array | null;
}

export const NO_NARRATIVE: EncryptedRowNarrative = Object.freeze({
  hsfAlgorithm: null,
  hsfKeyVersion: null,
  descriptionCiphertext: null,
  descriptionNonce: null,
  descriptionAuthTag: null,
  merchantCiphertext: null,
  merchantNonce: null,
  merchantAuthTag: null,
  sourceReferenceCiphertext: null,
  sourceReferenceNonce: null,
  sourceReferenceAuthTag: null,
  instrumentMaskCiphertext: null,
  instrumentMaskNonce: null,
  instrumentMaskAuthTag: null,
});

/**
 * Encrypts a staged row's four HSF fields under one key version.
 *
 * Every field of a row shares the encryption context columns. Two key
 * versions inside one row would mean two calls resolved different versions
 * mid-row, which is a provider defect rather than a state to persist — so it
 * throws instead of storing the first one and hoping.
 */
export async function encryptRowNarrative(
  encryption: HsfFieldEncryptionPort,
  actor: ImportsPrincipal,
  rowId: string,
  narrative: {
    readonly description: HsfField | null;
    readonly merchant: HsfField | null;
    readonly sourceReference: HsfField | null;
    readonly instrumentMask: HsfField | null;
  },
): Promise<EncryptedRowNarrative> {
  const encryptOne = async (
    field: HsfFieldName,
    value: HsfField | null,
  ): Promise<EncryptedField | null> =>
    value === null
      ? null
      : encryption.encryptField(actor, value, {
          table: 'statement_import_rows',
          rowId,
          field,
        });

  const description = await encryptOne('description', narrative.description);
  const merchant = await encryptOne('merchant', narrative.merchant);
  const sourceReference = await encryptOne('sourceReference', narrative.sourceReference);
  const instrumentMask = await encryptOne('instrumentMask', narrative.instrumentMask);

  const present = [description, merchant, sourceReference, instrumentMask].filter(
    (field): field is EncryptedField => field !== null,
  );
  if (present.length === 0) return NO_NARRATIVE;
  const first = present[0] as EncryptedField;
  for (const field of present) {
    if (field.keyVersion !== first.keyVersion || field.algorithm !== first.algorithm) {
      throw new StatementImportStoreError(
        'the encryption provider returned two key versions within one row; a row carries one ' +
          'encryption context by design',
      );
    }
  }

  const owned = (field: EncryptedField | null, part: 'ciphertext' | 'nonce' | 'authTag') =>
    field === null ? null : ownedBytes(field[part]);
  return Object.freeze({
    hsfAlgorithm: first.algorithm,
    hsfKeyVersion: first.keyVersion,
    descriptionCiphertext: owned(description, 'ciphertext'),
    descriptionNonce: owned(description, 'nonce'),
    descriptionAuthTag: owned(description, 'authTag'),
    merchantCiphertext: owned(merchant, 'ciphertext'),
    merchantNonce: owned(merchant, 'nonce'),
    merchantAuthTag: owned(merchant, 'authTag'),
    sourceReferenceCiphertext: owned(sourceReference, 'ciphertext'),
    sourceReferenceNonce: owned(sourceReference, 'nonce'),
    sourceReferenceAuthTag: owned(sourceReference, 'authTag'),
    instrumentMaskCiphertext: owned(instrumentMask, 'ciphertext'),
    instrumentMaskNonce: owned(instrumentMask, 'nonce'),
    instrumentMaskAuthTag: owned(instrumentMask, 'authTag'),
  });
}
