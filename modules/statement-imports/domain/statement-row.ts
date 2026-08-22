/**
 * One CSV line, mapped and normalised into the facts a transaction is built
 * from — or the typed reasons it could not be.
 *
 * This is the only place raw cell text becomes a financial fact, and it is
 * pure: given the same fields, mapping and currency it produces the same
 * result forever, with no clock, no randomness and no I/O. That matters
 * because the result is fingerprinted and the fingerprint decides whether a
 * row is a duplicate; a non-deterministic mapping would make the same
 * statement import differently on two runs.
 *
 * ## Everything is collected, nothing short-circuits
 *
 * A line with an unreadable date AND an unreadable amount produces two
 * errors, not the first one. A person fixing a mapping needs to see every
 * consequence of the convention they got wrong; reporting one at a time turns
 * a single fix into four round trips through a 40,000-line file.
 *
 * ## The sign is derived here, once, from a STATED frame
 *
 * `modules/transactions` owns the canonical convention — money out of the
 * account is negative, from the account holder's point of view — and this
 * module never adopts the source's frame. What the source literally said is
 * preserved as `sourceDirection`, and HOW it was interpreted is preserved as
 * `directionMapping`, so a later discovery that one institution's export uses
 * the bank-ledger frame is a re-derivation from stored facts rather than an
 * archaeological dig through lost semantics.
 */

import { CalendarDay } from '@karar/shared-kernel';
import type { Currency } from '@karar/shared-kernel';

import { HsfField, INSTRUMENT_MASK_MAX_BYTES } from './hsf-field.js';
import {
  normalizeAmount,
  normalizeDay,
  normalizeInstant,
  normalizeText,
  normalizeTimezone,
  type NormalizedAmount,
} from './normalization.js';
import { rowError, type RowError, type SafeField } from './reason-codes.js';
import type { SourceBalanceKind, StatementColumnMapping } from './column-mapping.js';

/**
 * What the SOURCE literally said about direction. The same vocabulary
 * `modules/transactions` uses, restated here rather than imported: nothing
 * crosses a module boundary except through `public-api.ts`, and a domain type
 * shared between two modules is a coupling neither boundary admits.
 */
export const SOURCE_DIRECTIONS = ['DEBIT', 'CREDIT', 'NOT_STATED'] as const;
export type SourceDirection = (typeof SOURCE_DIRECTIONS)[number];

/** How this module arrived at the stored sign. Manual entry never occurs here. */
export const DIRECTION_MAPPINGS = [
  'SOURCE_DIRECTION_WORD',
  'SOURCE_SIGNED_AMOUNT',
  'SOURCE_SIGNED_AMOUNT_INVERTED',
] as const;
export type DirectionMapping = (typeof DIRECTION_MAPPINGS)[number];

/** One line, read successfully. Every field is a fact the source supplied. */
export interface MappedStatementRow {
  /** 1-based, among the DATA rows. Never an offset into the file. */
  readonly rowNumber: number;
  readonly bookingDate: CalendarDay;
  readonly valueDate: CalendarDay | null;
  /** Only when the source supplied a real instant. Never derived from the day. */
  readonly eventOccurredAt: Date | null;
  /** Only when the source stated a zone. Never this platform's. */
  readonly sourceTimezone: string | null;
  readonly description: HsfField;
  readonly merchant: HsfField | null;
  /** Exact minor units, signed under the canonical convention. */
  readonly amountMinorUnits: bigint;
  readonly currencyCode: string;
  readonly sourceDirection: SourceDirection;
  readonly directionMapping: DirectionMapping;
  /** The balance the LINE stated, in the line's own currency. Never derived. */
  readonly sourceBalanceMinorUnits: bigint | null;
  readonly sourceBalanceKind: SourceBalanceKind | null;
  /** The source's own transaction reference. HSF: another party's identifier. */
  readonly sourceReference: HsfField | null;
  /** The instrument mask the line named. HSF, and bounded. */
  readonly instrumentMask: HsfField | null;
  /**
   * The value of the account-identifier column, if the mapping named one.
   *
   * Used ONLY to detect that the file describes more than one account, and
   * deliberately NOT persisted: it is another party's identifier for the
   * subject, it plays no part in the fingerprint, and a column that exists to
   * make a refusal possible must not become a column that stores identifiers.
   */
  readonly accountIdentifier: string | null;
  /**
   * The description after normalisation, as the dedup fingerprint consumes
   * it. Carried explicitly so the value that entered the digest is the value
   * the row was built from, rather than one re-derived at commit time under
   * whatever the rules say then.
   */
  readonly normalizedNarrative: string;
}

