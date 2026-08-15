import { Currency, ExchangeRate, Result } from '@karar/shared-kernel';
import { describe, expect, it } from 'vitest';
import { exchangeRateFromWire, exchangeRateToWire } from './exchange-rate.js';

const qar = Currency.get('QAR');
const kwd = Currency.get('KWD');

const rate = ExchangeRate.of({
  base: qar,
  quote: kwd,
  mantissa: 1175n,
  scale: 4,
  source: 'treasury-feed',
  asOf: new Date('2026-08-01T00:00:00Z'),
});

describe('exchange-rate wire round trips', () => {
  it('serializes codes, exact rate, and provenance', () => {
    expect(exchangeRateToWire(rate)).toEqual({
      base: 'QAR',
      quote: 'KWD',
      mantissa: '1175',
      scale: 4,
      source: 'treasury-feed',
      asOf: '2026-08-01T00:00:00.000Z',
    });
  });

  it('round trips exactly, including a mantissa beyond Number.MAX_SAFE_INTEGER', () => {
    const precise = ExchangeRate.of({
      base: kwd,
      quote: qar,
      mantissa: 9007199254740993n, // 2^53 + 1
      scale: 15,
      source: 'stress-test',
      asOf: new Date('2026-08-15T12:34:56.789Z'),
    });
    const back = exchangeRateFromWire(JSON.parse(JSON.stringify(exchangeRateToWire(precise))));
    expect(Result.isOk(back)).toBe(true);
    if (back.ok) {
      expect(back.value.base.code).toBe('KWD');
      expect(back.value.quote.code).toBe('QAR');
      expect(back.value.rate.mantissa).toBe(9007199254740993n);
      expect(back.value.rate.scale).toBe(15);
      expect(back.value.source).toBe('stress-test');
      expect(back.value.asOf.toISOString()).toBe('2026-08-15T12:34:56.789Z');
    }
  });
});

describe('exchangeRateFromWire validation', () => {
  const valid = {
    base: 'QAR',
    quote: 'KWD',
    mantissa: '1175',
    scale: 4,
    source: 'treasury-feed',
    asOf: '2026-08-01T00:00:00.000Z',
  };

  it.each([
    ['not an object', 'nope'],
    ['unknown base', { ...valid, base: 'JPY' }],
    ['non-string base', { ...valid, base: 5 }],
    ['unknown quote', { ...valid, quote: 'XXX' }],
    ['numeric mantissa', { ...valid, mantissa: 1175 }],
    ['decimal mantissa string', { ...valid, mantissa: '0.1175' }],
    ['string scale', { ...valid, scale: '4' }],
    ['unparseable asOf', { ...valid, asOf: 'yesterday-ish' }],
    ['non-string asOf', { ...valid, asOf: 1754006400000 }],
    // Kernel construction rules surface as Results at this boundary:
    ['zero mantissa', { ...valid, mantissa: '0' }],
    ['negative mantissa', { ...valid, mantissa: '-1175' }],
    ['scale beyond the kernel cap', { ...valid, scale: 31 }],
    ['identical base and quote', { ...valid, quote: 'QAR' }],
    ['blank source', { ...valid, source: '  ' }],
  ] as const)('rejects %s as a VALIDATION_ERROR result', (_label, input) => {
    const result = exchangeRateFromWire(input);
    expect(Result.isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details?.field).toBeDefined();
    }
  });

  it('accepts the valid payload as a sanity check on the table above', () => {
    const result = exchangeRateFromWire(valid);
    expect(Result.isOk(result)).toBe(true);
  });
});
