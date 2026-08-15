import { ErrorCode } from './error-code.js';

/** Which architectural layer raised the error. */
export type ErrorOrigin = 'domain' | 'application' | 'infrastructure';

/** Detail values safe to serialize outward: JSON primitives only, no objects to smuggle state in. */
export type SafeDetailValue = string | number | boolean;

/**
 * The platform's error carrier.
 *
 * Two disclosure classes live on one object, and the split is the point:
 *
 * - `message` and `details` are **safe by contract**: written for the caller,
 *   allow-listed by the throwing site, and eligible for the RFC 7807 body.
 *   Details are runtime-filtered to JSON primitives so a driver error object
 *   cannot ride along in a field.
 * - `cause` is **internal only**: the underlying exception, kept for logs and
 *   debugging, never serialized outward. `toProblemDetails` does not read it,
 *   and the standard `Error` cause slot is non-enumerable, so naive JSON
 *   serialization does not leak it either.
 */
export class PlatformError extends Error {
  readonly code: ErrorCode;
  readonly origin: ErrorOrigin;
  /** Whether retrying the same request may succeed. Explicit, defaulting to false. */
  readonly retryable: boolean;
  /** Safe, caller-facing key/value context. Allow-listed by the throwing site. */
  readonly details?: Readonly<Record<string, SafeDetailValue>>;
  /** Correlates this failure across logs, traces, and the problem response. */
  readonly correlationId?: string;

  constructor(options: {
    code: ErrorCode;
    /** Safe for the caller: no secrets, no connection strings, no internals. */
    message: string;
    origin: ErrorOrigin;
    retryable?: boolean;
    details?: Record<string, SafeDetailValue>;
    correlationId?: string;
    /** The underlying failure, for logs only. Never serialized outward. */
    cause?: unknown;
  }) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PlatformError';
    this.code = options.code;
    this.origin = options.origin;
    this.retryable = options.retryable ?? false;
    if (options.details !== undefined) {
      this.details = Object.freeze(sanitizeDetails(options.details));
    }
    if (options.correlationId !== undefined) {
      this.correlationId = options.correlationId;
    }
  }

  static is(value: unknown): value is PlatformError {
    return value instanceof PlatformError;
  }
}

/** Keep only own enumerable entries whose values are JSON primitives. */
function sanitizeDetails(
  details: Record<string, SafeDetailValue>,
): Record<string, SafeDetailValue> {
  const safe: Record<string, SafeDetailValue> = {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    }
  }
  return safe;
}
