/**
 * The import aggregate: what one CSV statement is, and the only ways it may
 * change.
 *
 * Every mutator here returns a NEW frozen value and refuses an illegal move
 * rather than correcting it. The database enforces the same rules
 * (`statement_imports_guard`, migration 0100), and the duplication is
 * deliberate: a lifecycle rule enforced only in TypeScript is a rule about
 * the code path somebody happened to take, and this one — no canonical
 * transaction before review — is the guarantee the module exists for.
 *
 * ## Retention is a field on the aggregate, not a flag beside it
 *
 * `retention` is a discriminated union with exactly two arms, so an import
 * cannot be in a state where it "has a period" without also carrying the
 * basis and the pack version that make the period mean something. A partially
 * recorded decision is not a weaker decision; it is a number nobody can
 * defend, attached to somebody's financial records.
 *
 * ## The counts are facts, and the type will not let them be summaries
 *
 * `validRowCount + invalidRowCount` need not equal `rowCount`: a row can be
 * valid AND an exact duplicate, and a duplicate is neither committed nor
 * invalid. Making the counts independent keeps a preview honest about a file
 * where 40 lines are fine, 3 are unreadable, and 12 are already recorded.
 *
 * Pure: no clock, no randomness, no I/O. Time arrives as an argument.
 */

import {
  checkTransition,
  mayHaveCommittedTransactions,
  type ImportState,
} from './import-state.js';
import type { ImportRefusalCode } from './reason-codes.js';
import type { ReconciliationStatus, StatedStatementBalance } from './reconciliation.js';
import type { CanonicalAccountRef, ConnectionRef, StatementImportId } from './refs.js';

/** The only media type this path accepts, this phase and by CHECK. */
export const SUPPORTED_MEDIA_TYPE = 'text/csv';
export type SupportedMediaType = typeof SUPPORTED_MEDIA_TYPE;

export class StatementImportRuleError extends Error {
  override readonly name = 'StatementImportRuleError';
}

/** The retention question, before anybody has answered it. */
export interface RetentionUndecided {
  readonly state: 'UNDECIDED';
}

/**
 * The answer, recorded whole. Every field is required together: a period with
 * no basis is a number nobody can defend, and a basis with no pack version
 * cannot be traced back to the decision that produced it.
 */
export interface RetentionDecided {
  readonly state: 'DECIDED';
  readonly decidedAt: Date;
  /** ISO-8601 duration. The decision owns the number; this module never does. */
  readonly retentionPeriod: string;
  readonly basis: string;
  readonly packVersion: string;
}

export type ImportRetention = RetentionUndecided | RetentionDecided;

/** The versions that processed this file. All four or none. */
export interface ProcessingVersions {
  readonly parserVersion: string;
  readonly mappingVersion: string;
  readonly normalizationVersion: string;
  readonly fingerprintVersion: string;
}

/** Safe counts. Numbers, never values. */
export interface ImportCounts {
  readonly rowCount: number;
  readonly validRowCount: number;
  readonly invalidRowCount: number;
  readonly exactDuplicateCount: number;
  readonly probableDuplicateCount: number;
  readonly committedTransactionCount: number;
}

export const NO_ROWS: ImportCounts = Object.freeze({
  rowCount: 0,
  validRowCount: 0,
  invalidRowCount: 0,
  exactDuplicateCount: 0,
  probableDuplicateCount: 0,
  committedTransactionCount: 0,
});

export interface StatementImport {
  readonly id: StatementImportId;
  readonly tenantId: string;
  readonly userId: string;
  /** The ONE account this import targets. Chosen by the person; immutable. */
  readonly accountRef: CanonicalAccountRef;
  readonly connectionRef: ConnectionRef | null;
  readonly state: ImportState;
  readonly stateChangedAt: Date;
  readonly mediaType: SupportedMediaType;
  readonly retention: ImportRetention;
  readonly versions: ProcessingVersions | null;
  readonly counts: ImportCounts;
  readonly reconciliationStatus: ReconciliationStatus;
  /** The balance the FILE stated. Never one derived by summing rows. */
  readonly statedBalance: StatedStatementBalance | null;
  readonly refusalCode: ImportRefusalCode | null;
  readonly committedAt: Date | null;
  readonly erasedAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
}

export interface NewStatementImport {
  readonly id: StatementImportId;
  readonly tenantId: string;
  readonly userId: string;
  readonly accountRef: CanonicalAccountRef;
  readonly connectionRef: ConnectionRef | null;
  /**
   * The retention decision, ALREADY TAKEN.
   *
   * It is a constructor argument rather than something recorded afterwards
   * because the ordering guarantee starts one step earlier than most people
   * expect: not "before the bytes", but before the import row itself. When
   * retention refuses, the honest outcome is that NOTHING durable exists —
   * no source, no rows, and no import row either. An import row created first
   * and decided second would leave a durable record of a subject's
   * statement-import attempt governed by a decision nobody took, which is a
   * smaller version of exactly the state the gate exists to prevent.
   *
   * `UNDECIDED` remains expressible because the database column defaults to
   * it and a row could be read back in that state; it is not reachable
   * through this factory.
   */
  readonly retention: RetentionDecided;
  readonly createdAt: Date;
}