export type RowMappingOutcome =
  | { readonly ok: true; readonly row: MappedStatementRow }
  | { readonly ok: false; readonly errors: readonly RowError[] };

/**
 * Reads one line.
 *
 * `accountCurrency` is the currency of the ONE account this import targets.
 * A line in a different currency is refused as `CURRENCY_MISMATCH` rather
 * than converted: this platform stores no exchange rate it did not observe,
 * and a converted figure on a bank statement is a number nobody can defend.
 */
export function mapStatementRow(input: {
  readonly rowNumber: number;
  readonly fields: readonly string[];
  readonly mapping: StatementColumnMapping;
  readonly accountCurrency: Currency;
  /** Resolves a currency code, or `null` when this platform does not support it. */
  readonly resolveCurrency: (code: string) => Currency | null;
}): RowMappingOutcome {
  const { rowNumber, fields, mapping, accountCurrency, resolveCurrency } = input;
  const errors: RowError[] = [];
  const at = (column: number | null): string | null =>
    column === null ? null : (fields[column] ?? null);

  // Currency first: every amount on this line is read against it, and reading
  // an amount against the wrong exponent is how `1.234` becomes the wrong
  // number rather than a refusal.
  const currency = resolveLineCurrency(rowNumber, mapping, at, resolveCurrency, errors);
  // A line in a currency the account is not held in is refused, never
  // converted: this platform stores no exchange rate it did not observe, and a
  // converted figure on a bank statement is a number nobody can defend.
  if (currency !== null && currency.code !== accountCurrency.code) {
    errors.push(rowError(rowNumber, 'CURRENCY', 'CURRENCY_MISMATCH'));
  }

  const bookingDate = normalizeDay(at(mapping.bookingDateColumn), mapping.dateOrder);
  if (!bookingDate.ok) errors.push(rowError(rowNumber, 'BOOKING_DATE', bookingDate.reason));

  let valueDate: CalendarDay | null = null;
  if (mapping.valueDateColumn !== null) {
    const rawValueDate = at(mapping.valueDateColumn);
    // An absent optional field is absence, not an error. Only a present but
    // unreadable one is.
    if (normalizeText(rawValueDate) !== null) {
      const read = normalizeDay(rawValueDate, mapping.dateOrder);
      if (read.ok) valueDate = read.value;
      else errors.push(rowError(rowNumber, 'VALUE_DATE', read.reason));
    }
  }

  let eventOccurredAt: Date | null = null;
  if (mapping.eventOccurredAtColumn !== null) {
    const raw = at(mapping.eventOccurredAtColumn);
    if (normalizeText(raw) !== null) {
      const read = normalizeInstant(raw);
      if (read.ok) eventOccurredAt = read.value;
      else errors.push(rowError(rowNumber, 'EVENT_OCCURRED_AT', read.reason));
    }
  }

  let sourceTimezone: string | null = null;
  if (mapping.sourceTimezoneColumn !== null) {
    const raw = at(mapping.sourceTimezoneColumn);
    if (normalizeText(raw) !== null) {
      const read = normalizeTimezone(raw);
      if (read.ok) sourceTimezone = read.value;
      else errors.push(rowError(rowNumber, 'SOURCE_TIMEZONE', read.reason));
    }
  }
  // A zone with no instant to interpret is not a fact about the statement.
  if (sourceTimezone !== null && eventOccurredAt === null) sourceTimezone = null;

  const narrative = normalizeText(at(mapping.descriptionColumn));
  if (narrative === null) {
    errors.push(rowError(rowNumber, 'DESCRIPTION', 'REQUIRED_FIELD_MISSING'));
  }
  const merchantText = normalizeText(at(mapping.merchantColumn));

  const amount =
    currency === null ? null : readAmount(rowNumber, fields, mapping, currency, errors);

  let sourceBalanceMinorUnits: bigint | null = null;
  if (mapping.sourceBalanceColumn !== null && currency !== null) {
    const raw = at(mapping.sourceBalanceColumn);
    if (normalizeText(raw) !== null) {
      const read = normalizeAmount(raw, currency);
      if (read.ok) {
        sourceBalanceMinorUnits = read.value.negativeMarker
          ? -read.value.minorUnits
          : read.value.minorUnits;
      } else {
        errors.push(rowError(rowNumber, 'SOURCE_BALANCE', read.reason));
      }
    }
  }

  const sourceReferenceText = boundedHsf(
    rowNumber,
    normalizeText(at(mapping.sourceReferenceColumn)),
    'SOURCE_REFERENCE',
    errors,
  );
  const instrumentMaskText = boundedHsf(
    rowNumber,
    normalizeText(at(mapping.instrumentMaskColumn)),
    'INSTRUMENT_MASK',
    errors,
    INSTRUMENT_MASK_MAX_BYTES,
  );
  const descriptionField = boundedHsf(rowNumber, narrative, 'DESCRIPTION', errors);
  const merchantField = boundedHsf(rowNumber, merchantText, 'MERCHANT', errors);

  if (
    errors.length > 0 ||
    !bookingDate.ok ||
    amount === null ||
    currency === null ||
    descriptionField === null ||
    narrative === null
  ) {
    return { ok: false, errors: Object.freeze(errors) };
  }

  return {
    ok: true,
    row: Object.freeze({
      rowNumber,
      bookingDate: bookingDate.value,
      valueDate,
      eventOccurredAt,
      sourceTimezone,
      description: descriptionField,
      merchant: merchantField,
      amountMinorUnits: amount.signedMinorUnits,
      currencyCode: currency.code,
      sourceDirection: amount.sourceDirection,
      directionMapping: amount.directionMapping,
      sourceBalanceMinorUnits,
      sourceBalanceKind: mapping.sourceBalanceKind,
      sourceReference: sourceReferenceText,
      instrumentMask: instrumentMaskText,
      accountIdentifier: normalizeText(at(mapping.accountIdentifierColumn)),
      normalizedNarrative: narrative,
    }),
  };
}

