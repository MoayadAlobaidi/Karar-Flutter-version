/**
 * `TransactionRetentionDecisionPort` — how long a transaction record may be
 * kept, asked as a question rather than assumed as a constant.
 *
 * ## The defect this exists to close
 *
 * MODULE.md declares the retention of every table in this module as
 * **unresolved — a legal decision nobody here may take**, and says non-local
 * ingestion "fails closed until a PolicyPack decision exists". Nothing
 * enforced it. `CreateManualTransaction` wrote `HIGHLY_SENSITIVE_FINANCIAL`
 * rows with no retention decision in reach, so the claim was documentation
 * about behaviour the code did not have. A retention declaration that nothing
 * checks is worse than none: it reads, to an auditor and to the next
 * engineer, as a control.
 *
 * ## The three answers, and why there are exactly three
 *
 *   `DECIDED`               a period exists and the decision names its basis.
 *   `PENDING_LEGAL_REVIEW`  the question is with legal review. A refusal with
 *                           known provenance.
 *   `UNAVAILABLE`           nothing could answer — no pack activated, no
 *                           jurisdiction resolved, the source unreachable.
 *
 * The last two are separate because "we know we have not decided" and "we
 * could not find out" are different facts with different owners, and
 * collapsing them into one denial loses the only signal that says which one
 * to go and fix. The same three-way shape as the platform's `PolicyDecision`
 * (packages/jurisdiction-policy/src/decision.ts), stated in this module's own
 * vocabulary so the module does not depend on a policy package to express a
 * refusal.
 *
 * **There is no fourth arm meaning "assume something".** A default period is
 * a legal claim, and inventing one is the exact failure this port exists to
 * make impossible.
 *
 * ## Where the gate sits
 *
 * `CreateManualTransaction` asks BEFORE it fingerprints, BEFORE any narrative
 * is encrypted, and BEFORE the first write. Refusing after encryption would
 * still have produced ciphertext of a subject's narrative, and refusing after
 * a write would leave a durable record whose disposal date nobody has
 * decided — which is the state the gate exists to prevent, not a smaller
 * version of it.
 *
 * ## The environment rule lives in the adapter, not here
 *
 * The use case accepts `DECIDED` and refuses the other two, and it does not
 * look at the environment or at `effect`. It must not: an application layer
 * that branches on the deployment environment is one edit away from branching
 * on other things, and this module already forbids branching on jurisdiction
 * (architecture test 12) for the same reason. What keeps a no-legal-effect
 * decision out of a deployed environment is that the LOCAL/TEST fixture
 * refuses to be constructed anywhere else — see
 * `infrastructure/providers/local-synthetic-retention-decision-provider.ts`.
 *
 * ## Coordination
 *
 * `modules/financial-accounts` declares `FinancialAccountRetentionDecisionPort`
 * with the same three-arm shape for its own tables. Same shape, different
 * owner, deliberately not shared: each module states the retention question
 * for the data IT owns, and a shared port would make one module's lifecycle
 * declaration answerable by another module's adapter.
 */

import type { TransactionsPrincipal } from './principal-context.js';

/**
 * Whether a decision carries legal weight.
 *
 * `SYNTHETIC_NO_LEGAL_EFFECT` is a fixture's self-declaration, and it is a
 * field rather than a naming convention so that the fact survives a log line,
 * a serialized payload, and a reader who has never opened the adapter.
 */
export const RETENTION_DECISION_EFFECTS = ['LEGAL', 'SYNTHETIC_NO_LEGAL_EFFECT'] as const;
export type RetentionDecisionEffect = (typeof RETENTION_DECISION_EFFECTS)[number];

export interface RetentionDecided {
  readonly state: 'DECIDED';
  /** ISO-8601 duration. The decision owns the number; this module never does. */
  readonly retentionPeriod: string;
  /** The review, opinion, instrument — or, for a fixture, the fixture. */
  readonly basis: string;
  readonly effect: RetentionDecisionEffect;
}

export interface RetentionPendingLegalReview {
  readonly state: 'PENDING_LEGAL_REVIEW';
  /** The question that is with review, stated so it can be chased. */
  readonly openQuestion: string;
}

export interface RetentionUnavailable {
  readonly state: 'UNAVAILABLE';
  /** Why nothing could answer — never a period, never a guess. */
  readonly reason: string;
}

export type TransactionRetentionDecision =
  | RetentionDecided
  | RetentionPendingLegalReview
  | RetentionUnavailable;

export interface TransactionRetentionDecisionPort {
  /**
   * The retention decision governing this principal's transaction records.
   *
   * The principal is a parameter because retention is per jurisdiction and a
   * jurisdiction is resolved per subject — the adapter needs to know whose
   * question it is answering. It is a port parameter, never a use-case input:
   * `principal-context.ts` explains why that distinction is the whole
   * isolation argument.
   *
   * An implementation that cannot answer returns `UNAVAILABLE`; it does not
   * throw, and above all it does not substitute a period.
   */
  decide(principal: TransactionsPrincipal): Promise<TransactionRetentionDecision>;
}
