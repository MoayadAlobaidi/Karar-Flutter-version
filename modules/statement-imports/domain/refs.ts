/**
 * Reference types this module declares.
 *
 * Cross-module references carry a raw UUID plus a reference type declared
 * HERE (data-model.md §2). The branded alias is what stops an import id being
 * handed to a call site expecting a row id, without dragging a foreign
 * module's types across the boundary. `TenantId` and `UserId` are kernel
 * universals and are deliberately not redeclared.
 *
 * `CanonicalAccountRef` is the important one, and it is deliberately NOT
 * `modules/financial-accounts`' `FinancialAccountId`. An import is anchored to
 * an account owned by another bounded context; what crosses the boundary is a
 * UUID plus a locally-declared discriminator saying what the UUID refers to,
 * exactly as `modules/transactions` and `modules/financial-connections` do for
 * the same anchor.
 *
 * `CommittedTransactionRef` runs the same way in the other direction: a staged
 * row records which canonical transaction it produced, and it records it as a
 * UUID rather than as the transactions module's identifier type, so that the
 * link is expressible without this module's domain depending on that one.
 *
 * The discriminators are closed unions rather than free text. When a second
 * kind of anchor ever exists — none does today — adding it is a reviewed
 * change here plus a CHECK-constraint migration, not a new string appearing in
 * production rows because a caller invented one.
 */

/** RFC 9562 textual form, any version. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidReferenceError extends Error {
  override readonly name = 'InvalidReferenceError';
}

function requireUuid(kind: string, value: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new InvalidReferenceError(
      `${kind} requires a UUID in RFC 9562 textual form, got '${String(value)}'`,
    );
  }
  return value.toLowerCase();
}

/** A `statement_imports.id`. */
export type StatementImportId = string & { readonly __brand: 'StatementImportId' };

export const StatementImportId = {
  of(value: string): StatementImportId {
    return requireUuid('StatementImportId', value) as StatementImportId;
  },
};

/** A `statement_import_sources.id`. */
export type StatementImportSourceId = string & {
  readonly __brand: 'StatementImportSourceId';
};

export const StatementImportSourceId = {
  of(value: string): StatementImportSourceId {
    return requireUuid('StatementImportSourceId', value) as StatementImportSourceId;
  },
};

/** A `statement_import_rows.id`. */
export type StatementImportRowId = string & { readonly __brand: 'StatementImportRowId' };

export const StatementImportRowId = {
  of(value: string): StatementImportRowId {
    return requireUuid('StatementImportRowId', value) as StatementImportRowId;
  },
};

/** A `statement_import_row_errors.id`. */
export type StatementImportRowErrorId = string & {
  readonly __brand: 'StatementImportRowErrorId';
};

export const StatementImportRowErrorId = {
  of(value: string): StatementImportRowErrorId {
    return requireUuid('StatementImportRowErrorId', value) as StatementImportRowErrorId;
  },
};

/** What a `CanonicalAccountRef` UUID points at. Closed set; extending it is reviewed. */
export const CANONICAL_ACCOUNT_REFERENCE_TYPES = ['FINANCIAL_ACCOUNT'] as const;
export type CanonicalAccountReferenceType = (typeof CANONICAL_ACCOUNT_REFERENCE_TYPES)[number];

/**
 * A raw UUID plus what it refers to. Never the financial-accounts module's own
 * identifier type, never a relation, never an import.
 */
export interface CanonicalAccountRef {
  readonly referenceType: CanonicalAccountReferenceType;
  readonly accountId: string;
}

export const CanonicalAccountRef = {
  of(
    accountId: string,
    referenceType: CanonicalAccountReferenceType = 'FINANCIAL_ACCOUNT',
  ): CanonicalAccountRef {
    if (!CANONICAL_ACCOUNT_REFERENCE_TYPES.includes(referenceType)) {
      throw new InvalidReferenceError(
        `CanonicalAccountRef referenceType must be one of (${CANONICAL_ACCOUNT_REFERENCE_TYPES.join(', ')}), got '${String(referenceType)}'`,
      );
    }
    return Object.freeze({
      referenceType,
      accountId: requireUuid('CanonicalAccountRef', accountId),
    });
  },

  equals(left: CanonicalAccountRef, right: CanonicalAccountRef): boolean {
    return left.referenceType === right.referenceType && left.accountId === right.accountId;
  },
};

/** What a `ConnectionRef` UUID points at. Closed set. */
export const CONNECTION_REFERENCE_TYPES = ['FINANCIAL_CONNECTION'] as const;
export type ConnectionReferenceType = (typeof CONNECTION_REFERENCE_TYPES)[number];

/**
 * The financial connection a file arrived through, when the person has one.
 *
 * Optional throughout: a person can import a file before any connection
 * exists, and refusing that would make the connection a prerequisite for
 * reading one's own statement. Naming a connection here asserts nothing about
 * any institution — no provider is integrated and none exposes an interface to
 * Karar (ADR-0028).
 */
export interface ConnectionRef {
  readonly referenceType: ConnectionReferenceType;
  readonly connectionId: string;
}

export const ConnectionRef = {
  of(
    connectionId: string,
    referenceType: ConnectionReferenceType = 'FINANCIAL_CONNECTION',
  ): ConnectionRef {
    if (!CONNECTION_REFERENCE_TYPES.includes(referenceType)) {
      throw new InvalidReferenceError(
        `ConnectionRef referenceType must be one of (${CONNECTION_REFERENCE_TYPES.join(', ')}), got '${String(referenceType)}'`,
      );
    }
    return Object.freeze({
      referenceType,
      connectionId: requireUuid('ConnectionRef', connectionId),
    });
  },

  equals(left: ConnectionRef, right: ConnectionRef): boolean {
    return left.referenceType === right.referenceType && left.connectionId === right.connectionId;
  },
};

/**
 * The canonical transaction a staged row produced.
 *
 * A UUID rather than `modules/transactions`' `TransactionId`, for the reason
 * the account anchor gives: the link must be expressible without this module's
 * domain depending on that module. The value is write-once at the database
 * (migration 0101, SQLSTATE KAR56), because moving it would reassign a
 * person's financial record to a different statement line and clearing it
 * would let a retry write that record a second time.
 */
export type CommittedTransactionRef = string & {
  readonly __brand: 'CommittedTransactionRef';
};

export const CommittedTransactionRef = {
  of(value: string): CommittedTransactionRef {
    return requireUuid('CommittedTransactionRef', value) as CommittedTransactionRef;
  },
};

/**
 * There is deliberately NO reference type for a stored object's ADDRESS.
 *
 * Where the encrypted statement lives is `SourceObjectRef` in
 * `encrypted-source.ts`, and it is an opaque handle with a shape rule that
 * refuses a URI. A "storage location" reference type here would be the first
 * step toward a provider address travelling through the domain, and the
 * migration's CHECK exists precisely so that cannot happen even by accident.
 */
