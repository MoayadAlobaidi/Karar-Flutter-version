/**
 * The two closed vocabularies a row error is made of, and the rule that keeps
 * the offending value out of both.
 *
 * ## The defect this exists to close
 *
 * The natural way to report a bad statement line is to quote it: "could not
 * read amount '1.234,56' on row 14". That message then travels into a log, an
 * error tracker, a support ticket and a screenshot — and it is a fragment of
 * somebody's bank statement in every one of them. The value is exactly the
 * thing the ciphertext columns exist to protect, handed out in the one place
 * nobody thinks of as storage.
 *
 * So an error here is **a line number, a safe field name, and a reason code**.
 * Nothing else. `statement_import_row_errors` (migration 0101) has no
 * `detail`, `message`, `raw_value`, `context` or jsonb column, and a
 * `CHECK` cannot assert the absence of a column, so an exhaustive-column test
 * reads `information_schema.columns` and fails on any column added at all.
 *
 * ## Why the field name is OURS and not the file's
 *
 * A CSV header is content from the file. It can say `Amount`, and it can just
 * as easily say `Acct 4471-2299-0031 balance` — headers in real exports carry
 * account numbers, branch codes and names. Echoing a header back is the same
 * leak as echoing a cell. `SafeField` is therefore this module's own
 * vocabulary, mapped from whatever the header said and never derived from its
 * text.
 *
 * Pure: no clock, no randomness, no I/O.
 */

/**
 * Which part of a line a refusal is about, in this module's own words.
 *
 * `ROW` is the whole line — used when the line could not be split into fields
 * at all, so no field name is meaningful yet.
 */
export const SAFE_FIELDS = [
  'ROW',
  'BOOKING_DATE',
  'VALUE_DATE',
  'EVENT_OCCURRED_AT',
  'SOURCE_TIMEZONE',
  'AMOUNT',
  'DEBIT_AMOUNT',
  'CREDIT_AMOUNT',
  'CURRENCY',
  'DESCRIPTION',
  'MERCHANT',
  'SOURCE_BALANCE',
  'SOURCE_REFERENCE',
  'INSTRUMENT_MASK',
] as const;

export type SafeField = (typeof SAFE_FIELDS)[number];

export function isSafeField(value: string): value is SafeField {
  return (SAFE_FIELDS as readonly string[]).includes(value);
}

/**
 * Why a line was refused. Stable codes: a client translates them, a support
 * engineer searches for them, and neither has to quote the line.
 *
 * The ambiguity codes are the ones worth reading twice. `1.234` is one
 * thousand two hundred and thirty-four in one convention and one point two
 * three four in another; `03/04/2026` is March in one and April in another.
 * Neither has a right answer available from the value itself, so neither gets
 * guessed — `AMBIGUOUS_DECIMAL_SEPARATOR` and `AMBIGUOUS_DATE_ORDER` are
 * refusals that send the file to review, not defaults dressed as decisions.
 */
export const ROW_ERROR_REASON_CODES = [
  /** A field the mapping declared as required was absent or blank. */
  'REQUIRED_FIELD_MISSING',
  /** The characters are not a number under any rule this module applies. */
  'UNREADABLE_AMOUNT',
  /** Both a `.` and a `,` reading are defensible and neither is stated. */
  'AMBIGUOUS_DECIMAL_SEPARATOR',
  /** Day-first and month-first both produce a real date, and neither is stated. */
  'AMBIGUOUS_DATE_ORDER',
  /** Not a date in any accepted shape. */
  'UNREADABLE_DATE',
  /** A stated instant that is not a parseable instant. */
  'UNREADABLE_INSTANT',
  /** A stated zone that is not an IANA zone this runtime knows. */
  'UNKNOWN_TIMEZONE',
  /** A currency code this platform does not support. */
  'UNKNOWN_CURRENCY',
  /** The line's currency is not the account's, and nothing here converts. */
  'CURRENCY_MISMATCH',
  /** A direction word that is neither debit nor credit in any recognised form. */
  'AMBIGUOUS_DIRECTION',
  /** Separate debit and credit columns both carried a value on one line. */
  'DEBIT_AND_CREDIT_BOTH_PRESENT',
  /** Separate debit and credit columns were both empty on one line. */
  'DEBIT_AND_CREDIT_BOTH_ABSENT',
  /** One field exceeded the declared per-field byte ceiling. */
  'FIELD_TOO_LARGE',
  /** The line had more columns than the declared ceiling. */
  'TOO_MANY_COLUMNS',
  /** The line had a different number of columns than the header. */
  'COLUMN_COUNT_MISMATCH',
  /** The bytes are not valid UTF-8. */
  'INVALID_ENCODING',
  /** RFC 4180 quoting that cannot be resolved — an unterminated quote. */
  'MALFORMED_QUOTING',
  /** A number too large to be exact minor units. */
  'AMOUNT_EXCEEDS_RANGE',
  /** More decimal places than the currency has — 3 in a 2-decimal currency. */
  'DECIMAL_PLACES_EXCEED_CURRENCY',
] as const;

export type RowErrorReasonCode = (typeof ROW_ERROR_REASON_CODES)[number];

export function isRowErrorReasonCode(value: string): value is RowErrorReasonCode {
  return (ROW_ERROR_REASON_CODES as readonly string[]).includes(value);
}

/**
 * One refusal about one line. Three fields, and there is deliberately no
 * fourth — see the header.
 */
export interface RowError {
  /** 1-based, among the DATA rows. Never an offset into the file. */
  readonly rowNumber: number;
  readonly safeField: SafeField;
  readonly reasonCode: RowErrorReasonCode;
}

export function rowError(
  rowNumber: number,
  safeField: SafeField,
  reasonCode: RowErrorReasonCode,
): RowError {
  return Object.freeze({ rowNumber, safeField, reasonCode });
}

/**
 * The stable codes an IMPORT (rather than one line) can be refused with.
 *
 * Separate from the row codes because they are answers to a different
 * question: a row code says which line the person should look at, an import
 * code says why there is nothing to look at. The limit refusals name the
 * bound they hit rather than a generic "too big", because "this file has more
 * rows than we accept" and "one field in it was enormous" send a person to
 * two different remedies.
 */
export const IMPORT_REFUSAL_CODES = [
  'SOURCE_TOO_LARGE',
  'TOO_MANY_ROWS',
  'TOO_MANY_COLUMNS',
  'FIELD_TOO_LARGE',
  'BUFFERED_ROWS_EXCEEDED',
  'BUFFERED_BYTES_EXCEEDED',
  'DEADLINE_EXCEEDED',
  'CANCELLED',
  'TOO_MANY_ERRORS',
  'UNSUPPORTED_MEDIA_TYPE',
  'INVALID_ENCODING',
  'BINARY_CONTENT',
  'SPREADSHEET_CONTENT',
  'COMPRESSED_CONTENT',
  'MALFORMED_QUOTING',
  'EMPTY_SOURCE',
  'NO_HEADER_ROW',
  'MAPPING_AMBIGUOUS',
  'MULTIPLE_ACCOUNTS_IN_SOURCE',
  'CURRENCY_MISMATCH',
  'RECONCILIATION_MISMATCH',
  'SOURCE_ALREADY_IMPORTED',
  'SOURCE_INTEGRITY_FAILED',
  'SOURCE_UNREADABLE',
] as const;

export type ImportRefusalCode = (typeof IMPORT_REFUSAL_CODES)[number];

export function isImportRefusalCode(value: string): value is ImportRefusalCode {
  return (IMPORT_REFUSAL_CODES as readonly string[]).includes(value);
}
