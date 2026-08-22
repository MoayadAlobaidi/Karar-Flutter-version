/**
 * `FinancialConnectionRetentionDecisionPort` — the retention question, asked
 * before anything durable is written, declared INWARD.
 *
 * ## The claim this port exists to make true
 *
 * Migration 0096's header, migration 0097's header, and this module's
 * MODULE.md all say the same thing about both tables:
 *
 *   Retention: UNRESOLVED — the financial-data retention decision is a legal
 *   one and has not been taken, so no period is written here. Non-local
 *   durable creation fails closed until a PolicyPack decision exists; LOCAL
 *   and TEST run on clearly synthetic fixtures with no legal effect.
 *
 * `modules/financial-accounts` learned what happens when that is a paragraph
 * and nothing else: `CreateManualAccount` asked nothing and wrote
 * unconditionally, so on a staging or production database the platform would
 * have accumulated real financial records under a paragraph promising it
 * would not. **A retention claim that no code path can refuse is worse than
 * an absent one, because it is believed.** This port is why the claim above
 * is true for this module from its first line rather than from a later
 * remediation.
 *
 * ## Why this module is governed at all, when it holds no money
 *
 * Neither table stores an amount. Both are still `HIGHLY_SENSITIVE_FINANCIAL`
 * subject-owned records, and `account_source_links` in particular holds an
 * encrypted identifier that another party uses to name this person's account.
 * "It is only metadata" is exactly the argument that would leave the most
 * durable identifier in the system ungoverned.
 *
 * ## The vocabulary
 *
 * The four states mirror `packages/jurisdiction-policy`'s `PolicyDecision`
 * (jurisdiction-policy.md §8) and the port of the same shape in
 * `modules/financial-accounts`. A decision slot never encodes "undecided" as
 * a default value, an empty object that reads as permission, or an absent key
 * that reads as denial.
 *
 *   DECIDED               a reviewed period exists, with the basis and the
 *                         approval evidence that carry the actual claim. A
 *                         period without a basis is an assertion, so the type
 *                         requires both.
 *   PENDING_LEGAL_REVIEW  the question is with legal review. A denial with a
 *                         stated reason, not an error.
 *   UNAVAILABLE           the decision could not be resolved at all. Same
 *                         denial posture, different provenance, and
 *                         deliberately distinct so an operator can tell
 *                         "nobody has decided" from "we could not ask".
 *   NOT_APPLICABLE        retention law does not reach the dataset.
 *
 * **NOT_APPLICABLE is never a valid answer for either dataset here, and the
 * gate treats it as a refusal.** A provider answering it would be asserting
 * that the record of which sources feed a person's accounts — and the
 * encrypted identifier a source uses for them — is outside retention law.
 * That is a defect in the provider, and accepting it as permission would be
 * the precise failure this gate exists to prevent.
 *
 * ## What an implementation may NOT do
 *
 * - substitute a hardcoded duration: inventing "seven years" in code is
 *   taking the legal decision, which is not engineering's to take;
 * - reuse the LOCAL fixture outside local development, where it is labelled
 *   as having no legal effect and would be a lie;
 * - mint an approval reference. Absence of evidence means not approved
 *   (`packages/jurisdiction-policy/src/lifecycle.ts`).
 */

import type { ConnectionsPrincipal } from '../principal.js';

/**
 * The durable datasets this module gates. Both are SUBJECT_OWNED and
 * `HIGHLY_SENSITIVE_FINANCIAL`; the names are the table names so a refusal
 * says exactly which store was refused.
 */
export const RETENTION_GOVERNED_DATASETS = [
  'financial_connections',
  'account_source_links',
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

export interface FinancialConnectionRetentionDecisionPort {
  /**
   * The retention decision governing one durable dataset, for one principal.
   *
   * Answers rather than throws for every expected outcome, including "we
   * could not resolve it" — a port that throws on an unresolved decision
   * makes the caller unable to tell a policy gap from a broken dependency,
   * and both would then be logged as errors nobody triages.
   */
  decideFor(
    actor: ConnectionsPrincipal,
    dataset: RetentionGovernedDataset,
  ): Promise<FinancialRetentionDecision>;
}

/**
 * Whether a decision permits a durable write.
 *
 * **`DECIDED` alone is not enough.** A decision claiming a period with no
 * basis or no approval reference is an assertion someone typed, and absence
 * of evidence means not approved — so the check is on the evidence, not on
 * the word.
 */
export function permitsDurableWrite(decision: FinancialRetentionDecision): boolean {
  return (
    decision.state === 'DECIDED' &&
    typeof decision.basis === 'string' &&
    decision.basis.trim() !== '' &&
    typeof decision.approvalReference === 'string' &&
    decision.approvalReference.trim() !== ''
  );
}
