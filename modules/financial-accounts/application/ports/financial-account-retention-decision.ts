/**
 * `FinancialAccountRetentionDecisionPort` — the retention question, asked
 * before anything durable is written, declared INWARD.
 *
 * ## The claim this port exists to make true
 *
 * Migration 0088's header, migration 0089's header, this module's MODULE.md,
 * and DATA_LIFECYCLE.md all say the same thing about both subject-owned
 * tables:
 *
 *   Retention: UNRESOLVED — the financial-data retention decision is a legal
 *   one and has not been taken, so no period is written here. Non-local
 *   ingestion fails closed until a PolicyPack decision exists; LOCAL and TEST
 *   run on clearly synthetic fixtures with no legal effect.
 *
 * That was documentation of an intention, not a control: `CreateManualAccount`
 * asked nothing and wrote unconditionally, so on a staging or production
 * database the platform would have accumulated real financial records under a
 * paragraph promising it would not. A retention claim that no code path can
 * refuse is worse than an absent one, because it is believed.
 *
 * ## The vocabulary, and why "we have not decided" is a first-class state
 *
 * The four states mirror `packages/jurisdiction-policy`'s `PolicyDecision`
 * (jurisdiction-policy.md §8): a decision slot never encodes "undecided" as a
 * default value, an empty object that reads as permission, or an absent key
 * that reads as denial.
 *
 *   DECIDED               — a reviewed period exists, with the basis and the
 *                           approval evidence that carry the actual claim. A
 *                           period without a basis is an assertion, so the
 *                           type requires both.
 *   PENDING_LEGAL_REVIEW  — the question is with legal review. A denial with
 *                           a stated reason, not an error.
 *   UNAVAILABLE           — the decision could not be resolved at all: no
 *                           pack bound, the source unreachable, the answer
 *                           unreadable. Same denial posture, different
 *                           provenance, and deliberately distinct so an
 *                           operator can tell "nobody has decided" from
 *                           "we could not ask".
 *   NOT_APPLICABLE        — retention law does not reach the dataset.
 *
 * **NOT_APPLICABLE is never a valid answer for either dataset this port
 * governs, and the gate treats it as a refusal.** It exists in the vocabulary
 * because the platform genuinely has datasets it fits — this module's
 * `institutions` catalogue is `NON_PERSONAL` and `NON_PERSONAL_BY_DESIGN`,
 * and no subject-derived bound applies to it — but the catalogue has no
 * runtime write path to gate (it changes by reviewed migration, and
 * `karar_app` holds SELECT only), so no caller here can legitimately receive
 * it. A provider that answers NOT_APPLICABLE for a subject's own accounts or
 * balances is asserting that a person's financial records are outside
 * retention law; that is a defect in the provider, and accepting it as
 * permission would be the precise failure this gate exists to prevent.
 *
 * ## What an implementation may NOT do
 *
 * Stated here because the constraints are the point of the port, and a
 * comment on the interface is where the next implementer will look:
 *
 * - a non-local implementation must not substitute a hardcoded duration —
 *   inventing "seven years" in code is taking the legal decision, which is
 *   not engineering's to take;
 * - a non-local implementation must not reuse the LOCAL fixture, which is
 *   labelled as having no legal effect and would be a lie anywhere else;
 * - nothing here alters the `qa/v1` pack: it is DRAFT and
 *   PENDING_LEGAL_REVIEW and decides nothing, and editing it to unblock a
 *   write would be forging the decision rather than obtaining it;
 * - nothing here creates an approval reference. Absence of evidence means not
 *   approved (`packages/jurisdiction-policy/src/lifecycle.ts`), and the field
 *   below is for carrying evidence that exists, never for minting it.
 */

import type { AccountsPrincipal } from '../principal.js';

/**
 * The durable datasets this module gates. Both are SUBJECT_OWNED and
 * `HIGHLY_SENSITIVE_FINANCIAL`; the names are the table names so a refusal
 * says exactly which store was refused.
 */
export const RETENTION_GOVERNED_DATASETS = [
  'financial_accounts',
  'financial_account_balance_snapshots',
] as const;
export type RetentionGovernedDataset = (typeof RETENTION_GOVERNED_DATASETS)[number];

export interface RetentionDecided {
  readonly state: 'DECIDED';
  readonly dataset: RetentionGovernedDataset;
  /** ISO 8601 duration, e.g. 'P7Y'. Opaque to this module; it only gates. */
  readonly retentionPeriod: string;
  /** The opinion, instrument, or review that carries the actual claim. */
  readonly basis: string;
  /** Evidence that the basis was approved. Never minted here. */
  readonly approvalReference: string;
  /** The pack version the decision was read from, for provenance. */
  readonly packVersion: string;
}

export interface RetentionPendingLegalReview {
  readonly state: 'PENDING_LEGAL_REVIEW';
  readonly dataset: RetentionGovernedDataset;
  readonly reason: string;
  readonly packVersion: string;
}

export interface RetentionUnavailable {
  readonly state: 'UNAVAILABLE';
  readonly dataset: RetentionGovernedDataset;
  readonly reason: string;
}

export interface RetentionNotApplicable {
  readonly state: 'NOT_APPLICABLE';
  readonly dataset: RetentionGovernedDataset;
  readonly reason: string;
}

export type FinancialRetentionDecision =
  | RetentionDecided
  | RetentionPendingLegalReview
  | RetentionUnavailable
  | RetentionNotApplicable;

export interface FinancialAccountRetentionDecisionPort {
  /**
   * The retention decision governing one dataset for one principal.
   *
   * The principal is a parameter because retention is a JURISDICTIONAL
   * question and the tenant is what selects the jurisdiction — a single
   * global answer would be wrong the moment a second market exists. It is
   * NOT a parameter so the caller can name a subject: it is the same
   * authenticated principal every other operation in this module acts as.
   *
   * Implementations must not throw to express "undecided". An unreachable
   * source is `UNAVAILABLE`, which is a value the gate already refuses; a
   * throw would arrive at the use case as an unexpected store failure and
   * blur the two.
   */
  decideFor(
    actor: AccountsPrincipal,
    dataset: RetentionGovernedDataset,
  ): Promise<FinancialRetentionDecision>;
}

/**
 * True only for a decision that permits a durable write.
 *
 * A single predicate, so no call site can invent its own reading of the
 * vocabulary. Note what it does NOT do: it does not inspect
 * `retentionPeriod`, because this module does not enforce a period — it
 * enforces that a decision exists, and deletion under a period is a separate
 * mechanism that has to be built once there is a period to enforce.
 */
export function permitsDurableWrite(
  decision: FinancialRetentionDecision,
): decision is RetentionDecided {
  return (
    decision.state === 'DECIDED' &&
    decision.basis.trim() !== '' &&
    decision.approvalReference.trim() !== ''
  );
}
