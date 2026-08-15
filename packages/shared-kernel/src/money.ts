/* eslint-disable @typescript-eslint/no-namespace -- the kernel surface is capped
   at nine exported names (architecture test 20); supporting types and errors
   therefore hang off the universal via declaration merging. */
import type { Currency } from './currency';
import { KernelError } from './internal/kernel-error';
import { divideRounded, pow10, ROUNDING_MODES } from './internal/integer-math';
import type { Percentage } from './percentage';

/**
 * An exact monetary amount: integer minor units in a named currency.
 *
 * `BIGINT` minor units + `Currency` carrying its ISO 4217 exponent
 * (ADR-0006, docs/architecture/data-model.md §1). No floating point exists on
 * any code path in this class; every scaling division takes an explicit
 * `Money.RoundingMode`. On the wire, minor units travel as a string
 * (`toWireString`); the JSON mapping itself lives in `@karar/platform`.
 *
 * ## Errors: why arithmetic throws while boundaries return `Result`
 *
 * Adding QAR to KWD, or parsing `'12.345'` as QAR, is a defect at the call
 * site — no business outcome is served by carrying it as a value, so these
 * throw typed `KernelError` subclasses and fail loudly. Expected conditions
 * (an unknown currency code in a request, a malformed wire payload) belong to
 * boundary code, which validates first (`Currency.tryGet`) or catches at the
 * edge and returns `Result` (see the wire mappers in `@karar/platform`).
 *
 * Weights, purities, ratios, and rates are not Money — see `Percentage` and
 * `ExchangeRate` (docs/architecture/financial-engine.md §3).
 */
export class Money {
  private constructor(
    /** Integer minor units: 10^currency.exponent minor units per major unit. */
    readonly minorUnits: bigint,
    readonly currency: Currency,
  ) {
    Object.freeze(this);
  }

  /**
   * Money from integer minor units. A string is accepted for callers arriving
   * from serialized integers and must be a plain optionally-signed decimal
   * integer (`/^-?\d+$/`).
   */
  static of(minorUnits: bigint | string, currency: Currency): Money {
    if (typeof minorUnits === 'bigint') {
      return new Money(minorUnits, currency);
    }
    if (!/^-?\d+$/.test(minorUnits)) {
      throw new Money.InvalidAmountError(
        `minor-unit string '${minorUnits}' is not an optionally-signed decimal integer`,
      );
    }
    return new Money(BigInt(minorUnits), currency);
  }

  /**
   * Money from a decimal-notation string such as `'12.34'` (QAR) or `'1.234'`
   * (OMR), interpreted with the currency's own exponent. Fractional digits
   * beyond the exponent are rejected, never rounded: silent rounding at a
   * construction site is exactly the implicit rounding ADR-0006 bans.
   */
  static fromDecimalString(text: string, currency: Currency): Money {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
    if (match === null) {
      throw new Money.InvalidAmountError(
        `'${text}' is not a decimal amount (expected digits with an optional sign and fraction)`,
      );
    }
    const sign = match[1] === '-' ? -1n : 1n;
    const wholePart = match[2] ?? '';
    const fractionPart = match[3] ?? '';
    if (fractionPart.length > currency.exponent) {
      throw new Money.InvalidAmountError(
        `'${text}' has ${fractionPart.length} fractional digits but ${currency.code} has exponent ` +
          `${currency.exponent} — excess precision is rejected, not rounded`,
      );
    }
    const paddedFraction = fractionPart.padEnd(currency.exponent, '0');
    const minorUnits =
      sign *
      (BigInt(wholePart) * pow10(currency.exponent) +
        BigInt(paddedFraction === '' ? '0' : paddedFraction));
    return new Money(minorUnits, currency);
  }

  /** Zero in the given currency. */
  static zero(currency: Currency): Money {
    return new Money(0n, currency);
  }

  /** Sum of two amounts in the same currency. Cross-currency addition throws. */
  add(other: Money): Money {
    this.assertSameCurrency(other, 'add');
    return new Money(this.minorUnits + other.minorUnits, this.currency);
  }

  /** Difference of two amounts in the same currency. Cross-currency subtraction throws. */
  subtract(other: Money): Money {
    this.assertSameCurrency(other, 'subtract');
    return new Money(this.minorUnits - other.minorUnits, this.currency);
  }

  /**
   * This amount scaled by a percentage, with the rounding mode a required,
   * explicit argument — scaling is the kernel's only lossy operation and the
   * caller owns the loss.
   */
  multiplyByPercentage(percentage: Percentage, roundingMode: Money.RoundingMode): Money {
    const rounded = divideRounded(
      this.minorUnits * percentage.value,
      pow10(percentage.scale),
      roundingMode,
    );
    return new Money(rounded, this.currency);
  }

