import { Currency, ExchangeRate, Result } from '@karar/shared-kernel';
import { ErrorCode } from '../errors/error-code.js';
import { PlatformError } from '../errors/platform-error.js';

/**
 * ExchangeRate on the wire: currencies as ISO codes, the exact rate as a
 * string mantissa plus integer scale (the mantissa is a bigint, and JSON
 * numbers are doubles — ADR-0006), provenance as source plus an ISO 8601
 * `asOf` instant.
 */
export interface ExchangeRateWire {
  readonly base: string;
  readonly quote: string;
  readonly mantissa: string;
  readonly scale: number;
  readonly source: string;
  readonly asOf: string;
}

const INTEGER_STRING = /^-?\d+$/;

/** Serialize. Total — every ExchangeRate has an exact wire form. */
export function exchangeRateToWire(rate: ExchangeRate): ExchangeRateWire {
  return {
    base: rate.base.code,
    quote: rate.quote.code,
    mantissa: rate.rate.mantissa.toString(),
    scale: rate.rate.scale,
    source: rate.source,
    asOf: rate.asOf.toISOString(),
  };
}

/** Parse and validate untrusted wire input; expected failures come back as a Result. */
export function exchangeRateFromWire(input: unknown): Result<ExchangeRate, PlatformError> {
  if (typeof input !== 'object' || input === null) {
    return Result.err(invalid('exchangeRate', 'expected an object'));
  }
  const candidate = input as {
    base?: unknown;
    quote?: unknown;
    mantissa?: unknown;
    scale?: unknown;
    source?: unknown;
    asOf?: unknown;
  };

  if (typeof candidate.base !== 'string') {
    return Result.err(invalid('base', 'expected an ISO 4217 code string'));
  }
  const base = Currency.tryGet(candidate.base);
  if (base === undefined) {
    return Result.err(invalid('base', `'${candidate.base}' is not a supported currency code`));
  }
  if (typeof candidate.quote !== 'string') {
    return Result.err(invalid('quote', 'expected an ISO 4217 code string'));
  }
  const quote = Currency.tryGet(candidate.quote);
  if (quote === undefined) {
    return Result.err(invalid('quote', `'${candidate.quote}' is not a supported currency code`));
  }
  if (typeof candidate.mantissa !== 'string' || !INTEGER_STRING.test(candidate.mantissa)) {
    return Result.err(
      invalid(
        'mantissa',
        'expected an optionally-signed integer string (ADR-0006: never a JSON number)',
      ),
    );
  }
  if (typeof candidate.scale !== 'number') {
    return Result.err(invalid('scale', 'expected an integer number'));
  }
  if (typeof candidate.source !== 'string') {
    return Result.err(invalid('source', 'expected a string naming the rate source'));
  }
  if (typeof candidate.asOf !== 'string' || Number.isNaN(Date.parse(candidate.asOf))) {
    return Result.err(invalid('asOf', 'expected an ISO 8601 date-time string'));
  }

  try {
    return Result.ok(
      ExchangeRate.of({
        base,
        quote,
        mantissa: BigInt(candidate.mantissa),
        scale: candidate.scale,
        source: candidate.source,
        asOf: new Date(candidate.asOf),
      }),
    );
  } catch (cause) {
    // Kernel construction rules (positive mantissa, scale bounds, distinct
    // currencies, non-empty source) are expected conditions at this boundary.
    return Result.err(
      invalid('exchangeRate', cause instanceof Error ? cause.message : 'invalid exchange rate'),
    );
  }
}

function invalid(field: string, reason: string): PlatformError {
  return new PlatformError({
    code: ErrorCode.VALIDATION_ERROR,
    message: `invalid exchange-rate payload: ${reason}`,
    origin: 'infrastructure',
    details: { field, reason },
  });
}
