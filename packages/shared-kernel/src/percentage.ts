/* eslint-disable @typescript-eslint/no-namespace -- the kernel surface is capped
   at nine exported names (architecture test 20); supporting types and errors
   therefore hang off the universal via declaration merging. */
import { KernelError } from './internal/kernel-error';
import { divideRounded, pow10 } from './internal/integer-math';
import { Money } from './money';

/**
 * An exact percentage as a scaled integer: the represented ratio is
 * `value / 10^scale`, so 2.5% is `{ value: 250n, scale: 4 }` (250 basis
 * points). There is no floating-point constructor and no float anywhere in the
 * arithmetic — a `number` cannot say 0.1% exactly, and a percentage that is
 * approximately right is how a Zakat rate drifts (ADR-0006).
 *
 * Percentages, ratios, and weights are not Money and never carry minor units
 * (docs/architecture/financial-engine.md §3).
 */
export class Percentage {
  private constructor(
    /** Scaled integer numerator; the ratio is value / 10^scale. */
    readonly value: bigint,
    /** Decimal scale; 4 is basis points. Integer in [0, 30]. */
    readonly scale: number,
  ) {
    Object.freeze(this);
  }

  /** The exact scaled representation, for wire mappers and stored values. */
  static of(value: bigint, scale: number): Percentage {
    if (!Number.isInteger(scale) || scale < 0 || scale > Percentage.MAX_SCALE) {
      throw new Percentage.InvalidPercentageError(
        `scale must be an integer in [0, ${Percentage.MAX_SCALE}], got ${scale}`,
      );
    }
    return new Percentage(value, scale);
  }

  /** Basis points: 10000 = 100%. `fromBasisPoints(250n)` is 2.5%. */
  static fromBasisPoints(basisPoints: bigint): Percentage {
    return new Percentage(basisPoints, 4);
  }

  /**
   * A percent given in decimal notation: `'2.5'` is 2.5%, `'0.001'` is 0.001%.
   * The scale grows with the stated precision, so every literal is represented
   * exactly — never through a float.
   */
  static fromPercent(text: string): Percentage {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
    if (match === null) {
      throw new Percentage.InvalidPercentageError(
        `'${text}' is not a decimal percentage literal (expected digits with an optional sign and fraction)`,
      );
    }
    const sign = match[1] === '-' ? -1n : 1n;
    const wholePart = match[2] ?? '';
    const fractionPart = match[3] ?? '';
    if (fractionPart.length + 2 > Percentage.MAX_SCALE) {
      throw new Percentage.InvalidPercentageError(
        `'${text}' exceeds the maximum supported precision (${Percentage.MAX_SCALE - 2} fractional digits)`,
      );
    }
    // percent → ratio divides by 100, hence the +2 on the scale.
    return new Percentage(sign * BigInt(wholePart + fractionPart), fractionPart.length + 2);
  }

  /**
   * This percentage of an amount, exactly, with rounding only at the final
   * integer step and only under the explicit mode. The bigint overload serves
   * calculators working on raw minor units.
   */
  apply(target: Money, roundingMode: Money.RoundingMode): Money;
  apply(target: bigint, roundingMode: Money.RoundingMode): bigint;
  apply(target: Money | bigint, roundingMode: Money.RoundingMode): Money | bigint {
    if (typeof target === 'bigint') {
      return divideRounded(target * this.value, pow10(this.scale), roundingMode);
    }
    return target.multiplyByPercentage(this, roundingMode);
  }

  /** Debug representation in percent, exact, without trailing zeros: `2.5%`, `-0.001%`, `100%`. */
  toString(): string {
    const sign = this.value < 0n ? '-' : '';
    const magnitude = this.value < 0n ? -this.value : this.value;
    // The ratio is value / 10^scale; in percent that is value / 10^(scale - 2).
    const percentScale = this.scale - 2;
    if (percentScale <= 0) {
      return `${sign}${magnitude * pow10(-percentScale)}%`;
    }
    const divisor = pow10(percentScale);
    const whole = magnitude / divisor;
    const fraction = (magnitude % divisor)
      .toString()
      .padStart(percentScale, '0')
      .replace(/0+$/, '');
    return fraction === '' ? `${sign}${whole}%` : `${sign}${whole}.${fraction}%`;
  }
}

export namespace Percentage {
  /** Upper bound on `scale`; beyond any meaningful precision and a guard against abusive wire input. */
  export const MAX_SCALE = 30;

  /** Thrown for malformed percentage literals or out-of-range scales. */
  export class InvalidPercentageError extends KernelError {}
}
