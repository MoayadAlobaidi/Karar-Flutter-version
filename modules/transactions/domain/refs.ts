/**
 * Reference types the transactions module declares for ITSELF (data-model.md
 * §2: a cross-module reference is a raw UUID plus a reference type declared
 * in the consuming module).
 *
 * `AccountRef` is the important one. A transaction is anchored to a financial
 * account owned by another bounded context (modules/financial-accounts), and
 * this module deliberately does NOT import that module's identifier type,
 * entity, or repository. What crosses the boundary is a UUID and a
 * locally-declared discriminator saying what the UUID refers to — so the two
 * contexts can evolve their internals independently, and so a reader of a
 * transaction row can tell what `account_id` points at without reading
 * another module's source.
 *
 * The discriminator is a closed union rather than free text on purpose. When
 * a second kind of anchor ever exists (it does not today), adding it is a
 * reviewed change here plus a CHECK-constraint migration — not a new string
 * appearing in production rows because some caller invented one.
 */

/** What an `AccountRef` UUID points at. Closed set; extending it is reviewed. */
export const ACCOUNT_REFERENCE_TYPES = ['FINANCIAL_ACCOUNT'] as const;
export type AccountReferenceType = (typeof ACCOUNT_REFERENCE_TYPES)[number];

export class InvalidReferenceError extends Error {
  override readonly name = 'InvalidReferenceError';
}

/**
 * RFC 9562 textual form, any version. The module mints v7 for its own rows
 * (data-model.md §2) but accepts any well-formed UUID for a reference it did
 * not mint — validating another context's version choice here would couple
 * the two exactly as this file exists to avoid.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(kind: string, value: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new InvalidReferenceError(
      `${kind} requires a UUID in RFC 9562 textual form, got '${String(value)}'`,
    );
  }
  return value.toLowerCase();
}

function requireRef(kind: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidReferenceError(`${kind} requires a non-empty reference string`);
  }
  return value;
}

declare const transactionIdBrand: unique symbol;
/** This module's own row identity (UUID v7, minted through the IdSource port). */
export type TransactionId = string & { readonly [transactionIdBrand]: 'TransactionId' };

export const TransactionId = {
  of(value: string): TransactionId {
    return requireUuid('TransactionId', value) as TransactionId;
  },
};

/**
 * A raw UUID plus what it refers to. Never the financial-accounts module's
 * own ID type, never a relation, never an import.
 */
export interface AccountRef {
  readonly referenceType: AccountReferenceType;
  readonly accountId: string;
}

export const AccountRef = {
  of(accountId: string, referenceType: AccountReferenceType = 'FINANCIAL_ACCOUNT'): AccountRef {
    if (!ACCOUNT_REFERENCE_TYPES.includes(referenceType)) {
      throw new InvalidReferenceError(
        `AccountRef referenceType must be one of (${ACCOUNT_REFERENCE_TYPES.join(', ')}), got '${String(referenceType)}'`,
      );
    }
    return Object.freeze({
      referenceType,
      accountId: requireUuid('AccountRef', accountId),
    });
  },

  /** Value equality — two refs are the same anchor iff kind and UUID match. */
  equals(left: AccountRef, right: AccountRef): boolean {
    return left.referenceType === right.referenceType && left.accountId === right.accountId;
  },
};

declare const importRefBrand: unique symbol;
/**
 * Opaque reference to ONE ingestion attempt, owned by the (later) statement
 * import workstream. Provenance stores it; nothing in this module resolves
 * it, which is why it is a string and not a foreign key.
 */
export type ImportRef = string & { readonly [importRefBrand]: 'ImportRef' };

export const ImportRef = {
  of(value: string): ImportRef {
    return requireRef('ImportRef', value) as ImportRef;
  },
};

declare const rowRefBrand: unique symbol;
/**
 * Opaque reference to the EXACT source row a fact came from. Together with
 * `ImportRef` this is what makes "explain this number" answerable: import
 * plus row identifies one line of one uploaded statement. It is a reference,
 * never the row's text — narrative belongs on the transaction, encrypted.
 */
export type RowRef = string & { readonly [rowRefBrand]: 'RowRef' };

export const RowRef = {
  of(value: string): RowRef {
    return requireRef('RowRef', value) as RowRef;
  },
};

declare const actorRefBrand: unique symbol;
/** Who acted: a raw user UUID, opaque here (identity is another context's). */
export type ActorRef = string & { readonly [actorRefBrand]: 'ActorRef' };

export const ActorRef = {
  of(value: string): ActorRef {
    return requireUuid('ActorRef', value) as ActorRef;
  },
};
