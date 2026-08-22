/**
 * Expected failure shapes of this module's use cases (backend.md §9). Every
 * kind is machine-readable for RFC 7807 mapping.
 *
 * **Denial kinds deliberately avoid oracles.** A connection id that does not
 * exist, one belonging to another user in the same tenant, and one belonging
 * to another tenant all answer `connection_not_found` — identically, with the
 * same message; the same holds for source links and for the canonical account
 * a link is asked to point at. Anything else turns a guessed identifier into a
 * membership test. RLS produces this outcome structurally (the row is simply
 * not visible), and these types keep the application layer from
 * reintroducing the distinction on the way out.
 *
 * **No message in this file carries an external account reference, a
 * fingerprint, or a fragment of either**, including in the arms that exist
 * precisely because one of them was rejected. That is the same rule
 * `domain/errors.ts` states, restated here because this layer is where an
 * error becomes a response.
 */

import type { FinancialConnectionRuleViolation } from '../domain/errors.js';
import type {
  FinancialRetentionDecision,
  RetentionGovernedDataset,
} from './ports/financial-connection-retention-decision.js';
import type { MissingPrincipalContext } from './principal.js';

/** No connection with that id is visible to the acting principal. */
export interface ConnectionNotFound {
  readonly kind: 'connection_not_found';
  readonly message: string;
}

/** No source link with that id is visible to the acting principal. */
export interface SourceLinkNotFound {
  readonly kind: 'source_link_not_found';
  readonly message: string;
}

/**
 * The canonical account a link was asked to point at is not visible to the
 * acting principal — absent, another user's, another tenant's, or never
 * minted, indistinguishably.
 */
export interface AccountNotFound {
  readonly kind: 'account_not_found';
  readonly message: string;
}

/**
 * The account exists but may not receive a source link: it is archived,
 * closed, or in a state this module does not recognise. Distinct from
 * `account_not_found` because the remedies differ and because neither reveals
 * anything about an account the caller cannot already see.
 */
export interface AccountNotLinkable {
  readonly kind: 'account_not_linkable';
  readonly lifecycleState: string;
  readonly message: string;
}

/** The connection may not receive data: retired, unavailable, unconfigured. */
export interface ConnectionNotUsable {
  readonly kind: 'connection_not_usable';
  readonly status: string;
  readonly message: string;
}

/** A domain rule refused the request; `violation` says which. */
export interface RuleViolated {
  readonly kind: 'rule_violated';
  readonly violation: FinancialConnectionRuleViolation;
  readonly message: string;
}

/**
 * This source account is already linked to a DIFFERENT account for this
 * subject.
 *
 * The most important refusal in the module: one source account maps to at
 * most one canonical account, so two would split one person's history in two
 * with nothing to tell them it happened (ADR-0028). It carries the account
 * the source already resolves to, because that is the subject's OWN account
 * and telling them which one is the entire point of the message — there is no
 * oracle here, since a caller who could not already see that account could not
 * have reached this arm.
 */
export interface SourceAccountAlreadyLinkedElsewhere {
  readonly kind: 'source_account_already_linked_elsewhere';
  readonly linkedAccountId: string;
  readonly message: string;
}

/**
 * The link changed since the caller read it. The caller re-reads and decides;
 * this module never silently overwrites a concurrent edit, because the losing
 * edit is usually the one a person made on their other device.
 */
export interface VersionConflict {
  readonly kind: 'version_conflict';
  readonly expectedVersion: number;
  readonly message: string;
}

/**
 * The store failed. Never carries store internals outward.
 *
 * `operation` is this module's own vocabulary ('propose account source
 * link'), never the store's. `cause` holds the original throw for the ONE
 * place allowed to log it — the boundary that turns this into a response —
 * and is defined NON-ENUMERABLE so `JSON.stringify`, object spread,
 * structured logging and an RFC 7807 body all drop it without anyone
 * remembering to. A field that must not be serialized is safer as a field
 * that cannot be.
 */
export interface StoreFailure {
  readonly kind: 'store_failure';
  readonly message: string;
  readonly operation: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
}

/**
 * The fingerprint could not be computed, so nothing was written.
 *
 * Deliberately its own kind rather than a `store_failure`: no store was
 * touched, the remedy is key availability rather than a database, and — the
 * part that matters — proceeding without a fingerprint would mean writing a
 * link whose source account can never be recognised again, which is a silent
 * duplicate-account generator rather than a failure anyone would notice.
 */
export interface FingerprintUnavailable {
  readonly kind: 'fingerprint_unavailable';
  readonly message: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
}

/**
 * Whether the canonical account is visible could not be established, so the
 * link was refused. Fail closed: "we could not check, so probably fine" is
 * how a link to somebody else's account gets written.
 */
export interface AccountAccessUnavailable {
  readonly kind: 'account_access_unavailable';
  readonly message: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
}

/**
 * Durable creation was refused because the retention decision governing the
 * dataset is not resolved. Carries the decision itself, not a rephrasing:
 * "legal has not ruled" and "we could not ask" have different remedies.
 */
