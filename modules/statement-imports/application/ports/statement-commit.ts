/**
 * `StatementCommitPort` — the atomic unit of work that turns reviewed rows
 * into a person's financial records.
 *
 * ## Why this is ONE port and not five repositories
 *
 * A commit writes into two bounded contexts at once: the canonical
 * transactions, revisions and provenance that `modules/transactions` owns,
 * and the row links and import state this module owns. **They must land
 * together or not at all.** If they do not, the two failure modes are both
 * silent and both terrible: transactions written without their row links
 * means a retry writes them a second time, and row links written without
 * their transactions means an import that reports success over records that
 * do not exist.
 *
 * So the contract is a single call with a single guarantee — one database
 * transaction, no subset — rather than a sequence a caller is trusted to get
 * right. `CommitStatementImport` cannot write a partial commit because the
 * port gives it no way to express one.
 *
 * ## Idempotency is part of the contract, not of the caller
 *
 * The implementation re-reads the import INSIDE the transaction. If it is
 * already `COMMITTED`, it writes nothing and answers `alreadyCommitted: true`
 * with the transaction ids the first commit produced. That is what makes a
 * retry after an ambiguous response safe: the caller that never saw the first
 * response gets the same answer, and nobody's spending is recorded twice.
 *
 * The row link (`statement_import_rows.committed_transaction_id`) is what
 * makes that possible, and migration 0101 makes it write-once with SQLSTATE
 * `KAR56` — so even a caller that bypassed this port could not move or clear
 * it to make a second commit look like a first.
 *
 * ## What the plan carries, and what it deliberately does not
 *
 * Everything is resolved BEFORE the transaction opens: identifiers minted,
 * fingerprints computed, categories decided, narrative ready to encrypt. The
 * implementation opens the transaction, writes, and closes. Nothing inside it
 * calls a key provider, a policy pack, or another service — holding a
 * database transaction open across a network call is how a connection pool
 * starves under load, and this transaction is the widest one in the module.
 *
 * The plan carries no raw statement bytes, no object reference, and no
 * plaintext beyond the narrative that is about to become a transaction's own
 * description. The outbox notice carries identifiers only.
 *
 * ## Where the implementation is, and where the rows are written
 *
 * The rows a commit writes into `public.transactions`,
 * `public.transaction_revisions`, `public.transaction_provenance` and
 * `public.transaction_category_assignments` belong to `modules/transactions`,
 * and that is where the code that writes them lives —
 * `PrismaStatementCommitWriter`, satisfying `ImportedRecordCommitPort` that
 * module declares, on the same principle as `PrismaFinancialRecordEraser`
 * living there and satisfying a need `modules/financial-accounts` has.
 *
 * The source freshness observation crosses the same way for the same reason.
 * `public.account_source_links` belongs to `modules/financial-connections`,
 * and `PrismaSourceObservationWriter` there satisfies
 * `SourceObservationWriterPort` that module declares, on the open handle.
 * **This module writes no table it does not own, and the observation stays
 * inside the transaction rather than becoming an event** — a lagging
 * freshness report is untidy, but a link claiming a successful import that
 * rolled back is false, and only one of the two can be made unwritable.
 *
 * This port's own implementation, `PrismaStatementCommitUnitOfWork`, opens the
 * ONE transaction, writes this module's own rows in it, and hands the open
 * handle over for the rows belonging to the other two. That handle is what
 * made the split possible without giving up atomicity: a repository that
 * opens its own transaction per record could never be part of somebody else's
 * unit of work.
 *
 * The PORT stays declared here, because the module that owns the atomicity
 * requirement is the module that declares the contract — and because
 * `modules/transactions` cannot import this module without making a cycle,
 * which is why the contract it fills is declared on ITS side rather than
 * aliased from this one the way the eraser is.
 */

import type { CalendarDay } from '@karar/shared-kernel';

import type { HsfField } from '../../domain/hsf-field.js';
import type { DirectionMapping, SourceDirection } from '../../domain/statement-row.js';
import type { ProcessingVersions, StatementImport } from '../../domain/statement-import.js';
import type {
  CanonicalAccountRef,
  StatementImportId,
  StatementImportRowId,
} from '../../domain/refs.js';
import type { ImportsPrincipal } from '../principal.js';

/** One staged row, prepared for the write. Everything is already resolved. */
export interface PreparedRowCommit {
  readonly rowId: StatementImportRowId;
  readonly rowNumber: number;
  /** Minted before the transaction opens, so a retry can compare against it. */
  readonly transactionId: string;
  readonly revisionId: string;
  readonly provenanceId: string;
  readonly categoryAssignmentId: string;
  readonly accountRef: CanonicalAccountRef;
  readonly bookingDate: CalendarDay;
  readonly valueDate: CalendarDay | null;
  readonly eventOccurredAt: Date | null;
  readonly sourceTimezone: string | null;
  /** Exact minor units, signed under the canonical convention. */
  readonly amountMinorUnits: bigint;
  readonly currencyCode: string;
  readonly description: HsfField;
  readonly merchant: HsfField | null;
  readonly sourceDirection: SourceDirection;
  readonly directionMapping: DirectionMapping;
  readonly dedupFingerprint: string;
  readonly fingerprintVersion: string;
  readonly occurrenceOrdinal: number;
  /**
   * A category assigned by an exact, reviewed rule — or `null`.
   *
   * `null` is the ordinary answer and is not a gap to be filled later by
   * something cleverer. Nothing in this module scores, ranks, or guesses a
   * category: an assignment is a person's choice or an exact-match rule, and
   * a probabilistic one on an imported statement would put a label a machine
   * invented onto a financial record, at scale, in one action.
   */
  readonly categoryCode: string | null;
  readonly categoryRuleVersion: string | null;
}

