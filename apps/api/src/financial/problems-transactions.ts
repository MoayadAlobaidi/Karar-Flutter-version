/**
 * Transactions errors -> RFC 7807 documents.
 *
 * The union is assembled from the module's INDIVIDUAL error interfaces rather
 * than from its per-use-case unions, so the exhaustive `switch` fails to
 * compile when the module adds an arm nobody has decided how to report. A
 * default case would turn that decision into a silent 500.
 *
 * TWO ARMS ARE NOT FAILURES AND ARE NOT SUCCESSES. Deleting a transaction
 * reaches across a module boundary to the transfer matches that name it, and
 * the two are not one unit of work. `TRANSFER_MATCH_ERASURE_INCOMPLETE` and
 * `DELETION_PARTIALLY_APPLIED` therefore have no problem document at all:
 * they are answered as a 207 body carrying what was really erased, because
 * rounding a partial delete to 200 tells a person their data is gone when
 * some of it is not, and rounding it to 500 tells them nothing happened when
 * some of it did.
 *
 * WHAT IS DROPPED. `StoreFailure.cause` (already non-enumerable) and its
 * `operation`; the fingerprint behind `DUPLICATE_TRANSACTION`, of which only
 * the ALGORITHM VERSION is safe and even that is not carried here; and the
 * retention decision's period, basis and pack version.
 */

import type {
  AccountCurrencyMismatch,
  AccountNotWritable,
  CategoryUnknown,
  DuplicateTransaction,
  InvalidCursor,
  NoChange,
  NotFound,
  OccurrenceOrdinalNotNext,
  PrincipalContextMissing,
  RetentionUndecided,
  StoreFailure,
  UserAssignmentWins,
  VersionConflict,
} from '@karar/transactions';

import {
  authenticationRequiredProblem,
  codedProblem,
  invalidCursorProblem,
  retentionUnresolvedProblem,
  storeUnavailableProblem,
  type ProblemResponse,
} from './problems.js';

/**
 * Every arm reachable through the transaction routes this surface mounts,
 * MINUS the two partial-application arms, which are answered as a 207 body.
 */
export type TransactionsSurfaceError =
  | PrincipalContextMissing
  | InvalidCursor
  | NotFound
  | AccountNotWritable
  | AccountCurrencyMismatch
  | DuplicateTransaction
  | OccurrenceOrdinalNotNext
  | VersionConflict
  | NoChange
  | CategoryUnknown
  | UserAssignmentWins
  | RetentionUndecided
  | StoreFailure;

/**
 * A 404 with the right code. The `resource` is the module's own noun, and
 * both possible values name something the CALLER owns — so the code is
 * precise without being an oracle: another subject's row produces exactly the
 * same 404 as an id that never existed.
 */
function notFoundProblem(error: NotFound): ProblemResponse {
  return error.resource === 'financial_account'
    ? codedProblem(
        404,
        'Account not found',
        'ACCOUNT_NOT_FOUND',
        'no such account for this principal',
      )
    : codedProblem(
        404,
        'Transaction not found',
        'TRANSACTION_NOT_FOUND',
        'no such transaction for this principal',
      );
}

export function problemForTransactionsError(error: TransactionsSurfaceError): ProblemResponse {
  switch (error.kind) {
    case 'PRINCIPAL_CONTEXT_MISSING':
      return authenticationRequiredProblem();
    case 'INVALID_CURSOR':
      return invalidCursorProblem();
    case 'NOT_FOUND':
      return notFoundProblem(error);
    case 'ACCOUNT_NOT_WRITABLE':
      return codedProblem(
        409,
        'Account not writable',
        'ACCOUNT_NOT_WRITABLE',
        `the account cannot accept a record while it is ${error.reason}`,
      );
    case 'ACCOUNT_CURRENCY_MISMATCH':
      // Both currencies are the caller's own facts and naming them is what
      // makes the refusal actionable; no amount is carried.
      return codedProblem(
        409,
        'Currency mismatch',
        'ACCOUNT_CURRENCY_MISMATCH',
        `the account is held in ${error.accountCurrency} and the record states ${error.transactionCurrency}`,
      );
    case 'DUPLICATE_TRANSACTION':
      // The fingerprint itself is a per-subject keyed MAC and never crosses;
      // the caller is told that an identical movement is already recorded and
      // how to record a genuine repeat.
      return codedProblem(
        409,
        'Duplicate transaction',
        'DUPLICATE_TRANSACTION',
        'an identical movement is already recorded; supply the next occurrenceOrdinal to record a genuine repeat',
      );
    case 'OCCURRENCE_ORDINAL_NOT_NEXT':
      return codedProblem(
        409,
        'Occurrence ordinal not next',
        'OCCURRENCE_ORDINAL_NOT_NEXT',
        `the next unused occurrence for this movement is ${String(error.nextOrdinal)}`,
      );
    case 'VERSION_CONFLICT':
      return codedProblem(
        409,
        'Transaction changed under the caller',
        'TRANSACTION_VERSION_CONFLICT',
        're-read the transaction and retry with its current version',
      );
    case 'NO_CHANGE':
      return codedProblem(
        400,
        'Nothing to change',
        'NO_CHANGE',
        'the correction would leave every value as it is; a revision that records no change is not appended',
      );
    case 'CATEGORY_UNKNOWN':
      // A malformed code, an absent code and a retired code answer alike: the
      // catalogue is reference data, not a surface to probe.
      return codedProblem(
        404,
        'Category unknown',
        'CATEGORY_UNKNOWN',
        'no assignable category has that code',
      );
    case 'USER_ASSIGNMENT_WINS':
      return codedProblem(
        409,
        'A person’s own decision stands',
        'USER_ASSIGNMENT_WINS',
        'this transaction already carries a category the subject chose',
      );
    case 'RETENTION_UNDECIDED':
      return retentionUnresolvedProblem('transactions');
    case 'STORE_FAILURE':
      return storeUnavailableProblem();
  }
}
