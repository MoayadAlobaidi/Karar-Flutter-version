import { describe, expect, it } from 'vitest';
import { Currency, ExchangeRate, Money } from './index';

const qar = Currency.get('QAR'); // exponent 2
const kwd = Currency.get('KWD'); // exponent 3
const aed = Currency.get('AED'); // exponent 2
const usd = Currency.get('USD'); // exponent 2

const asOf = new Date('2026-08-01T00:00:00Z');

const qarToKwd = ExchangeRate.of({
  base: qar,
  quote: kwd,
  mantissa: 1175n, // 0.1175 KWD per QAR
  scale: 4,
  source: 'treasury-feed',
  asOf,
});

describe('ExchangeRate.of validation', () => {
  it.each([
    ['zero mantissa', { mantissa: 0n }, /mantissa/],
    ['negative mantissa', { mantissa: -5n }, /mantissa/],
    ['negative scale', { scale: -1 }, /scale/],
    ['scale beyond the cap', { scale: 31 }, /scale/],
    ['fractional scale', { scale: 1.5 }, /scale/],
    ['blank source', { source: '   ' }, /source/],
    ['invalid asOf', { asOf: new Date('not-a-date') }, /asOf/],
    ['identical base and quote', { quote: qar }, /base and quote must differ/],
  ] as const)('rejects %s with a typed error', (_label, override, message) => {
    const build = (): ExchangeRate =>
      ExchangeRate.of({
        base: qar,
        quote: kwd,
        mantissa: 1175n,
        scale: 4,
        source: 'treasury-feed',
        asOf,
        ...override,
      });
    expect(build).toThrow(ExchangeRate.InvalidRateError);
    expect(build).toThrow(message);
  });

  it('defensively copies asOf so later mutation cannot move the rate', () => {
    const date = new Date('2026-08-01T00:00:00Z');
    const rate = ExchangeRate.of({
      base: qar,
      quote: kwd,
      mantissa: 1175n,
      scale: 4,
      source: 'treasury-feed',
      asOf: date,
    });
    date.setFullYear(1999);
    expect(rate.asOf.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('convert — exact scaled arithmetic across exponents', () => {
  it('QAR(2) to KWD(3) lands exactly when the arithmetic is exact', () => {
    // QAR 100.00 at 0.1175 = KWD 11.750, exactly — every mode agrees.
    const hundredQar = Money.fromDecimalString('100.00', qar);
    for (const mode of Object.values(Money.RoundingMode)) {
      const converted = qarToKwd.convert(hundredQar, mode);
      expect(converted.minorUnits).toBe(11750n);
      expect(converted.currency).toBe(kwd);
    }
  });

  it('KWD(3) to QAR(2) rescales through major units, never assuming aligned minor units', () => {
    const kwdToQar = ExchangeRate.of({
      base: kwd,
      quote: qar,
      mantissa: 119n, // 11.9 QAR per KWD
      scale: 1,
      source: 'treasury-feed',
      asOf,
    });
    // KWD 1.000 = QAR 11.90: 1000 minor KWD in, 1190 minor QAR out.
    const oneKwd = Money.fromDecimalString('1.000', kwd);
    expect(kwdToQar.convert(oneKwd, 'HALF_EVEN').minorUnits).toBe(1190n);
  });

  it('rounds only once, at the end, under the explicit mode', () => {
    const aedToUsd = ExchangeRate.of({
      base: aed,
      quote: usd,
      mantissa: 2723n, // 0.2723 USD per AED
      scale: 4,
      source: 'treasury-feed',
      asOf,
    });
    // AED 1.00 = 27.23 US cents: fractional, so the mode decides.
    const oneAed = Money.fromDecimalString('1.00', aed);
    expect(aedToUsd.convert(oneAed, 'HALF_UP').minorUnits).toBe(27n);
    expect(aedToUsd.convert(oneAed, 'FLOOR').minorUnits).toBe(27n);
    expect(aedToUsd.convert(oneAed, 'CEIL').minorUnits).toBe(28n);
    expect(aedToUsd.convert(oneAed, 'TRUNC').minorUnits).toBe(27n);
  });

  it('handles negative amounts under the declared mode', () => {
    const aedToUsd = ExchangeRate.of({
      base: aed,
      quote: usd,
      mantissa: 2723n,
      scale: 4,
      source: 'treasury-feed',
      asOf,
    });
    const minusOneAed = Money.fromDecimalString('-1.00', aed);
    expect(aedToUsd.convert(minusOneAed, 'FLOOR').minorUnits).toBe(-28n);
    expect(aedToUsd.convert(minusOneAed, 'CEIL').minorUnits).toBe(-27n);
    expect(aedToUsd.convert(minusOneAed, 'HALF_UP').minorUnits).toBe(-27n);
  });

  it('stays exact at magnitudes far beyond 2^53', () => {
    const huge = Money.of(2n ** 80n, qar);
    const converted = qarToKwd.convert(huge, 'TRUNC');
    // (2^80 * 1175 * 10^3) / 10^6, truncated — computed independently here.
    expect(converted.minorUnits).toBe((2n ** 80n * 1175n * 1000n) / 1000000n);
  });

  it('rejects an amount not in the base currency', () => {
    const dirhams = Money.of(100n, aed);
    expect(() => qarToKwd.convert(dirhams, 'HALF_EVEN')).toThrow(Money.CurrencyMismatchError);
    expect(() => qarToKwd.convert(dirhams, 'HALF_EVEN')).toThrow(/base currency/);
  });
});

describe('inverse — a derived, rounded rate', () => {
  it('swaps direction, annotates provenance, and keeps asOf', () => {
    const inverse = qarToKwd.inverse(8, 'HALF_EVEN');
    expect(inverse.base).toBe(kwd);
    expect(inverse.quote).toBe(qar);
    // 1 / 0.1175 = 8.51063829787…; at scale 8, HALF_EVEN: 851063830.
    expect(inverse.rate.mantissa).toBe(851063830n);
    expect(inverse.rate.scale).toBe(8);
    expect(inverse.source).toBe('inverse(treasury-feed)');
    expect(inverse.asOf.toISOString()).toBe(asOf.toISOString());
  });

  it('round-trips within one minor unit — the documented precision loss', () => {
    const inverse = qarToKwd.inverse(8, 'HALF_EVEN');
    const original = Money.fromDecimalString('100.00', qar);
    const there = qarToKwd.convert(original, 'HALF_EVEN');
    const backAgain = inverse.convert(there, 'HALF_EVEN');
    const drift = backAgain.minorUnits - original.minorUnits;
    expect(drift <= 1n && drift >= -1n).toBe(true);
  });

  it('refuses an inverse that rounds to zero instead of returning a nonsense rate', () => {
    const three = ExchangeRate.of({
      base: qar,
      quote: kwd,
      mantissa: 3n,
      scale: 0,
      source: 'test',
      asOf,
    });
    expect(() => three.inverse(0, 'FLOOR')).toThrow(ExchangeRate.InvalidRateError);
    expect(() => three.inverse(0, 'FLOOR')).toThrow(/rounds to zero/);
  });

  it('validates the requested scale', () => {
    expect(() => qarToKwd.inverse(-1, 'HALF_EVEN')).toThrow(ExchangeRate.InvalidRateError);
    expect(() => qarToKwd.inverse(31, 'HALF_EVEN')).toThrow(ExchangeRate.InvalidRateError);
  });
});

describe('debug formatting', () => {
  it('names both currencies, the exact rate, and provenance', () => {
    expect(qarToKwd.toString()).toBe(
      'QAR->KWD 1175/10^4 (treasury-feed @ 2026-08-01T00:00:00.000Z)',
    );
  });
});
