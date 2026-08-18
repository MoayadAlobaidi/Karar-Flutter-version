/**
 * THE WINDOW, AS A DECLARED CONSTANT.
 *
 * A movement between a person's own accounts appears on the two accounts on
 * two different days: the outflow when the sending account posts it, the
 * inflow when the receiving one does. A window is therefore unavoidable — a
 * rule requiring the same booking day would miss nearly every real transfer.
 *
 * **The window is a NAMED, VERSIONED constant and never a number typed at a
 * call site.** Three things follow from that, and each is the reason:
 *
 *   1. **It is one number, in one place.** A magic `3` in a use case and
 *      another in a test drift apart, and the day they do, the tested rule and
 *      the shipped rule are different rules.
 *   2. **Every stored row records WHICH window suggested it.**
 *      `transfer_matches.suggestion_window` holds `WINDOW_VERSION`, so
 *      widening the window later does not silently reinterpret rows suggested
 *      under the old one. A person who confirmed a match answered a question
 *      the product asked under a stated rule, and that rule stays attached to
 *      their answer.
 *   3. **Widening it is visible.** Changing the constant changes the version
 *      label, which changes what new rows carry, which is a diff a reviewer
 *      reads — rather than a `3` becoming a `30` in a condition nobody looks
 *      at twice.
 *
 * ## Why THREE days, and why the number is not the important part
 *
 * Three calendar days each way covers the ordinary case — a same-day transfer
 * posting to one account overnight, a weekend, a value-date difference of a
 * day or two — without stretching so far that two unrelated equal-and-opposite
 * movements in one month start pairing. It is a **judgement**, and the honest
 * framing is that it is the smallest window that does not routinely miss real
 * transfers rather than the largest one that is safe.
 *
 * What makes the judgement tolerable is not the number. It is that a
 * suggestion inside the window **changes nothing**: it is a question, and only
 * the person's confirmation makes it authoritative
 * (`transfer_matches_confirmed_requires_subject_decision`). A window that is
 * slightly too wide produces a question a person answers "no" to. A rule that
 * auto-matched would make the same width a silent error.
 *
 * ## Calendar days, not hours
 *
 * A booking date is a `CalendarDay` (ADR-0027): it is what the institution
 * wrote, not a moment in time. Comparing two booking dates in HOURS would
 * require inventing a midnight in some timezone for each of them, and the
 * invented offsets would move the window by a day for readers at a different
 * offset — so a transfer that matched in Doha would not match in London.
 *
 * The separation below is computed from `toUtcMidnight()`, which is the
 * transport form of a calendar day and not a claim about when the day began.
 * Both sides are converted the same way, so the offset cancels exactly and the
 * result is a count of calendar days rather than a duration.
 *
 * ## Purity
 *
 * No clock, no randomness, no I/O (architecture test 11). The days being
 * compared arrive as arguments.
 */

import type { CalendarDay } from '@karar/shared-kernel';

/** Milliseconds in one calendar day, used only to divide two UTC midnights. */
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * The window, in calendar days, in EITHER direction. A three-day window means
 * the two booking dates may be up to three days apart, whichever side is
 * earlier.
 */
export const SUGGESTION_WINDOW_DAYS = 3;

/**
 * The label stored on every row this window suggests
 * (`transfer_matches.suggestion_window`).
 *
 * It carries the rule AND its version, so a row remains readable as "suggested
 * under the three-day rule, version 1" after the constant above has moved on.
 * The `P3D` is ISO 8601 duration notation for the same three days, written out
 * so the label does not have to be read against this file to be understood.
 */
export const SUGGESTION_WINDOW_VERSION =
  'equal-and-opposite/same-currency/P3D/v1' as const;

/**
 * The window as one value, so a caller takes both halves or neither. A caller
 * that took the number without the label would write rows that do not say
 * which rule produced them.
 */
export const TRANSFER_SUGGESTION_WINDOW = Object.freeze({
  days: SUGGESTION_WINDOW_DAYS,
  version: SUGGESTION_WINDOW_VERSION,
});

/**
 * Calendar days between two booking dates, absolute and never negative.
 *
 * The only division in this module, and it divides TIME rather than money:
 * two UTC midnights differ by a whole number of days, and both sides are
 * converted identically so no timezone is invented and none can cancel
 * unevenly. `Math.round` guards the one case where the difference is not
 * exactly whole — a leap second does not exist in POSIX time, but a future
 * `Date` implementation detail should not be able to turn a three-day gap
 * into 2.99999 and refuse a real transfer.
 */
export function calendarDaysBetween(left: CalendarDay, right: CalendarDay): number {
  const difference = left.toUtcMidnight().getTime() - right.toUtcMidnight().getTime();
  return Math.round(Math.abs(difference) / MILLISECONDS_PER_DAY);
}

/**
 * True when two booking dates are close enough for a suggestion.
 *
 * Inclusive at the boundary: exactly `SUGGESTION_WINDOW_DAYS` apart is inside
 * the window. An exclusive bound would make the declared constant off by one
 * from what it says, which is precisely the kind of quiet mismatch a named
 * constant exists to prevent.
 */
export function isWithinSuggestionWindow(
  outflowBookingDate: CalendarDay,
  inflowBookingDate: CalendarDay,
): boolean {
  return calendarDaysBetween(outflowBookingDate, inflowBookingDate) <= SUGGESTION_WINDOW_DAYS;
}
