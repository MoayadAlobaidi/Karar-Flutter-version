/**
 * Expected failure shapes of this module's use cases (backend.md §9). Every
 * kind is machine-readable for RFC 7807 mapping.
 *
 * **Denial kinds deliberately avoid oracles.** An instrument id that does not
 * exist, one belonging to another user in the same tenant, and one belonging
 * to another tenant all answer `instrument_not_found` — identically, with the
 * same message; the same holds for the account an instrument is asked to
 * point at. Anything else turns a guessed identifier into a membership test.
 * RLS produces this outcome structurally (the row is simply not visible), and
 * these types keep the application layer from reintroducing the distinction
 * on the way out.
 *
 * **No message in this file carries a mask, a label, or a fragment of
 * either**, including in the arms that exist precisely because one of them
 * was rejected. That is the same rule `domain/errors.ts` states, restated
 * here because this layer is where an error becomes a response.
 *
 * **No message interpolates driver text.** `String(error)` and
 * `error.message` never appear in a caller-visible sentence: a driver message
 * can carry a connection string with credentials, the failing SQL, or a
 * fragment of the ciphertext of a card mask. The original throw rides along
 * NON-ENUMERABLE for the one boundary allowed to log it, exactly as
 * `modules/financial-accounts/application/errors.ts` does — a field that must
 * not be serialized is safer as a field that cannot be.
 */

import type { PaymentInstrumentRuleViolation } from '../domain/errors.js';
import type {
  FinancialRetentionDecision,
  RetentionGovernedDataset,
} from './ports/payment-instrument-retention-decision.js';
import type { MissingPrincipalContext } from './principal.js';

/** No instrument with that id is visible to the acting principal. */
export interface InstrumentNotFound {
  readonly kind: 'instrument_not_found';
  readonly message: string;
}

/**
 * The account an instrument was asked to spend from is not visible to the
 * acting principal — absent, another user's, another tenant's, or never
 * minted, indistinguishably.
 */
export interface AccountNotFound {
  readonly kind: 'account_not_found';
  readonly message: string;
}

/**
 * The account exists but may not receive a new instrument: it is archived,
 * closed, or in a state this module does not recognise. Distinct from
 * `account_not_found` because the remedies differ and because neither reveals
 * anything about an account the caller cannot already see.
 */
export interface AccountNotAttachable {
  readonly kind: 'account_not_attachable';
  readonly lifecycleState: string;
  readonly message: string;
}

/** A domain rule refused the request; `violation` says which. */
export interface RuleViolated {
  readonly kind: 'rule_violated';
  readonly violation: PaymentInstrumentRuleViolation;
  readonly message: string;
}

/**
 * The instrument changed since the caller read it. The caller re-reads and
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
 * `operation` is this module's own vocabulary ('record payment instrument'),
 * never the store's. `cause` holds the original throw for the ONE place
 * allowed to log it — the boundary that turns this into a response — and is
 * defined NON-ENUMERABLE so `JSON.stringify`, object spread, structured
 * logging and an RFC 7807 body all drop it without anyone remembering to.
 */
export interface StoreFailure {
  readonly kind: 'store_failure';
  readonly message: string;
  readonly operation: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
}

/**
 * Whether the account is visible could not be established, so the instrument
 * was refused. Fail closed: "we could not check, so probably fine" is how a
 * card gets recorded against somebody else's wallet.
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

export type ListOwnPaymentInstrumentsError = MissingPrincipalContext | StoreFailure;

export type RecordPaymentInstrumentError =
  | MissingPrincipalContext
  | RetentionUnresolved
  | AccountNotFound
  | AccountNotAttachable
  | AccountAccessUnavailable
  | RuleViolated
  | StoreFailure;

export type UpdateOwnPaymentInstrumentError =
  | MissingPrincipalContext
  | InstrumentNotFound
  | RuleViolated
  | VersionConflict
  | StoreFailure;

export type DeleteOwnPaymentInstrumentError =
  | MissingPrincipalContext
  | InstrumentNotFound
  | StoreFailure;

export type ErasePaymentInstrumentsError = MissingPrincipalContext | StoreFailure;

/** The one message every instrument not-found arm uses. */
export const INSTRUMENT_NOT_FOUND: InstrumentNotFound = Object.freeze({
  kind: 'instrument_not_found' as const,
  message:
    'no such payment instrument — a guessed identifier, an instrument belonging to another user ' +
    'inside this tenant, and one belonging to another tenant are all answered identically on ' +
    'purpose, so a caller learns nothing from the difference',
});

/** The one message every account not-found arm uses. */
export const ACCOUNT_NOT_FOUND: AccountNotFound = Object.freeze({
  kind: 'account_not_found' as const,
  message:
    'no such account — a guessed identifier, an account belonging to another user inside this ' +
    'tenant, and one belonging to another tenant are all answered identically on purpose. An ' +
    'instrument is not recorded against an account the caller cannot see, and the refusal ' +
    'reveals nothing about whether one exists for anybody else',
});

/**
 * Wrap an unexpected store throw without leaking its internals to a client.
 *
 * A driver message is not ours to show: it can carry a connection string with
 * credentials, the SQL that failed, a table name, a host and port, or — worst
 * here — a fragment of the row that failed, which in this module is the
 * ciphertext of a card mask. It is also unstable, so a client that keyed on
 * it would break on a driver upgrade.
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

/** The refusal when account visibility could not be established. */
export function accountAccessUnavailable(error: unknown): AccountAccessUnavailable {
  const failure = {
    kind: 'account_access_unavailable' as const,
    message:
      'whether this account is one the caller owns could not be established, so no instrument ' +
      'was recorded. The rule fails closed: an instrument written against an unverified account ' +
      'reference would say that money leaves an account nobody checked. Why the question went ' +
      'unanswered is logged once at the boundary',
  };
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as AccountAccessUnavailable;
}

/**
 * The one refusal the retention gate produces, so the wording cannot drift
 * and so the reason is always the decision's own.
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
