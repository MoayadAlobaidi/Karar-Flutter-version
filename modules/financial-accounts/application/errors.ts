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

export type ListOwnAccountsError = MissingPrincipalContext | StoreFailure;

export type ReadOwnAccountError = MissingPrincipalContext | AccountNotFound | StoreFailure;

export type CreateManualAccountError =
  | MissingPrincipalContext
  | InstitutionNotSelectable
  | RuleViolated
  | StoreFailure;

export type UpdateOwnAccountError =
  | MissingPrincipalContext
  | AccountNotFound
  | InstitutionNotSelectable
  | RuleViolated
  | VersionConflict
  | StoreFailure;

export type DeleteOwnAccountError =
  | MissingPrincipalContext
  | AccountNotFound
  | VersionConflict
  | StoreFailure;

export type ListOwnBalanceSnapshotsError =
  | MissingPrincipalContext
  | AccountNotFound
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
