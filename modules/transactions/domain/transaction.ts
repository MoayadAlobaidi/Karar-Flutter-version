/**
 * `Transaction` — the canonical record of one movement of money on one
 * account, as the subject entered it or as a reviewed import committed it.
 *
 * Pure: no framework, no ORM, no clock, no randomness, no I/O. Time and
 * identity arrive as arguments (architecture test 11).
 *
 * Three properties this shape exists to guarantee:
 *
 *  1. **Exactness.** The amount is `Money` — BIGINT minor units plus a
 *     `Currency` carrying its own ISO 4217 exponent (ADR-0006). No `number`
 *     appears in any monetary position, here or in the row that stores it.
 *
 *  2. **One sign convention.** See `sign-convention.ts`. Money out of the
 *     account is negative; the source's own debit/credit wording is preserved
 *     in provenance instead of being dissolved into the sign.
 *
 *  3. **Nothing unexplainable.** Every transaction has provenance
 *     (`provenance.ts`) naming either manual input or an exact source row, and
 *     every later correction becomes a revision (`revision.ts`) rather than an
 *     overwrite.
 *
 * The three free-text fields are `HsfField` values: plaintext in memory,
 * inside a wrapper that redacts on every accidental rendering path, encrypted
 * at rest behind the `HsfFieldEncryption` port. The domain never sees a key.
 */

import type { Currency, Money } from '@karar/shared-kernel';

import type { HsfField } from './hsf-field.js';
import type { AccountRef, TransactionId } from './refs.js';

