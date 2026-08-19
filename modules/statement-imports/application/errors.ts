/**
 * Expected failure shapes of this module's use cases (backend.md §9). Every
 * kind is machine-readable for RFC 7807 mapping.
 *
 * **Denial kinds deliberately avoid oracles.** An import id that does not
 * exist, one belonging to another user in the same tenant, and one belonging
 * to another tenant all answer `import_not_found` — identically, with the same
 * message; the same holds for the account an import is asked to target.
 * Anything else turns a guessed identifier into a membership test. RLS
 * produces this outcome structurally (the row is simply not visible), and
 * these types keep the application layer from reintroducing the distinction
 * on the way out.
 *
 * **NO MESSAGE IN THIS FILE CARRIES A FRAGMENT OF THE STATEMENT.** Not a
 * cell, not a header, not an amount, not a merchant, not a line of the file —
 * including in the arms that exist precisely because one of them was
 * unreadable. A refusal names a LINE NUMBER, a SAFE FIELD and a REASON CODE,
 * and that is the whole vocabulary. The value that caused the problem is the
 * one thing a person can already see by opening their own file, and it is the
 * one thing that must not travel into a log, an error tracker, a support
 * ticket or a screenshot.
 *
 * `cause` on every failure that has one is defined NON-ENUMERABLE, so
 * `JSON.stringify`, object spread, structured logging and an RFC 7807 body
 * all drop it without anyone remembering to. A field that must not be
 * serialized is safer as a field that cannot be.
 */

import type { ImportRefusalCode, RowError } from '../domain/reason-codes.js';
import type { ImportState } from '../domain/import-state.js';
import type { MappingViolation } from '../domain/column-mapping.js';
import type { ReconciliationOutcome } from '../domain/reconciliation.js';
import type {
  StatementRetentionDecision,
  RetentionGovernedDataset,
} from './ports/statement-retention-decision.js';
import type { MissingPrincipalContext } from './principal.js';

/** No import with that id is visible to the acting principal. */
export interface ImportNotFound {
  readonly kind: 'import_not_found';
  readonly message: string;
}

export const IMPORT_NOT_FOUND: ImportNotFound = Object.freeze({
  kind: 'import_not_found' as const,
  message:
    'no statement import with that id is visible to this principal. Whether one exists for ' +
    'anybody else is deliberately not answered: a distinguishable denial turns a guessed ' +
    'identifier into a test for whether another person has imported a statement',
});

/**
 * The account this import was asked to target is not visible to the acting
 * principal — absent, another user's, another tenant's, or never minted,
 * indistinguishably.
 */
export interface AccountNotFound {
  readonly kind: 'account_not_found';
  readonly message: string;
}

export const ACCOUNT_NOT_FOUND: AccountNotFound = Object.freeze({
  kind: 'account_not_found' as const,
  message:
    'no account with that id is visible to this principal, so no statement import was started. ' +
    'The refusal reveals nothing about whether such an account exists for anybody else',
});

/**
 * The account exists but may not receive imported records: it is archived,
 * closed, or in a state this module does not recognise.
 *
 * An unrecognised state is refused rather than permitted. A state this module
 * has no rule for is not permission to file 300 movements into somebody's
 * account; it is a gap, and the fail-closed reading of a gap is no.
 */
export interface AccountNotWritable {
  readonly kind: 'account_not_writable';
  readonly lifecycleState: string;
  readonly message: string;
}

/**
 * The line's currency, or the file's, is not the account's — and nothing here
 * converts.
 */
export interface CurrencyMismatch {
  readonly kind: 'currency_mismatch';
  readonly accountCurrency: string;
  readonly sourceCurrency: string;
  readonly message: string;
}

/** The import is not in a state where the requested operation is meaningful. */
export interface ImportNotInExpectedState {
  readonly kind: 'import_not_in_expected_state';
  readonly state: ImportState;
  readonly expected: readonly ImportState[];
  readonly message: string;
}

/** The declared mapping is unusable, before a byte of the file is read. */
export interface MappingUnusable {
  readonly kind: 'mapping_unusable';
  readonly violations: readonly MappingViolation[];
  readonly message: string;
}

