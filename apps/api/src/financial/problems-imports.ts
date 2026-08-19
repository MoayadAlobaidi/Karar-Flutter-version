/**
 * Statement-import errors -> RFC 7807 documents.
 *
 * The union is assembled from the module's INDIVIDUAL error interfaces, so
 * the exhaustive `switch` fails to compile when the module adds an arm nobody
 * has decided how to report.
 *
 * WHAT IS DROPPED, AND WHY EACH ONE MATTERS:
 *   * `source_refused` carries the bounded row errors AND both counts. The
 *     ROW ERRORS ARE NOT PUT IN THE PROBLEM DOCUMENT: a problem body is
 *     logged, forwarded and pasted into tickets far more freely than a
 *     response body, and a row error names a row of somebody's bank
 *     statement. The refusal CODE travels as `reason`, and the row errors
 *     stay on the preview route, where the subject reads them.
 *   * `retention_unresolved` carries the whole decision — period, basis,
 *     approval reference, pack version. Only the DATASET is kept.
 *   * `mapping_unusable` carries a list of violations whose messages may
 *     quote a column index the caller sent; only the violation KINDS travel,
 *     joined, because those name the rule rather than the input.
 *   * every `cause` (already non-enumerable) and every `operation`.
 *
 * A SIZE REFUSAL NAMES THE BOUND. `SOURCE_TOO_LARGE` carries `limitBytes`
 * from the central policy, because "too large" without a number is something
 * a person can only guess at.
 */

import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/limits.js';
import type {
  AccountAccessUnavailable,
  AccountNotFound,
  AccountNotWritable,
  CommitFailed,
  CurrencyMismatch,
  FingerprintUnavailable,
  ImportNotFound,
  ImportNotInExpectedState,
  MappingUnusable,
  MissingPrincipalContext,
  ReconciliationBlocked,
  RetentionUnresolved,
  SourceIntegrityFailed,
  SourceRefused,
  SourceStoreUnavailable,
  StoreFailure,
  VersionConflict,
} from '@karar/statement-imports';

import {
  authenticationRequiredProblem,
  codedProblem,
  retentionUnresolvedProblem,
  storeUnavailableProblem,
  type ProblemResponse,
} from './problems.js';

/**
 * The bounds this ingestion path is held to. Taken from the CENTRAL policy —
 * `INGESTION_LIMIT_POLICIES.csvStatementImport` — rather than restated here,
 * so the number a refusal quotes is the number the reader actually enforced.
 */
const CSV_LIMITS = INGESTION_LIMIT_POLICIES.csvStatementImport;

export type ImportsSurfaceError =
  | MissingPrincipalContext
  | ImportNotFound
  | AccountNotFound
  | AccountNotWritable
  | ImportNotInExpectedState
  | MappingUnusable
  | SourceRefused
  | SourceIntegrityFailed
  | CurrencyMismatch
  | ReconciliationBlocked
  | VersionConflict
  | RetentionUnresolved
  | SourceStoreUnavailable
  | FingerprintUnavailable
  | AccountAccessUnavailable
  | CommitFailed
  | StoreFailure;

/** A refused source. The status separates "too big" from "not usable". */
function sourceRefusedProblem(error: SourceRefused): ProblemResponse {
  if (error.code === 'SOURCE_TOO_LARGE') {
    return {
      status: 413,
      body: {
        type: 'about:blank',
        title: 'Statement too large',
        status: 413,
        code: 'SOURCE_TOO_LARGE',
        detail: 'the statement exceeds the declared byte bound for this ingestion path',
        reason: error.code,
        limitBytes: CSV_LIMITS.maxBytes,
      },
    };
  }
  if (error.code === 'UNSUPPORTED_MEDIA_TYPE') {
    return {
      status: 415,
      body: {
        type: 'about:blank',
        title: 'Unsupported media type',
        status: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        detail: 'this path accepts text/csv and nothing else',
        reason: error.code,
      },
    };
  }
  return {
    status: 400,
    body: {
      type: 'about:blank',
      title: 'Statement refused',
      status: 400,
      code: 'SOURCE_REFUSED',
      // The refusal code, and not one row of the file. The row errors are on
      // the preview route, where the subject reads their own statement.
      reason: error.code,
      detail: 'the statement could not be accepted; read the import preview for the row detail',
    },
  };
}

export function problemForImportsError(error: ImportsSurfaceError): ProblemResponse {
  switch (error.kind) {
    case 'missing_principal_context':
      return authenticationRequiredProblem();
    case 'import_not_found':
      return codedProblem(
        404,
        'Import not found',
        'IMPORT_NOT_FOUND',
        'no such statement import for this principal',
      );
    case 'account_not_found':
      return codedProblem(
        404,
        'Account not found',
        'ACCOUNT_NOT_FOUND',
        'no such account for this principal',
      );
    case 'account_not_writable':
      return codedProblem(
        409,
        'Account not writable',
        'ACCOUNT_NOT_WRITABLE',
        `the account cannot receive an import while it is ${error.lifecycleState}`,
      );
    case 'import_not_in_expected_state':
      return codedProblem(
        409,
        'Import not in the expected state',
        'IMPORT_NOT_IN_EXPECTED_STATE',
        `the import is ${error.state}; this step is legal from ${error.expected.join(', ')}`,
      );
    case 'mapping_unusable':
      return codedProblem(
        400,
        'Column mapping unusable',
        'MAPPING_UNUSABLE',
        `the mapping violates: ${error.violations.map((violation) => violation.kind).join(', ')}`,
      );
    case 'source_refused':
      return sourceRefusedProblem(error);
    case 'source_integrity_failed':
      // The stored bytes did not match the checksum written with them.
      // Refused rather than parsed with a warning: a statement that changed
      // under us is not a statement.
      return codedProblem(
        409,
        'Stored statement failed its integrity check',
        'SOURCE_INTEGRITY_FAILED',
        'the stored source no longer matches the checksum recorded with it; erase this import and upload again',
      );
    case 'currency_mismatch':
      return codedProblem(
        409,
        'Currency mismatch',
        'CURRENCY_MISMATCH',
        `the account is held in ${error.accountCurrency} and the statement states ${error.sourceCurrency}`,
      );
    case 'reconciliation_blocked':
      return codedProblem(
        409,
        'Reconciliation blocked the commit',
        'RECONCILIATION_BLOCKED',
        'the statement’s own stated balance does not agree with its rows',
      );
    case 'version_conflict':
      return codedProblem(
        409,
        'Import changed under the caller',
        'IMPORT_VERSION_CONFLICT',
        're-read the import and retry with its current version',
      );
    case 'retention_unresolved':
      return retentionUnresolvedProblem(error.dataset);
    case 'source_store_unavailable':
      return codedProblem(
        503,
        'Statement store unavailable',
        'SOURCE_STORE_UNAVAILABLE',
        'the encrypted statement store could not be reached',
      );
    case 'commit_failed':
      // Nothing partial was written: the commit is one unit of work.
      return codedProblem(
        503,
        'Commit could not be performed',
        'COMMIT_FAILED',
        'nothing was written; the commit is a single unit of work',
      );
    case 'fingerprint_unavailable':
    case 'account_access_unavailable':
    case 'store_failure':
      return storeUnavailableProblem();
  }
}
