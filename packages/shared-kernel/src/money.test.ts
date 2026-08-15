import { describe, expect, it } from 'vitest';
import { Currency, Money, Percentage } from './index';

const qar = Currency.get('QAR'); // exponent 2
const omr = Currency.get('OMR'); // exponent 3
const kwd = Currency.get('KWD'); // exponent 3
const bhd = Currency.get('BHD'); // exponent 3

describe('Money.of', () => {
  it('accepts bigint minor units', () => {
    expect(Money.of(1234n, qar).minorUnits).toBe(1234n);
    expect(Money.of(-1n, qar).minorUnits).toBe(-1n);
  });

  it('accepts integer strings, including beyond Number.MAX_SAFE_INTEGER', () => {
    expect(Money.of('1234', qar).minorUnits).toBe(1234n);
    expect(Money.of('-1234', qar).minorUnits).toBe(-1234n);
    expect(Money.of('-0', qar).minorUnits).toBe(0n);
    expect(Money.of('9007199254740993', qar).minorUnits).toBe(9007199254740993n);
  });

  it.each(['', '12.3', '1e5', '+5', 'abc', '12 ', ' 12', '0x10'])(
    'rejects non-integer string %j',
    (text) => {
      expect(() => Money.of(text, qar)).toThrow(Money.InvalidAmountError);
    },
  );
});

describe('Money.fromDecimalString', () => {
  // The exponent comes from the Currency, never from an assumption of 2
  // (ADR-0006): the same literal '1.234' is invalid QAR and exactly 1234
  // minor units of OMR.
  it.each([
    ['12.34', qar, 1234n],
    ['0.05', qar, 5n],
    ['-0.05', qar, -5n],
    ['7', qar, 700n],
    ['0', qar, 0n],
    ['1.234', omr, 1234n],
    ['5', kwd, 5000n],
    ['0.001', bhd, 1n],
    ['-12.3', qar, -1230n],
    ['123456789123456789.99', qar, 12345678912345678999n],
  ] as const)('parses %j as %s minor units of its currency', (text, currency, minorUnits) => {
    const money = Money.fromDecimalString(text, currency);
    expect(money.minorUnits).toBe(minorUnits);
    expect(money.currency).toBe(currency);
  });

  it.each([
    ['12.345', qar], // three decimals in a two-decimal currency
    ['1.2345', omr], // four decimals in a three-decimal currency
    ['0.0001', kwd],
  ] as const)('rejects excess precision %j for %s instead of rounding', (text, currency) => {
    expect(() => Money.fromDecimalString(text, currency)).toThrow(Money.InvalidAmountError);
    expect(() => Money.fromDecimalString(text, currency)).toThrow(/excess precision/);
  });

  it.each(['1.', '.5', '1,000', '12.34.5', 'abc', '', '+1', '1e2', '١٢'])(
    'rejects malformed literal %j',
    (text) => {
      expect(() => Money.fromDecimalString(text, qar)).toThrow(Money.InvalidAmountError);
    },
  );
});

describe('Money.zero', () => {
  it('is zero minor units in the given currency', () => {
    const zero = Money.zero(omr);
    expect(zero.minorUnits).toBe(0n);
    expect(zero.currency).toBe(omr);
    expect(zero.isZero()).toBe(true);
  });
});

describe('same-currency arithmetic', () => {
  it('adds and subtracts exactly', () => {
    const a = Money.of(1050n, qar);
    const b = Money.of(-250n, qar);
    expect(a.add(b).minorUnits).toBe(800n);
    expect(a.subtract(b).minorUnits).toBe(1300n);
    // immutability: operands unchanged
    expect(a.minorUnits).toBe(1050n);
    expect(b.minorUnits).toBe(-250n);
  });

  it('survives magnitudes far beyond 2^53 without loss', () => {
    const big = Money.of(2n ** 80n, qar);
    expect(big.add(Money.of(1n, qar)).minorUnits).toBe(2n ** 80n + 1n);
    expect(big.subtract(Money.of(1n, qar)).minorUnits).toBe(2n ** 80n - 1n);
  });

  it.each(['add', 'subtract', 'compare', 'equals'] as const)(
    '%s across currencies throws CurrencyMismatchError',
    (operation) => {
      const a = Money.of(100n, qar);
      const b = Money.of(100n, kwd);
      expect(() => a[operation](b)).toThrow(Money.CurrencyMismatchError);
      expect(() => a[operation](b)).toThrow(/QAR/);
    },
  );
});

