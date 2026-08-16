import { ErrorCode } from './error-code.js';
import { PlatformError, type SafeDetailValue } from './platform-error.js';

/**
 * RFC 7807 problem document, plus the platform's registered extensions
 * (`code`, `traceId`, `correlationId`, `details`).
 */
export interface ProblemDetails {
  /** Stable machine-readable identity: `urn:karar:error:<code>`. */
  readonly type: string;
  readonly title: string;
  readonly status: number;
  /** The safe message only — never a stack, a cause chain, or environment detail. */
  readonly detail: string;
  /** The request path or resource this occurrence concerns, when known. */
  readonly instance?: string;
  readonly code: ErrorCode;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly details?: Readonly<Record<string, SafeDetailValue>>;
}

const STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.AUTHENTICATION_REQUIRED]: 401,
  [ErrorCode.NOT_AUTHORIZED]: 403,
  [ErrorCode.CONFIGURATION_ERROR]: 500,
  [ErrorCode.DEPENDENCY_UNAVAILABLE]: 503,
  [ErrorCode.OPERATION_RESTRICTED]: 503,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
});

const TITLE: Readonly<Record<ErrorCode, string>> = Object.freeze({
  [ErrorCode.VALIDATION_ERROR]: 'Validation failed',
  [ErrorCode.AUTHENTICATION_REQUIRED]: 'Authentication required',
  [ErrorCode.NOT_AUTHORIZED]: 'Not authorized',
  [ErrorCode.CONFIGURATION_ERROR]: 'Configuration error',
  [ErrorCode.DEPENDENCY_UNAVAILABLE]: 'Dependency unavailable',
  [ErrorCode.OPERATION_RESTRICTED]: 'Operation restricted',
  [ErrorCode.CONFLICT]: 'Conflict',
  [ErrorCode.NOT_FOUND]: 'Not found',
  [ErrorCode.RATE_LIMITED]: 'Rate limited',
  [ErrorCode.INTERNAL_ERROR]: 'Internal error',
});

const GENERIC_DETAIL = 'An unexpected error occurred.';

/**
 * Map any thrown value to an RFC 7807 problem document.
 *
 * Pure and framework-free: no HTTP types, no response objects — the NestJS
 * exception filter in `apps/api` calls this and owns transport. The mapping
 * is the platform's information-disclosure boundary:
 *
 * - A `PlatformError` contributes its code, safe message, safe details, and
 *   correlation id — nothing else.
 * - Anything else (a driver error, a TypeError, a thrown string) becomes an
 *   `INTERNAL_ERROR` problem with a generic detail. Its message is treated as
 *   unsafe by default, because driver messages carry hosts, users, and
 *   connection strings.
 * - Under no circumstances does a stack, a cause chain, or an environment
 *   detail enter the document. The leakage test in problem-details.test.ts
 *   pins this.
 */
export function toProblemDetails(
  error: unknown,
  context: { instance?: string; traceId?: string } = {},
): ProblemDetails {
  const platformError = PlatformError.is(error) ? error : undefined;
  const code = platformError?.code ?? ErrorCode.INTERNAL_ERROR;

  return {
    type: `urn:karar:error:${code}`,
    title: TITLE[code],
    status: STATUS[code],
    detail: platformError?.message ?? GENERIC_DETAIL,
    ...(context.instance !== undefined ? { instance: context.instance } : {}),
    code,
    ...(context.traceId !== undefined ? { traceId: context.traceId } : {}),
    ...(platformError?.correlationId !== undefined
      ? { correlationId: platformError.correlationId }
      : {}),
    ...(platformError?.details !== undefined ? { details: platformError.details } : {}),
  };
}
