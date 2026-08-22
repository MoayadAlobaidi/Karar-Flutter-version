/**
 * The suggestion rule, exhaustively, against the pure domain.
 *
 * Six conditions must ALL hold before a pair may even be a question, and the
 * ORDER of two of them is load-bearing rather than cosmetic:
 *
 *   * the currency check runs BEFORE the amount comparison, because comparing
 *     minor units across currencies would treat 100 of one and 100 of another
 *     as equal-and-opposite — a fabricated exchange rate of exactly 1.0, which
 *     is the precise error `transfer_matches_same_currency_only` exists to
 *     make unwritable;
 *   * the different-transactions and different-accounts checks run before
 *     both, because a refusal that named the amounts would send the caller to
 *     entirely the wrong remedy.
 *
 * The window is asserted against the DECLARED CONSTANT rather than against the
 * number 3, so widening it later changes one line here and this suite keeps
 * testing the shipped rule instead of a stale copy of it.
 */

import { describe, expect, it } from 'vitest';

import { CalendarDay, TenantId, UserId } from '@karar/shared-kernel';

import { isEqualAndOpposite, orientEqualAndOpposite } from '../domain/equal-and-opposite.js';
import {
  SUGGESTION_WINDOW_DAYS,
  SUGGESTION_WINDOW_VERSION,
  TRANSFER_SUGGESTION_WINDOW,
  calendarDaysBetween,
  isWithinSuggestionWindow,
} from '../domain/suggestion-window.js';
import {
  MATCH_STATES,
  checkSuggestable,
  suggestTransferMatch,
  type MatchCandidateSide,
} from '../domain/transfer-match.js';
import { MatchedAccountRef, TransactionRef, type TransferMatchId } from '../domain/refs.js';

const TENANT = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const USER = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
const MATCH_ID = 'cccccccc-0000-7000-8000-00000000000c' as TransferMatchId;
const TX_OUT = 'd0000000-0000-7000-8000-00000000000d';
const TX_IN = 'e0000000-0000-7000-8000-00000000000e';
const ACCOUNT_ONE = 'a0000000-0000-7000-8000-00000000000a';
const ACCOUNT_TWO = 'b0000000-0000-7000-8000-00000000000b';
const AT = new Date('2026-08-19T09:00:00.000Z');

/** 100.00 QAR leaving, in minor units. Round and obviously synthetic. */
const HUNDRED_OUT = -10_000n;
const HUNDRED_IN = 10_000n;

function side(overrides: Partial<MatchCandidateSide> = {}): MatchCandidateSide {
  return {
    transactionRef: TransactionRef.of(TX_OUT),
    accountRef: MatchedAccountRef.of(ACCOUNT_ONE),
    amountMinorUnits: HUNDRED_OUT,
    currencyCode: 'QAR',
    bookingDate: CalendarDay.of(2026, 8, 17),
    ...overrides,
  };
}

const OUTFLOW = side();
const INFLOW = side({
  transactionRef: TransactionRef.of(TX_IN),
  accountRef: MatchedAccountRef.of(ACCOUNT_TWO),
  amountMinorUnits: HUNDRED_IN,
});

describe('equal and opposite is a comparison, not a calculation', () => {
  it('accepts an exact mirror pair', () => {
    expect(isEqualAndOpposite(HUNDRED_OUT, HUNDRED_IN)).toBe(true);
    expect(isEqualAndOpposite(-1n, 1n)).toBe(true);
  });

  it('refuses a pair that differs by a single minor unit', () => {
    // A fee, a partial transfer or a rounded figure is a separate fact and
    // stays one. Nothing approximates, and nothing adds a difference to make
    // two figures agree.
    expect(isEqualAndOpposite(-10_000n, 9_999n)).toBe(false);
    expect(isEqualAndOpposite(-10_000n, 10_001n)).toBe(false);
  });

  it('refuses two zero amounts, which would otherwise pair', () => {
    // `0n === -0n` is true, so without the explicit refusal two zero-amount
    // corrections would suggest as a transfer — pairing two things that moved
    // no money and telling the person they moved some.
    expect(isEqualAndOpposite(0n, 0n)).toBe(false);
    expect(isEqualAndOpposite(0n, 10_000n)).toBe(false);
    expect(isEqualAndOpposite(-10_000n, 0n)).toBe(false);
  });

  it('refuses two outflows and two inflows, whatever their magnitudes', () => {
    expect(isEqualAndOpposite(-10_000n, -10_000n)).toBe(false);
    expect(isEqualAndOpposite(10_000n, 10_000n)).toBe(false);
    // And the arguments are positional: passing them the wrong way round is
    // refused rather than silently reinterpreted.
    expect(isEqualAndOpposite(HUNDRED_IN, HUNDRED_OUT)).toBe(false);
  });

  it('orientation finds the outflow whichever order the caller holds', () => {
    expect(orientEqualAndOpposite(HUNDRED_OUT, HUNDRED_IN)).toBe('FIRST_IS_OUTFLOW');
    expect(orientEqualAndOpposite(HUNDRED_IN, HUNDRED_OUT)).toBe('SECOND_IS_OUTFLOW');
    expect(orientEqualAndOpposite(HUNDRED_OUT, -10_000n)).toBeNull();
  });

  it('handles amounts far beyond a safe integer, because bigint does', () => {
    const huge = 9_007_199_254_740_993n; // Number.MAX_SAFE_INTEGER + 2
    expect(isEqualAndOpposite(-huge, huge)).toBe(true);
    expect(isEqualAndOpposite(-huge, huge - 1n)).toBe(false);
  });
});

