/**
 * Accounts errors -> RFC 7807 documents.
 *
 * The union below is assembled from the module's INDIVIDUAL error interfaces
 * rather than from its per-use-case unions, and the exhaustive `switch` is
 * what keeps the two in step: a new arm the module adds fails to compile here
 * until somebody decides what a client should be told about it. A default
 * case would turn that decision into a silent 500.
 *
 * WHAT IS DROPPED ON THE WAY OUT. `StoreFailure` carries a `cause` (already
 * non-enumerable, so it cannot ride along by accident) and an `operation`
 * naming an internal call; neither crosses. `RetentionUnresolved` carries the
 * whole decision — its period, basis, approval reference and pack version —
 * and only the DATASET is kept: a client needs to know a decision is missing,
 * not which approval it is missing.
 *
 * A 404 IS THE ANSWER FOR SOMEBODY ELSE'S ROW, and it is the same 404 an
 * unknown id gets. There is no 403 arm here, deliberately: distinguishing
 * "not yours" from "does not exist" would make this surface an existence
 * oracle over other people's accounts.
 */

import type {
  AccountNotFound,
  InstitutionNotSelectable,
  MissingPrincipalContext,
  RecordPresenceUnavailable,
  RetentionUnresolved,
  RuleViolated,
  StoreFailure,
  VersionConflict,
} from '@karar/financial-accounts';

import {
  authenticationRequiredProblem,
  codedProblem,
  retentionUnresolvedProblem,
  storeUnavailableProblem,
  type ProblemResponse,
} from './problems.js';

/** Every arm reachable through the account routes this surface mounts. */
export type AccountsSurfaceError =
  | MissingPrincipalContext
  | AccountNotFound
  | InstitutionNotSelectable
  | RuleViolated
  | RecordPresenceUnavailable
  | RetentionUnresolved
  | VersionConflict
  | StoreFailure;

export function problemForAccountsError(error: AccountsSurfaceError): ProblemResponse {
  switch (error.kind) {
    case 'missing_principal_context':
      return authenticationRequiredProblem();
    case 'account_not_found':
      return codedProblem(
        404,
        'Account not found',
        'ACCOUNT_NOT_FOUND',
        'no such account for this principal',
      );
    case 'institution_not_selectable':
      return codedProblem(
        409,
        'Institution not selectable',
        'INSTITUTION_NOT_SELECTABLE',
        'that catalogue entry may not be chosen for an account',
      );
    case 'rule_violated':
      // The violation KIND is safe and useful — it says which rule refused —
      // while the domain's own message may quote a value the caller sent.
      return codedProblem(
        400,
        'Account rule violated',
        'ACCOUNT_RULE_VIOLATED',
        `the request violates the '${error.violation.kind}' rule`,
      );
    case 'record_presence_unavailable':
      // A currency change is refused when records exist, and the check itself
      // could not be performed. Answering 503 rather than allowing the edit
      // is the fail-closed reading: an unchecked currency change is the one
      // that silently reinterprets every stored amount.
      return storeUnavailableProblem();
    case 'retention_unresolved':
      return retentionUnresolvedProblem(error.dataset);
    case 'version_conflict':
      return codedProblem(
        409,
        'Account changed under the caller',
        'ACCOUNT_VERSION_CONFLICT',
        're-read the account and retry with its current version',
      );
    case 'store_failure':
      return storeUnavailableProblem();
  }
}