  /** -1, 0, or 1 against another amount in the same currency. Cross-currency comparison throws. */
  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other, 'compare');
    if (this.minorUnits < other.minorUnits) return -1;
    if (this.minorUnits > other.minorUnits) return 1;
    return 0;
  }

  /**
   * Value equality within one currency. Asking whether an amount of one
   * currency equals an amount of another is a category error and throws —
   * answering `false` would let a wiring defect pass silently as inequality.
   */
  equals(other: Money): boolean {
    this.assertSameCurrency(other, 'compare');
    return this.minorUnits === other.minorUnits;
  }

  isZero(): boolean {
    return this.minorUnits === 0n;
  }

  isNegative(): boolean {
    return this.minorUnits < 0n;
  }

  isPositive(): boolean {
    return this.minorUnits > 0n;
  }

  negate(): Money {
    return new Money(-this.minorUnits, this.currency);
  }

  abs(): Money {
    return this.minorUnits < 0n ? this.negate() : this;
  }

  /**
   * Split this amount into one part per weight, in proportion, conserving
   * every minor unit: the parts sum to exactly this amount, always.
   *
   * Largest-remainder method: each part starts at the floor of its exact
   * proportional share; the minor units that flooring left over (fewer than
   * there are parts) go one each to the parts with the largest remainders,
   * earliest index first on ties, so the distribution is deterministic.
   *
   * There is no rounding-mode parameter: conservation fixes the sum, and the
   * largest-remainder rule is the distribution policy — a per-part rounding
   * mode could not honour both. A zero weight receives exactly zero.
   *
   * Weights must be non-negative with a positive sum. Weights are ratios, not
   * Money (docs/architecture/financial-engine.md §3).
   */
  allocate(weights: readonly bigint[]): Money[] {
    if (weights.length === 0) {
      throw new Money.InvalidAllocationError('allocate requires at least one weight');
    }
    let totalWeight = 0n;
    for (const weight of weights) {
      if (weight < 0n) {
        throw new Money.InvalidAllocationError(`weights must be non-negative, got ${weight}`);
      }
      totalWeight += weight;
    }
    if (totalWeight === 0n) {
      throw new Money.InvalidAllocationError('weights must sum to a positive value');
    }

    const floors: bigint[] = [];
    const remainders: bigint[] = [];
    let assigned = 0n;
    for (const weight of weights) {
      const product = this.minorUnits * weight;
      // Floor division (bigint `/` truncates toward zero, which differs for negatives).
      let quotient = product / totalWeight;
      let remainder = product % totalWeight;
      if (remainder < 0n) {
        quotient -= 1n;
        remainder += totalWeight;
      }
      floors.push(quotient);
      remainders.push(remainder);
      assigned += quotient;
    }

    // 0 <= leftover < weights.length, so Number() is safe.
    const leftover = Number(this.minorUnits - assigned);
    const byLargestRemainder = remainders
      .map((remainder, index) => ({ remainder, index }))
      .sort((a, b) => {
        if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
        return a.index - b.index;
      });
    for (let i = 0; i < leftover; i += 1) {
      const winner = byLargestRemainder[i];
      if (winner === undefined) break; // unreachable: leftover < weights.length
      floors[winner.index] = (floors[winner.index] ?? 0n) + 1n;
    }

    return floors.map((units) => new Money(units, this.currency));
  }

  /** Debug representation with the currency's exponent applied, e.g. `QAR -12.34`, `KWD 1.234`. */
  toString(): string {
    const scale = pow10(this.currency.exponent);
    const magnitude = this.minorUnits < 0n ? -this.minorUnits : this.minorUnits;
    const whole = magnitude / scale;
    const sign = this.minorUnits < 0n ? '-' : '';
    if (this.currency.exponent === 0) {
      return `${this.currency.code} ${sign}${whole}`;
    }
    const fraction = (magnitude % scale).toString().padStart(this.currency.exponent, '0');
    return `${this.currency.code} ${sign}${whole}.${fraction}`;
  }

  /**
   * Minor units as a decimal string for transport. Minor units are a string on
   * the wire because a 64-bit integer does not survive JavaScript's number
   * type (ADR-0006); the full wire object mapping lives in `@karar/platform`.
   */
  toWireString(): string {
    return this.minorUnits.toString();
  }

  private assertSameCurrency(other: Money, operation: string): void {
    if (this.currency.code !== other.currency.code) {
      throw new Money.CurrencyMismatchError(
        `cannot ${operation} ${this.currency.code} and ${other.currency.code} — cross-currency ` +
          `arithmetic requires an explicit ExchangeRate conversion first`,
      );
    }
  }
}

export namespace Money {
  /** Rounding vocabulary for every scaling operation. See the member docs on the type. */
  export type RoundingMode = import('./internal/integer-math').RoundingMode;
  /** Runtime companion of {@link Money.RoundingMode}. */
  export const RoundingMode = ROUNDING_MODES;

  /** Thrown when an operation mixes currencies — a wiring defect, not a business outcome. */
  export class CurrencyMismatchError extends KernelError {}

  /** Thrown when a constructor receives a malformed or over-precise amount literal. */
  export class InvalidAmountError extends KernelError {}

  /** Thrown when allocate receives an empty, negative, or zero-sum weight list. */
  export class InvalidAllocationError extends KernelError {}
}
