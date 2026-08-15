import { Currency, Money, Result } from '@karar/shared-kernel';
import { describe, expect, it } from 'vitest';
import { PlatformError } from '../errors/platform-error.js';
import { moneyFromWire, moneyToWire } from './money.js';

const qar = Currency.get('QAR');
const kwd = Currency.get('KWD');

describe('moneyToWire', () => {
  it('emits minor units as a string and the currency as its code', () => {
    expect(moneyToWire(Money.of(1234n, qar))).toEqual({ minorUnits: '1234', currency: 'QAR' });
    expect(moneyToWire(Money.of(-1n, kwd))).toEqual({ minorUnits: '-1', currency: 'KWD' });
  });

  it('survives JSON round-tripping beyond Number.MAX_SAFE_INTEGER — the reason for strings (ADR-0006)', () => {
    const exact = 9007199254740993n; // 2^53 + 1: a JSON number silently becomes …992
    const viaJson: unknown = JSON.parse(JSON.stringify(moneyToWire(Money.of(exact, qar))));
    const back = moneyFromWire(viaJson);
    expect(Result.isOk(back)).toBe(true);
    if (back.ok) {
      expect(back.value.minorUnits).toBe(exact);
      expect(back.value.currency).toBe(qar);
    }
  });
});

describe('moneyFromWire round trips', () => {
  it.each([
    [0n, 'QAR'],
    [-50n, 'QAR'],
    [1n, 'BHD'], // three-decimal currency: 0.001 BHD
    [123456789123456789999n, 'KWD'], // far beyond int32/double
    [-(2n ** 71n), 'OMR'],
  ] as const)('%s %s', (minorUnits, code) => {
    const original = Money.of(minorUnits, Currency.get(code));
    const back = moneyFromWire(moneyToWire(original));
    expect(Result.isOk(back)).toBe(true);
    if (back.ok) {
      expect(back.value.minorUnits).toBe(minorUnits);
      expect(back.value.currency.code).toBe(code);
    }
  });
});

describe('moneyFromWire validation', () => {
  it.each([
    ['not an object', 'nope'],
    ['null', null],
    ['missing minorUnits', { currency: 'QAR' }],
    ['numeric minorUnits', { minorUnits: 1234, currency: 'QAR' }],
    ['decimal string', { minorUnits: '12.34', currency: 'QAR' }],
    ['exponent string', { minorUnits: '1e5', currency: 'QAR' }],
    ['empty string', { minorUnits: '', currency: 'QAR' }],
    ['missing currency', { minorUnits: '1234' }],
    ['non-string currency', { minorUnits: '1234', currency: 7 }],
    ['unknown currency', { minorUnits: '1234', currency: 'JPY' }],
    ['lowercase currency', { minorUnits: '1234', currency: 'qar' }],
  ] as const)('rejects %s as a VALIDATION_ERROR result', (_label, input) => {
    const result = moneyFromWire(input);
    expect(Result.isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(PlatformError);
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.retryable).toBe(false);
      expect(result.error.details?.field).toBeDefined();
    }
  });
});