/** How the record came into existence. `CSV` covers reviewed statement import. */
export const SOURCE_KINDS = ['MANUAL', 'CSV'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * Lifecycle state.
 *
 * `POSTED` is the ordinary state of a committed fact. `VOIDED` marks a record
 * a subject withdrew without deleting it — kept distinct from deletion
 * because a voided transaction still has provenance worth keeping while a
 * deleted one is gone under `CASCADE_DELETE` (MODULE.md). No state means
 * "pending review": staged rows live in the import tables the ingestion
 * workstream owns and only reach this table once committed.
 */
export const TRANSACTION_STATUSES = ['POSTED', 'VOIDED'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export class InvalidTransactionError extends Error {
  override readonly name = 'InvalidTransactionError';
}

/**
 * The amount a source stated in ITS currency, when that differs from the
 * account's — an **all-or-nothing pair**.
 *
 * Both members or neither. A currency without an amount says nothing, and an
 * amount without a currency is the classic corruption: a bare number that
 * later reads as the account currency and is wrong by a factor of the
 * exchange rate.
 *
 * **No derived exchange rate is computed or stored, ever.** Dividing the
 * booked amount by the original amount yields a number that looks like a rate
 * and is not one: it silently absorbs the institution's spread, its fees, its
 * rounding, and any partial settlement, and it changes with the exponents of
 * two currencies. Storing that quotient would create a figure this platform
 * did not observe and cannot defend, which is precisely the class of
 * fabricated financial fact the product refuses. If a source states a rate
 * explicitly, that is a source-stated fact and belongs with the import
 * evidence — still not something computed here.
 */
export interface OriginalAmount {
  readonly amount: Money;
  readonly currency: Currency;
}

export const OriginalAmount = {
  /**
   * Builds the pair, or `null` when both members are absent. A half-supplied
   * pair throws: it is a defect at the call site, not a business outcome.
   */
  of(amount: Money | null | undefined, currency: Currency | null | undefined): OriginalAmount | null {
    const hasAmount = amount !== null && amount !== undefined;
    const hasCurrency = currency !== null && currency !== undefined;
    if (!hasAmount && !hasCurrency) return null;
    if (!hasAmount || !hasCurrency) {
      throw new InvalidTransactionError(
        'originalAmount is an all-or-nothing pair: supply both the amount and its currency, or neither — ' +
          'a lone amount is a number whose meaning depends on a currency nobody recorded',
      );
    }
    if (amount.currency.code !== currency.code) {
      throw new InvalidTransactionError(
        `originalAmount currency mismatch: the amount is denominated in ${amount.currency.code} but the pair declares ${currency.code}`,
      );
    }
    return Object.freeze({ amount, currency });
  },
};

/**
 * The canonical transaction.
 *
 * `version` is an optimistic-concurrency counter, incremented by exactly one
 * per accepted correction. It is what makes "update this transaction" safe
 * under two concurrent editors without either silently winning.
 */
export interface Transaction {
  readonly id: TransactionId;
  readonly tenantId: string;
  readonly userId: string;
  readonly accountRef: AccountRef;
  /** Exact, signed under the canonical convention. */
  readonly amount: Money;
  /** When the movement is booked to the account. Required — a transaction with no date is not a transaction. */
  readonly bookingDate: Date;
  /** When value is applied, where a source distinguishes it. Optional; never inferred from bookingDate. */
  readonly valueDate: Date | null;
  readonly merchant: HsfField | null;
  readonly description: HsfField;
  readonly note: HsfField | null;
  /** Source-stated amount in the source's own currency, all-or-nothing. */
  readonly originalAmount: OriginalAmount | null;
  readonly sourceKind: SourceKind;
  readonly status: TransactionStatus;
  readonly createdAt: Date;
  readonly version: number;
}

/**
 * Validates and freezes a transaction. Throws rather than returning a
 * `Result`: a malformed transaction reaching this constructor is a defect in
 * the calling use case, and every expected refusal (a bad date from a
 * request, an unknown currency code) is already a typed outcome upstream.
 */
export function createTransaction(fields: Transaction): Transaction {
  if (!Number.isInteger(fields.version) || fields.version < 1) {
    throw new InvalidTransactionError(
      `version must be a positive integer, got ${String(fields.version)}`,
    );
  }
  requireInstant('bookingDate', fields.bookingDate);
  requireInstant('createdAt', fields.createdAt);
  if (fields.valueDate !== null) requireInstant('valueDate', fields.valueDate);
  if (
    fields.originalAmount !== null &&
    fields.originalAmount.currency.code === fields.amount.currency.code
  ) {
    throw new InvalidTransactionError(
      `originalAmount is for a source currency that differs from the booked currency; ` +
        `both are ${fields.amount.currency.code}, which records nothing and invites a redundant second copy of the same figure`,
    );
  }
  return Object.freeze({ ...fields });
}

function requireInstant(field: string, value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidTransactionError(`${field} must be a valid Date`);
  }
}

/**
 * The fields a correction may change. Deliberately narrow: identity, owner,
 * account anchor, source kind, and creation instant are NOT correctable —
 * changing any of them would make the record a different record wearing the
 * same id, and the honest operation for that is a delete plus a new entry.
 */
export interface TransactionCorrection {
  readonly amount?: Money;
  readonly bookingDate?: Date;
  readonly valueDate?: Date | null;
  readonly merchant?: HsfField | null;
  readonly description?: HsfField;
  readonly note?: HsfField | null;
  readonly status?: TransactionStatus;
}

/**
 * Applies a correction, returning the next version. Pure — the caller pairs
 * the result with the `TransactionRevision` that records what changed, and
 * persists both in one transaction.
 */
export function applyCorrection(
  current: Transaction,
  correction: TransactionCorrection,
): Transaction {
  const next: Transaction = {
    ...current,
    ...(correction.amount !== undefined ? { amount: correction.amount } : {}),
    ...(correction.bookingDate !== undefined ? { bookingDate: correction.bookingDate } : {}),
    ...(correction.valueDate !== undefined ? { valueDate: correction.valueDate } : {}),
    ...(correction.merchant !== undefined ? { merchant: correction.merchant } : {}),
    ...(correction.description !== undefined ? { description: correction.description } : {}),
    ...(correction.note !== undefined ? { note: correction.note } : {}),
    ...(correction.status !== undefined ? { status: correction.status } : {}),
    version: current.version + 1,
  };
  if (correction.amount !== undefined && correction.amount.currency.code !== current.amount.currency.code) {
    throw new InvalidTransactionError(
      `a correction may not change the currency of a booked transaction (${current.amount.currency.code} -> ${correction.amount.currency.code}); ` +
        're-denominating a record in place would silently rewrite history, so the honest operation is a delete plus a new entry',
    );
  }
  return createTransaction(next);
}
