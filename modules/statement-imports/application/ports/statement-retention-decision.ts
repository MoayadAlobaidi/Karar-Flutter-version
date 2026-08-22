/**
 * `StatementRetentionDecisionPort` — how long a staged statement and the rows
 * parsed from it may be kept, asked as a question rather than assumed as a
 * constant.
 *
 * ## Why this gate is stricter here than anywhere else in the platform
 *
 * Every other module asks this question before writing a ROW. This one asks
 * it before writing a FILE — an entire bank statement, in one object, holding
 * every movement on somebody's account for a month. The refusal therefore has
 * to land earlier than "before the insert": it has to land before the first
 * durable byte exists anywhere, including in an object store this database
 * cannot see.
 *
 * So the ordering is fixed and is enforced twice:
 *
 * ```
 * resolve retention -> DECIDED -> encrypt the source -> durable write
 * ```
 *
 * `StoreImportSource` asks this port first and refuses on anything but
 * `DECIDED`. Independently, `statement_import_sources_guard` (migration 0100)
 * refuses to insert a source row whose parent import has not recorded a
 * decision, with SQLSTATE `KAR54` — for a direct SQL INSERT, a fixture, a
 * backfill, or an ingestion path written later by someone who never opened
 * this file. The test that proves it counts rows in all four tables after a
 * refusal and asserts **zero**, as the bootstrap superuser with RLS bypassed,
 * because counting as `karar_app` would prove the rows are hidden rather than
 * that they are absent.
 *
 * ## The four answers, and why there are exactly four
 *
 *   `DECIDED`               a period exists and the decision names its basis.
 *   `PENDING_LEGAL_REVIEW`  the question is with legal review. A refusal with
 *                           known provenance.
 *   `UNAVAILABLE`           nothing could answer — no pack activated, no
 *                           jurisdiction resolved, the source unreachable.
 *   `NOT_APPLICABLE`        the dataset is outside retention law.
 *
 * The middle two are separate because "we know we have not decided" and "we
 * could not find out" are different facts with different owners, and
 * collapsing them into one denial loses the only signal that says which one
 * to go and fix. `NOT_APPLICABLE` is present so the vocabulary can express a
 * dataset genuinely outside retention law — and it is a REFUSAL for both
 * datasets here, because a subject's bank statement and the lines parsed from
 * it are not outside retention law and no provider may claim they are.
 *
 * **There is no fifth arm meaning "assume something".** A default period is a
 * legal claim, and inventing one is the exact failure this port exists to
 * make impossible.
 *
 * ## The environment rule lives in the adapter, not here
 *
 * The use case accepts `DECIDED` and refuses the rest, and it does not look
 * at the environment. What keeps a no-legal-effect decision out of a deployed
 * environment is that the LOCAL/TEST fixture refuses to be constructed
 * anywhere else — see
 * `infrastructure/providers/local-synthetic-retention-decision-provider.ts`.
 */

import type { ImportsPrincipal } from '../principal.js';

/**
 * The datasets this module owns, as the retention question sees them.
 *
 * Two rather than four, because the four tables carry two lifetimes: the
 * source object is the subject's own file, and the staged rows plus their
 * errors are what this platform derived from it. A provider may legitimately
 * answer differently for the two — "the file goes, the parse stays" is a
 * coherent policy — and a single dataset name would make that unsayable.
 */
export const RETENTION_GOVERNED_DATASETS = [
  'statement_import_source',
  'statement_import_rows',
] as const;
export type RetentionGovernedDataset = (typeof RETENTION_GOVERNED_DATASETS)[number];

/** Whether a decision carries legal weight. */
export const RETENTION_DECISION_EFFECTS = ['LEGAL', 'SYNTHETIC_NO_LEGAL_EFFECT'] as const;
export type RetentionDecisionEffect = (typeof RETENTION_DECISION_EFFECTS)[number];

export interface RetentionDecided {
  readonly state: 'DECIDED';
  readonly dataset: RetentionGovernedDataset;
  /** ISO-8601 duration. The decision owns the number; this module never does. */
  readonly retentionPeriod: string;
  /** The review, opinion, instrument — or, for a fixture, the fixture. */
  readonly basis: string;
  readonly approvalReference: string;
  readonly packVersion: string;
  /**
   * A field rather than a naming convention, so the fact survives a log line,
   * a serialized payload, and a reader who has never opened the adapter.
   */
  readonly effect: RetentionDecisionEffect;
}

export interface RetentionPendingLegalReview {
  readonly state: 'PENDING_LEGAL_REVIEW';
  readonly dataset: RetentionGovernedDataset;
  /** The question that is with review, stated so it can be chased. */
  readonly reason: string;
  readonly packVersion: string;
}

export interface RetentionUnavailable {
  readonly state: 'UNAVAILABLE';
  readonly dataset: RetentionGovernedDataset;
  /** Why nothing could answer — never a period, never a guess. */
  readonly reason: string;
}

export interface RetentionNotApplicable {
  readonly state: 'NOT_APPLICABLE';
  readonly dataset: RetentionGovernedDataset;
  readonly reason: string;
}

export type StatementRetentionDecision =
  | RetentionDecided
  | RetentionPendingLegalReview
  | RetentionUnavailable
  | RetentionNotApplicable;

/**
 * Whether a decision permits a durable write.
 *
 * Only `DECIDED` does, and `NOT_APPLICABLE` explicitly does not. A function
 * rather than an inline comparison at each call site: there are two call
 * sites today and the rule must not be able to differ between them.
 */
export function permitsDurableWrite(decision: StatementRetentionDecision): boolean {
  return decision.state === 'DECIDED';
}

export interface StatementRetentionDecisionPort {
  /**
   * The retention decision governing one of this module's datasets for this
   * principal.
   *
   * The principal is a parameter because retention is per jurisdiction and a
   * jurisdiction is resolved per subject — the adapter needs to know whose
   * question it is answering. It is a port parameter, never a use-case input:
   * `principal.ts` explains why that distinction is the whole isolation
   * argument.
   *
   * An implementation that cannot answer returns `UNAVAILABLE`; it does not
   * throw, and above all it does not substitute a period.
   */
  decideFor(
    actor: ImportsPrincipal,
    dataset: RetentionGovernedDataset,
  ): Promise<StatementRetentionDecision>;
}
