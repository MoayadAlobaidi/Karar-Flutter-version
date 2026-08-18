import { Catch, HttpException, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { ErrorCode, PlatformError, toProblemDetails } from '@karar/platform/dist/errors/index.js';
import type { ProblemDetails } from '@karar/platform/dist/errors/index.js';
import type { PlatformLogger } from '@karar/platform/dist/observability/index.js';
import { APP_LOGGER } from '../di-tokens.js';
import {
  authoredProblemOf,
  writeProblemResponse,
  type ProblemReplyLike,
} from './problem-response.js';

interface RequestLike {
  method: string;
  url: string;
  routeOptions?: { url?: string | undefined };
}

/** Framework 4xx statuses mapped onto the platform's infrastructure codes. */
const HTTP_STATUS_TO_CODE: Readonly<Record<number, ErrorCode>> = Object.freeze({
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.AUTHENTICATION_REQUIRED,
  403: ErrorCode.NOT_AUTHORIZED,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
});

/**
 * The kill-switch guards (identity/tenancy operation gates and the
 * control-plane guard) throw `ServiceUnavailableException` with exactly this
 * body. It is an INTENTIONAL, module-authored denial — the one framework 5xx
 * that must pass through as its coded problem instead of being genericized.
 */
interface OperationDeniedBody {
  readonly code: 'OPERATION_RESTRICTED' | 'DEPENDENCY_UNAVAILABLE';
  readonly switchId: string;
  readonly message: string;
}

function operationDeniedBodyOf(exception: HttpException): OperationDeniedBody | null {
  if (!(exception instanceof ServiceUnavailableException)) return null;
  const body = exception.getResponse();
  if (typeof body !== 'object' || body === null) return null;
  const candidate = body as Partial<OperationDeniedBody>;
  if (
    (candidate.code === 'OPERATION_RESTRICTED' || candidate.code === 'DEPENDENCY_UNAVAILABLE') &&
    typeof candidate.switchId === 'string' &&
    typeof candidate.message === 'string'
  ) {
    return candidate as OperationDeniedBody;
  }
  return null;
}

/** What leaves this boundary: the status, the body, and the code it logs under. */
interface ProblemAnswer {
  readonly status: number;
  readonly code: string;
  readonly body: unknown;
}

/**
 * The single error boundary of the HTTP entrypoint.
 *
 * Every thrown value leaves as an RFC 7807 problem document
 * (`application/problem+json`, written by `writeProblemResponse` — the one
 * writer). Two kinds of document reach the wire:
 *
 *   * a document the platform error model produced from the throw
 *     (`toProblemDetails`): `PlatformError` contributes its code/safe
 *     message/safe details, framework `HttpException`s are mapped onto
 *     platform codes, and anything else becomes the generic `INTERNAL_ERROR`
 *     problem;
 *   * a document a MODULE authored and threw for itself, forwarded verbatim
 *     (`authoredProblemOf`) so its own machine-readable code, its `reason` /
 *     `retryable` and its echoed `requestId` survive the boundary.
 *
 * The response NEVER carries stacks, causes, driver errors or connection
 * details either way.
 *
 * The error is logged here ONCE, server-side, with its stack — and nowhere
 * else (no-duplicate-error-logging rule, see platform observability/logger.ts).
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@Inject(APP_LOGGER) private readonly logger: PlatformLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<ProblemReplyLike>();
    const request = http.getRequest<RequestLike>();
    const route = request.routeOptions?.url ?? request.url.split('?')[0] ?? '/';
    const traceId = trace.getActiveSpan()?.spanContext().traceId;

    const answer = this.toAnswer(exception, route, traceId);

    // Log ONCE, at this boundary. Stack and cause stay SERVER-SIDE only.
    // An operator-set kill-switch restriction is an intentional denial, not a
    // failure: it logs as a rejection so an incident does not flood the error
    // signal. A switch-store outage stays in the error branch — it is real,
    // and so is a module's own dependency-unavailable answer.
    if (answer.status >= 500 && answer.code !== ErrorCode.OPERATION_RESTRICTED) {
      this.logger.error(
        {
          err: exception instanceof Error ? exception : new Error(String(exception)),
          method: request.method,
          route,
          status: answer.status,
          code: answer.code,
        },
        'request failed',
      );
    } else {
      this.logger.warn(
        { method: request.method, route, status: answer.status, code: answer.code },
        'request rejected',
      );
    }

    writeProblemResponse(reply, answer.status, answer.body);
  }

  private toAnswer(
    exception: unknown,
    instance: string,
    traceId: string | undefined,
  ): ProblemAnswer {
    // A module-authored document is already the answer; this boundary adds
    // the media type and the log line and changes nothing else.
    if (!(exception instanceof PlatformError)) {
      const authored = authoredProblemOf(exception);
      if (authored !== null) {
        return { status: authored.status, code: authored.body.code, body: authored.body };
      }
    }
    const problem = this.toProblem(exception, instance, traceId);
    return { status: problem.status, code: problem.code, body: problem };
  }

  private toProblem(
    exception: unknown,
    instance: string,
    traceId: string | undefined,
  ): ProblemDetails {
    const context = { instance, ...(traceId !== undefined ? { traceId } : {}) };
    if (!(exception instanceof PlatformError) && exception instanceof HttpException) {
      const denial = operationDeniedBodyOf(exception);
      if (denial !== null) {
        // Kill-switch denial: keep its code, its safe message, and the switch
        // id (a registry constant, safe by construction) — 503 both ways.
        return toProblemDetails(
          new PlatformError({
            code:
              denial.code === 'OPERATION_RESTRICTED'
                ? ErrorCode.OPERATION_RESTRICTED
                : ErrorCode.DEPENDENCY_UNAVAILABLE,
            message: denial.message,
            origin: 'infrastructure',
            details: { switchId: denial.switchId },
          }),
          context,
        );
      }
      const status = exception.getStatus();
      if (status < 500) {
        // Framework rejections (unknown route, bad payload shape) become the
        // matching platform-coded problem; the exception message is
        // framework-authored and safe for the caller.
        const code = HTTP_STATUS_TO_CODE[status] ?? ErrorCode.VALIDATION_ERROR;
        const mapped = new PlatformError({
          code,
          message: exception.message,
          origin: 'infrastructure',
        });
        return { ...toProblemDetails(mapped, context), status };
      }
      // A framework 5xx is an unexpected failure: fall through to the generic
      // INTERNAL_ERROR document (its message is treated as unsafe).
    }
    return toProblemDetails(exception, context);
  }
}