/**
 * The identifier-only notice the commit enqueues.
 *
 * **Two identifiers and an instant. Nothing else, and deliberately not even a
 * count.**
 *
 * The platform's `assertEventPayloadAllowed` is exact about what
 * `identifier-only` means for a `HIGHLY_SENSITIVE_FINANCIAL` event: an id
 * field or an occurred-at field, and anything else needs a catalogue
 * exemption naming an owner, a reason and a reviewer. A count is not an
 * identifier — "this import produced 312 transactions" is a fact about a
 * person's spending volume, and it would travel into a relay, a bus, a
 * consumer and a log.
 *
 * That rule is right, and the honest response is to carry less rather than to
 * declare an exemption for convenience. A consumer that needs the count reads
 * it from the import the notice names. The count still reaches the CALLER, in
 * `StatementCommitReceipt`, which does not leave the process.
 */
export interface StatementImportCommittedNotice {
  readonly importId: StatementImportId;
  readonly accountId: string;
  readonly occurredAt: Date;
}

/**
 * What this module reports about the import having arrived through a source.
 *
 * It is a description of the DELIVERY, not of a row: no link id, no version,
 * no column. `modules/financial-connections` turns it into whatever its own
 * table requires, and it is stated here in this module's own vocabulary so
 * that the plan a use case builds stays free of the other module's types.
 */
export interface SourceFreshnessObservation {
  readonly connectionId: string;
  readonly observedAt: Date;
  readonly coverageStart: CalendarDay;
  readonly coverageEnd: CalendarDay;
}

export interface StatementCommitPlan {
  /**
   * The import as `COMMITTING`, written FIRST and inside the same transaction.
   *
   * The lifecycle has no `REVIEW_REQUIRED -> COMMITTED` edge, in the domain or
   * in the database (`statement_imports_guard`, SQLSTATE `KAR51`), and that is
   * not pedantry: a commit that could move an import straight from reviewed to
   * committed is a commit that could be written by anything holding a
   * reviewed import, with no state that says the write is under way. So the
   * implementation walks the real path — `REVIEW_REQUIRED -> COMMITTING ->
   * COMMITTED` — with both steps inside ONE transaction, so `COMMITTING` is a
   * state the write passes through rather than one anybody can observe
   * half-finished.
   */
  readonly committingImport: StatementImport;
  /** The import as it should be AFTER the commit: COMMITTED, counts filled. */
  readonly committedImport: StatementImport;
  /** The version the caller read, so a concurrent edit loses rather than wins. */
  readonly expectedVersion: number;
  readonly rows: readonly PreparedRowCommit[];
  readonly versions: ProcessingVersions;
  /** The acting subject, recorded as the actor on every revision and provenance. */
  readonly actorId: string;
  readonly committedAt: Date;
  readonly notice: StatementImportCommittedNotice;
  readonly freshness: SourceFreshnessObservation | null;
}

export interface StatementCommitReceipt {
  readonly committedTransactionCount: number;
  /** True when this call found the work already done and wrote nothing. */
  readonly alreadyCommitted: boolean;
  readonly transactionIds: readonly string[];
}

/** A commit refused by a rule the database enforces. Never a driver message. */
export class StatementCommitConflictError extends Error {
  override readonly name = 'StatementCommitConflictError';

  constructor(
    readonly kind: 'duplicate_transaction' | 'occurrence_not_next' | 'version_conflict',
    message: string,
  ) {
    super(message);
  }
}

export interface StatementCommitPort {
  /**
   * Writes everything, or nothing.
   *
   * One database transaction covers: the canonical transactions, their
   * revision 1, their provenance, the deterministic category assignments
   * where a rule applied, the staged rows' links back to what they produced,
   * the source freshness observation, the identifier-only outbox notice, and
   * the import's COMMITTED state. A failure at any point leaves no subset.
   */
  commit(actor: ImportsPrincipal, plan: StatementCommitPlan): Promise<StatementCommitReceipt>;
}

/**
 * `DeterministicCategoryPort` — an exact, reviewed rule, or nothing.
 *
 * Declared here rather than in its own file because it exists only to fill
 * one field of `PreparedRowCommit`, and separating it would suggest there is
 * a categorisation subsystem in this module. There is not.
 *
 * **Exact match only.** No scoring, no ranking, no confidence, no nearest
 * neighbour, no model. The reason is scale: a manual entry mislabelled by a
 * guess is one wrong label a person notices; an import mislabelled by a guess
 * is four hundred wrong labels applied in one action, on records the person
 * did not type and cannot easily audit.
 */
export interface DeterministicCategoryMatch {
  readonly categoryCode: string;
  readonly ruleVersion: string;
}

export interface DeterministicCategoryPort {
  /**
   * The category an exact reviewed rule assigns to this normalised narrative,
   * or `null` when no rule matches. `null` is the ordinary answer.
   */
  match(
    actor: ImportsPrincipal,
    normalizedNarrative: string,
  ): Promise<DeterministicCategoryMatch | null>;
}