export interface RetentionUnresolved {
  readonly kind: 'retention_unresolved';
  readonly dataset: RetentionGovernedDataset;
  readonly decision: FinancialRetentionDecision;
  readonly message: string;
}

export type ListOwnConnectionsError = MissingPrincipalContext | StoreFailure;

export type CreateManualConnectionError =
  | MissingPrincipalContext
  | RetentionUnresolved
  | RuleViolated
  | StoreFailure;

export type DeleteOwnConnectionError =
  | MissingPrincipalContext
  | ConnectionNotFound
  | VersionConflict
  | StoreFailure;

export type ProposeAccountSourceLinkError =
  | MissingPrincipalContext
  | RetentionUnresolved
  | ConnectionNotFound
  | ConnectionNotUsable
  | AccountNotFound
  | AccountNotLinkable
  | AccountAccessUnavailable
  | SourceAccountAlreadyLinkedElsewhere
  | FingerprintUnavailable
  | RuleViolated
  | StoreFailure;

export type ConfirmProbableSourceLinkError =
  | MissingPrincipalContext
  | SourceLinkNotFound
  | SourceAccountAlreadyLinkedElsewhere
  | VersionConflict
  | RuleViolated
  | StoreFailure;

export type DeclineProbableSourceLinkError =
  | MissingPrincipalContext
  | SourceLinkNotFound
  | VersionConflict
  | RuleViolated
  | StoreFailure;

export type ListOwnAccountSourceLinksError = MissingPrincipalContext | StoreFailure;

export type RecordSourceObservationError =
  | MissingPrincipalContext
  | SourceLinkNotFound
  | VersionConflict
  | RuleViolated
  | StoreFailure;

export type EraseAccountSourceLinksError = MissingPrincipalContext | StoreFailure;

/** The one message every connection not-found arm uses. */
export const CONNECTION_NOT_FOUND: ConnectionNotFound = Object.freeze({
  kind: 'connection_not_found' as const,
  message:
    'no such connection — a guessed identifier, a connection belonging to another user inside ' +
    'this tenant, and one belonging to another tenant are all answered identically on purpose, ' +
    'so a caller learns nothing from the difference',
});

/** The one message every source-link not-found arm uses. */
export const SOURCE_LINK_NOT_FOUND: SourceLinkNotFound = Object.freeze({
  kind: 'source_link_not_found' as const,
  message:
    'no such account source link — absent, one belonging to another user, and one ' +
    'belonging to another tenant are answered identically on purpose',
});

/** The one message every account not-found arm uses. */
export const ACCOUNT_NOT_FOUND: AccountNotFound = Object.freeze({
  kind: 'account_not_found' as const,
  message:
    'no such account — a guessed identifier, an account belonging to another user inside this ' +
    'tenant, and one belonging to another tenant are all answered identically on purpose. A ' +
    'source link to an account the caller cannot see is not created, and the refusal reveals ' +
    'nothing about whether one exists for anybody else',
});

/**
 * Wrap an unexpected store throw without leaking its internals to a client.
 *
 * A driver message is not ours to show: it can carry a connection string with
 * credentials, the SQL that failed, a table name, a host and port, or — worst
 * here — a fragment of the row that failed, which in this module includes the
 * ciphertext and the fingerprint the whole design exists to protect. It is
 * also unstable, so a client that keyed on it would break on a driver upgrade.
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
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as StoreFailure;
}

/** The refusal when the fingerprint port cannot answer. */
export function fingerprintUnavailable(error: unknown): FingerprintUnavailable {
  const failure = {
    kind: 'fingerprint_unavailable' as const,
    message:
      'the source-account fingerprint could not be computed, so nothing was written. Proceeding ' +
      'without one would store a link whose source account can never be recognised again, and ' +
      'the visible symptom of that is duplicate accounts appearing on the next import rather ' +
      'than an error anybody sees. Why it could not be computed is logged once at the boundary',
  };
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as FingerprintUnavailable;
}

/** The refusal when account visibility could not be established. */
export function accountAccessUnavailable(error: unknown): AccountAccessUnavailable {
  const failure = {
    kind: 'account_access_unavailable' as const,
    message:
      'whether this account is one the caller owns could not be established, so no link was ' +
      'created. The rule fails closed: a source link written against an unverified account ' +
      'reference would attach a data route belonging to somebody else to an account nobody ' +
      'checked. ' +
      'Why the question went unanswered is logged once at the boundary',
  };
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as AccountAccessUnavailable;
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
      ? 'the decision claims DECIDED but carries no basis or no approval reference, and absence ' +
        'of evidence means not approved'
      : decision.reason;
  return {
    kind: 'retention_unresolved',
    dataset,
    decision,
    message:
      `refusing to create a durable record in ${dataset}: the retention decision governing it is ` +
      `${decision.state} — ${because}. This module's data-lifecycle declaration says non-local ` +
      'durable financial creation fails closed until a reviewed decision exists, and this is ' +
      'that gate; the remedy is a legal decision recorded in an approved policy pack, never a ' +
      'duration chosen in code',
  };
}