describe('the suggestion window is a declared constant', () => {
  it('exposes the number and its version label as ONE value', () => {
    expect(TRANSFER_SUGGESTION_WINDOW.days).toBe(SUGGESTION_WINDOW_DAYS);
    expect(TRANSFER_SUGGESTION_WINDOW.version).toBe(SUGGESTION_WINDOW_VERSION);
    // The label carries the rule and its version, so a stored row remains
    // readable after the constant has moved on.
    expect(SUGGESTION_WINDOW_VERSION).toContain('equal-and-opposite');
    expect(SUGGESTION_WINDOW_VERSION).toContain('same-currency');
    expect(SUGGESTION_WINDOW_VERSION).toMatch(/\/v\d+$/);
  });

  it('counts calendar days, symmetrically and without a timezone', () => {
    const early = CalendarDay.of(2026, 8, 17);
    const late = CalendarDay.of(2026, 8, 20);
    expect(calendarDaysBetween(early, late)).toBe(3);
    expect(calendarDaysBetween(late, early)).toBe(3);
    expect(calendarDaysBetween(early, early)).toBe(0);
    // Across a month boundary, and across a leap day, without special-casing.
    expect(calendarDaysBetween(CalendarDay.of(2026, 8, 31), CalendarDay.of(2026, 9, 1))).toBe(1);
    expect(calendarDaysBetween(CalendarDay.of(2028, 2, 28), CalendarDay.of(2028, 3, 1))).toBe(2);
  });

  it('is inclusive at the boundary the constant names', () => {
    // Asserted against the CONSTANT, not against the number 3: widening the
    // window changes one line in the domain and this suite keeps testing the
    // shipped rule.
    const start = CalendarDay.of(2026, 8, 17);
    const atBound = CalendarDay.of(2026, 8, 17 + SUGGESTION_WINDOW_DAYS);
    const pastBound = CalendarDay.of(2026, 8, 17 + SUGGESTION_WINDOW_DAYS + 1);
    expect(isWithinSuggestionWindow(start, atBound)).toBe(true);
    expect(isWithinSuggestionWindow(atBound, start)).toBe(true);
    expect(isWithinSuggestionWindow(start, pastBound)).toBe(false);
  });
});

