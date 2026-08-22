/**
 * Exact bigint arithmetic shared by Money, Percentage, and ExchangeRate.
 *
 * No IEEE floating point appears anywhere in these paths (ADR-0006,
 * architecture test 7). Every division takes an explicit RoundingMode; there
 * is no default, so rounding is visible at every call site.
 *
 * This module is internal: it is reachable from kernel code only and is not
 * part of the ten-name kernel surface. Consumers reach the rounding-mode
 * vocabulary as `Money.RoundingMode`.
 */
import { KernelError } from './kernel-error';

/**
 * How a non-exact division resolves to an integer.
 *
 * - `HALF_UP`   — ties round away from zero (2.5 → 3, -2.5 → -3).
 * - `HALF_EVEN` — ties round to the even neighbour (banker's rounding).
 * - `FLOOR`     — toward negative infinity.
 * - `CEIL`      — toward positive infinity.
 * - `TRUNC`     — toward zero.
 */
export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'FLOOR' | 'CEIL' | 'TRUNC';

/** Runtime companion of {@link RoundingMode}; frozen so it cannot be extended ad hoc. */
export const ROUNDING_MODES = Object.freeze({
  HALF_UP: 'HALF_UP',
  HALF_EVEN: 'HALF_EVEN',
  FLOOR: 'FLOOR',
  CEIL: 'CEIL',
  TRUNC: 'TRUNC',
} as const);

/** 10^exponent as a bigint. `exponent` must be a non-negative integer. */
export function pow10(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0) {
    throw new KernelError(`pow10 requires a non-negative integer exponent, got ${exponent}`);
  }
  return 10n ** BigInt(exponent);
}

/**
 * numerator / denominator resolved to an integer under an explicit rounding
 * mode. The denominator must be positive; negativity is normalised by callers
 * so that rounding semantics are stated once, here.
 */
export function divideRounded(
  numerator: bigint,
  denominator: bigint,
  roundingMode: RoundingMode,
): bigint {
  if (denominator <= 0n) {
    throw new KernelError(`divideRounded requires a positive denominator, got ${denominator}`);
  }
  const quotient = numerator / denominator; // bigint division truncates toward zero
  const remainder = numerator % denominator; // carries the numerator's sign
  if (remainder === 0n) {
    return quotient;
  }
  const negative = numerator < 0n;
  const awayFromZero = negative ? quotient - 1n : quotient + 1n;
  switch (roundingMode) {
    case 'TRUNC':
      return quotient;
    case 'FLOOR':
      return negative ? quotient - 1n : quotient;
    case 'CEIL':
      return negative ? quotient : quotient + 1n;
    case 'HALF_UP': {
      const twiceRemainder = 2n * (remainder < 0n ? -remainder : remainder);
      return twiceRemainder >= denominator ? awayFromZero : quotient;
    }
    case 'HALF_EVEN': {
      const twiceRemainder = 2n * (remainder < 0n ? -remainder : remainder);
      if (twiceRemainder > denominator) return awayFromZero;
      if (twiceRemainder < denominator) return quotient;
      return quotient % 2n === 0n ? quotient : awayFromZero;
    }
  }
}
