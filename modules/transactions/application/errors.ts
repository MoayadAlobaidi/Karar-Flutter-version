/**
 * The expected-failure vocabulary of the transactions use cases.
 *
 * The rule the repository holds to (backend.md §9): expected outcomes are
 * `Result` arms the caller must handle; defects throw. "The account you named
 * is not yours", "that transaction does not exist", "somebody edited this
 * while you were editing it" are outcomes a caller must render; a malformed
 * `Money` at a trusted call site is a defect.
 *
 * Two arms carry design weight and are worth reading before use:
 *
 * `NOT_FOUND` is the ONLY answer for a transaction the principal may not see.
 * RLS scopes every read to the principal's own rows, so another subject's
 * transaction id resolves to nothing, and the use case reports absence rather
 * than a distinguishable denial. A separate FORBIDDEN arm would turn a
 * guessed id into an existence oracle — probe ids, read which ones say
 * "forbidden", and you have enumerated another person's records without ever
 * seeing one.
 *
 * `DUPLICATE_TRANSACTION` is a first-class outcome, not a store failure. The
 * unique constraint on the dedup fingerprint is what makes committing the
 * same statement row twice impossible under concurrency, and the caller needs
 * to tell a user "this is already recorded" rather than surfacing a database
 * error.
 */

export interface StoreFailure {
  readonly kind: 'STORE_FAILURE';
  readonly message: string;
}

/**
 * The transaction is absent, or belongs to somebody else — deliberately the
 * same answer. See the header: a distinguishable denial is an existence
 * oracle.
 */
export interface NotFound {
  readonly kind: 'NOT_FOUND';
  readonly resource: string;
  readonly id: string;
}

/** No principal is bound. Fail closed: nothing is read, nothing is written. */
export interface PrincipalContextMissing {
  readonly kind: 'PRINCIPAL_CONTEXT_MISSING';
  readonly message: string;
}

/** The exact same transaction is already recorded on this account. */
export interface DuplicateTransaction {
  readonly kind: 'DUPLICATE_TRANSACTION';
  readonly fingerprintVersion: string;
  readonly message: string;
}

/** Somebody else changed the record between the read and the write. */
export interface VersionConflict {
  readonly kind: 'VERSION_CONFLICT';
  readonly expectedVersion: number;
  readonly actualVersion: number;
  readonly message: string;
}

/** The correction changes nothing. Refused so history stays free of noise. */
export interface NoChange {
  readonly kind: 'NO_CHANGE';
  readonly message: string;
}

/** The category code is not in the catalogue, or is retired. */
export interface CategoryUnknown {
  readonly kind: 'CATEGORY_UNKNOWN';
  readonly categoryCode: string;
  readonly message: string;
}

/**
 * A rule tried to overwrite a person's own categorisation. Refused loudly
 * rather than skipped quietly: the rules path must handle being told no.
 */
export interface UserAssignmentWins {
  readonly kind: 'USER_ASSIGNMENT_WINS';
  readonly transactionId: string;
  readonly message: string;
}

/** A page cursor that this module did not mint, or that has been tampered with. */
export interface InvalidCursor {
  readonly kind: 'INVALID_CURSOR';
  readonly message: string;
}

/** Thrown, not returned: defective input at a trusted call site. */
export class InvalidTransactionInputError extends Error {
  override readonly name = 'InvalidTransactionInputError';
}

export function requireNonEmpty(field: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidTransactionInputError(`'${field}' requires a non-empty value`);
  }
  return value;
}

export function toStoreFailure(error: unknown): StoreFailure {
  return {
    kind: 'STORE_FAILURE',
    message: error instanceof Error ? error.message : String(error),
  };
}

export function principalContextMissing(): PrincipalContextMissing {
  return {
    kind: 'PRINCIPAL_CONTEXT_MISSING',
    message:
      'no principal is bound to this call — the transactions use cases take their tenant and user from context, never from input, ' +
      'so an unbound call reads nothing and writes nothing (tenancy.md: RLS is the boundary, the context arms it)',
  };
}