describe('checkSuggestable, in the order the rules must run', () => {
  it('accepts the ordinary case: a top-up between two of the person’s accounts', () => {
    expect(checkSuggestable(OUTFLOW, INFLOW)).toBeNull();
  });

  it('refuses a transaction matched to itself', () => {
    const refusal = checkSuggestable(OUTFLOW, side({ amountMinorUnits: HUNDRED_IN }));
    expect(refusal?.kind).toBe('same_transaction_on_both_sides');
  });

  it('refuses two movements on ONE account — a refund is not a transfer', () => {
    const refusal = checkSuggestable(
      OUTFLOW,
      side({ transactionRef: TransactionRef.of(TX_IN), amountMinorUnits: HUNDRED_IN }),
    );
    expect(refusal?.kind).toBe('same_account_on_both_sides');
  });

  it('refuses a cross-currency pair BEFORE it compares any amounts', () => {
    // The ordering test that matters most. Both amounts are 100 in minor
    // units, so an implementation that compared them first would call this
    // pair equal-and-opposite — a fabricated exchange rate of exactly 1.0.
    const refusal = checkSuggestable(OUTFLOW, { ...INFLOW, currencyCode: 'USD' });
    expect(refusal?.kind).toBe('cross_currency_not_matchable');
    if (refusal?.kind === 'cross_currency_not_matchable') {
      expect(refusal.outflowCurrencyCode).toBe('QAR');
      expect(refusal.inflowCurrencyCode).toBe('USD');
      expect(refusal.message).toContain('different currencies');
    }
  });

  it('refuses a cross-currency pair even when the minor units differ too', () => {
    // The other half: no rate is consulted in either direction, so an
    // "obviously converted" pair is refused for the same reason as an
    // identically-numbered one.
    const refusal = checkSuggestable(OUTFLOW, {
      ...INFLOW,
      currencyCode: 'USD',
      amountMinorUnits: 2_740n,
    });
    expect(refusal?.kind).toBe('cross_currency_not_matchable');
  });

  it('refuses a pair that is not exactly equal and opposite', () => {
    const refusal = checkSuggestable(OUTFLOW, { ...INFLOW, amountMinorUnits: 9_800n });
    expect(refusal?.kind).toBe('not_equal_and_opposite');
    // And it names no figure.
    expect(refusal?.message).not.toMatch(/[0-9]{3,}/);
  });

  it('refuses a pair outside the declared window, naming the window', () => {
    const refusal = checkSuggestable(OUTFLOW, {
      ...INFLOW,
      bookingDate: CalendarDay.of(2026, 8, 17 + SUGGESTION_WINDOW_DAYS + 1),
    });
    expect(refusal?.kind).toBe('outside_suggestion_window');
    if (refusal?.kind === 'outside_suggestion_window') {
      expect(refusal.windowDays).toBe(SUGGESTION_WINDOW_DAYS);
      expect(refusal.windowVersion).toBe(SUGGESTION_WINDOW_VERSION);
      expect(refusal.daysApart).toBe(SUGGESTION_WINDOW_DAYS + 1);
    }
  });

  it('no refusal message quotes an amount', () => {
    // Every refusal is about a person's money and describes the RULE. An error
    // string that quotes two figures puts financial values into log lines.
    const refusals = [
      checkSuggestable(OUTFLOW, side({ amountMinorUnits: HUNDRED_IN })),
      checkSuggestable(OUTFLOW, { ...INFLOW, currencyCode: 'USD' }),
      checkSuggestable(OUTFLOW, { ...INFLOW, amountMinorUnits: 9_800n }),
    ];
    for (const refusal of refusals) {
      expect(refusal).not.toBeNull();
      expect(refusal?.message ?? '').not.toContain('10000');
      expect(refusal?.message ?? '').not.toContain('9800');
    }
  });
});

describe('a suggestion is born SUGGESTED and carries no decision', () => {
  it('cannot be constructed in any other state', () => {
    const built = suggestTransferMatch({
      id: MATCH_ID,
      tenantId: TENANT,
      userId: USER,
      outflow: OUTFLOW,
      inflow: INFLOW,
      suggestedAt: AT,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.state).toBe('SUGGESTED');
    expect(built.value.subjectDecidedAt).toBeNull();
    expect(built.value.version).toBe(1);
    // The factory takes no state parameter at all, so the other two states
    // are unreachable from here rather than merely unused.
    expect(MATCH_STATES).toContain('CONFIRMED');
    expect(Object.keys(built.value)).not.toContain('confirmed');
  });

  it('records WHICH window suggested it, as the declared version label', () => {
    const built = suggestTransferMatch({
      id: MATCH_ID,
      tenantId: TENANT,
      userId: USER,
      outflow: OUTFLOW,
      inflow: INFLOW,
      suggestedAt: AT,
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.value.suggestionWindow).toBe(SUGGESTION_WINDOW_VERSION);
      expect(built.value.suggestionBasis).toBe('EQUAL_AND_OPPOSITE_SAME_CURRENCY_WITHIN_WINDOW');
    }
  });

  it('stores neither amount nor booking date on either side', () => {
    // A stored match is a RELATIONSHIP. Keeping the figures would put a number
    // on a row whose whole design is that it has none, and something would
    // eventually total them.
    const built = suggestTransferMatch({
      id: MATCH_ID,
      tenantId: TENANT,
      userId: USER,
      outflow: OUTFLOW,
      inflow: INFLOW,
      suggestedAt: AT,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    for (const stored of [built.value.outflow, built.value.inflow]) {
      expect(Object.keys(stored).sort()).toEqual(['accountRef', 'currencyCode', 'transactionRef']);
    }
    // And the whole match carries exactly one number.
    const numericFields = Object.entries(built.value)
      .filter(([, value]) => typeof value === 'number')
      .map(([key]) => key);
    expect(numericFields).toEqual(['version']);
  });

  it('refuses to build at all when the rule refuses', () => {
    const built = suggestTransferMatch({
      id: MATCH_ID,
      tenantId: TENANT,
      userId: USER,
      outflow: OUTFLOW,
      inflow: { ...INFLOW, currencyCode: 'USD' },
      suggestedAt: AT,
    });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.kind).toBe('cross_currency_not_matchable');
  });
});
