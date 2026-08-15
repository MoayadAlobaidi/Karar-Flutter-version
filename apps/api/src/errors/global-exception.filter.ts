import { Catch, HttpException, Inject } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { ErrorCode, PlatformError, toProblemDetails } from '@karar/platform/dist/errors/index.js';
import type { ProblemDetails } from '@karar/platform/dist/errors/index.js';
import type { PlatformLogger } from '@karar/platform/dist/observability/index.js';
import { APP_LOGGER } from '../di-tokens.js';

interface ReplyLike {
  status(code: number): ReplyLike;
  header(name: string, value: string): ReplyLike;
  send(body: unknown): unknown;
}

interface RequestLike {
  method: string;
  url: string;
  routeOptions?: { url?: string | undefined };
}

/** Framework 4xx statuses mapped onto the platform's infrastructure codes. */
const HTTP_STATUS_TO_CODE: Readonly<Record<number, ErrorCode>> = Object.freeze({
  400: ErrorCode.VALIDATION_ERROR,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
});

/**
 * The single error boundary of the HTTP entrypoint.
 *
 * Every thrown value leaves as an RFC 7807 problem document produced by the
 * platform error model's `toProblemDetails` (`application/problem+json`):
 * `PlatformError` contributes its code/safe message/safe details; framework
 * `HttpException`s are mapped onto platform codes; anything else becomes the
 * generic `INTERNAL_ERROR` problem. The response NEVER carries stacks,
 * causes, driver errors or connection details.
 *
 * The error is logged here ONCE, server-side, with its stack — and nowhere
 * else (no-duplicate-error-logging rule, see platform observability/logger.ts).
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@Inject(APP_LOGGER) private readonly logger: PlatformLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<ReplyLike>();
    const request = http.getRequest<RequestLike>();
    const route = request.routeOptions?.url ?? request.url.split('?')[0] ?? '/';
    const traceId = trace.getActiveSpan()?.spanContext().traceId;

    const problem = this.toProblem(exception, route, traceId);

    // Log ONCE, at this boundary. Stack and cause stay SERVER-SIDE only.
    if (problem.status >= 500) {
      this.logger.error(
        {
          err: exception instanceof Error ? exception : new Error(String(exception)),
          method: request.method,
          route,
          status: problem.status,
          code: problem.code,
        },
        'request failed',
      );
    } else {
      this.logger.warn(
        { method: request.method, route, status: problem.status, code: problem.code },
        'request rejected',
      );
    }

    reply
      .status(problem.status)
      .header('content-type', 'application/problem+json; charset=utf-8')
      .send(problem);
  }

  private toProblem(
    exception: unknown,
    instance: string,
    traceId: string | undefined,
  ): ProblemDetails {
    const context = { instance, ...(traceId !== undefined ? { traceId } : {}) };
    if (!(exception instanceof PlatformError) && exception instanceof HttpException) {
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
