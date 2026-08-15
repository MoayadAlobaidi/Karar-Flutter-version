/* eslint-disable @typescript-eslint/no-namespace -- the kernel surface is capped
   at nine exported names (architecture test 20); supporting types and errors
   therefore hang off the universal via declaration merging. */
import { KernelError } from './internal/kernel-error';

/**
 * A currency and its ISO 4217 minor-unit exponent.
 *
 * The exponent lives here and nowhere else (ADR-0006). Nothing in the platform
 * may assume "minor units means cents": Karar's launch markets include
 * three-decimal currencies (OMR, KWD, BHD) alongside two-decimal ones, so
 * `1000` minor units is ten QAR or one KWD depending on this object.
 *
 * Instances come only from the registry below — the constructor is private, so
 * a `Currency` in hand is always a supported currency with a verified exponent.
 *
 * ## Adding a currency — controlled process
 *
 * The registry is deliberately closed. A new currency is a reviewed change,
 * never a runtime registration:
 *
 * 1. Add the entry to `SUPPORTED` below with the exponent taken from ISO 4217
 *    (not assumed), and extend `Currency.Code`.
 * 2. Extend the registry tests in `currency.test.ts` (code, exponent, name)
 *    and add exponent-boundary cases in `money.test.ts` if the exponent is one
 *    the suite does not already cover.
 * 3. Review against docs/architecture/data-model.md §1 and ADR-0006; the
 *    reviewer confirms the exponent against the ISO table, since a wrong
 *    exponent silently mis-scales every stored amount in that currency.
 *
 * Lookup of a code outside the registry is an expected condition at system
 * boundaries, so `Currency.tryGet` returns `undefined` for it; `Currency.get`
 * throws `Currency.UnsupportedCurrencyError` for call sites that have already
 * validated their input and treat a miss as a programmer error.
 */
export class Currency {
  private constructor(
    /** ISO 4217 alphabetic code, e.g. 'QAR'. */
    readonly code: Currency.Code,
    /** ISO 4217 minor-unit exponent: minor units per major unit = 10^exponent. */
    readonly exponent: number,
    /** English name, for debug output only — display names are a localisation concern. */
    readonly name: string,
  ) {
    Object.freeze(this);
  }

  /** Launch-market currencies (QAR, SAR, AED, OMR, KWD, BHD) plus USD, EUR and
   * GBP, which appear as common statement and remittance currencies in the
   * launch markets even where they are not a local tender. */
  private static readonly SUPPORTED: ReadonlyMap<string, Currency> = new Map(
    (
      [
        ['QAR', 2, 'Qatari riyal'],
        ['SAR', 2, 'Saudi riyal'],
        ['AED', 2, 'United Arab Emirates dirham'],
        ['OMR', 3, 'Omani rial'],
        ['KWD', 3, 'Kuwaiti dinar'],
        ['BHD', 3, 'Bahraini dinar'],
        ['USD', 2, 'United States dollar'],
        ['EUR', 2, 'Euro'],
        ['GBP', 2, 'Pound sterling'],
      ] as const
    ).map(([code, exponent, name]) => [code, new Currency(code, exponent, name)]),
  );

  /**
   * The currency for `code`, or `undefined` when the code is not supported.
   * This is the boundary-facing lookup: an unknown code in external input is
   * an expected condition, not an exception.
   */
  static tryGet(code: string): Currency | undefined {
    return Currency.SUPPORTED.get(code);
  }

  /**
   * The currency for `code`. Throws `Currency.UnsupportedCurrencyError` when
   * the code is not in the registry — for call sites whose input is already
   * validated, where a miss is a programmer error. Boundary code validating
   * external input uses `tryGet`.
   */
  static get(code: string): Currency {
    const currency = Currency.SUPPORTED.get(code);
    if (currency === undefined) {
      throw new Currency.UnsupportedCurrencyError(code);
    }
    return currency;
  }

  /** All supported codes, in registry order. */
  static codes(): readonly Currency.Code[] {
    return [...Currency.SUPPORTED.keys()] as Currency.Code[];
  }

  /** Debug representation, e.g. `QAR(2)`. */
  toString(): string {
    return `${this.code}(${this.exponent})`;
  }
}

export namespace Currency {
  /** The supported ISO 4217 codes. Extending this union is step 1 of the controlled process above. */
  export type Code = 'QAR' | 'SAR' | 'AED' | 'OMR' | 'KWD' | 'BHD' | 'USD' | 'EUR' | 'GBP';

  /** Thrown by `Currency.get` for a code outside the registry. */
  export class UnsupportedCurrencyError extends KernelError {
    constructor(readonly requestedCode: string) {
      super(
        `unsupported currency code '${requestedCode}' — supported codes are ${Currency.codes().join(', ')}; ` +
          `adding one is a reviewed registry change (see Currency doc comment)`,
      );
    }
  }
}
