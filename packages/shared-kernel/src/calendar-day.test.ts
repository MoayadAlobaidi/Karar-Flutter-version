import { describe, expect, it } from 'vitest';
import { CalendarDay } from './index';

// Two zones either side of UTC. Qatar sits at +3 all year, so its cases turn
// on the offset alone; Toronto changes offset twice a year, which is what
// catches a conversion that hard-codes one.
const doha = 'Asia/Qatar';
const toronto = 'America/Toronto';

describe('CalendarDay.of', () => {
  it('keeps the year, the 1-based month and the day it was given', () => {
    const day = CalendarDay.of(2026, 8, 12);
    expect(day.year).toBe(2026);
    // August is 8 here, not the 7 a Date would want.
    expect(day.month).toBe(8);
    expect(day.day).toBe(12);
  });

  // Month lengths are the whole of the day validation, so each month is taken
  // at its last valid day and one past it. 2026 is a common year.
  it.each([
    [1, 31],
    [2, 28],
    [3, 31],
    [4, 30],
    [5, 31],
    [6, 30],
    [7, 31],
    [8, 31],
    [9, 30],
    [10, 31],
    [11, 30],
    [12, 31],
  ] as const)('month %i of 2026 ends on day %i and has nothing after it', (month, lastDay) => {
    expect(CalendarDay.of(2026, month, lastDay).day).toBe(lastDay);
    expect(() => CalendarDay.of(2026, month, lastDay + 1)).toThrow(
      CalendarDay.InvalidCalendarDayError,
    );
  });

  it('refuses 31 April instead of rolling it forward to 1 May', () => {
    // The rollover is how a wrong date becomes a plausible one (ADR-0027): a
    // Date answers 1 May, and nothing downstream ever questions it again.
    const build = (): CalendarDay => CalendarDay.of(2026, 4, 31);
    expect(build).toThrow(CalendarDay.InvalidCalendarDayError);
    expect(build).toThrow(/day must be in \[1, 30\] for 2026-04/);
  });

  it('refuses 29 February in a common year instead of rolling it forward to 1 March', () => {
    const build = (): CalendarDay => CalendarDay.of(2026, 2, 29);
    expect(build).toThrow(CalendarDay.InvalidCalendarDayError);
    expect(build).toThrow(/day must be in \[1, 28\] for 2026-02/);
  });

  // The century rule is the part a hand-rolled `year % 4 === 0` gets wrong,
  // and the 1900/2000 pair is where it shows.
  it.each([
    [2024, true],
    [2023, false],
    [1900, false],
    [2000, true],
    [2100, false],
  ] as const)('29 February exists in %i: %s', (year, exists) => {
    // 28 February is there either way, so the assertion below is about the
    // leap rule and not about the month being refused wholesale.
    expect(CalendarDay.of(year, 2, 28).day).toBe(28);
    if (exists) {
      expect(CalendarDay.of(year, 2, 29).toString()).toBe(`${year}-02-29`);
    } else {
      expect(() => CalendarDay.of(year, 2, 29)).toThrow(CalendarDay.InvalidCalendarDayError);
    }
  });

  it.each([
    [2026.5, 8, 12],
    [2026, 8.5, 12],
    [2026, 8, 12.5],
    [Number.NaN, 8, 12],
    [2026, Number.NaN, 12],
    [2026, 8, Number.NaN],
    [Number.POSITIVE_INFINITY, 8, 12],
    [2026, 8, Number.POSITIVE_INFINITY],
  ] as const)('rejects the non-integer components (%s, %s, %s)', (year, month, day) => {
    const build = (): CalendarDay => CalendarDay.of(year, month, day);
    expect(build).toThrow(CalendarDay.InvalidCalendarDayError);
    expect(build).toThrow(/must be an integer/);
  });

  // A Date reads month 0 as December of the previous year and month 13 as
  // January of the next, so an out-of-range month is a year error in disguise.
  it.each([0, -1, 13, 24])('rejects month %i, outside [1, 12]', (month) => {
    const build = (): CalendarDay => CalendarDay.of(2026, month, 1);
    expect(build).toThrow(CalendarDay.InvalidCalendarDayError);
    expect(build).toThrow(/month must be in \[1, 12\]/);
  });

  // Day 0 is the same trap one level down: a Date reads it as the last day of
  // the previous month.
  it.each([0, -1])('rejects day %i', (day) => {
    const build = (): CalendarDay => CalendarDay.of(2026, 8, day);
    expect(build).toThrow(CalendarDay.InvalidCalendarDayError);
    expect(build).toThrow(/day must be in \[1, 31\] for 2026-08/);
  });
});

