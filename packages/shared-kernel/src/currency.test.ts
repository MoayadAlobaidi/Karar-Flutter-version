import { describe, expect, it } from 'vitest';
import { Currency } from './index';

describe('Currency registry', () => {
  // The registry is the single source of exponents (ADR-0006). Every entry is
  // pinned here so a drive-by edit fails a test, not a customer balance.
  it.each([
    ['QAR', 2, 'Qatari riyal'],
    ['SAR', 2, 'Saudi riyal'],
    ['AED', 2, 'United Arab Emirates dirham'],
    ['OMR', 3, 'Omani rial'],
    ['KWD', 3, 'Kuwaiti dinar'],
    ['BHD', 3, 'Bahraini dinar'],
    ['USD', 2, 'United States dollar'],
    ['EUR', 2, 'Euro'],
    ['GBP', 2, 'Pound sterling'],
  ] as const)('%s has exponent %i (%s)', (code, exponent, name) => {
    const currency = Currency.get(code);
    expect(currency.code).toBe(code);
    expect(currency.exponent).toBe(exponent);
    expect(currency.name).toBe(name);
  });

  it('supports exactly the nine registry currencies', () => {
    expect(Currency.codes()).toEqual([
      'QAR',
      'SAR',
      'AED',
      'OMR',
      'KWD',
      'BHD',
      'USD',
      'EUR',
      'GBP',
    ]);
  });

  it('returns the same frozen instance from get and tryGet', () => {
    expect(Currency.get('QAR')).toBe(Currency.tryGet('QAR'));
    expect(Object.isFrozen(Currency.get('QAR'))).toBe(true);
  });

  describe('unknown codes', () => {
    // JPY (exponent 0) is deliberately outside the registry: nothing may fall
    // back to an assumed exponent for a currency the platform has not
    // admitted through the controlled process.
    it('tryGet reports an expected miss as undefined', () => {
      expect(Currency.tryGet('JPY')).toBeUndefined();
      expect(Currency.tryGet('')).toBeUndefined();
      expect(Currency.tryGet('qar')).toBeUndefined(); // ISO codes are uppercase; no case folding
      expect(Currency.tryGet('QA')).toBeUndefined();
    });

    it('get throws a typed error naming the rejected code', () => {
      expect(() => Currency.get('JPY')).toThrow(Currency.UnsupportedCurrencyError);
      try {
        Currency.get('JPY');
        expect.unreachable('get must throw for JPY');
      } catch (error) {
        expect(error).toBeInstanceOf(Currency.UnsupportedCurrencyError);
        expect((error as Currency.UnsupportedCurrencyError).requestedCode).toBe('JPY');
        expect((error as Error).message).toContain('JPY');
      }
    });
  });

  it('formats a debug string carrying the exponent', () => {
    expect(Currency.get('KWD').toString()).toBe('KWD(3)');
    expect(Currency.get('QAR').toString()).toBe('QAR(2)');
  });
});