interface ReadAmount {
  readonly signedMinorUnits: bigint;
  readonly sourceDirection: SourceDirection;
  readonly directionMapping: DirectionMapping;
}

/**
 * The amount, in whichever of the two shapes the mapping declared.
 *
 * The debit/credit shape is the one worth reading closely. Both columns
 * carrying a value on one line, and neither carrying one, are BOTH errors —
 * and they are separate errors, because they mean different things. Both
 * present is a file whose columns do not mean what the mapping says;
 * both absent is a line with no amount at all. Neither is resolvable by
 * summing, subtracting, or preferring one column, and every one of those
 * would produce a plausible number.
 */
function readAmount(
  rowNumber: number,
  fields: readonly string[],
  mapping: StatementColumnMapping,
  currency: Currency,
  errors: RowError[],
): ReadAmount | null {
  if (mapping.amount.kind === 'SIGNED') {
    const raw = fields[mapping.amount.amountColumn] ?? null;
    const read = normalizeAmount(raw, currency);
    if (!read.ok) {
      errors.push(rowError(rowNumber, 'AMOUNT', read.reason));
      return null;
    }
    const magnitude = read.value.minorUnits;
    const asStated = read.value.negativeMarker ? -magnitude : magnitude;
    // The frame is STATED, so the inversion is a recorded derivation rather
    // than a rule somebody has to remember.
    const inverted = mapping.amount.signFrame === 'BANK_LEDGER';
    return {
      signedMinorUnits: inverted ? -asStated : asStated,
      sourceDirection: 'NOT_STATED',
      directionMapping: inverted ? 'SOURCE_SIGNED_AMOUNT_INVERTED' : 'SOURCE_SIGNED_AMOUNT',
    };
  }

  const debitRaw = fields[mapping.amount.debitColumn] ?? null;
  const creditRaw = fields[mapping.amount.creditColumn] ?? null;
  const debitPresent = normalizeText(debitRaw) !== null;
  const creditPresent = normalizeText(creditRaw) !== null;

  if (debitPresent && creditPresent) {
    errors.push(rowError(rowNumber, 'AMOUNT', 'DEBIT_AND_CREDIT_BOTH_PRESENT'));
    return null;
  }
  if (!debitPresent && !creditPresent) {
    errors.push(rowError(rowNumber, 'AMOUNT', 'DEBIT_AND_CREDIT_BOTH_ABSENT'));
    return null;
  }

  const isDebit = debitPresent;
  const read: ReturnType<typeof normalizeAmount> = normalizeAmount(
    isDebit ? debitRaw : creditRaw,
    currency,
  );
  if (!read.ok) {
    errors.push(rowError(rowNumber, isDebit ? 'DEBIT_AMOUNT' : 'CREDIT_AMOUNT', read.reason));
    return null;
  }
  const value: NormalizedAmount = read.value;
  // A negative marker inside a debit or credit column is contradictory: the
  // column already says the direction. Refused rather than reinterpreted.
  if (value.negativeMarker) {
    errors.push(
      rowError(rowNumber, isDebit ? 'DEBIT_AMOUNT' : 'CREDIT_AMOUNT', 'AMBIGUOUS_DIRECTION'),
    );
    return null;
  }
  return {
    signedMinorUnits: isDebit ? -value.minorUnits : value.minorUnits,
    sourceDirection: isDebit ? 'DEBIT' : 'CREDIT',
    directionMapping: 'SOURCE_DIRECTION_WORD',
  };
}

