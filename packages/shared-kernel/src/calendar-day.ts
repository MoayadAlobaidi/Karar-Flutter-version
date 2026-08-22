/* eslint-disable @typescript-eslint/no-namespace -- the kernel surface is capped
   at its exported universals (architecture test 20); supporting types and
   errors therefore hang off the universal via declaration merging. */
import { KernelError } from './internal/kernel-error';

/**
 * A date on a calendar: a year, a month and a day, with no time and no
 * timezone. `2026-08-12` and nothing else.
 *
 * ## Why this is a universal and not a `Date`
 *
 * `Date` is an instant — a count of milliseconds from an epoch. A statement
 * line that says a payment was booked on 12 August is not an instant: it is
 * what the institution wrote on its books. Storing it as an instant forces a
 * time onto it, and the moment a time exists the value acquires a timezone,
 * whether or not anyone chose one.
 *
 * That has a concrete cost in a ledger. Stored as midnight UTC, a purchase
 * booked on the 12th reads as the 11th for anyone at a negative offset. The
 * transaction moves to the previous day, and at a month boundary it moves to
 * the previous MONTH: a statement for August gains or loses a line depending
 * on where the reader is sitting. Two people looking at one account would see
 * different totals, and both would be reading the data correctly.
 *
 * So a calendar day is stored as a calendar day (`date` in PostgreSQL) and
 * carried as this type, which cannot be shifted because it has nothing to
 * shift by.
 *
 * ## Why converting FROM an instant demands a timezone
 *
 * `fromInstant` will not take a `Date` alone. "What day is this instant on?"
 * has no answer until someone names a place — the same instant is Tuesday in
 * Doha and Monday in Toronto. Making the zone a required argument turns that
 * ambiguity into something a reader of the call site can see and a reviewer
 * can question, instead of a silent dependency on wherever the process happens
 * to be running.
 *
 * There is deliberately no `today()`. "Today" is a question about a timezone,
 * and a domain that wants it must say which one.
 */
export class CalendarDay {
  private constructor(
    /** Full proleptic Gregorian year, e.g. 2026. */
    readonly year: number,
    /** Month, 1-12. Not the 0-based month a `Date` uses. */
    readonly month: number,
    /** Day of month, 1-31, valid for the year and month. */
    readonly day: number,
  ) {
    Object.freeze(this);
  }

  /**
   * The three components, rejecting anything that is not a real date.
   *
   * 31 April and 29 February in a common year are refused rather than rolled
   * forward. A `Date` would silently turn them into 1 May and 1 March, which
   * is how a wrong date becomes a plausible one.
   */
  static of(year: number, month: number, day: number): CalendarDay {
    for (const [name, value] of [
      ['year', year],
      ['month', month],
      ['day', day],
    ] as const) {
      if (!Number.isInteger(value)) {
        throw new CalendarDay.InvalidCalendarDayError(`${name} must be an integer, got ${value}`);
      }
    }
    if (month < 1 || month > 12) {
      throw new CalendarDay.InvalidCalendarDayError(`month must be in [1, 12], got ${month}`);
    }
    const maxDay = CalendarDay.daysInMonth(year, month);
    if (day < 1 || day > maxDay) {
      throw new CalendarDay.InvalidCalendarDayError(
        `day must be in [1, ${maxDay}] for ${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}, got ${day}`,
      );
    }
    return new CalendarDay(year, month, day);
  }

