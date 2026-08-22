/**
 * Reference types this module declares.
 *
 * Cross-module references carry a raw UUID plus a reference type declared
 * HERE (modules/payment-instruments/MODULE.md; data-model.md §2). The branded
 * alias is what stops an account id being handed to a call site expecting an
 * instrument id, without dragging a foreign module's types across the
 * boundary. `TenantId` and `UserId` are kernel universals and are deliberately
 * not redeclared.
 *
 * `BalanceBearingAccountRef` is the important one, and it is deliberately NOT
 * `modules/financial-accounts`' `FinancialAccountId`. An instrument is
 * anchored to an account owned by another bounded context; what crosses the
 * boundary is a UUID and a locally-declared discriminator saying what the
 * UUID refers to, exactly as `modules/transactions` and
 * `modules/financial-connections` do for the same anchor. The two contexts
 * stay independently evolvable, and a reader of an instrument row can tell
 * what `account_id` points at without opening another module's source.
 *
 * The name says the invariant: an instrument points at an account where a
 * balance SITS. It is the account that is balance-bearing; the instrument
 * never is, and there is no reference type here for anything else an
 * instrument could draw on, because there is nothing else.
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

/** A `payment_instruments.id`. */
export type PaymentInstrumentId = string & { readonly __brand: 'PaymentInstrumentId' };

export const PaymentInstrumentId = {
  of(value: string): PaymentInstrumentId {
    return requireUuid('PaymentInstrumentId', value) as PaymentInstrumentId;
  },
};

/** What a `BalanceBearingAccountRef` UUID points at. Closed set. */
export const BALANCE_BEARING_ACCOUNT_REFERENCE_TYPES = ['FINANCIAL_ACCOUNT'] as const;
export type BalanceBearingAccountReferenceType =
  (typeof BALANCE_BEARING_ACCOUNT_REFERENCE_TYPES)[number];

/**
 * A raw UUID plus what it refers to. Never the financial-accounts module's own
 * identifier type, never a relation, never an import.
 */
export interface BalanceBearingAccountRef {
  readonly referenceType: BalanceBearingAccountReferenceType;
  readonly accountId: string;
}

export const BalanceBearingAccountRef = {
  of(
    accountId: string,
    referenceType: BalanceBearingAccountReferenceType = 'FINANCIAL_ACCOUNT',
  ): BalanceBearingAccountRef {
    if (!BALANCE_BEARING_ACCOUNT_REFERENCE_TYPES.includes(referenceType)) {
      throw new InvalidReferenceError(
        `BalanceBearingAccountRef referenceType must be one of (${BALANCE_BEARING_ACCOUNT_REFERENCE_TYPES.join(', ')}), got '${String(referenceType)}'`,
      );
    }
    return Object.freeze({
      referenceType,
      accountId: requireUuid('BalanceBearingAccountRef', accountId),
    });
  },

  /** Value equality — two refs are the same anchor iff kind and UUID match. */
  equals(left: BalanceBearingAccountRef, right: BalanceBearingAccountRef): boolean {
    return left.referenceType === right.referenceType && left.accountId === right.accountId;
  },
};

/**
 * There is deliberately NO payment-credential reference type here — no token
 * reference, no network-token id, no wallet provisioning handle, and no
 * opaque "instrument secret" indirection.
 *
 * Adding one would be the first move toward storing what it points at, and
 * this module's whole claim is that no payment credential of any kind exists
 * anywhere in it — not in a column, not in a value object, not behind an
 * indirection that names something held elsewhere. A reference to a
 * credential is still a design that has a credential in it
 * (`modules/financial-connections/domain/refs.ts` records the same rule for
 * institution credentials).
 */
