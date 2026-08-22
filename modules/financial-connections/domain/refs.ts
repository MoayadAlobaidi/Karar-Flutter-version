/**
 * Reference types this module declares.
 *
 * Cross-module references carry a raw UUID plus a reference type declared
 * HERE (modules/financial-connections/MODULE.md; data-model.md §2). The
 * branded alias is what stops a connection id being handed to a call site
 * expecting a source-link id, without dragging a foreign module's types
 * across the boundary. `TenantId` and `UserId` are kernel universals and are
 * deliberately not redeclared.
 *
 * `CanonicalAccountRef` is the important one, and it is deliberately NOT
 * `modules/financial-accounts`' `FinancialAccountId`. A source link is
 * anchored to an account owned by another bounded context; what crosses the
 * boundary is a UUID and a locally-declared discriminator saying what the
 * UUID refers to, exactly as `modules/transactions` does for the same anchor.
 * The two contexts stay independently evolvable, and a reader of a link row
 * can tell what `account_id` points at without opening another module's
 * source.
 *
 * The discriminators are closed unions rather than free text. When a second
 * kind of anchor ever exists — none does today — adding it is a reviewed
 * change here plus a CHECK-constraint migration, not a new string appearing
 * in production rows because a caller invented one.
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

/** A `financial_connections.id`. */
export type FinancialConnectionId = string & {
  readonly __brand: 'FinancialConnectionId';
};

export const FinancialConnectionId = {
  of(value: string): FinancialConnectionId {
    return requireUuid('FinancialConnectionId', value) as FinancialConnectionId;
  },
};

/** An `account_source_links.id`. */
export type AccountSourceLinkId = string & { readonly __brand: 'AccountSourceLinkId' };

export const AccountSourceLinkId = {
  of(value: string): AccountSourceLinkId {
    return requireUuid('AccountSourceLinkId', value) as AccountSourceLinkId;
  },
};

/** What a `CanonicalAccountRef` UUID points at. Closed set; extending it is reviewed. */
export const CANONICAL_ACCOUNT_REFERENCE_TYPES = ['FINANCIAL_ACCOUNT'] as const;
export type CanonicalAccountReferenceType =
  (typeof CANONICAL_ACCOUNT_REFERENCE_TYPES)[number];

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

  /** Value equality — two refs are the same anchor iff kind and UUID match. */
  equals(left: CanonicalAccountRef, right: CanonicalAccountRef): boolean {
    return left.referenceType === right.referenceType && left.accountId === right.accountId;
  },
};

/** What an `InstitutionRef` UUID points at. Closed set. */
export const INSTITUTION_REFERENCE_TYPES = ['INSTITUTION_CATALOGUE_ENTRY'] as const;
export type InstitutionReferenceType = (typeof INSTITUTION_REFERENCE_TYPES)[number];

/**
 * A row in the reviewed institution catalogue (`public.institutions`, owned by
 * modules/financial-accounts), as a raw UUID plus its kind.
 *
 * Naming an institution here asserts nothing about that institution: not that
 * it is reachable, not that it exposes an interface to Karar, and above all
 * not that this platform is connected to it. None is (ADR-0028).
 */
export interface InstitutionRef {
  readonly referenceType: InstitutionReferenceType;
  readonly institutionId: string;
}

export const InstitutionRef = {
  of(
    institutionId: string,
    referenceType: InstitutionReferenceType = 'INSTITUTION_CATALOGUE_ENTRY',
  ): InstitutionRef {
    if (!INSTITUTION_REFERENCE_TYPES.includes(referenceType)) {
      throw new InvalidReferenceError(
        `InstitutionRef referenceType must be one of (${INSTITUTION_REFERENCE_TYPES.join(', ')}), got '${String(referenceType)}'`,
      );
    }
    return Object.freeze({
      referenceType,
      institutionId: requireUuid('InstitutionRef', institutionId),
    });
  },

  equals(left: InstitutionRef, right: InstitutionRef): boolean {
    return (
      left.referenceType === right.referenceType && left.institutionId === right.institutionId
    );
  },
};

/**
 * There is deliberately NO credential reference type here, and no opaque
 * "session", "token" or "cursor" reference either.
 *
 * Adding one would be the first move toward storing what it points at, and
 * this module's whole claim is that no credential of any kind exists anywhere
 * in it — not in a column, not in a value object, not behind an indirection
 * that names something held elsewhere. A reference to a secret is still a
 * design that has a secret in it.
 */