/**
 * The file was refused as a whole. `code` is one of this module's stable
 * refusal codes; `rowErrors` carries the per-line reasons when there are any,
 * bounded by the declared `maxReportedErrors`.
 *
 * **`reportedErrorCount` and `totalErrorCount` are separate on purpose.** A
 * caller shown 500 of 900 errors needs to know 900 exist; collapsing them
 * into one number turns a truncated report into a complete-looking one, which
 * is the same failure mode as a silently truncated import.
 */
export interface SourceRefused {
  readonly kind: 'source_refused';
  readonly code: ImportRefusalCode;
  readonly rowErrors: readonly RowError[];
  readonly reportedErrorCount: number;
  readonly totalErrorCount: number;
  readonly message: string;
}

/** The stored statement's integrity checksum no longer matches. */
export interface SourceIntegrityFailed {
  readonly kind: 'source_integrity_failed';
  readonly message: string;
}

/** The reconciliation the source's own figures imply does not hold. */
export interface ReconciliationBlocked {
  readonly kind: 'reconciliation_blocked';
  readonly outcome: ReconciliationOutcome;
  readonly message: string;
}

/**
 * The import changed since the caller read it. The caller re-reads and
 * decides; this module never silently overwrites a concurrent edit, because
 * the losing edit is usually the one a person made on their other device.
 */
export interface VersionConflict {
  readonly kind: 'version_conflict';
  readonly expectedVersion: number;
  readonly message: string;
}

/**
 * Durable creation was refused because the retention decision governing the
 * dataset is not resolved.
 *
 * Carries the decision itself rather than a rephrasing of it: an operator
 * needs to know whether the answer was "legal has not ruled" or "we could not
 * ask", and those have different remedies. Deliberately NOT a `store_failure`
 * — no store was touched, and reporting it as one would send somebody to look
 * at the database for a problem that is a policy gap.
 */
export interface RetentionUnresolved {
  readonly kind: 'retention_unresolved';
  readonly dataset: RetentionGovernedDataset;
  readonly decision: StatementRetentionDecision;
  readonly message: string;
}

/** The encrypted-source store could not be reached, so nothing was stored. */
export interface SourceStoreUnavailable {
  readonly kind: 'source_store_unavailable';
  readonly message: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
}

/** The deduplication fingerprint could not be computed, so nothing was staged. */
export interface FingerprintUnavailable {
  readonly kind: 'fingerprint_unavailable';
  readonly message: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
}

/** Whether the target account is one the caller owns could not be established. */
export interface AccountAccessUnavailable {
  readonly kind: 'account_access_unavailable';
  readonly message: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
}

/**
 * The commit did not complete, and NO SUBSET of it was written.
 *
 * The wording is the guarantee: one database transaction writes the canonical
 * transactions, their revisions, their provenance, the row links, the
 * outbox notice and the COMMITTED state, or it writes none of them. A caller
 * receiving this arm can retry, and the retry is idempotent.
 */
export interface CommitFailed {
  readonly kind: 'commit_failed';
  readonly message: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
}

/**
 * The store failed. Never carries store internals outward.
 *
 * `operation` is this module's own vocabulary ('stage statement rows'), never
 * the store's.
 */
export interface StoreFailure {
  readonly kind: 'store_failure';
  readonly message: string;
  readonly operation: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
}

/**
 * Wrap an unexpected store throw without leaking its internals to a client.
 *
 * A driver message is not ours to show: it can carry a connection string with
 * credentials, the SQL that failed, a table name, a host and port, or — worst
 * here — a fragment of the row that failed, which in this module is a line of
 * somebody's bank statement. It is also unstable, so a client that keyed on
 * it would break on a driver upgrade.
 */
export function storeFailure(operation: string, error: unknown): StoreFailure {
  const failure = {
    kind: 'store_failure' as const,
    operation,
    message:
      `${operation} could not be completed because the store did not answer. The reason is ` +
      'deliberately not described here: it comes from the database driver, and driver text can ' +
      'carry credentials, SQL, or a fragment of the statement line itself. It is logged once at ' +
      'the boundary, against this request',
  };
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as StoreFailure;
}

