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
 * unique constraint on the dedup fingerprint and the occurrence ordinal is
 * what makes committing the same occurrence of the same content twice
 * impossible under concurrency, and the caller needs to tell a user "this is
 * already recorded" rather than surfacing a database error.
 *
 * The account arms follow the same reasoning as `NOT_FOUND`, one step out. An
 * account that is absent, another user's, another tenant's, or never minted
 * is ONE outcome — `NOT_FOUND` with `resource: 'financial_account'` — for
 * exactly the oracle reason above. `ACCOUNT_NOT_WRITABLE` and
 * `ACCOUNT_CURRENCY_MISMATCH` are separate arms only because they concern an
 * account the caller has already been shown to own, so naming the reason
 * tells them something about their own data and nothing about anyone else's.
 */

export interface StoreFailure {
  readonly kind: 'STORE_FAILURE';
  readonly message: string;
  /** Non-enumerable; present for the boundary logger, invisible to serialization. */
  readonly cause?: unknown;
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

/** This exact occurrence of this exact content is already on this account. */
export interface DuplicateTransaction {
  readonly kind: 'DUPLICATE_TRANSACTION';
  readonly fingerprintVersion: string;
  readonly message: string;
}

/**
 * The occurrence ordinal was not the next unused one for its content
 * identity.
 *
 * An ordinal claims "this identical content genuinely happened again". Any
 * integer being acceptable would make duplicate review optional: submit the
 * same row twice as occurrence 1 and occurrence 9999, and both commit,
 * because the second collides with nothing. So the only acceptable value is
 * the next one, and it is reported here so the caller can offer it — "if this
 * genuinely happened twice, record it as occurrence 2" — instead of leaving a
 * user to guess a number the system will accept.
 */
export interface OccurrenceOrdinalNotNext {
  readonly kind: 'OCCURRENCE_ORDINAL_NOT_NEXT';
  readonly requestedOrdinal: number;
  readonly nextOrdinal: number;
  readonly message: string;
}

/**
 * A retention decision is required before a durable financial record may be
 * written, and none exists. Refused before encryption and before any write.
 *
 * `state` carries which of the two non-answers it was, because "with legal
 * review" and "nothing could answer" have different owners and different
 * fixes, and one denial that hid the difference would send the wrong person.
 */
export interface RetentionUndecided {
  readonly kind: 'RETENTION_UNDECIDED';
  readonly state: 'PENDING_LEGAL_REVIEW' | 'UNAVAILABLE';
  readonly message: string;
}

/**
 * The account exists and is the principal's own, but may not take a new
 * record: it is archived or closed, its lifecycle state is one this module
 * does not recognise, or it claims a provider connection.
 */
export interface AccountNotWritable {
  readonly kind: 'ACCOUNT_NOT_WRITABLE';
  readonly accountId: string;
  readonly reason: 'ARCHIVED' | 'CLOSED' | 'UNRECOGNIZED_STATE' | 'PROVIDER_CONNECTED';
  readonly message: string;
}

/**
 * The amount's currency is not the account's currency. Refused rather than
 * converted: this platform stores no exchange rate it did not observe, and a
 * converted figure would be a number nobody can defend (migration 0090).
 */
export interface AccountCurrencyMismatch {
  readonly kind: 'ACCOUNT_CURRENCY_MISMATCH';
  readonly accountId: string;
  readonly accountCurrency: string;
  readonly transactionCurrency: string;
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

/**
 * Wrap an unexpected store throw without carrying its words outward.
 *
 * This used to be the driver's message verbatim. A driver message can hold the
 * connection string with credentials, the SQL that failed, a table name, a host
 * and port, and — worst in this module — a fragment of the row that failed,
 * which here is the narrative and the amount that every HSF column exists to
 * protect. It is also unstable, so a caller keying on it breaks on a driver
 * upgrade.
 *
 * The cause still travels, because the platform logging rule is that an error
 * is logged ONCE at the boundary that turns it into a response and interior
 * code must not log; discarding it would trade a leak for blindness. It is
 * defined NON-ENUMERABLE, so `JSON.stringify`, object spread, a structured log
 * line and an RFC 7807 body all drop it without anyone remembering to.
 */
export function toStoreFailure(error: unknown): StoreFailure {
  const failure = {
    kind: 'STORE_FAILURE' as const,
    message:
      'the store did not answer. The reason is deliberately not described here: it comes from the ' +
      'database driver, and driver text can carry credentials, SQL, or a fragment of the record ' +
      'itself. It is logged once at the boundary, against this request',
  };
  Object.defineProperty(failure, 'cause', { value: error, enumerable: false, writable: false });
  return failure as StoreFailure;
}

export function principalContextMissing(): PrincipalContextMissing {
  return {
    kind: 'PRINCIPAL_CONTEXT_MISSING',
    message:
      'no principal is bound to this call — the transactions use cases take their tenant and user from context, never from input, ' +
      'so an unbound call reads nothing and writes nothing (tenancy.md: RLS is the boundary, the context arms it)',
  };
}