describe('CalendarDay.parse', () => {
  it('accepts YYYY-MM-DD and keeps the three components', () => {
    const day = CalendarDay.parse('2026-08-12');
    expect(day.year).toBe(2026);
    expect(day.month).toBe(8);
    expect(day.day).toBe(12);
  });

  it('reads the zero padding as decimal, not as octal', () => {
    // '08' and '09' are the two a radix-guessing parse turns into zero.
    const day = CalendarDay.parse('2026-08-09');
    expect(day.month).toBe(8);
    expect(day.day).toBe(9);
  });

  it.each(['2026-08-12T00:00:00Z', '2026-08-12T00:00:00+03:00', '2026-08-12T21:00'])(
    'refuses the instant %j and names fromInstant as the way through',
    (text) => {
      const build = (): CalendarDay => CalendarDay.parse(text);
      expect(build).toThrow(CalendarDay.InvalidCalendarDayError);
      // Truncating the suffix would pick a timezone on the caller's behalf, so
      // the message sends them to the call that makes them say which.
      expect(build).toThrow(/fromInstant/);
    },
  );

  it.each([
    '2026-8-12',
    '26-08-12',
    '',
    '2026-08-12 ',
    ' 2026-08-12',
    '2026-08-12\n',
    '2026/08/12',
    '12-08-2026',
    '2026-08-012',
    '2026-08-12Z',
    '2026-08',
  ])('rejects the malformed %j', (text) => {
    expect(() => CalendarDay.parse(text)).toThrow(CalendarDay.InvalidCalendarDayError);
  });

  it('keeps the fromInstant hint off a string that carries no time', () => {
    // The hint is guidance for one specific mistake; on a typo it would send
    // the caller somewhere they have no need to go.
    expect(() => CalendarDay.parse('2026-8-12')).toThrow(CalendarDay.InvalidCalendarDayError);
    expect(() => CalendarDay.parse('2026-8-12')).not.toThrow(/fromInstant/);
  });

  it.each([
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-08-00',
    '2026-08-32',
    '2100-02-29',
  ])('rejects the well-formed but impossible %j', (text) => {
    expect(() => CalendarDay.parse(text)).toThrow(CalendarDay.InvalidCalendarDayError);
  });

  it('refuses 30 February rather than reading it as early March', () => {
    expect(() => CalendarDay.parse('2026-02-30')).toThrow(/day must be in \[1, 28\] for 2026-02/);
  });
});