/** The refusal when the encrypted-source store could not be reached. */
export function sourceStoreUnavailable(error: unknown): SourceStoreUnavailable {
  const failure = {
    kind: 'source_store_unavailable' as const,
    message:
      'the encrypted source store did not answer, so no statement was stored and no import ' +
      'proceeded. It fails closed on purpose: the alternative is a durable import row describing ' +
      'a file that is not anywhere, which reads as a lost statement to the person and as a ' +
      'successful upload to everything else. Why it did not answer is logged once at the boundary',
  };
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as SourceStoreUnavailable;
}

/** The refusal when the dedup fingerprint port cannot answer. */
export function fingerprintUnavailable(error: unknown): FingerprintUnavailable {
  const failure = {
    kind: 'fingerprint_unavailable' as const,
    message:
      'the deduplication fingerprint could not be computed, so nothing was staged. Proceeding ' +
      'without one would stage rows that cannot be recognised as already recorded, and the ' +
      'visible symptom of that is a second copy of a month of spending rather than an error ' +
      'anybody sees. Why it could not be computed is logged once at the boundary',
  };
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as FingerprintUnavailable;
}

/** The refusal when account visibility could not be established. */
export function accountAccessUnavailable(error: unknown): AccountAccessUnavailable {
  const failure = {
    kind: 'account_access_unavailable' as const,
    message:
      'whether this account is one the caller owns could not be established, so no import was ' +
      'started. The rule fails closed: an import written against an unverified account reference ' +
      'would aim a statement at an account nobody checked. Why the question went unanswered is ' +
      'logged once at the boundary',
  };
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as AccountAccessUnavailable;
}

/**
 * The refusal when a commit did not complete.
 *
 * The message states the atomicity guarantee rather than the failure, because
 * the guarantee is what the caller needs in order to decide what to do next:
 * a retry is safe, and it produces the same result rather than a second copy.
 */
export function commitFailed(error: unknown): CommitFailed {
  const failure = {
    kind: 'commit_failed' as const,
    message:
      'the commit did not complete, and no part of it was written: the canonical transactions, ' +
      'their revisions, their provenance, the row links and the import state all live in one ' +
      'database transaction, so a failure leaves no subset behind. Retrying is safe and produces ' +
      'the same result rather than a second copy. Why it failed is logged once at the boundary',
  };
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as CommitFailed;
}

/**
 * The one refusal every retention gate produces, so the wording cannot drift
 * between the paths that use it and so the reason is always the decision's
 * own.
 */
export function retentionUnresolved(
  dataset: RetentionGovernedDataset,
  decision: StatementRetentionDecision,
): RetentionUnresolved {
  const detail =
    decision.state === 'PENDING_LEGAL_REVIEW'
      ? decision.reason
      : decision.state === 'UNAVAILABLE'
        ? decision.reason
        : decision.state === 'NOT_APPLICABLE'
          ? decision.reason
          : '';
  return Object.freeze({
    kind: 'retention_unresolved' as const,
    dataset,
    decision,
    message:
      `no retention decision governs ${dataset} here, so nothing durable may be written: ` +
      `${decision.state}${detail === '' ? '' : ` — ${detail}`}. How long a ` +
      'HIGHLY_SENSITIVE_FINANCIAL record may be kept is a legal decision, and storing the ' +
      'statement first while waiting for it is the outcome the gate exists to prevent',
  });
}

/** The refusal when an import is asked to do something its state does not permit. */
export function notInExpectedState(
  state: ImportState,
  expected: readonly ImportState[],
): ImportNotInExpectedState {
  return Object.freeze({
    kind: 'import_not_in_expected_state' as const,
    state,
    expected: Object.freeze([...expected]),
    message:
      `this statement import is ${state}, and the operation requires one of ` +
      `(${expected.join(', ')}). The lifecycle is enforced rather than assumed, because the ` +
      "move that must be impossible — committing a file nobody reviewed — is one a caller can " +
      'otherwise reach by asking twice',
  });
}

/** Every failure any use case in this module can return. */
export type StatementImportError =
  | MissingPrincipalContext
  | ImportNotFound
  | AccountNotFound
  | AccountNotWritable
  | AccountAccessUnavailable
  | CurrencyMismatch
  | ImportNotInExpectedState
  | MappingUnusable
  | SourceRefused
  | SourceIntegrityFailed
  | ReconciliationBlocked
  | RetentionUnresolved
  | SourceStoreUnavailable
  | FingerprintUnavailable
  | CommitFailed
  | VersionConflict
  | StoreFailure;