describe('comparison and predicates', () => {
  it('compares within one currency', () => {
    expect(Money.of(1n, qar).compare(Money.of(2n, qar))).toBe(-1);
    expect(Money.of(2n, qar).compare(Money.of(1n, qar))).toBe(1);
    expect(Money.of(2n, qar).compare(Money.of(2n, qar))).toBe(0);
  });

  it('equals is value equality within one currency', () => {
    expect(Money.of(5n, qar).equals(Money.of(5n, qar))).toBe(true);
    expect(Money.of(5n, qar).equals(Money.of(6n, qar))).toBe(false);
  });

  it('classifies sign', () => {
    expect(Money.of(-1n, qar).isNegative()).toBe(true);
    expect(Money.of(-1n, qar).isPositive()).toBe(false);
    expect(Money.of(0n, qar).isNegative()).toBe(false);
    expect(Money.of(0n, qar).isZero()).toBe(true);
    expect(Money.of(1n, qar).isPositive()).toBe(true);
  });

  it('negates and takes absolute value', () => {
    expect(Money.of(5n, qar).negate().minorUnits).toBe(-5n);
    expect(Money.of(-5n, qar).abs().minorUnits).toBe(5n);
    expect(Money.of(5n, qar).abs().minorUnits).toBe(5n);
    expect(Money.of(0n, qar).negate().minorUnits).toBe(0n);
  });
});

describe('multiplyByPercentage', () => {
  it('is exact when the share divides evenly, in every mode', () => {
    const amount = Money.of(20000n, qar); // QAR 200.00
    const fivePercent = Percentage.fromPercent('5');
    for (const mode of Object.values(Money.RoundingMode)) {
      expect(amount.multiplyByPercentage(fivePercent, mode).minorUnits).toBe(1000n);
    }
  });

  // The canonical fractional-minor-unit case: 0.1% of QAR 1.00 is 0.1 minor
  // units, so the declared mode decides — and is required, never defaulted.
  it.each([
    ['HALF_UP', 0n],
    ['HALF_EVEN', 0n],
    ['FLOOR', 0n],
    ['CEIL', 1n],
    ['TRUNC', 0n],
  ] as const)('0.1%% of QAR 1.00 under %s is %s minor units', (mode, expected) => {
    const oneQar = Money.fromDecimalString('1.00', qar);
    const tenthOfAPercent = Percentage.fromPercent('0.1');
    expect(oneQar.multiplyByPercentage(tenthOfAPercent, mode).minorUnits).toBe(expected);
  });

  it('keeps the currency and leaves the operand untouched', () => {
    const amount = Money.of(999n, omr);
    const result = amount.multiplyByPercentage(Percentage.fromBasisPoints(250n), 'HALF_EVEN');
    expect(result.currency).toBe(omr);
    expect(amount.minorUnits).toBe(999n);
  });
});

describe('toString / toWireString', () => {
  it.each([
    [1234n, qar, 'QAR 12.34'],
    [-5n, qar, 'QAR -0.05'],
    [0n, qar, 'QAR 0.00'],
    [1n, kwd, 'KWD 0.001'],
    [1234567n, omr, 'OMR 1234.567'],
    [-1000n, bhd, 'BHD -1.000'],
  ] as const)('%s minor units renders as %j', (minorUnits, currency, expected) => {
    expect(Money.of(minorUnits, currency).toString()).toBe(expected);
  });

  it('toWireString is the exact minor-unit integer as a string (ADR-0006)', () => {
    expect(Money.of(1234n, qar).toWireString()).toBe('1234');
    expect(Money.of(-1n, qar).toWireString()).toBe('-1');
    expect(Money.of(2n ** 70n, kwd).toWireString()).toBe((2n ** 70n).toString());
  });
});
