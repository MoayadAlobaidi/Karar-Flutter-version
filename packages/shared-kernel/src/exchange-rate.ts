/* eslint-disable @typescript-eslint/no-namespace -- the kernel surface is capped
   at nine exported names (architecture test 20); supporting types and errors
   therefore hang off the universal via declaration merging. */
import type { Currency } from './currency';
import { KernelError } from './internal/kernel-error';
import { divideRounded, pow10 } from './internal/integer-math';
import { Money } from './money';

/**
 * A conversion rate between two currencies, exact and provenance-carrying:
 * the rate is `mantissa / 10^scale` quote-currency units per base-currency
 * unit, valid `asOf` a moment, from a named `source`. Rates are not Money
 * (docs/architecture/financial-engine.md §3) and never floats (ADR-0006).
 *
 * `convert` is exact until the single final rounding step, which requires an
 * explicit `Money.RoundingMode` and honours both currencies' ISO 4217
 * exponents — converting QAR (exponent 2) into KWD (exponent 3) rescales
 * through major units, with no hidden assumption that minor units align.
 */
export class ExchangeRate {
  private constructor(
    /** The currency an amount must be in for `convert` to accept it. */
    readonly base: Currency,
    /** The currency `convert` produces. */
    readonly quote: Currency,
    /** The rate as an exact scaled integer: mantissa / 10^scale quote per base. */
    readonly rate: { readonly mantissa: bigint; readonly scale: number },
    /** Where the rate came from — a provider name, a statement, a manual entry. */
    readonly source: string,
    /** The moment the rate was observed. */
    readonly asOf: Date,
  ) {
    Object.freeze(this.rate);
    Object.freeze(this);
  }

  static of(input: {
    base: Currency;
    quote: Currency;
    mantissa: bigint;
    scale: number;
    source: string;
    asOf: Date;
  }): ExchangeRate {
    const { base, quote, mantissa, scale, source, asOf } = input;
    if (base.code === quote.code) {
      throw new ExchangeRate.InvalidRateError(
        `base and quote must differ, got ${base.code} for both`,
      );
    }
    if (mantissa <= 0n) {
      throw new ExchangeRate.InvalidRateError(`rate mantissa must be positive, got ${mantissa}`);
    }
    if (!Number.isInteger(scale) || scale < 0 || scale > ExchangeRate.MAX_SCALE) {
      throw new ExchangeRate.InvalidRateError(
        `rate scale must be an integer in [0, ${ExchangeRate.MAX_SCALE}], got ${scale}`,
      );
    }
    if (source.trim() === '') {
      throw new ExchangeRate.InvalidRateError('source must name where the rate came from');
    }
    if (Number.isNaN(asOf.getTime())) {
      throw new ExchangeRate.InvalidRateError('asOf must be a valid Date');
    }
    return new ExchangeRate(base, quote, { mantissa, scale }, source, new Date(asOf.getTime()));
  }

  /**
   * The amount in the quote currency. The amount must be in the base currency
   * — converting anything else through this rate is a wiring defect and
   * throws. Exact integer arithmetic throughout; one rounding step at the end,
   * under the explicit mode.
   */
  convert(amount: Money, roundingMode: Money.RoundingMode): Money {
    if (amount.currency.code !== this.base.code) {
      throw new Money.CurrencyMismatchError(
        `rate ${this.base.code}->${this.quote.code} cannot convert a ${amount.currency.code} ` +
          `amount — the amount must be in the base currency`,
      );
    }
    // minorQuote = minorBase / 10^expBase * (mantissa / 10^scale) * 10^expQuote,
    // kept as one exact fraction so rounding happens exactly once.
    const numerator = amount.minorUnits * this.rate.mantissa * pow10(this.quote.exponent);
    const denominator = pow10(this.rate.scale + this.base.exponent);
    return Money.of(divideRounded(numerator, denominator, roundingMode), this.quote);
  }

  /**
   * The quote→base rate derived from this one.
   *
   * Precision note: a reciprocal is generally not representable exactly in
   * scaled-decimal form (1 / 3.673 has no finite decimal expansion), so the
   * inverse mantissa is itself a rounded quantity — which is why both the
   * result scale and the rounding mode are required, explicit arguments, and
   * why `source` is annotated. Derive inverses for display or estimation;
   * where the reverse direction is authoritative, source a real reverse rate.
   */
  inverse(scale: number, roundingMode: Money.RoundingMode): ExchangeRate {
    if (!Number.isInteger(scale) || scale < 0 || scale > ExchangeRate.MAX_SCALE) {
      throw new ExchangeRate.InvalidRateError(
        `inverse scale must be an integer in [0, ${ExchangeRate.MAX_SCALE}], got ${scale}`,
      );
    }
    // inverse rate = 10^rate.scale / mantissa; at the requested scale the
    // mantissa is round(10^(scale + rate.scale) / mantissa).
    const mantissa = divideRounded(
      pow10(scale + this.rate.scale),
      this.rate.mantissa,
      roundingMode,
    );
    if (mantissa <= 0n) {
      throw new ExchangeRate.InvalidRateError(
        `inverse of ${this.rate.mantissa}/10^${this.rate.scale} rounds to zero at scale ${scale} — use a larger scale`,
      );
    }
    return ExchangeRate.of({
      base: this.quote,
      quote: this.base,
      mantissa,
      scale,
      source: `inverse(${this.source})`,
      asOf: this.asOf,
    });
  }

  /** Debug representation, e.g. `QAR->KWD 1175/10^4 (treasury-feed @ 2026-08-01T00:00:00.000Z)`. */
  toString(): string {
    return (
      `${this.base.code}->${this.quote.code} ${this.rate.mantissa}/10^${this.rate.scale} ` +
      `(${this.source} @ ${this.asOf.toISOString()})`
    );
  }
}

export namespace ExchangeRate {
  /** Upper bound on rate scales; beyond any quoted market precision and a guard against abusive wire input. */
  export const MAX_SCALE = 30;

  /** Thrown for structurally invalid rates: non-positive mantissa, bad scale, empty source, invalid asOf. */
  export class InvalidRateError extends KernelError {}
}
