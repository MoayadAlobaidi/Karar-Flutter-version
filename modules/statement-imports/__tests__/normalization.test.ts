/**
 * The normalisation matrix.
 *
 * Every row here is a real shape a statement export produces, and every
 * refusal is a case where guessing would be wrong about somebody's money
 * roughly half the time. The assertions are exact minor units, never
 * approximate: an epsilon in a money test is a test that would pass on a
 * float implementation.
 */

import { describe, expect, it } from 'vitest';

import { CalendarDay, Currency } from '@karar/shared-kernel';

import {
  foldDigits,
  normalizeAmount,
  normalizeDay,
  normalizeInstant,
  normalizeText,
  normalizeTimezone,
} from '../domain/normalization.js';

const QAR = Currency.get('QAR'); // 2 decimals
const KWD = Currency.get('KWD'); // 3 decimals

function amount(raw: string, currency = QAR): bigint | string {
  const read = normalizeAmount(raw, currency);
  return read.ok ? (read.value.negativeMarker ? -read.value.minorUnits : read.value.minorUnits) : read.reason;
}

describe('digit families', () => {
  it('folds Arabic-Indic and Persian digits to ASCII', () => {
    expect(foldDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890');
    expect(foldDigits('۱۲۳۴۵۶۷۸۹۰')).toBe('1234567890');
  });

  it('folds U+066B to a decimal point and U+066C to a group separator', () => {
    // The mapping is of ROLE, not appearance: U+066B means the decimal
    // separator regardless of which ASCII character a reader expects.
    expect(foldDigits('١٬٢٣٤٫٥٦')).toBe('1,234.56');
    expect(amount('١٬٢٣٤٫٥٦')).toBe(123456n);
  });

  it('leaves other scripts alone — a merchant name is not a number', () => {
    expect(foldDigits('شركة ٧')).toBe('شركة 7');
  });
});

describe('separator resolution', () => {
  it('reads the LAST of two separator kinds as the decimal point', () => {
    expect(amount('1,234.56')).toBe(123456n);
    expect(amount('1.234,56')).toBe(123456n);
    expect(amount('1.234.567,89')).toBe(123456789n);
    expect(amount('1,234,567.89')).toBe(123456789n);
  });

  it('reads a repeated single separator as grouping', () => {
    expect(amount('1.234.567')).toBe(123456700n);
    expect(amount('1,234,567')).toBe(123456700n);
  });

  it('reads three digits after a single separator as grouping in a 2-decimal currency', () => {
    // A 3-decimal reading is impossible in QAR, so this is not ambiguous.
    expect(amount('1,234')).toBe(123400n);
    expect(amount('1.234')).toBe(123400n);
  });

  it('REFUSES three digits after a single separator in a 3-decimal currency', () => {
    // 1.234 is either 1234 fils or 1.234 dinar, and both are ordinary.
    expect(amount('1.234', KWD)).toBe('AMBIGUOUS_DECIMAL_SEPARATOR');
    expect(amount('1,234', KWD)).toBe('AMBIGUOUS_DECIMAL_SEPARATOR');
  });

  it('reads fewer decimals than the currency has, padding exactly', () => {
    expect(amount('1234.5')).toBe(123450n);
    expect(amount('.5')).toBe(50n);
    expect(amount('12.34', KWD)).toBe(12340n);
  });

  it('REFUSES more decimals than the currency has, rather than rounding', () => {
    expect(amount('1234.5678')).toBe('DECIMAL_PLACES_EXCEED_CURRENCY');
    expect(amount('1.2345', KWD)).toBe('DECIMAL_PLACES_EXCEED_CURRENCY');
  });

  it('REFUSES grouping this ruleset does not understand rather than joining it', () => {
    // Indian lakh grouping. Refusing gives a person something to act on;
    // silently reading 123456 gives them a number nobody will question.
    expect(amount('1,23,456')).toBe('UNREADABLE_AMOUNT');
  });
});

describe('signs', () => {
  it('reads accounting parentheses as negative', () => {
    expect(amount('(1,234.56)')).toBe(-123456n);
  });

  it('reads a trailing minus as negative', () => {
    expect(amount('1234.56-')).toBe(-123456n);
  });

  it('reads a leading minus as negative and a leading plus as positive', () => {
    expect(amount('-1234.56')).toBe(-123456n);
    expect(amount('+1234.56')).toBe(123456n);
  });

  it('REFUSES two sign markers at once — contradictory, not emphatic', () => {
    expect(amount('(-1234.56)')).toBe('UNREADABLE_AMOUNT');
    expect(amount('-1234.56-')).toBe('UNREADABLE_AMOUNT');
  });
});

describe('whitespace, BOM and control characters', () => {
  it('strips space grouping inside an amount', () => {
    expect(amount('1 234,56')).toBe(123456n);
    expect(amount('1 234,56')).toBe(123456n);
    expect(amount('1 234,56')).toBe(123456n);
  });

  it('strips a BOM wherever it appears', () => {
    expect(amount('﻿1234.56')).toBe(123456n);
    expect(normalizeText('﻿SYNTHETIC MERCHANT')).toBe('SYNTHETIC MERCHANT');
  });

  it('collapses whitespace runs and trims narrative', () => {
    expect(normalizeText('  SYNTHETIC   MERCHANT \t ONE  ')).toBe('SYNTHETIC MERCHANT ONE');
  });

  it('treats an empty or blank value as absence rather than as a value', () => {
    expect(normalizeText('')).toBeNull();
    expect(normalizeText('   ')).toBeNull();
    expect(amount('')).toBe('REQUIRED_FIELD_MISSING');
    expect(amount('   ')).toBe('REQUIRED_FIELD_MISSING');
  });

  it('normalises to NFC so two visually identical merchants fingerprint alike', () => {
    // Decomposed and precomposed forms of the same string. Without NFC these
    // are different strings, so the same purchase from two exports would
    // become two transactions.
    const decomposed = 'Café SYNTHETIC';
    const precomposed = 'Café SYNTHETIC';
    expect(normalizeText(decomposed)).toBe(normalizeText(precomposed));
  });
});

describe('unreadable amounts are errors, never zero', () => {
  it.each(['abc', '12ab', '1.2.3.4', 'QAR 45.00', '--', '()'])(
    'refuses %s rather than reading it as zero',
    (raw) => {
      const read = normalizeAmount(raw, QAR);
      expect(read.ok).toBe(false);
      if (read.ok) return;
      expect(read.reason).not.toBe('');
    },
  );

  it('still reads a genuine zero as zero', () => {
    // The point of refusing above: zero is a real financial fact that
    // reversals produce, so it must stay distinguishable from "unreadable".
    expect(amount('0.00')).toBe(0n);
    expect(amount('(0.00)')).toBe(-0n);
  });
});

describe('range', () => {
  it('refuses a magnitude larger than exact minor units can hold', () => {
    expect(amount('999999999999999999999.99')).toBe('AMOUNT_EXCEEDS_RANGE');
  });
});

describe('dates', () => {
  const day = (raw: string, stated: Parameters<typeof normalizeDay>[1] = null) => {
    const read = normalizeDay(raw, stated);
    return read.ok ? read.value.toString() : read.reason;
  };

  it('reads ISO shapes whatever the stated order says', () => {
    expect(day('2026-08-12')).toBe('2026-08-12');
    expect(day('2026/08/12')).toBe('2026-08-12');
    expect(day('2026-08-12', 'DAY_FIRST')).toBe('2026-08-12');
  });

  it('reads a two-part date under the STATED order', () => {
    expect(day('03/04/2026', 'DAY_FIRST')).toBe('2026-04-03');
    expect(day('03/04/2026', 'MONTH_FIRST')).toBe('2026-03-04');
  });

  it('REFUSES a two-part date when both readings are real and none is stated', () => {
    expect(day('03/04/2026')).toBe('AMBIGUOUS_DATE_ORDER');
  });

  it('reads a two-part date when only ONE reading is a real date', () => {
    // Determined by the value, not guessed about the file: there is no
    // month 25.
    expect(day('25/12/2026')).toBe('2026-12-25');
  });

  it('REFUSES a two-digit year — a century is not in the value', () => {
    expect(day('12/03/26')).toBe('UNREADABLE_DATE');
  });

  it('refuses a date that is not a real date rather than rolling it forward', () => {
    expect(day('2026-02-30')).toBe('UNREADABLE_DATE');
    expect(day('31/04/2026', 'DAY_FIRST')).toBe('UNREADABLE_DATE');
  });

  it('reads Arabic-Indic digits in a date', () => {
    expect(day('٢٠٢٦-٠٨-١٢')).toBe('2026-08-12');
  });

  it('produces a CalendarDay, which has no timezone to shift by', () => {
    const read = normalizeDay('2026-08-12', null);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value).toBeInstanceOf(CalendarDay);
    expect(read.value.toString()).toBe('2026-08-12');
  });
});

describe('instants and zones', () => {
  it('reads an instant that carries a zone or a UTC designator', () => {
    const read = normalizeInstant('2026-08-12T14:30:00Z');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.toISOString()).toBe('2026-08-12T14:30:00.000Z');
  });

  it('REFUSES a wall-clock reading with no zone', () => {
    // Turning it into an instant would mean choosing a zone, invisibly.
    const read = normalizeInstant('2026-08-12 14:30');
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.reason).toBe('UNREADABLE_INSTANT');
  });

  it('accepts an IANA zone the runtime knows and refuses anything else', () => {
    const known = normalizeTimezone('Asia/Qatar');
    expect(known.ok).toBe(true);
    const unknown = normalizeTimezone('Middle/Earth');
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.reason).toBe('UNKNOWN_TIMEZONE');
  });
});
