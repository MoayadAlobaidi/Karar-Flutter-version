import { describe, expect, it } from 'vitest';
import { Currency, Money, Percentage } from './index';

const qar = Currency.get('QAR');

describe('Percentage construction', () => {
  it('fromBasisPoints is exact: 250 bp = 2.5%', () => {
    const percentage = Percentage.fromBasisPoints(250n);
    expect(percentage.value).toBe(250n);
    expect(percentage.scale).toBe(4);
    expect(percentage.toString()).toBe('2.5%');
  });

  it.each([
    // [literal, value, scale, rendered]
    ['2.5', 25n, 3, '2.5%'],
    ['0.1', 1n, 3, '0.1%'],
    ['0.001', 1n, 5, '0.001%'],
    ['100', 100n, 2, '100%'],
    ['-1', -1n, 2, '-1%'],
    ['0', 0n, 2, '0%'],
    ['12.75', 1275n, 4, '12.75%'],
  ] as const)('fromPercent(%j) is exactly value=%s scale=%i', (text, value, scale, rendered) => {
    const percentage = Percentage.fromPercent(text);
    expect(percentage.value).toBe(value);
    expect(percentage.scale).toBe(scale);
    expect(percentage.toString()).toBe(rendered);
  });

  it.each(['', 'abc', '2,5', '1.', '.5', '+1', '1e2', '5%'])(
    'fromPercent rejects %j — no float passthrough, no formats',
    (text) => {
      expect(() => Percentage.fromPercent(text)).toThrow(Percentage.InvalidPercentageError);
    },
  );

  it('of validates the scale range', () => {
    expect(Percentage.of(5n, 0).scale).toBe(0);
    expect(() => Percentage.of(5n, -1)).toThrow(Percentage.InvalidPercentageError);
    expect(() => Percentage.of(5n, 31)).toThrow(Percentage.InvalidPercentageError);
    expect(() => Percentage.of(5n, 2.5)).toThrow(Percentage.InvalidPercentageError);
  });

  it('equal ratios in different representations apply identically', () => {
    const fromBp = Percentage.fromBasisPoints(10n); // 10/10^4
    const fromPercent = Percentage.fromPercent('0.1'); // 1/10^3
    for (const mode of Object.values(Money.RoundingMode)) {
      expect(fromBp.apply(12345n, mode)).toBe(fromPercent.apply(12345n, mode));
    }
  });
});

describe('Percentage.apply — exact scaled arithmetic', () => {
  // 50% produces exact .5 remainders: the tie behaviour of every mode,
  // positive and negative, in one table.
  it.each([
    // [target, HALF_UP, HALF_EVEN, FLOOR, CEIL, TRUNC]
    [1n, 1n, 0n, 0n, 1n, 0n],
    [3n, 2n, 2n, 1n, 2n, 1n],
    [5n, 3n, 2n, 2n, 3n, 2n],
    [-1n, -1n, 0n, -1n, 0n, 0n],
    [-3n, -2n, -2n, -2n, -1n, -1n],
    [-5n, -3n, -2n, -3n, -2n, -2n],
  ] as const)('50%% of %s at each mode', (target, halfUp, halfEven, floor, ceil, trunc) => {
    const half = Percentage.fromPercent('50');
    expect(half.apply(target, 'HALF_UP')).toBe(halfUp);
    expect(half.apply(target, 'HALF_EVEN')).toBe(halfEven);
    expect(half.apply(target, 'FLOOR')).toBe(floor);
    expect(half.apply(target, 'CEIL')).toBe(ceil);
    expect(half.apply(target, 'TRUNC')).toBe(trunc);
  });

  // Non-tie fractional parts round independently of tie rules.
  it.each([
    ['25', 1n, 0n, 0n, 0n, 1n, 0n],
    ['75', 1n, 1n, 1n, 0n, 1n, 0n],
    ['25', -1n, 0n, 0n, -1n, 0n, 0n],
    ['75', -1n, -1n, -1n, -1n, 0n, 0n],
  ] as const)(
    '%s%% of %s at each mode',
    (percent, target, halfUp, halfEven, floor, ceil, trunc) => {
      const percentage = Percentage.fromPercent(percent);
      expect(percentage.apply(target, 'HALF_UP')).toBe(halfUp);
      expect(percentage.apply(target, 'HALF_EVEN')).toBe(halfEven);
      expect(percentage.apply(target, 'FLOOR')).toBe(floor);
      expect(percentage.apply(target, 'CEIL')).toBe(ceil);
      expect(percentage.apply(target, 'TRUNC')).toBe(trunc);
    },
  );

  it('applies to Money through the same explicit-rounding path', () => {
    const oneQar = Money.fromDecimalString('1.00', qar);
    const tenthOfAPercent = Percentage.fromPercent('0.1');
    expect(tenthOfAPercent.apply(oneQar, 'CEIL').minorUnits).toBe(1n);
    expect(tenthOfAPercent.apply(oneQar, 'HALF_UP').minorUnits).toBe(0n);
    expect(tenthOfAPercent.apply(oneQar, 'HALF_UP').currency).toBe(qar);
  });

  it('is exact at magnitudes beyond 2^53', () => {
    const huge = 2n ** 70n; // divisible by 4, so 25% is exact
    expect(Percentage.fromPercent('25').apply(huge, 'TRUNC')).toBe(2n ** 68n);
  });

  it('100% is the identity and 0% is zero, exactly', () => {
    const amount = 987654321987654321n;
    for (const mode of Object.values(Money.RoundingMode)) {
      expect(Percentage.fromPercent('100').apply(amount, mode)).toBe(amount);
      expect(Percentage.fromPercent('0').apply(amount, mode)).toBe(0n);
    }
  });
});
