/**
 * Response serialization for statement imports — CLOSED field sets, picked by
 * name.
 *
 * NOTHING FROM THE FILE COMES BACK. No raw row, no raw cell, no header text —
 * a header can itself carry an account number — no staged amount, no staged
 * merchant, no staged balance, no staged-row fingerprint and no occurrence
 * ordinal. A row error is three fields and there is never a fourth: a 1-based
 * DATA row number (never an offset into the file), one field name from a
 * CLOSED safe vocabulary, and one reason code.
 *
 * NO OBJECT-STORAGE HANDLE AND NO ENCRYPTION METADATA. The stored source's
 * locator, store kind, byte length, algorithm, key version, nonce, auth tag,
 * integrity checksum and file fingerprint are on a descriptor type that never
 * reaches a use-case result; existence is reported as `hasStoredSource`,
 * because a handle is enough to ask a store for somebody's bank statement.
 *
 * THE RETENTION DECISION IS REPORTED AS A STATE, NOT AS ITS CONTENTS. The
 * period, the basis, the approval reference and the pack version are internal
 * review artefacts. A client needs to know whether an approved decision
 * exists; it does not need to be told which approval, and a fabricated-looking
 * reference in a client body is exactly the shape of the problem this project
 * has already had once.
 */

import type { StatementImport, StatementImportPreview } from '@karar/statement-imports';
import type { RowError } from '@karar/statement-imports';

import { instantWire, nullableInstantWire } from './wire.js';

export interface ImportCountsWire {
  readonly rowCount: number;
  readonly validRowCount: number;
  readonly invalidRowCount: number;
  readonly exactDuplicateCount: number;
  readonly probableDuplicateCount: number;
  readonly committedTransactionCount: number;
}

export interface ProcessingVersionsWire {
  readonly parserVersion: string;
  readonly mappingVersion: string;
  readonly normalizationVersion: string;
  readonly fingerprintVersion: string;
}

export interface RowErrorWire {
  readonly rowNumber: number;
  readonly safeField: string;
  readonly reasonCode: string;
}

export function rowErrorWire(error: RowError): RowErrorWire {
  return {
    rowNumber: error.rowNumber,
    safeField: error.safeField,
    reasonCode: error.reasonCode,
  };
}

function countsWire(counts: StatementImport['counts']): ImportCountsWire {
  return {
    rowCount: counts.rowCount,
    validRowCount: counts.validRowCount,
    invalidRowCount: counts.invalidRowCount,
    exactDuplicateCount: counts.exactDuplicateCount,
    // Present and zero rather than absent: probable-duplicate detection is
    // not implemented, and a field that quietly did not exist would read as
    // "none found" instead of "none looked for".
    probableDuplicateCount: counts.probableDuplicateCount,
    committedTransactionCount: counts.committedTransactionCount,
  };
}

function versionsWire(versions: StatementImport['versions']): ProcessingVersionsWire | null {
  return versions === null
    ? null
    : {
        parserVersion: versions.parserVersion,
        mappingVersion: versions.mappingVersion,
        normalizationVersion: versions.normalizationVersion,
        // The ALGORITHM version. Never a fingerprint.
        fingerprintVersion: versions.fingerprintVersion,
      };
}

export interface StatedBalanceWire {
  readonly minorUnits: string;
  readonly kind: string;
  readonly currency: string;
}

function statedBalanceWire(balance: StatementImport['statedBalance']): StatedBalanceWire | null {
  return balance === null
    ? null
    : {
        // A bigint has no JSON form; the exact integer travels as characters.
        minorUnits: balance.minorUnits.toString(),
        kind: balance.kind,
        currency: balance.currencyCode,
      };
}

export interface StatementImportWire {
  readonly importId: string;
  readonly accountId: string;
  readonly connectionId: string | null;
  readonly state: string;
  readonly stateChangedAt: string;
  readonly mediaType: string;
  readonly rail: 'USER_FILE_UPLOAD';
  readonly availability: 'EXECUTABLE';
  readonly hasStoredSource: boolean;
  readonly retentionState: string;
  readonly versions: ProcessingVersionsWire | null;
  readonly counts: ImportCountsWire;
  readonly reconciliationStatus: string;
  readonly statedBalance: StatedBalanceWire | null;
  readonly refusalCode: string | null;
  readonly awaitsDecision: boolean;
  readonly committedAt: string | null;
  readonly erasedAt: string | null;
  readonly createdAt: string;
  readonly version: number;
}

/**
 * `hasStoredSource` is derived by the CALLER and handed in, because the
 * import row does not carry it: whether encrypted bytes exist is a fact about
 * the source store, and the honest way to report it is the state machine
 * (anything past DRAFT that has not been erased has bytes) rather than a
 * descriptor this layer must never see.
 */
