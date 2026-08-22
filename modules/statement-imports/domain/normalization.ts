/**
 * Deterministic, versioned normalisation of what a CSV cell says into what
 * this platform stores.
 *
 * ## The rule the whole file is built on: REFUSE, NEVER GUESS
 *
 * `1.234` is one thousand two hundred and thirty-four in one convention and
 * one point two three four in another. `03/04/2026` is March in one and April
 * in another. Neither has a right answer available from the value itself, and
 * a product that picks one is wrong about somebody's money roughly half the
 * time — silently, in a way that looks completely normal on screen. So every
 * genuinely ambiguous input produces a typed reason code and sends the import
 * to review; nothing here has a default, a locale, or a "usually".
 *
 * **An unreadable amount is an ERROR, never a zero.** Zero is a real
 * financial fact — a reversed fee genuinely produces one — so a column that
 * is later summed must not conflate "nothing happened" with "we could not
 * read it". This module answers `UNREADABLE_AMOUNT` and the row is INVALID
 * with a NULL amount (migration 0101 refuses an INVALID row that carries one).
 *
 * ## What is handled, and why each case is here rather than theoretical
 *
 * - **Arabic-Indic (U+0660–U+0669) and Extended Arabic-Indic / Persian
 *   (U+06F0–U+06F9) digits.** Statements printed in the launch markets carry
 *   them, and `Number('٣')` is `NaN`.
 * - **U+066B ARABIC DECIMAL SEPARATOR and U+066C ARABIC THOUSANDS
 *   SEPARATOR.** The same roles as `.` and `,`, in different code points.
 * - **Accounting negatives, `(1,234.56)`.** Every spreadsheet export produces
 *   them, and read naively they become positive.
 * - **Trailing minus, `1234.56-`.** Mainframe-derived exports produce them,
 *   and read naively they become positive.
 * - **Separate debit and credit columns.** Handled in `column-mapping.ts`;
 *   this file provides the amount reading each column needs.
 * - **Unicode normalisation (NFC), BOM, control characters and whitespace.**
 *   Two visually identical merchant strings that differ by composition
 *   produce two different dedup fingerprints, so the same purchase imported
 *   from two exports becomes two transactions.
 * - **0-, 2- and 3-decimal currencies.** KWD, BHD and OMR have three. The
 *   exponent is not decoration: it decides whether `1.234` is even readable.
 *
 * ## Why the version is a constant here and is stored on every row
 *
 * Everything above is a RULESET, and rulesets move. A digest, a stored
 * amount, or a committed transaction whose normalisation rules are
 * unrecorded becomes uninterpretable the moment they change — and a silent
 * redefinition either resurrects duplicates or hides genuine new rows. The
 * version travels into `transaction_provenance.normalization_version`, so a
 * later reader can say which rules produced a stored figure.
 *
 * Pure: no clock, no randomness, no I/O.
 */

import { CalendarDay } from '@karar/shared-kernel';
import type { Currency } from '@karar/shared-kernel';

import type { RowErrorReasonCode } from './reason-codes.js';

/**
 * The identifier for this ruleset. Bumped whenever any rule below changes
 * what a given input produces — including a rule that merely accepts
 * something previously refused, because "this file used to fail and now
 * imports" is exactly the kind of change a stored version has to be able to
 * explain.
 */
export const NORMALIZATION_VERSION = 'statement-csv/normalization/v1';

/** The outcome of reading one cell: a value, or the reason it could not be read. */
export type Normalized<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: RowErrorReasonCode };

function ok<T>(value: T): Normalized<T> {
  return { ok: true, value };
}

