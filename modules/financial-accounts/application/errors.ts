/**
 * Expected failure shapes of the financial-account use cases (backend.md §9).
 * Every kind is machine-readable for RFC 7807 mapping.
 *
 * **Denial kinds deliberately avoid oracles.** An account id that does not
 * exist, an account id belonging to another user in the same tenant, and an
 * account id belonging to another tenant all answer `account_not_found` —
 * identically, with the same message. Anything else turns a guessed
 * identifier into a membership test: "not found" versus "forbidden" tells the
 * guesser that the account is real and whose it is. RLS produces this outcome
 * structurally (the row is simply not visible), and these types keep the
 * application layer from re-introducing the distinction on the way out.
 */

import type { FinancialAccountRuleViolation } from '../domain/errors.js';
import type {
  FinancialRecordErasureCounts,
  FinancialRecordErasureOutcome,
} from './ports/financial-record-eraser.js';
import type {
  FinancialRetentionDecision,
  RetentionGovernedDataset,
} from './ports/financial-account-retention-decision.js';
import type { MissingPrincipalContext } from './principal.js';

/**
 * No account with that id is visible to the acting principal. Says nothing
 * about whether one exists for anyone else — see the file header.
 */
export interface AccountNotFound {
  readonly kind: 'account_not_found';
  readonly message: string;
}

/** The named catalogue entry does not exist, or is not selectable. */
export interface InstitutionNotSelectable {
  readonly kind: 'institution_not_selectable';
  readonly message: string;
}

/** A domain rule refused the request; `violation` says which. */
export interface RuleViolated {
  readonly kind: 'rule_violated';
  readonly violation: FinancialAccountRuleViolation;
  readonly message: string;
}

/**
 * The account changed since the caller read it. The caller re-reads and
 * decides; this module never silently overwrites a concurrent edit, because
 * the losing edit is usually the one a person made on their other device.
 */
export interface VersionConflict {
  readonly kind: 'version_conflict';
  readonly expectedVersion: number;
  readonly message: string;
}

/** The store failed. Never carries store internals outward. */
export interface StoreFailure {
  readonly kind: 'store_failure';
  readonly message: string;
}

/**
 * Durable financial creation was refused because the retention decision
 * governing the dataset is not resolved.
 *
 * Carries the decision itself, not a rephrasing of it: an operator needs to
 * know whether the answer was "legal has not ruled" or "we could not ask",
 * and those have different remedies. Deliberately NOT a `store_failure` — no
 * store was touched, and reporting it as one would send someone to look at
 * the database for a problem that is a policy gap.
 */
export interface RetentionUnresolved {
  readonly kind: 'retention_unresolved';
  readonly dataset: RetentionGovernedDataset;
  readonly decision: FinancialRetentionDecision;
  readonly message: string;
}

/**
 * The account was NOT deleted because the records scoped to it could not be
 * erased. Carries whatever the eraser did manage to remove, because a caller
 * that has to tell a person what happened needs the true number and not a
 * guess.
 */
export interface ErasureIncomplete {
  readonly kind: 'erasure_incomplete';
  readonly deleted: FinancialRecordErasureCounts;
  readonly outcome: FinancialRecordErasureOutcome['kind'];
  readonly message: string;
}

/**
 * The records were erased but the account row itself was not removed — the
 * one window cross-module deletion leaves open (see `delete-own-account.ts`).
 * Reported as its own kind so it can never be mistaken for success and never
 * be mistaken for "nothing happened", which are the two comfortable lies
 * available at this point.
 */
export interface DeletionPartiallyApplied {
  readonly kind: 'deletion_partially_applied';
  readonly deleted: FinancialRecordErasureCounts;
  readonly message: string;
}

/**
 * Whether the account holds financial records could not be established, so
 * the currency change was refused.
 *
 * Distinct from `rule_violated / currency_immutable_with_records`, which
 * asserts that records DO exist. Saying that when the question went
 * unanswered would be inventing a fact about a person's account; saying this
 * is the honest refusal, and the outcome is the same either way because the
 * rule fails closed.
 */
export interface RecordPresenceUnavailable {
  readonly kind: 'record_presence_unavailable';
  readonly message: string;
}

export type ListOwnAccountsError = MissingPrincipalContext | StoreFailure;

export type ReadOwnAccountError = MissingPrincipalContext | AccountNotFound | StoreFailure;

export type CreateManualAccountError =
  | MissingPrincipalContext
  | RetentionUnresolved
  | InstitutionNotSelectable
  | RuleViolated
  | StoreFailure;

export type UpdateOwnAccountError =
  | MissingPrincipalContext
  | AccountNotFound
  | InstitutionNotSelectable
  | RuleViolated
  | RecordPresenceUnavailable
  | VersionConflict
  | StoreFailure;

export type DeleteOwnAccountError =
  | MissingPrincipalContext
  | AccountNotFound
  | VersionConflict
  | ErasureIncomplete
  | DeletionPartiallyApplied
  | StoreFailure;

export type ListOwnBalanceSnapshotsError =
  | MissingPrincipalContext
  | AccountNotFound
  | StoreFailure;

export type RecordReportedBalanceError =
  | MissingPrincipalContext
  | RetentionUnresolved
  | AccountNotFound
  | RuleViolated
  | StoreFailure;

/** The one message every not-found arm uses, so no arm can drift into an oracle. */
export const ACCOUNT_NOT_FOUND: AccountNotFound = Object.freeze({
  kind: 'account_not_found' as const,
  message:
    'no such account — a guessed identifier, an account belonging to another user inside this tenant, ' +
    'and an account belonging to another tenant are all answered identically on purpose, so a caller ' +
    'learns nothing from the difference',
});

/** Wrap an unexpected store throw without leaking its internals to a client. */
export function storeFailure(operation: string, error: unknown): StoreFailure {
  return {
    kind: 'store_failure',
    message: `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}

/**
 * The refusal both halves of the record-presence question produce. Names
 * WHICH store went silent, because the remedies differ, but says nothing
 * about the records themselves — that is the other module's data, and this
 * refusal exists precisely because nobody here learned anything about it.
 */
export function recordPresenceUnavailable(
  store: string,
  error: unknown,
): RecordPresenceUnavailable {
  return {
    kind: 'record_presence_unavailable',
    message:
      `the currency was not changed: whether this account holds ${store} could not be established ` +
      `(${error instanceof Error ? error.message : String(error)}). The rule fails closed — stored ` +
      'minor units are scaled by their currency exponent, so re-denominating an account that might ' +
      'hold records would silently rescale every figure already recorded',
  };
}

/**
 * The one refusal every retention gate produces, so the wording cannot drift
 * between the two write paths that use it and so the reason is always the
 * decision's own.
 */
export function retentionUnresolved(
  dataset: RetentionGovernedDataset,
  decision: FinancialRetentionDecision,
): RetentionUnresolved {
  const because =
    decision.state === 'DECIDED'
      ? 'the decision claims DECIDED but carries no basis or no approval reference, and absence of ' +
        'evidence means not approved'
      : decision.reason;
  return {
    kind: 'retention_unresolved',
    dataset,
    decision,
    message:
      `refusing to create a durable record in ${dataset}: the retention decision governing it is ` +
      `${decision.state} — ${because}. This module's data-lifecycle declaration says non-local ` +
      'durable financial creation fails closed until a reviewed decision exists, and this is that ' +
      'gate; the remedy is a legal decision recorded in an approved policy pack, never a duration ' +
      'chosen in code',
  };
}