/**
 * A DRAFT import with its retention decision already recorded. Nothing
 * durable about the FILE exists yet — the source guard (migration 0100,
 * SQLSTATE KAR54) reads this row's `retention_state` before it will accept a
 * single byte.
 */
export function startImport(fields: NewStatementImport): StatementImport {
  return Object.freeze({
    id: fields.id,
    tenantId: fields.tenantId,
    userId: fields.userId,
    accountRef: fields.accountRef,
    connectionRef: fields.connectionRef,
    state: 'DRAFT' satisfies ImportState,
    stateChangedAt: fields.createdAt,
    mediaType: SUPPORTED_MEDIA_TYPE,
    retention: Object.freeze(fields.retention),
    versions: null,
    counts: NO_ROWS,
    reconciliationStatus: 'NOT_AVAILABLE' satisfies ReconciliationStatus,
    statedBalance: null,
    refusalCode: null,
    committedAt: null,
    erasedAt: null,
    version: 1,
    createdAt: fields.createdAt,
  });
}

/**
 * Records the retention decision. Write-once: a second call throws rather
 * than overwriting, because a rewritten decision leaves durable records
 * governed by something no longer written down.
 */
export function recordRetentionDecision(
  current: StatementImport,
  decision: Omit<RetentionDecided, 'state'>,
): StatementImport {
  if (current.retention.state === 'DECIDED') {
    throw new StatementImportRuleError(
      `statement import ${current.id} already recorded a retention decision; it may not be ` +
        'withdrawn or rewritten',
    );
  }
  if (current.state !== 'DRAFT') {
    throw new StatementImportRuleError(
      `statement import ${current.id} is ${current.state}; the retention decision is taken while ` +
        'the import is still a DRAFT, before the first durable byte of the source exists',
    );
  }
  return Object.freeze({
    ...current,
    retention: Object.freeze({ state: 'DECIDED' as const, ...decision }),
    version: current.version + 1,
  });
}

/** What a transition may carry alongside the new state. */
export interface TransitionPatch {
  readonly versions?: ProcessingVersions;
  readonly counts?: ImportCounts;
  readonly reconciliationStatus?: ReconciliationStatus;
  readonly statedBalance?: StatedStatementBalance | null;
  readonly refusalCode?: ImportRefusalCode | null;
}

/**
 * Moves the import, refusing anything the lifecycle does not permit.
 *
 * Three rules are enforced here rather than left to callers:
 *
 * 1. **The transition itself** — the explicit legal-move list in
 *    `import-state.ts`, which refuses `PARSING -> COMMITTED` and every other
 *    shape that skips review.
 * 2. **Retention before anything but DRAFT** — an import cannot reach
 *    `SOURCE_STORED` with the question open, which is the same claim the
 *    source guard makes about the bytes, stated about the lifecycle.
 * 3. **No committed count outside the committing states** — the review
 *    guarantee as an invariant on the value, matching the CHECK in 0100.
 */
export function transitionTo(
  current: StatementImport,
  to: ImportState,
  at: Date,
  patch: TransitionPatch = {},
): StatementImport {
  const refusal = checkTransition(current.state, to);
  if (refusal !== null) {
    throw new StatementImportRuleError(`statement import ${current.id}: ${refusal}`);
  }
  if (to !== 'REJECTED' && to !== 'FAILED' && to !== 'ERASED' && current.retention.state !== 'DECIDED') {
    throw new StatementImportRuleError(
      `statement import ${current.id} may not reach ${to} with its retention question open: ` +
        'nothing durable about a subject’s statement may exist until somebody has decided how ' +
        'long it may be kept',
    );
  }

  const counts = patch.counts ?? current.counts;
  if (!mayHaveCommittedTransactions(to) && counts.committedTransactionCount !== 0) {
    throw new StatementImportRuleError(
      `statement import ${current.id} cannot be ${to} while reporting ` +
        `${counts.committedTransactionCount} committed transactions: a canonical transaction ` +
        'exists only after the subject reviewed and the commit ran',
    );
  }

  return Object.freeze({
    ...current,
    state: to,
    stateChangedAt: at,
    versions: patch.versions ?? current.versions,
    counts,
    reconciliationStatus: patch.reconciliationStatus ?? current.reconciliationStatus,
    statedBalance:
      patch.statedBalance === undefined ? current.statedBalance : patch.statedBalance,
    refusalCode: patch.refusalCode === undefined ? current.refusalCode : patch.refusalCode,
    committedAt: to === 'COMMITTED' ? at : to === 'ERASED' ? current.committedAt : null,
    erasedAt: to === 'ERASED' ? at : current.erasedAt,
    version: current.version + 1,
  });
}

/**
 * Whether this import may still be committed.
 *
 * Deliberately a function rather than a boolean field: a stored flag would be
 * a second source of truth about the state machine, and the two would
 * eventually disagree about an import somebody is looking at.
 */
export function awaitsSubjectDecision(current: StatementImport): boolean {
  return current.state === 'REVIEW_REQUIRED';
}
