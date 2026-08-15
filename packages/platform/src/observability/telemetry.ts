/**
 * Provider-neutral telemetry helpers — `@opentelemetry/api` ONLY.
 *
 * The platform never touches an SDK, an exporter, or a vendor client: apps
 * initialize the OTel NodeSDK (apps/api/src/telemetry) and deployment profiles
 * route the OTLP stream to whichever backend the provider offers. Moving
 * providers re-routes telemetry without touching this code or its callers
 * (docs/architecture/backend.md §11, infrastructure-portability.md).
 */
import { SpanStatusCode, metrics, trace } from '@opentelemetry/api';
import type { Attributes, Exception, Meter, Span, SpanOptions, Tracer } from '@opentelemetry/api';

const DEFAULT_SCOPE = '@karar/platform';

/**
 * Well-known instrument names, declared once so dashboards and alerts bind to
 * stable, provider-neutral names. Outbox/job instruments are declared by the
 * worker workstream with the same helpers.
 */
export const METRIC_NAMES = {
  /** Histogram, ms — RED duration per endpoint, recorded by the api's HTTP interceptor. */
  httpServerDuration: 'http.server.duration',
  /** Gauge, 1 ready / 0 not ready — mirrors the /readyz verdict. */
  readinessState: 'karar.readiness.state',
  /** Gauge, 1 up / 0 down — the database dependency as last probed. */
  dbUp: 'karar.db.up',
} as const;

export function getTracer(scope: string = DEFAULT_SCOPE): Tracer {
  return trace.getTracer(scope);
}

export function getMeter(scope: string = DEFAULT_SCOPE): Meter {
  return metrics.getMeter(scope);
}

export interface WithSpanOptions {
  readonly scope?: string;
  readonly attributes?: Attributes;
}

/**
 * Runs `fn` inside a started active span: children created inside `fn` nest
 * under it, a throw records the exception and marks the span errored, and the
 * span always ends. The error itself propagates unchanged — spans observe,
 * they never swallow.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => T | Promise<T>,
  options: WithSpanOptions = {},
): Promise<T> {
  const tracer = getTracer(options.scope);
  const spanOptions: SpanOptions =
    options.attributes !== undefined ? { attributes: options.attributes } : {};
  return tracer.startActiveSpan(name, spanOptions, async (span): Promise<T> => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Exception);
      // Status message carries the error NAME only — messages can contain data.
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.name : 'Error',
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

export interface InstrumentOptions {
  readonly description?: string;
  readonly unit?: string;
  readonly scope?: string;
}

export interface CounterHandle {
  add(value: number, attributes?: Attributes): void;
}

export interface HistogramHandle {
  record(value: number, attributes?: Attributes): void;
}

export interface GaugeHandle {
  record(value: number, attributes?: Attributes): void;
}

// The handles resolve their instrument through the GLOBAL meter provider on
// every call, so they are correct whether they were created before or after
// the SDK registered (and are no-ops when no SDK ever does — tests, tools).
// SDK meters cache instruments by name, so resolution is a map lookup.

export function makeCounter(name: string, options: InstrumentOptions = {}): CounterHandle {
  return {
    add(value, attributes) {
      getMeter(options.scope)
        .createCounter(name, {
          ...(options.description !== undefined && { description: options.description }),
          ...(options.unit !== undefined && { unit: options.unit }),
        })
        .add(value, attributes);
    },
  };
}

export function makeHistogram(name: string, options: InstrumentOptions = {}): HistogramHandle {
  return {
    record(value, attributes) {
      getMeter(options.scope)
        .createHistogram(name, {
          ...(options.description !== undefined && { description: options.description }),
          ...(options.unit !== undefined && { unit: options.unit }),
        })
        .record(value, attributes);
    },
  };
}

export function makeGauge(name: string, options: InstrumentOptions = {}): GaugeHandle {
  return {
    record(value, attributes) {
      getMeter(options.scope)
        .createGauge(name, {
          ...(options.description !== undefined && { description: options.description }),
          ...(options.unit !== undefined && { unit: options.unit }),
        })
        .record(value, attributes);
    },
  };
}