export function statementImportWire(
  statementImport: StatementImport,
  hasStoredSource: boolean,
  awaitsDecision: boolean,
): StatementImportWire {
  return {
    importId: statementImport.id,
    accountId: statementImport.accountRef.accountId,
    connectionId:
      statementImport.connectionRef === null ? null : statementImport.connectionRef.connectionId,
    state: statementImport.state,
    stateChangedAt: instantWire(statementImport.stateChangedAt),
    mediaType: statementImport.mediaType,
    // A statement import is a file the SUBJECT uploaded. It is not a bank
    // connection, and USER_FILE_UPLOAD is one of the two rails that run.
    rail: 'USER_FILE_UPLOAD',
    availability: 'EXECUTABLE',
    hasStoredSource,
    retentionState: statementImport.retention.state,
    versions: versionsWire(statementImport.versions),
    counts: countsWire(statementImport.counts),
    reconciliationStatus: statementImport.reconciliationStatus,
    statedBalance: statedBalanceWire(statementImport.statedBalance),
    refusalCode: statementImport.refusalCode,
    awaitsDecision,
    committedAt: nullableInstantWire(statementImport.committedAt),
    erasedAt: nullableInstantWire(statementImport.erasedAt),
    createdAt: instantWire(statementImport.createdAt),
    version: statementImport.version,
  };
}

export interface StatementImportStatusWire {
  readonly importId: string;
  readonly state: string;
  readonly accountId: string;
  readonly connectionId: string | null;
  readonly hasStoredSource: boolean;
  readonly counts: ImportCountsWire;
  readonly reconciliationStatus: string;
  readonly versions: ProcessingVersionsWire | null;
  readonly refusalCode: string | null;
  readonly awaitsDecision: boolean;
  readonly reportedErrorCount: number;
  readonly totalErrorCount: number;
}

/**
 * The import's state, without its row errors.
 *
 * `version` IS ABSENT, and the absence is a real limitation rather than a
 * choice: the module exposes exactly one read for a single import — the
 * preview — and it does not carry the optimistic-concurrency token. A client
 * therefore takes `expectedVersion` for the commit from the response to the
 * write it last performed (the upload or the parse), which is where the
 * module hands the full import row over. Recovering it after that response is
 * lost needs a read the module does not declare, and inventing one here would
 * mean reaching past its public surface into a repository.
 */
export function statementImportStatusWire(
  preview: StatementImportPreview,
): StatementImportStatusWire {
  return {
    importId: preview.importId,
    state: preview.state,
    accountId: preview.accountId,
    connectionId: preview.connectionId,
    hasStoredSource: preview.hasStoredSource,
    counts: countsWire(preview.counts),
    reconciliationStatus: preview.reconciliationStatus,
    versions: versionsWire(preview.versions),
    refusalCode: preview.refusalCode,
    awaitsDecision: preview.awaitsDecision,
    reportedErrorCount: preview.reportedErrorCount,
    totalErrorCount: preview.totalErrorCount,
  };
}

export interface StatementImportPreviewWire {
  readonly importId: string;
  readonly state: string;
  readonly accountId: string;
  readonly connectionId: string | null;
  readonly hasStoredSource: boolean;
  readonly counts: ImportCountsWire;
  readonly reconciliationStatus: string;
  readonly versions: ProcessingVersionsWire | null;
  readonly refusalCode: string | null;
  readonly awaitsDecision: boolean;
  readonly reportedErrorCount: number;
  readonly totalErrorCount: number;
  readonly rowErrors: readonly RowErrorWire[];
}

/**
 * The preview MINUS its row errors, which the caller pages separately.
 *
 * `reportedErrorCount` and `totalErrorCount` both travel, and they are not
 * the same number: the report is bounded by the central policy's
 * `maxReportedErrors`, so collapsing the two would turn a truncated report
 * into a complete-looking one.
 */
export function statementImportPreviewWire(
  preview: StatementImportPreview,
  rowErrors: readonly RowError[],
): StatementImportPreviewWire {
  return {
    importId: preview.importId,
    state: preview.state,
    accountId: preview.accountId,
    connectionId: preview.connectionId,
    hasStoredSource: preview.hasStoredSource,
    counts: countsWire(preview.counts),
    reconciliationStatus: preview.reconciliationStatus,
    versions: versionsWire(preview.versions),
    refusalCode: preview.refusalCode,
    awaitsDecision: preview.awaitsDecision,
    reportedErrorCount: preview.reportedErrorCount,
    totalErrorCount: preview.totalErrorCount,
    rowErrors: rowErrors.map(rowErrorWire),
  };
}