describe('CalendarDay.fromInstant', () => {
  it('reads one instant as two different days either side of UTC midnight', () => {
    // 21:00 UTC is already the next calendar day in Doha. Both readings are
    // correct, which is why the zone cannot be implied (ADR-0027).
    const instant = new Date('2026-08-12T21:00:00Z');
    expect(CalendarDay.fromInstant(instant, 'UTC').toString()).toBe('2026-08-12');
    expect(CalendarDay.fromInstant(instant, doha).toString()).toBe('2026-08-13');
  });

  it('is the offset doing the work, not a constant skew between the zones', () => {
    // A second before the split, the same two zones agree.
    const instant = new Date('2026-08-12T20:59:59Z');
    expect(CalendarDay.fromInstant(instant, 'UTC').toString()).toBe('2026-08-12');
    expect(CalendarDay.fromInstant(instant, doha).toString()).toBe('2026-08-12');
  });

  it('reads an instant just after midnight UTC as the previous day at a negative offset', () => {
    const instant = new Date('2026-08-12T02:00:00Z');
    expect(CalendarDay.fromInstant(instant, 'UTC').toString()).toBe('2026-08-12');
    expect(CalendarDay.fromInstant(instant, toronto).toString()).toBe('2026-08-11');
  });

  it('crosses a month boundary, which is where a statement gains or loses a line', () => {
    const instant = new Date('2026-09-01T02:00:00Z');
    expect(CalendarDay.fromInstant(instant, 'UTC').toString()).toBe('2026-09-01');
    expect(CalendarDay.fromInstant(instant, toronto).toString()).toBe('2026-08-31');
    expect(CalendarDay.fromInstant(instant, doha).toString()).toBe('2026-09-01');
  });

  it('crosses a year boundary', () => {
    const instant = new Date('2027-01-01T02:00:00Z');
    expect(CalendarDay.fromInstant(instant, 'UTC').toString()).toBe('2027-01-01');
    expect(CalendarDay.fromInstant(instant, toronto).toString()).toBe('2026-12-31');
  });

  it('uses the offset in force on that date, not one fixed offset for the zone', () => {
    // 04:30 UTC is the evening before in Toronto in January (UTC-5) and the
    // same morning in July (UTC-4).
    expect(CalendarDay.fromInstant(new Date('2026-01-15T04:30:00Z'), toronto).toString()).toBe(
      '2026-01-14',
    );
    expect(CalendarDay.fromInstant(new Date('2026-07-15T04:30:00Z'), toronto).toString()).toBe(
      '2026-07-15',
    );
  });

  it('separates two zones a quarter of an hour apart', () => {
    // Kathmandu is +5:45 and Kolkata +5:30: fifteen minutes is enough to put
    // one instant on two days, so whole-hour arithmetic would not do.
    const instant = new Date('2026-08-12T18:20:00Z');
    expect(CalendarDay.fromInstant(instant, 'Asia/Kathmandu').toString()).toBe('2026-08-13');
    expect(CalendarDay.fromInstant(instant, 'Asia/Kolkata').toString()).toBe('2026-08-12');
  });

  it('lands on a leap day in one zone and on 1 March in the other', () => {
    const instant = new Date('2024-02-29T21:00:00Z');
    expect(CalendarDay.fromInstant(instant, 'UTC').toString()).toBe('2024-02-29');
    expect(CalendarDay.fromInstant(instant, doha).toString()).toBe('2024-03-01');
  });

  it.each(['Mars/Olympus_Mons', 'Atlantis/Poseidon', 'not a zone', ''])(
    'rejects the unknown timezone %j',
    (timeZone) => {
      const build = (): CalendarDay =>
        CalendarDay.fromInstant(new Date('2026-08-12T21:00:00Z'), timeZone);
      expect(build).toThrow(CalendarDay.InvalidCalendarDayError);
      expect(build).toThrow(/unknown IANA timezone/);
    },
  );

  it('rejects an invalid Date rather than reporting some day for it', () => {
    for (const instant of [new Date('nonsense'), new Date(Number.NaN)]) {
      const build = (): CalendarDay => CalendarDay.fromInstant(instant, 'UTC');
      expect(build).toThrow(CalendarDay.InvalidCalendarDayError);
      expect(build).toThrow(/invalid Date/);
    }
  });
});

describe('toString', () => {
  it.each([
    [2026, 8, 12, '2026-08-12'],
    [2026, 1, 2, '2026-01-02'],
    [2026, 12, 31, '2026-12-31'],
    [999, 12, 31, '0999-12-31'],
    [47, 3, 4, '0047-03-04'],
    [1, 1, 1, '0001-01-01'],
  ] as const)('%i-%i-%i renders as %j', (year, month, day, expected) => {
    expect(CalendarDay.of(year, month, day).toString()).toBe(expected);
  });

  it('is what interpolation and String() produce', () => {
    // Days reach SQL, JSON and log lines through both; the default object
    // rendering would be a silent corruption there.
    const day = CalendarDay.of(2026, 8, 12);
    expect(`${day}`).toBe('2026-08-12');
    expect(String(day)).toBe('2026-08-12');
  });

  it.each(['2026-08-12', '2024-02-29', '0001-01-01', '9999-12-31'])(
    'round-trips %j through parse',
    (text) => {
      expect(CalendarDay.parse(text).toString()).toBe(text);
    },
  );
});

