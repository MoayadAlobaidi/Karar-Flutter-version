/**
 * Reference types this module declares.
 *
 * Cross-module references carry a raw UUID plus a reference type declared
 * HERE (modules/transfer-matching/MODULE.md; data-model.md §2). The branded
 * alias is what stops a transaction id being handed to a call site expecting
 * a match id, without dragging a foreign module's types across the boundary.
 * `TenantId` and `UserId` are kernel universals and are deliberately not
 * redeclared.
 *
 * `TransactionRef` is the important one, and it is deliberately NOT
 * `modules/transactions`' `TransactionId`. A transfer match is anchored to
 * two transactions owned by another bounded context; what crosses the
 * boundary is a UUID and a locally-declared discriminator saying what the
 * UUID refers to, exactly as `modules/transactions` itself does for the
 * account anchor and `modules/financial-connections` does for both. The two
 * contexts stay independently evolvable, and a reader of a match row can tell
 * what `outflow_transaction_id` points at without opening another module's
 * source.
 *
 * `MatchedAccountRef` exists for a narrower reason: a match carries the
 * account each side belongs to, copied from a column `public.transactions`
 * freezes by trigger. It is a raw uuid for the same reason — no foreign key
 * crosses a module boundary — and the type says what it points at so a reader
 * of `outflow_account_id` is not left guessing whether it is an account or an
 * instrument.
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

/** A `transfer_matches.id`. */
export type TransferMatchId = string & { readonly __brand: 'TransferMatchId' };

export const TransferMatchId = {
  of(value: string): TransferMatchId {
    return requireUuid('TransferMatchId', value) as TransferMatchId;
  },
};

/** What a `TransactionRef` UUID points at. Closed set. */
export const TRANSACTION_REFERENCE_TYPES = ['TRANSACTION'] as const;
export type TransactionReferenceType = (typeof TRANSACTION_REFERENCE_TYPES)[number];

/**
 * A raw UUID plus what it refers to. Never the transactions module's own
 * identifier type, never a relation, never an import.
 */
export interface TransactionRef {
  readonly referenceType: TransactionReferenceType;
  readonly transactionId: string;
}

export const TransactionRef = {
  of(
    transactionId: string,
    referenceType: TransactionReferenceType = 'TRANSACTION',
  ): TransactionRef {
    if (!TRANSACTION_REFERENCE_TYPES.includes(referenceType)) {
      throw new InvalidReferenceError(
        `TransactionRef referenceType must be one of (${TRANSACTION_REFERENCE_TYPES.join(', ')}), got '${String(referenceType)}'`,
      );
    }
    return Object.freeze({
      referenceType,
      transactionId: requireUuid('TransactionRef', transactionId),
    });
  },

  /** Value equality — two refs are the same anchor iff kind and UUID match. */
  equals(left: TransactionRef, right: TransactionRef): boolean {
    return (
      left.referenceType === right.referenceType && left.transactionId === right.transactionId
    );
  },
};

/** What a `MatchedAccountRef` UUID points at. Closed set. */
export const MATCHED_ACCOUNT_REFERENCE_TYPES = ['FINANCIAL_ACCOUNT'] as const;
export type MatchedAccountReferenceType = (typeof MATCHED_ACCOUNT_REFERENCE_TYPES)[number];

/**
 * The account one side of a match belongs to. A raw uuid plus its kind; never
 * another module's identifier type.
 */
export interface MatchedAccountRef {
  readonly referenceType: MatchedAccountReferenceType;
  readonly accountId: string;
}

export const MatchedAccountRef = {
  of(
    accountId: string,
    referenceType: MatchedAccountReferenceType = 'FINANCIAL_ACCOUNT',
  ): MatchedAccountRef {
    if (!MATCHED_ACCOUNT_REFERENCE_TYPES.includes(referenceType)) {
      throw new InvalidReferenceError(
        `MatchedAccountRef referenceType must be one of (${MATCHED_ACCOUNT_REFERENCE_TYPES.join(', ')}), got '${String(referenceType)}'`,
      );
    }
    return Object.freeze({
      referenceType,
      accountId: requireUuid('MatchedAccountRef', accountId),
    });
  },

  equals(left: MatchedAccountRef, right: MatchedAccountRef): boolean {
    return left.referenceType === right.referenceType && left.accountId === right.accountId;
  },
};

/**
 * There is deliberately NO reference type for an exchange rate, an FX quote,
 * or a conversion.
 *
 * ADR-0028 permits a cross-currency match only on a **source-stated** FX
 * relationship, and no source states one anywhere in this platform. A
 * reference type here would be the first move toward resolving a rate — and a
 * rate this platform chose would turn "the person moved their own money" into
 * "the person moved their own money and lost some of it, according to us".
 * When a source-stated relationship one day exists, it arrives as a column
 * carrying the SOURCE'S OWN statement plus a widened CHECK, in a reviewed
 * migration.
 */
