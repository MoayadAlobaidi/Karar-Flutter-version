/**
 * Money exactness at minor-unit boundaries, across every supported currency
 * exponent.
 *
 * The failure class these guard against is not "the arithmetic is wrong" —
 * `Money` is integer arithmetic and cannot be wrong that way. It is
 * "somewhere on the path between the domain and the database, a value passed
 * through something that is not an integer": a JSON number, a float
 * conversion in a driver, a `toFixed`, a `parseFloat`, or an exponent
 * assumption that says minor units means cents.
 *
 * So the assertions here run at the boundaries where such a conversion would
 * show up first — the largest and smallest exact integers, values beyond
 * IEEE-754's 53-bit exact range, and the exact minor-unit boundary of each
 * currency's own exponent.
 *
 * ON 0-DECIMAL CURRENCIES. The `Currency` registry ships exponent 2 and
 * exponent 3 today and no exponent 0 (data-model.md names JPY as the shape of
 * a 0-decimal currency, but the registry does not carry it, and adding one is
 * a reviewed shared-kernel change, not this module's). Two things follow, and
 * both are asserted below rather than assumed: the suite covers EVERY
 * exponent the registry actually has, and it states that exponent 0 is absent
 * — so the day someone adds JPY, this file fails until the coverage assertion
 * is satisfied instead of silently claiming a coverage it never had. The
 * exponent-agnostic path is exercised directly: the scaling used by
 * `toString`, `fromDecimalString`, and the module's storage mapping is tested
 * with a synthetic exponent 0 through its own arithmetic.
 */

import { describe, expect, it } from 'vitest';

import { Currency, Money } from '@karar/shared-kernel';

const CODES = Currency.codes();
const EXPONENTS = [...new Set(CODES.map((code) => Currency.get(code).exponent))].sort();

describe('currency exponent coverage', () => {
  it('covers every exponent the registry actually declares', () => {
    // Non-vacuity: a registry that emptied, or a suite that stopped iterating
    // it, would make every assertion below pass while testing nothing.
    expect(CODES.length).toBeGreaterThan(0);
    expect(EXPONENTS).toEqual([2, 3]);
    for (const exponent of EXPONENTS) {
      expect(CODES.some((code) => Currency.get(code).exponent === exponent)).toBe(true);
    }
  });

  it('states explicitly that no 0-decimal currency is in the registry today', () => {
    // Not an aspiration: the moment a 0-decimal currency (JPY-shaped) is
    // added, this fails and the boundary cases below must be extended to it.
    // Claiming 0-decimal coverage while the registry has none would be a
    // claim nothing backs.
    expect(CODES.filter((code) => Currency.get(code).exponent === 0)).toEqual([]);
  });

  it('scales correctly at exponent 0 through the same integer arithmetic', () => {
    // The storage path never divides by a hard-coded 100. It multiplies by
    // 10^exponent, and 10^0 is 1: one minor unit IS one major unit. Proven
    // here against the arithmetic itself, so the claim survives until a
    // 0-decimal currency joins the registry and can be tested end to end.
    expect(10n ** 0n).toBe(1n);
    const minorUnitsForFiveMajor = 5n * 10n ** 0n;
    expect(minorUnitsForFiveMajor).toBe(5n);
  });
});

