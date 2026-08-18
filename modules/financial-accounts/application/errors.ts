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
import type { AccountSourceLinkErasureOutcome } from './ports/account-source-link-eraser.js';
import type { PaymentInstrumentErasureOutcome } from './ports/payment-instrument-eraser.js';
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

/**
 * The store failed. Never carries store internals outward.
 *
 * `operation` is this module's own vocabulary ('read own account'), never the
 * store's. `cause` holds the original throw for the ONE place allowed to log
 * it — the boundary that turns this into a response, per the logging rule in
 * `packages/platform/src/observability/logger.ts` — and is defined
 * NON-ENUMERABLE so that `JSON.stringify`, object spread, structured logging
 * and an RFC 7807 body all drop it without anyone remembering to. A field that
 * must not be serialized is safer as a field that cannot be.
 */
export interface StoreFailure {
  readonly kind: 'store_failure';
  readonly message: string;
  readonly operation: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
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
 * The account was NOT deleted because the source links feeding it could not
 * be erased. Its own kind rather than a flavour of `erasure_incomplete`,
 * because the two erasures are two ports with two implementers and an
 * operator reading this needs to know WHICH store refused — the remedies live
 * in different modules.
 *
 * Source links are erased first, so this arm means nothing else was attempted:
 * the account, its snapshots and every financial record are all still there.
 *
 * `cause` holds the original throw for the ONE place allowed to log it and is
 * defined NON-ENUMERABLE, for the reason given on `StoreFailure`.
 */
export interface SourceLinkErasureIncomplete {
  readonly kind: 'source_link_erasure_incomplete';
  readonly accountSourceLinksDeleted: number;
  readonly outcome: AccountSourceLinkErasureOutcome['kind'];
  readonly message: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
}

/**
 * The account was NOT deleted because the payment instruments spending from
 * it could not be erased. Its own kind rather than a flavour of
 * `erasure_incomplete` or of `source_link_erasure_incomplete`, for the reason
 * given above: three erasures are three ports with three implementers, and an
 * operator reading this needs to know WHICH store refused, because the
 * remedies live in different modules.
 *
 * Instruments are erased after the source links and before the records, so
 * this arm means the links really have gone — the count says so rather than
 * pretending the request left no trace — and that nothing was attempted
 * beyond them: the account, its snapshots and every financial record are all
 * still there.
 *
 * `cause` holds the original throw for the ONE place allowed to log it and is
 * defined NON-ENUMERABLE, for the reason given on `StoreFailure`.
 */
export interface InstrumentErasureIncomplete {
  readonly kind: 'instrument_erasure_incomplete';
  readonly paymentInstrumentsDeleted: number;
  readonly accountSourceLinksDeleted: number;
  readonly outcome: PaymentInstrumentErasureOutcome['kind'];
  readonly message: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
}

/**
 * The account was NOT deleted because the records scoped to it could not be
 * erased. Carries whatever the eraser did manage to remove, because a caller
 * that has to tell a person what happened needs the true number and not a
 * guess.
 *
 * It carries the source-link and instrument counts too, and those numbers are
 * usually NOT zero: both are erased before the records, so by the time this
 * arm is reachable they have already gone. A caller reporting "nothing
 * happened" here would be wrong about the rows that carried the account's
 * external identity and about the instruments that spent from it.
 *
 * `financialRecordRelationshipsDeleted` is `undefined` when the eraser
 * measured no relationships rather than measured none — see the port. Folding
 * the two together here would turn "nobody counted" into "there were none".
 */
export interface ErasureIncomplete {
  readonly kind: 'erasure_incomplete';
  readonly deleted: FinancialRecordErasureCounts;
  readonly financialRecordRelationshipsDeleted?: number;
  readonly accountSourceLinksDeleted: number;
  readonly paymentInstrumentsDeleted: number;
  readonly outcome: FinancialRecordErasureOutcome['kind'];
  readonly message: string;
}

/**
 * The source links, the instruments and the records were all erased but the
 * account row itself was not removed — the one window cross-module deletion
 * leaves open (see `delete-own-account.ts`). Reported as its own kind so it
 * can never be mistaken for success and never be mistaken for "nothing
 * happened", which are the two comfortable lies available at this point.
 */
export interface DeletionPartiallyApplied {
  readonly kind: 'deletion_partially_applied';
  readonly deleted: FinancialRecordErasureCounts;
  readonly financialRecordRelationshipsDeleted?: number;
  readonly accountSourceLinksDeleted: number;
  readonly paymentInstrumentsDeleted: number;
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
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
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
  | SourceLinkErasureIncomplete
  | InstrumentErasureIncomplete
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

/**
 * Wrap an unexpected store throw without leaking its internals to a client.
 *
 * The message used to interpolate the caught error, directly under a comment
 * promising it did not. A driver message is not ours to show: it can carry a
 * connection string with credentials, the SQL that failed, a table name, a
 * host and port, or — worst here — a fragment of the row that failed, which in
 * this module is the financial data the whole encryption story exists to
 * protect. It is also unstable, so a client that keyed on it would break when
 * the driver was upgraded.
 */
export function storeFailure(operation: string, error: unknown): StoreFailure {
  const failure = {
    kind: 'store_failure' as const,
    operation,
    message:
      `${operation} could not be completed because the store did not answer. The reason is ` +
      'deliberately not described here: it comes from the database driver, and driver text can ' +
      'carry credentials, SQL, or a fragment of the record itself. It is logged once at the ' +
      'boundary, against this request',
  };
  // Non-enumerable: invisible to JSON.stringify, spread, and any serializer,
  // reachable only by code that names it.
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as StoreFailure;
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
  const failure = {
    kind: 'record_presence_unavailable' as const,
    message:
      `the currency was not changed: whether this account holds ${store} could not be established. ` +
      'The rule fails closed — stored minor units are scaled by their currency exponent, so ' +
      're-denominating an account that might hold records would silently rescale every figure ' +
      'already recorded. Why the question could not be answered is logged once at the boundary',
  };
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as RecordPresenceUnavailable;
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