function resolveLineCurrency(
  rowNumber: number,
  mapping: StatementColumnMapping,
  at: (column: number | null) => string | null,
  resolveCurrency: (code: string) => Currency | null,
  errors: RowError[],
): Currency | null {
  const stated = mapping.statedCurrencyCode;
  const raw = stated ?? normalizeText(at(mapping.currencyColumn));
  if (raw === null) {
    errors.push(rowError(rowNumber, 'CURRENCY', 'REQUIRED_FIELD_MISSING'));
    return null;
  }
  const resolved = resolveCurrency(raw.toUpperCase());
  if (resolved === null) {
    errors.push(rowError(rowNumber, 'CURRENCY', 'UNKNOWN_CURRENCY'));
    return null;
  }
  return resolved;
}

/**
 * Wraps a normalised text as an HSF field, turning an over-long value into a
 * typed refusal instead of a throw.
 *
 * `HsfField.of` throws by contract — reaching it with a value its rules
 * reject is a defect in the module. A statement cell is user-supplied and
 * genuinely can be enormous, so the length is checked here and reported as
 * `FIELD_TOO_LARGE`, which is a fact about the line rather than a bug.
 */
function boundedHsf(
  rowNumber: number,
  value: string | null,
  field: SafeField,
  errors: RowError[],
  maxBytes?: number,
): HsfField | null {
  if (value === null) return null;
  if (maxBytes !== undefined && utf8ByteLength(value) > maxBytes) {
    errors.push(rowError(rowNumber, field, 'FIELD_TOO_LARGE'));
    return null;
  }
  try {
    return HsfField.of(value);
  } catch {
    errors.push(rowError(rowNumber, field, 'FIELD_TOO_LARGE'));
    return null;
  }
}

/**
 * The length PostgreSQL will measure, not the length JavaScript reports.
 *
 * `'\u062d1234'.length` is 5 but its UTF-8 encoding is 6 bytes, and it is the
 * encoding that meets the column's `octet_length` check.
 */
function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Whether the mapped rows describe more than one account.
 *
 * A file that covers a current account and the credit card printed beneath it
 * is ordinary — ADR-0028 names it as the reason one connection feeds many
 * accounts — and this import targets exactly ONE account. So the answer is a
 * refusal, never a split: silently filing both sets of movements into the one
 * account the person selected produces a balance that is wrong by the whole
 * of the other account, with nothing on screen to suggest it.
 */
export function distinctAccountIdentifiers(
  rows: readonly MappedStatementRow[],
): readonly string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.accountIdentifier !== null) seen.add(row.accountIdentifier);
  }
  return Object.freeze([...seen]);
}