describe('equals, compare, isBefore and isAfter', () => {
  it('compares by value, not by identity', () => {
    const constructed = CalendarDay.of(2026, 8, 12);
    const parsed = CalendarDay.parse('2026-08-12');
    expect(parsed).not.toBe(constructed);
    expect(constructed.equals(parsed)).toBe(true);
    expect(constructed.compare(parsed)).toBe(0);
    expect(constructed.isBefore(parsed)).toBe(false);
    expect(constructed.isAfter(parsed)).toBe(false);
  });

  it.each([
    ['2026-08-12', '2026-08-13'],
    ['2026-08-31', '2026-09-01'],
    ['2026-12-31', '2027-01-01'],
    ['2024-02-28', '2024-02-29'],
    ['2024-02-29', '2024-03-01'],
    ['1999-12-31', '2000-01-01'],
  ])('%s comes before %s, read in every direction', (earlierText, laterText) => {
    const earlier = CalendarDay.parse(earlierText);
    const later = CalendarDay.parse(laterText);
    expect(earlier.compare(later)).toBeLessThan(0);
    expect(later.compare(earlier)).toBeGreaterThan(0);
    expect(earlier.isBefore(later)).toBe(true);
    expect(later.isAfter(earlier)).toBe(true);
    expect(earlier.isAfter(later)).toBe(false);
    expect(later.isBefore(earlier)).toBe(false);
    expect(earlier.equals(later)).toBe(false);
  });

  it('sorts into chronological order, not into the order the fields happen to have', () => {
    // The month and year boundaries here are where a comparison on the day of
    // the month alone puts entries in the wrong place.
    const days = [
      '2026-09-01',
      '2027-01-01',
      '2026-08-31',
      '2024-02-29',
      '2026-12-31',
      '2026-08-12',
    ].map((text) => CalendarDay.parse(text));
    expect([...days].sort((a, b) => a.compare(b)).map(String)).toEqual([
      '2024-02-29',
      '2026-08-12',
      '2026-08-31',
      '2026-09-01',
      '2026-12-31',
      '2027-01-01',
    ]);
  });
});

describe('toUtcMidnight', () => {
  it('is exactly midnight UTC on the day, with no time left over', () => {
    const day = CalendarDay.of(2026, 8, 12);
    expect(day.toUtcMidnight().toISOString()).toBe('2026-08-12T00:00:00.000Z');
    expect(day.toUtcMidnight().getTime()).toBe(Date.UTC(2026, 7, 12));
  });

  it.each(['2026-08-12', '2024-02-29', '2026-01-01', '2026-12-31'])(
    'round-trips %j back through fromInstant in UTC',
    (text) => {
      const day = CalendarDay.parse(text);
      expect(CalendarDay.fromInstant(day.toUtcMidnight(), 'UTC').toString()).toBe(text);
    },
  );

  it('does not round-trip through a zone behind UTC — the hazard the type exists to prevent', () => {
    // Midnight UTC on 1 September is still 31 August in Toronto: a ledger that
    // stored the booking date as an instant would move the line into the
    // previous month for a reader sitting there (ADR-0027).
    const firstOfSeptember = CalendarDay.of(2026, 9, 1);
    const asReadInToronto = CalendarDay.fromInstant(firstOfSeptember.toUtcMidnight(), toronto);
    expect(asReadInToronto.toString()).toBe('2026-08-31');
    expect(asReadInToronto.equals(firstOfSeptember)).toBe(false);
    expect(asReadInToronto.month).toBe(8);
  });

  it('hands back a fresh Date, so a caller cannot move the day through it', () => {
    const day = CalendarDay.of(2026, 8, 12);
    const first = day.toUtcMidnight();
    first.setUTCFullYear(1999);
    expect(day.toUtcMidnight().toISOString()).toBe('2026-08-12T00:00:00.000Z');
    expect(day.toUtcMidnight()).not.toBe(first);
    expect(day.year).toBe(2026);
  });
});