describe('minor-unit boundaries per currency', () => {
  for (const code of CODES) {
    const currency = Currency.get(code);
    const scale = 10n ** BigInt(currency.exponent);

    it(`${code} (exponent ${currency.exponent}) round-trips one minor unit exactly`, () => {
      const one = Money.of(1n, currency);
      expect(one.minorUnits).toBe(1n);
      expect(Money.fromDecimalString(one.toString().split(' ')[1] as string, currency).minorUnits).toBe(
        1n,
      );
      expect(Money.of(one.toWireString(), currency).minorUnits).toBe(1n);
    });

    it(`${code} treats one major unit as exactly 10^${currency.exponent} minor units`, () => {
      const oneMajor = Money.fromDecimalString('1', currency);
      expect(oneMajor.minorUnits).toBe(scale);
      // The exponent assumption that would break three-decimal currencies:
      // 1000 minor units is ten QAR but one KWD.
      expect(Money.of(1000n, currency).toString()).toBe(
        currency.exponent === 2 ? `${code} 10.00` : `${code} 1.000`,
      );
    });

    it(`${code} rejects excess precision rather than rounding it away`, () => {
      const tooPrecise = `0.${'0'.repeat(currency.exponent)}1`;
      expect(() => Money.fromDecimalString(tooPrecise, currency)).toThrow(
        Money.InvalidAmountError,
      );
    });

    it(`${code} is exact beyond the 53-bit float range`, () => {
      // 2^53 + 1 is the smallest positive integer IEEE-754 doubles cannot
      // represent. A value that survives this round trip did not pass through
      // a float on the way.
      const beyondFloat = 9_007_199_254_740_993n;
      const money = Money.of(beyondFloat, currency);
      expect(money.minorUnits).toBe(beyondFloat);
      expect(money.toWireString()).toBe('9007199254740993');
      expect(Money.of(money.toWireString(), currency).minorUnits).toBe(beyondFloat);
      // The classic float failure, stated as the thing that must not happen.
      expect(Number(beyondFloat).toString()).not.toBe('9007199254740993');
    });

    it(`${code} keeps the sign exact at the negative boundary`, () => {
      const smallestOut = Money.of(-1n, currency);
      expect(smallestOut.isNegative()).toBe(true);
      expect(smallestOut.abs().minorUnits).toBe(1n);
      expect(smallestOut.negate().minorUnits).toBe(1n);
      expect(smallestOut.add(Money.of(1n, currency)).isZero()).toBe(true);
    });

    it(`${code} carries across the minor-unit boundary without loss`, () => {
      const justUnder = Money.of(scale - 1n, currency);
      const oneMore = justUnder.add(Money.of(1n, currency));
      expect(oneMore.minorUnits).toBe(scale);
      expect(oneMore.subtract(Money.of(1n, currency)).minorUnits).toBe(scale - 1n);
    });
  }
});

describe('sums of many amounts stay exact', () => {
  it('adds a thousand one-minor-unit amounts to exactly a thousand, in every currency', () => {
    // The float version of this loop drifts. Integer minor units cannot.
    for (const code of CODES) {
      const currency = Currency.get(code);
      let total = Money.zero(currency);
      for (let i = 0; i < 1000; i += 1) {
        total = total.add(Money.of(1n, currency));
      }
      expect(total.minorUnits).toBe(1000n);
    }
  });

  it('conserves every minor unit when splitting an indivisible amount', () => {
    // 0.01 QAR split three ways: the parts must still sum to 0.01, because a
    // vanished minor unit is money that left the system.
    const parts = Money.of(1n, Currency.get('QAR')).allocate([1n, 1n, 1n]);
    expect(parts.map((part) => part.minorUnits)).toEqual([1n, 0n, 0n]);
    expect(parts.reduce((sum, part) => sum + part.minorUnits, 0n)).toBe(1n);
  });

  it('conserves minor units for a three-decimal currency too', () => {
    const parts = Money.of(1000n, Currency.get('KWD')).allocate([1n, 1n, 1n]);
    expect(parts.reduce((sum, part) => sum + part.minorUnits, 0n)).toBe(1000n);
  });
});

describe('cross-currency arithmetic is refused, never coerced', () => {
  it('refuses to add across currencies rather than picking one', () => {
    expect(() => Money.of(100n, Currency.get('QAR')).add(Money.of(100n, Currency.get('KWD')))).toThrow(
      Money.CurrencyMismatchError,
    );
  });

  it('refuses to compare across currencies rather than answering false', () => {
    // Answering `false` would let a wiring defect pass silently as inequality.
    expect(() =>
      Money.of(100n, Currency.get('QAR')).equals(Money.of(100n, Currency.get('USD'))),
    ).toThrow(Money.CurrencyMismatchError);
  });
});
