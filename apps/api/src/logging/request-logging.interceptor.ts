import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { Observable } from 'rxjs';
import {
  METRIC_NAMES,
  getTracer,
  makeHistogram,
  withCorrelationId,
  type PlatformLogger,
} from '@karar/platform/dist/observability/index.js';
import { APP_LOGGER } from '../di-tokens.js';

// Structural request/reply types: fastify itself is not a direct dependency
// (it arrives through @nestjs/platform-fastify), and the interceptor needs
// only this surface.
interface RequestLike {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  routeOptions?: { url?: string | undefined };
}

interface ReplyLike {
  statusCode: number;
  header(name: string, value: string): unknown;
}

const CORRELATION_HEADER = 'x-correlation-id';
/** Accept only well-formed inbound ids so a hostile header cannot pollute logs. */
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

const httpServerDuration = makeHistogram(METRIC_NAMES.httpServerDuration, {
  description: 'Inbound HTTP request duration',
  unit: 'ms',
});

/**
 * Opens one SERVER span per handled request, propagates a correlation id, and
 * emits ONE access line per request (method, route template, status,
 * duration). The route TEMPLATE is logged, never the raw URL, so path
 * parameters (ids, tokens) stay out of logs. Errors are NOT logged here — the
 * exception filter is the single error-logging boundary.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(@Inject(APP_LOGGER) private readonly logger: PlatformLogger) {}

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = executionContext.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const reply = http.getResponse<ReplyLike>();

    const method = request.method;
    const route = request.routeOptions?.url ?? request.url.split('?')[0] ?? '/';
    const inboundId = request.headers[CORRELATION_HEADER];
    const correlationId =
      typeof inboundId === 'string' && CORRELATION_ID_PATTERN.test(inboundId)
        ? inboundId
        : randomUUID();
    reply.header(CORRELATION_HEADER, correlationId);

    const startedAt = process.hrtime.bigint();
    const tracer = getTracer('karar-api.http');

    return new Observable((subscriber) => {
      tracer.startActiveSpan(
        `${method} ${route}`,
        {
          kind: SpanKind.SERVER,
          attributes: { 'http.request.method': method, 'http.route': route },
        },
        (span) => {
          const finish = (statusCode: number, errored: boolean): void => {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
            span.setAttribute('http.response.status_code', statusCode);
            if (errored || statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
            httpServerDuration.record(durationMs, {
              'http.request.method': method,
              'http.route': route,
              'http.response.status_code': statusCode,
            });
            this.logger.info(
              {
                method,
                route,
                statusCode,
                durationMs: Math.round(durationMs * 1000) / 1000,
                correlationId,
              },
              'request completed',
            );
            span.end();
          };

          withCorrelationId(correlationId, () => {
            next.handle().subscribe({
              next: (value) => subscriber.next(value),
              complete: () => {
                finish(reply.statusCode, false);
                subscriber.complete();
              },
              error: (error: unknown) => {
                // Status is not final until the exception filter replies; derive
                // the same status it will use. The ERROR ITSELF is logged by the
                // filter, once.
                const status =
                  typeof (error as { getStatus?: () => number }).getStatus === 'function'
                    ? (error as { getStatus: () => number }).getStatus()
                    : 500;
                finish(status, true);
                subscriber.error(error);
              },
            });
          });
        },
      );
    });
  }
}
