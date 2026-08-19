/**
 * Transfer-matching errors -> RFC 7807 documents.
 *
 * The union covers exactly the arms the three mounted routes can reach.
 * Suggestion is not mounted, so `transaction_not_found`,
 * `transaction_already_matched`, `transaction_access_unavailable` and
 * `retention_unresolved` are deliberately absent: they belong to a write this
 * surface does not expose, and listing them here would imply a route that
 * does not exist.
 *
 * `rule_violated` covers two different situations and answers 409 for both,
 * with the violation KIND as the machine-readable `reason`. The domain's own
 * message is not forwarded: it may quote a currency, a day count or a
 * transaction id from the other side of the pair, and a problem body is the
 * wrong place for any of that.
 */

import type {
  MatchNotFound,
  MissingPrincipalContext,
  RuleViolated,
  StoreFailure,
  VersionConflict,
} from '@karar/transfer-matching';

import {
  authenticationRequiredProblem,
  codedProblem,
  storeUnavailableProblem,
  type ProblemResponse,
} from './problems.js';

export type MatchingSurfaceError =
  MissingPrincipalContext | MatchNotFound | RuleViolated | VersionConflict | StoreFailure;

export function problemForMatchingError(error: MatchingSurfaceError): ProblemResponse {
  switch (error.kind) {
    case 'missing_principal_context':
      return authenticationRequiredProblem();
    case 'match_not_found':
      return codedProblem(
        404,
        'Transfer match not found',
        'TRANSFER_MATCH_NOT_FOUND',
        'no such transfer match for this principal',
      );
    case 'rule_violated':
      return {
        status: 409,
        body: {
          type: 'about:blank',
          title: 'Transfer match rule violated',
          status: 409,
          code: 'TRANSFER_MATCH_RULE_VIOLATED',
          reason: error.violation.kind,
          detail: 'the decision is not available from this match’s current state',
        },
      };
    case 'version_conflict':
      return codedProblem(
        409,
        'Transfer match changed under the caller',
        'TRANSFER_MATCH_VERSION_CONFLICT',
        're-read the match and retry with its current version',
      );
    case 'store_failure':
      return storeUnavailableProblem();
  }
}
