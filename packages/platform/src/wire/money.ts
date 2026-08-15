import { Currency, Money, Result } from '@karar/shared-kernel';
import { ErrorCode } from '../errors/error-code.js';
import { PlatformError } from '../errors/platform-error.js';

/**
 * Money on the wire (ADR-0006): minor units as a **string**, currency as its
 * ISO 4217 code.
 *
 * The string is the load-bearing decision: minor units are 64-bit integers,
 * JSON numbers are IEEE doubles, and every integer past 2^53 silently loses
 * precision in a JavaScript consumer — a generated SDK that truncates a
 * balance is a defect no test catches until the amounts get large.
 * `JSON.stringify` also throws on bigint, so the string form is what keeps
 * exactness and serializability at once.
 */
export interface MoneyWire {
  readonly minorUnits: string;
  readonly currency: string;
}

const INTEGER_STRING = /^-?\d+$/;

/** Serialize. Total — every Money has an exact wire form. */
export function moneyToWire(money: Money): MoneyWire {
  return { minorUnits: money.toWireString(), currency: money.currency.code };
}

/**
 * Parse and validate untrusted wire input. Malformed input is an expected
 * condition at a transport boundary, so the outcome is a `Result`, never a
 * throw (the kernel's Result/throw rule); the error is a `VALIDATION_ERROR`
 * `PlatformError` naming the offending field in safe details.
 */
export function moneyFromWire(input: unknown): Result<Money, PlatformError> {
  if (typeof input !== 'object' || input === null) {
    return Result.err(invalid('money', 'expected an object with minorUnits and currency'));
  }
  const candidate = input as { minorUnits?: unknown; currency?: unknown };

  if (typeof candidate.minorUnits !== 'string' || !INTEGER_STRING.test(candidate.minorUnits)) {
    return Result.err(
      invalid(
        'minorUnits',
        'expected an optionally-signed integer string (ADR-0006: never a JSON number)',
      ),
    );
  }
  if (typeof candidate.currency !== 'string') {
    return Result.err(invalid('currency', 'expected an ISO 4217 code string'));
  }
  const currency = Currency.tryGet(candidate.currency);
  if (currency === undefined) {
    return Result.err(
      invalid('currency', `'${candidate.currency}' is not a supported currency code`),
    );
  }
  return Result.ok(Money.of(candidate.minorUnits, currency));
}

function invalid(field: string, reason: string): PlatformError {
  return new PlatformError({
    code: ErrorCode.VALIDATION_ERROR,
    message: `invalid money payload: ${reason}`,
    origin: 'infrastructure',
    details: { field, reason },
  });
}