function refuse<T>(reason: RowErrorReasonCode): Normalized<T> {
  return { ok: false, reason };
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

/** U+FEFF, wherever it appears. A BOM mid-file is a concatenation artefact. */
const BOM = /\uFEFF/g;

/** C0 and C1 controls except tab, which whitespace collapsing handles. */
// eslint-disable-next-line no-control-regex -- the point of the class is the control characters
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Every Unicode space separator, plus tab and the line terminators. */
const WHITESPACE_RUN = /[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g;

/**
 * Digit families this module reads. ASCII plus the two Arabic-script sets a
 * statement in the launch markets actually carries. Deliberately not "every
 * Unicode decimal digit": a rule that accepts Osmanya numerals in a bank
 * statement is a rule nobody can reason about, and the closed list is what
 * makes the transformation reviewable.
 */
const DIGIT_FAMILIES: readonly (readonly [number, string])[] = [
  [0x0660, 'Arabic-Indic'],
  [0x06f0, 'Extended Arabic-Indic (Persian)'],
];

/** The families this ruleset folds to ASCII, for documentation and tests. */
export const SUPPORTED_DIGIT_FAMILIES: readonly string[] = DIGIT_FAMILIES.map(
  ([, name]) => name,
);

/**
 * Folds Arabic-Indic and Persian digits to ASCII, and the two Arabic
 * separators to their ASCII roles.
 *
 * U+066B (decimal) becomes `.` and U+066C (thousands) becomes `,`. That is a
 * mapping of ROLE, not of appearance: the Arabic decimal separator means the
 * decimal point regardless of which ASCII character a reader would expect,
 * so folding it to `.` removes an ambiguity rather than creating one.
 */
export function foldDigits(value: string): string {
  let out = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0x066b) {
      out += '.';
      continue;
    }
    if (code === 0x066c) {
      out += ',';
      continue;
    }
    let folded: string | null = null;
    for (const [base] of DIGIT_FAMILIES) {
      if (code >= base && code <= base + 9) {
        folded = String(code - base);
        break;
      }
    }
    out += folded ?? character;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * The narrative normalisation: NFC, BOM removed, control characters removed,
 * whitespace runs collapsed to one space, trimmed. `null` for an empty
 * result.
 *
 * NFC is the load-bearing step and it is invisible. Two merchant strings that
 * render identically but differ by composition (a precomposed character
 * versus a base plus a combining mark) are different strings, so they produce
 * different dedup fingerprints, so the same purchase imported from two
 * exports of one statement becomes two transactions. Nobody looking at the
 * screen could ever see why.
 *
 * Digits are deliberately NOT folded here. A merchant called `شركة ٧` keeps
 * its digits: folding them would change the name a person reads, and the
 * fingerprint's job is to be stable, not to be Latin.
 */
export function normalizeText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const collapsed = raw
    .normalize('NFC')
    .replace(BOM, '')
    .replace(CONTROL_CHARACTERS, '')
    .replace(WHITESPACE_RUN, ' ')
    .trim();
  return collapsed === '' ? null : collapsed;
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/** What an amount cell resolved to, before any direction rule is applied. */
export interface NormalizedAmount {
  /** Exact minor units, magnitude only. The sign is reported separately. */
  readonly minorUnits: bigint;
  /**
   * Whether the cell itself carried a negative marker — a leading or trailing
   * minus, or accounting parentheses. Reported rather than folded in, because
   * WHICH marker a source used is a fact the sign-mapping rule needs and
   * `direction_mapping` records.
   */
  readonly negativeMarker: boolean;
}

/** The largest magnitude a `bigint` minor-unit column can hold (PostgreSQL bigint). */
const MAX_MINOR_UNITS = 9223372036854775807n;

const AMOUNT_CHARACTERS = /^[0-9.,()+-]*$/;

/**
 * Reads one amount cell for a currency.
 *
 * The separator rule, in full, because it is the part that decides whether a
 * person's statement is read correctly:
 *
 * 1. **Both `.` and `,` present** — the LAST of the two is the decimal
 *    separator and the other is grouping. This is not a preference: a group
 *    separator cannot appear after a decimal separator, so the ordering
 *    settles it with no locale involved.
 * 2. **One separator kind, appearing more than once** — it is grouping.
 *    `1.234.567` has no reading in which it is a decimal point.
 * 3. **One separator kind, appearing once** — decided by how many digits
 *    follow it and by the currency's exponent:
 *    - fewer than or equal to the exponent → a decimal separator;
 *    - exactly three, and the exponent is not three → grouping, because a
 *      3-decimal reading is impossible in a 2-decimal currency;
 *    - exactly three, and the exponent IS three (KWD, BHD, OMR) → genuinely
 *      **ambiguous**: `1.234` is either 1234 fils or 1.234 dinar, and both
 *      are ordinary. Refused as `AMBIGUOUS_DECIMAL_SEPARATOR`.
 *    - more than the exponent and not three → `DECIMAL_PLACES_EXCEED_CURRENCY`.
 *      Refused rather than rounded: rounding somebody's statement line to fit
 *      is a wrong figure that looks right.
 *
 * Grouping is validated rather than merely stripped: groups after the first
 * must be exactly three digits. `1,23,456` is refused as unreadable instead
 * of silently becoming 123456 — a refusal a person can act on, rather than a
 * number nobody will question.
 */
export function normalizeAmount(
  raw: string | null | undefined,
  currency: Currency,
): Normalized<NormalizedAmount> {
  if (raw === null || raw === undefined) return refuse('REQUIRED_FIELD_MISSING');

  // Whitespace is stripped entirely rather than collapsed: `1 234,56` uses a
  // space as a group separator, and a collapsed single space would still not
  // be a number.
  const cleaned = foldDigits(
    raw.normalize('NFC').replace(BOM, '').replace(CONTROL_CHARACTERS, ''),
  ).replace(WHITESPACE_RUN, '');

  if (cleaned === '') return refuse('REQUIRED_FIELD_MISSING');
  if (!AMOUNT_CHARACTERS.test(cleaned)) return refuse('UNREADABLE_AMOUNT');

  // Sign markers. Exactly one form may be used; `(-1234)` and `-1234-` are
  // contradictory rather than emphatic.
  let body = cleaned;
  let negativeMarker = false;
  const parenthesised = body.startsWith('(') && body.endsWith(')');
  if (parenthesised) {
    body = body.slice(1, -1);
    negativeMarker = true;
  }
  if (body.includes('(') || body.includes(')')) return refuse('UNREADABLE_AMOUNT');

  const leadingSign = body.startsWith('-') || body.startsWith('+');
  const trailingSign = body.endsWith('-') || body.endsWith('+');
  if (leadingSign && trailingSign) return refuse('UNREADABLE_AMOUNT');
  if (parenthesised && (leadingSign || trailingSign)) return refuse('UNREADABLE_AMOUNT');
  if (leadingSign) {
    negativeMarker = negativeMarker || body.startsWith('-');
    body = body.slice(1);
  } else if (trailingSign) {
    negativeMarker = negativeMarker || body.endsWith('-');
    body = body.slice(0, -1);
  }
  if (body.includes('-') || body.includes('+')) return refuse('UNREADABLE_AMOUNT');
  if (body === '') return refuse('UNREADABLE_AMOUNT');

  const split = splitIntegerAndFraction(body, currency.exponent);
  if (!split.ok) return refuse(split.reason);

  const { integerDigits, fractionDigits } = split.value;
  if (!/^[0-9]*$/.test(integerDigits) || !/^[0-9]*$/.test(fractionDigits)) {
    return refuse('UNREADABLE_AMOUNT');
  }
  if (integerDigits === '' && fractionDigits === '') return refuse('UNREADABLE_AMOUNT');

  // Pad the fraction out to the currency's exponent. Padding is exact — `.5`
  // in a 2-decimal currency is fifty minor units and nothing is rounded.
  const padded = fractionDigits.padEnd(currency.exponent, '0');
  if (padded.length > currency.exponent) return refuse('DECIMAL_PLACES_EXCEED_CURRENCY');

  let minorUnits: bigint;
  try {
    minorUnits = BigInt(`${integerDigits === '' ? '0' : integerDigits}${padded}`);
  } catch {
    return refuse('UNREADABLE_AMOUNT');
  }
  if (minorUnits > MAX_MINOR_UNITS) return refuse('AMOUNT_EXCEEDS_RANGE');

  return ok({ minorUnits, negativeMarker });
}

interface AmountParts {
  readonly integerDigits: string;
  readonly fractionDigits: string;
}

function splitIntegerAndFraction(body: string, exponent: number): Normalized<AmountParts> {
  const lastDot = body.lastIndexOf('.');
  const lastComma = body.lastIndexOf(',');
  const dots = countOf(body, '.');
  const commas = countOf(body, ',');

  if (dots === 0 && commas === 0) {
    return ok({ integerDigits: body, fractionDigits: '' });
  }

  // Rule 1 — both kinds present. The later one is the decimal separator,
  // because grouping cannot follow a decimal point.
  if (dots > 0 && commas > 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    const groupChar = lastDot > lastComma ? ',' : '.';
    const decimalChar = lastDot > lastComma ? '.' : ',';
    if (countOf(body, decimalChar) !== 1) return refuse('UNREADABLE_AMOUNT');
    const integerPart = body.slice(0, decimalAt);
    const fraction = body.slice(decimalAt + 1);
    if (fraction.includes(groupChar)) return refuse('UNREADABLE_AMOUNT');
    if (fraction.length > exponent) return refuse('DECIMAL_PLACES_EXCEED_CURRENCY');
    const ungrouped = ungroup(integerPart, groupChar);
    if (!ungrouped.ok) return refuse(ungrouped.reason);
    return ok({ integerDigits: ungrouped.value, fractionDigits: fraction });
  }

  const separator = dots > 0 ? '.' : ',';
  const occurrences = dots > 0 ? dots : commas;

  // Rule 2 — one kind, more than once. Grouping; there is no reading in which
  // `1.234.567` carries two decimal points.
  if (occurrences > 1) {
    const ungrouped = ungroup(body, separator);
    if (!ungrouped.ok) return refuse(ungrouped.reason);
    return ok({ integerDigits: ungrouped.value, fractionDigits: '' });
  }

  // Rule 3 — one kind, once. The digit count after it decides.
  const at = dots > 0 ? lastDot : lastComma;
  const integerPart = body.slice(0, at);
  const fraction = body.slice(at + 1);

  // The ambiguity is checked FIRST, and the order is the whole point. In a
  // 3-decimal currency `1.234` satisfies `fraction.length <= exponent`
  // perfectly well — reading it as 1.234 dinar is a completely defensible
  // interpretation, and so is reading it as 1,234 fils. Checking the decimal
  // branch first would silently pick one, which is exactly the failure this
  // file exists to prevent, hidden behind a condition that looks correct.
  if (fraction.length === 3 && exponent === 3) {
    return refuse('AMBIGUOUS_DECIMAL_SEPARATOR');
  }
  if (fraction.length <= exponent) {
    return ok({ integerDigits: integerPart, fractionDigits: fraction });
  }
  if (fraction.length === 3) {
    // Three digits after a single separator in a currency with fewer than
    // three decimals: a decimal reading is impossible, so it is grouping and
    // nothing is being guessed.
    const ungrouped = ungroup(body, separator);
    if (!ungrouped.ok) return refuse(ungrouped.reason);
    return ok({ integerDigits: ungrouped.value, fractionDigits: '' });
  }
  return refuse('DECIMAL_PLACES_EXCEED_CURRENCY');
}

/**
 * Removes a group separator, verifying the grouping rather than trusting it.
 *
 * Groups after the first are exactly three digits. `1,23,456` is refused
 * instead of becoming 123456: the alternative is a plausible number produced
 * from a shape this ruleset does not actually understand, which is the
 * specific failure mode this whole file exists to avoid.
 */
function ungroup(value: string, separator: string): Normalized<string> {
  const parts = value.split(separator);
  if (parts.length === 1) return ok(value);
  const [first, ...rest] = parts;
  if (first === undefined || first === '' || first.length > 3) return refuse('UNREADABLE_AMOUNT');
  for (const part of rest) {
    if (part.length !== 3) return refuse('UNREADABLE_AMOUNT');
  }
  return ok(parts.join(''));
}

function countOf(value: string, character: string): number {
  let total = 0;
  for (const c of value) if (c === character) total += 1;
  return total;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * How a source writes a numeric date, when it has been STATED.
 *
 * `null` means nobody stated one, and that is the ordinary case for a file a
 * person just uploaded. It does not become a default: see `normalizeDay`.
 */
export const DATE_ORDERS = ['ISO', 'DAY_FIRST', 'MONTH_FIRST'] as const;
export type DateOrder = (typeof DATE_ORDERS)[number];

export function isDateOrder(value: string): value is DateOrder {
  return (DATE_ORDERS as readonly string[]).includes(value);
}

const ISO_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASHED_ISO_SHAPE = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/;
const TWO_PART_FIRST_SHAPE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/**
 * Reads one date cell as a calendar day (ADR-0027).
 *
 * Four shapes are accepted and everything else is refused:
 *
 * - `YYYY-MM-DD` and `YYYY/MM/DD` — unambiguous by construction, and
 *   accepted whatever `stated` says.
 * - `D/M/YYYY` and `D.M.YYYY` and `D-M-YYYY` — ambiguous in general. When the
 *   mapping STATES an order, that order is used. When it does not, the value
 *   is read only if exactly one of the two readings is a real date (`25/12`
 *   has no month 25), and refused as `AMBIGUOUS_DATE_ORDER` when both are.
 *   That is a determination from the value, not a guess about the file.
 *
 * **Two-digit years are refused**, always. `12/03/26` requires a century, and
 * a century is not in the value. Every rule for supplying one — a window, a
 * pivot year, "assume 20xx" — is a guess about a date on somebody's financial
 * record.
 */
export function normalizeDay(
  raw: string | null | undefined,
  stated: DateOrder | null,
): Normalized<CalendarDay> {
  const text = normalizeText(raw);
  if (text === null) return refuse('REQUIRED_FIELD_MISSING');
  const value = foldDigits(text).replace(WHITESPACE_RUN, '');

  const iso = ISO_SHAPE.exec(value) ?? SLASHED_ISO_SHAPE.exec(value);
  if (iso !== null) {
    return dayOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const twoPart = TWO_PART_FIRST_SHAPE.exec(value);
  if (twoPart === null) return refuse('UNREADABLE_DATE');
  const first = Number(twoPart[1]);
  const second = Number(twoPart[2]);
  const year = Number(twoPart[3]);

  if (stated === 'DAY_FIRST') return dayOf(year, second, first);
  if (stated === 'MONTH_FIRST') return dayOf(year, first, second);
  // 'ISO' stated but the value is not in ISO shape: the mapping and the file
  // disagree, and reading it under either two-part order would be inventing
  // the very fact the mapping claimed to know.
  if (stated === 'ISO') return refuse('UNREADABLE_DATE');

  const asDayFirst = tryDay(year, second, first);
  const asMonthFirst = tryDay(year, first, second);
  if (asDayFirst !== null && asMonthFirst !== null) {
    // Both readings are real dates and nothing in the file says which.
    return refuse('AMBIGUOUS_DATE_ORDER');
  }
  if (asDayFirst !== null) return ok(asDayFirst);
  if (asMonthFirst !== null) return ok(asMonthFirst);
  return refuse('UNREADABLE_DATE');
}

function dayOf(year: number, month: number, day: number): Normalized<CalendarDay> {
  const parsed = tryDay(year, month, day);
  return parsed === null ? refuse('UNREADABLE_DATE') : ok(parsed);
}

function tryDay(year: number, month: number, day: number): CalendarDay | null {
  try {
    return CalendarDay.of(year, month, day);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Instants and zones
// ---------------------------------------------------------------------------

/**
 * Reads a source-stated instant.
 *
 * Only a value that carries a zone or an explicit UTC designator is accepted.
 * A bare `2026-08-12 14:30` is a wall-clock reading with no zone, so turning
 * it into an instant means choosing one — and the choice would be invisible
 * in the stored value. Refused as `UNREADABLE_INSTANT`, which sends the
 * import to review rather than recording a moment nobody observed.
 */
export function normalizeInstant(raw: string | null | undefined): Normalized<Date> {
  const text = normalizeText(raw);
  if (text === null) return refuse('REQUIRED_FIELD_MISSING');
  const value = foldDigits(text);
  if (!/(?:Z|z|[+-]\d{2}:?\d{2})$/.test(value)) return refuse('UNREADABLE_INSTANT');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return refuse('UNREADABLE_INSTANT');
  return ok(parsed);
}

/**
 * Accepts an IANA zone the runtime knows, and nothing else.
 *
 * Never the server's zone, never the device's, and never one inferred from
 * the account's country. A zone this platform supplied is not a fact about
 * the statement, and storing it beside a source-stated instant would make it
 * indistinguishable from one.
 */
export function normalizeTimezone(raw: string | null | undefined): Normalized<string> {
  const text = normalizeText(raw);
  if (text === null) return refuse('REQUIRED_FIELD_MISSING');
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: text });
  } catch {
    return refuse('UNKNOWN_TIMEZONE');
  }
  return ok(text);
}
