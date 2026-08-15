import { Percentage, Result } from '@karar/shared-kernel';
import { describe, expect, it } from 'vitest';
import { percentageFromWire, percentageToWire } from './percentage.js';

describe('percentage wire round trips', () => {
  it.each([
    [250n, 4], // 2.5% as basis points
    [1n, 5], // 0.001%
    [-1n, 2], // -1%
    [0n, 0],
    [98765432109876543210n, 20], // bigint precision beyond double
  ] as const)('value=%s scale=%i', (value, scale) => {
    const original = Percentage.of(value, scale);
    const wire = percentageToWire(original);
    expect(wire).toEqual({ value: value.toString(), scale });

    const back = percentageFromWire(JSON.parse(JSON.stringify(wire)));
    expect(Result.isOk(back)).toBe(true);
    if (back.ok) {
      expect(back.value.value).toBe(value);
      expect(back.value.scale).toBe(scale);
    }
  });
});

describe('percentageFromWire validation', () => {
  it.each([
    ['not an object', 42],
    ['missing value', { scale: 4 }],
    ['numeric value', { value: 250, scale: 4 }],
    ['decimal value string', { value: '2.5', scale: 4 }],
    ['missing scale', { value: '250' }],
    ['string scale', { value: '250', scale: '4' }],
    ['fractional scale', { value: '250', scale: 1.5 }],
    ['negative scale', { value: '250', scale: -1 }],
    ['scale beyond the kernel cap', { value: '250', scale: 31 }],
  ] as const)('rejects %s as a VALIDATION_ERROR result', (_label, input) => {
    const result = percentageFromWire(input);
    expect(Result.isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.origin).toBe('infrastructure');
    }
  });
});
