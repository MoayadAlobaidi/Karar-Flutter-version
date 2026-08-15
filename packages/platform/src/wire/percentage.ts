import { Percentage, Result } from '@karar/shared-kernel';
import { ErrorCode } from '../errors/error-code.js';
import { PlatformError } from '../errors/platform-error.js';

/**
 * Percentage on the wire: the exact scaled representation, with the bigint
 * `value` as a string for the same reason Money's minor units are strings —
 * JSON numbers are doubles and cannot carry it exactly (ADR-0006). `scale` is
 * a small integer and travels as a number.
 */
export interface PercentageWire {
  readonly value: string;
  readonly scale: number;
}

const INTEGER_STRING = /^-?\d+$/;

/** Serialize. Total — every Percentage has an exact wire form. */
export function percentageToWire(percentage: Percentage): PercentageWire {
  return { value: percentage.value.toString(), scale: percentage.scale };
}

/** Parse and validate untrusted wire input; expected failures come back as a Result. */
export function percentageFromWire(input: unknown): Result<Percentage, PlatformError> {
  if (typeof input !== 'object' || input === null) {
    return Result.err(invalid('percentage', 'expected an object with value and scale'));
  }
  const candidate = input as { value?: unknown; scale?: unknown };

  if (typeof candidate.value !== 'string' || !INTEGER_STRING.test(candidate.value)) {
    return Result.err(
      invalid(
        'value',
        'expected an optionally-signed integer string (ADR-0006: never a JSON number)',
      ),
    );
  }
  if (typeof candidate.scale !== 'number') {
    return Result.err(invalid('scale', 'expected an integer number'));
  }
  try {
    return Result.ok(Percentage.of(BigInt(candidate.value), candidate.scale));
  } catch (cause) {
    // The kernel throws typed errors for out-of-range scales; at this
    // boundary that is an expected condition, converted to a Result.
    return Result.err(
      invalid('scale', cause instanceof Error ? cause.message : 'invalid percentage'),
    );
  }
}

function invalid(field: string, reason: string): PlatformError {
  return new PlatformError({
    code: ErrorCode.VALIDATION_ERROR,
    message: `invalid percentage payload: ${reason}`,
    origin: 'infrastructure',
    details: { field, reason },
  });
}