// `Date.UTC(47, ...)` means 1947, not the year 47 — a legacy mapping of years
// 0-99 into the 1900s that cannot be switched off. `of` accepts those years and
// `toString` renders them, so anything reaching for a Date underneath has to
// undo the mapping. The failure it prevents is silent, nineteen centuries wide,
// and looks entirely plausible on the way past.
describe('years below 100, which Date.UTC maps into the 1900s', () => {
  it.each([
    [1, 1, 1, '0001-01-01T00:00:00.000Z'],
    [47, 8, 12, '0047-08-12T00:00:00.000Z'],
    [99, 12, 31, '0099-12-31T00:00:00.000Z'],
    [100, 1, 1, '0100-01-01T00:00:00.000Z'],
    [999, 3, 4, '0999-03-04T00:00:00.000Z'],
    [2026, 8, 12, '2026-08-12T00:00:00.000Z'],
  ] as const)('%i-%i-%i is midnight UTC at %j', (year, month, day, iso) => {
    expect(CalendarDay.of(year, month, day).toUtcMidnight().toISOString()).toBe(iso);
  });

  // 99 and 100 sit either side of the mapping, so a conversion that undoes it
  // for one and not the other shows up here rather than in production.
  it.each(['0001-01-01', '0047-08-12', '0099-12-31', '0100-01-01', '0999-03-04', '2026-08-12'])(
    'round-trips %j out through UTC midnight and back',
    (text) => {
      const day = CalendarDay.parse(text);
      expect(CalendarDay.fromInstant(day.toUtcMidnight(), 'UTC').toString()).toBe(text);
    },
  );

  it('accepts 29 February in year 0, which divides by 400', () => {
    // Judged against 1900 — the year Date.UTC maps 0 to — this is refused,
    // and 1900 is the one century within reach that is NOT a leap year. So the
    // mapping does not merely move a date: it changes the verdict on one.
    const leapDayOfYearZero = CalendarDay.of(0, 2, 29);
    expect(leapDayOfYearZero.toString()).toBe('0000-02-29');
    expect(leapDayOfYearZero.toUtcMidnight().toISOString()).toBe('0000-02-29T00:00:00.000Z');
  });

  it('still refuses 29 February 1900, which does not divide by 400', () => {
    // The pair matters: undoing the mapping must not cost the century rule.
    expect(() => CalendarDay.of(1900, 2, 29)).toThrow(CalendarDay.InvalidCalendarDayError);
    expect(CalendarDay.of(1900, 2, 28).toString()).toBe('1900-02-28');
  });
});

describe('the value itself', () => {
  it('is frozen, so a day cannot be edited into another one', () => {
    const day = CalendarDay.of(2026, 8, 12);
    expect(Object.isFrozen(day)).toBe(true);
    const mutable = day as unknown as { day: number };
    expect(() => {
      mutable.day = 13;
    }).toThrow(TypeError);
    expect(day.day).toBe(12);
  });

  it.each([
    ['of', (): CalendarDay => CalendarDay.of(2026, 2, 29)],
    ['parse', (): CalendarDay => CalendarDay.parse('12 August 2026')],
    [
      'fromInstant on a bad instant',
      (): CalendarDay => CalendarDay.fromInstant(new Date('nonsense'), 'UTC'),
    ],
    [
      'fromInstant in an unknown zone',
      (): CalendarDay =>
        CalendarDay.fromInstant(new Date('2026-08-12T00:00:00Z'), 'Mars/Olympus_Mons'),
    ],
  ] as const)('%s reports failure as InvalidCalendarDayError', (_entryPoint, build) => {
    expect(build).toThrow(CalendarDay.InvalidCalendarDayError);
  });

  it('gives the error a name a catch site can read', () => {
    let caught: unknown;
    try {
      CalendarDay.parse('2026-02-30');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalendarDay.InvalidCalendarDayError);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('InvalidCalendarDayError');
    expect((caught as Error).message).toContain('2026-02');
  });
});