  /**
   * An ISO 8601 calendar date, `YYYY-MM-DD`, and only that shape.
   *
   * A string carrying a time or a zone (`2026-08-12T00:00:00Z`) is refused
   * rather than truncated: it means the caller has an instant and has not yet
   * decided which zone turns it into a day, and quietly dropping the suffix
   * would make that decision for them.
   */
  static parse(value: string): CalendarDay {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match === null) {
      throw new CalendarDay.InvalidCalendarDayError(
        `expected an ISO calendar date 'YYYY-MM-DD', got '${value}'` +
          (value.includes('T')
            ? ' — this looks like an instant; use fromInstant with the timezone it should be read in'
            : ''),
      );
    }
    return CalendarDay.of(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  /**
   * The day an instant falls on, in a named IANA timezone.
   *
   * The zone is required and has no default. See the class note: the same
   * instant is two different days depending on where it is read.
   */
  static fromInstant(instant: Date, timeZone: string): CalendarDay {
    if (Number.isNaN(instant.getTime())) {
      throw new CalendarDay.InvalidCalendarDayError('instant is an invalid Date');
    }
    let parts: Intl.DateTimeFormatPart[];
    try {
      parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(instant);
    } catch {
      throw new CalendarDay.InvalidCalendarDayError(`unknown IANA timezone '${timeZone}'`);
    }
    const find = (type: string): number =>
      Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
    return CalendarDay.of(find('year'), find('month'), find('day'));
  }

  /** `YYYY-MM-DD`. The only serialization, on the wire and in the database. */
  toString(): string {
    return `${String(this.year).padStart(4, '0')}-${String(this.month).padStart(2, '0')}-${String(this.day).padStart(2, '0')}`;
  }

  /** Same calendar day. */
  equals(other: CalendarDay): boolean {
    return this.year === other.year && this.month === other.month && this.day === other.day;
  }

  /** Negative if this is earlier, 0 if the same day, positive if later. */
  compare(other: CalendarDay): number {
    if (this.year !== other.year) return this.year - other.year;
    if (this.month !== other.month) return this.month - other.month;
    return this.day - other.day;
  }

  isBefore(other: CalendarDay): boolean {
    return this.compare(other) < 0;
  }

  isAfter(other: CalendarDay): boolean {
    return this.compare(other) > 0;
  }

  /**
   * Midnight UTC on this day, for the one legitimate case: handing a
   * date-typed value to a driver that models `date` as a `Date`.
   *
   * This is NOT "the instant this day began" — that depends on a timezone this
   * type does not carry. It is a transport detail, named so that a call site
   * using it for anything else reads as wrong.
   */
  toUtcMidnight(): Date {
    return CalendarDay.utcAt(this.year, this.month - 1, this.day);
  }

  private static daysInMonth(year: number, month: number): number {
    // Day 0 of the next month is the last day of this one.
    return CalendarDay.utcAt(year, month, 0).getUTCDate();
  }

  /**
   * `Date.UTC` with the two-digit-year trap removed.
   *
   * `Date.UTC(47, ...)` means 1947, not the year 47 — a legacy mapping for
   * years 0-99 that cannot be turned off. This type accepts and correctly
   * renders those years, so without `setUTCFullYear` the one sanctioned
   * transport path would silently move a date by nineteen centuries, and year
   * 0 (a leap year in the proleptic Gregorian calendar this class documents)
   * would be judged against 1900, which is not.
   */
  private static utcAt(year: number, monthIndex: number, day: number): Date {
    // All three fields in ONE call. Setting the year alone means constructing
    // an intermediate date first, and the intermediate is where this goes
    // wrong: `daysInMonth` asks for day 0 of March, which in a leap anchor
    // year is 29 February. Moving only the year off that date keeps 29
    // February, which does not exist in a common year, and it rolls forward to
    // 1 March — so February reported ONE day in every common year while leap
    // years and every other month looked correct. The three-argument form
    // computes the day from all three components at once, so no invalid
    // intermediate exists and day 0 still means "last day of the previous
    // month".
    const at = new Date(0);
    at.setUTCFullYear(year, monthIndex, day);
    at.setUTCHours(0, 0, 0, 0);
    return at;
  }
}

export namespace CalendarDay {
  /** A value that is not a calendar day: a bad component, shape, or timezone. */
  export class InvalidCalendarDayError extends KernelError {
    override readonly name = 'InvalidCalendarDayError';
  }
}
