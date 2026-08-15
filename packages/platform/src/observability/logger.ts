/**
 * Structured JSON logging for the backend (docs/architecture/backend.md §11).
 *
 * Every line carries the service identity (`service.name`, `service.version`,
 * `env`, `pid`); every line emitted inside an active span or correlation scope
 * additionally carries `traceId`, `spanId` and `correlationId`. A key-based
 * redaction pass runs on every log object so that credential-shaped fields can
 * never reach a sink, whatever code path produced them.
 *
 * Error-logging rule: an error is logged ONCE, at the boundary that converts
 * it into a response or a job outcome (the api's exception filter, the
 * worker's job runner). Interior code adds context by (re)throwing, never by
 * logging — double logging is what makes incident timelines unreadable.
 */
import { trace, isSpanContextValid } from '@opentelemetry/api';
import { destination as pinoDestination, pino } from 'pino';
import type { DestinationStream, Logger } from 'pino';
import { setClassifiedWarnSink } from './classified.js';
import { getCorrelationId } from './correlation.js';

/** Re-exported so consumers type against the platform, not against pino. */
export type PlatformLogger = Logger;

export interface CreateLoggerOptions {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly env: string;
  /** pino level label, e.g. `info` (config.log.level). */
  readonly level: string;
  /** Test seam: capture the JSON lines instead of writing to stdout. */
  readonly destination?: DestinationStream;
}

/** Case-insensitive credential-shaped key patterns; matching values are replaced. */
const REDACT_KEY_PATTERN = /(password|secret|token|authorization|apikey|api_key)/i;
const REDACTED = '[redacted]';
const MAX_REDACTION_DEPTH = 8;

function redactTree(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_REDACTION_DEPTH) return '[depth-limit]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((entry) => redactTree(entry, depth + 1, seen));
  }
  if (value instanceof Error) return value; // serialized by pino's error handling
  if (value instanceof Date) return value;
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto !== Object.prototype && proto !== null) {
    // Class instances: honour self-redaction (SecretValue's toJSON) when
    // present; otherwise walk own enumerable props so a credential-shaped
    // field on a third-party config object cannot reach a sink. Serialization
    // side effects are contained: getters that throw degrade to a marker.
    if (typeof (value as { toJSON?: unknown }).toJSON === 'function') return value;
    try {
      const copy: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        copy[key] = REDACT_KEY_PATTERN.test(key) ? REDACTED : redactTree(entry, depth + 1, seen);
      }
      return copy;
    } catch {
      return '[unserializable]';
    }
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = REDACT_KEY_PATTERN.test(key) ? REDACTED : redactTree(entry, depth + 1, seen);
  }
  return out;
}

/** Exported for tests; applied by the logger to every log object. */
export function redactLogObject(object: Record<string, unknown>): Record<string, unknown> {
  return redactTree(object, 0, new WeakSet()) as Record<string, unknown>;
}

/**
 * Builds the process logger. One logger per process; request scopes attach
 * ids via the OTel context (see correlation.ts), not via child loggers.
 */
export function createLogger(options: CreateLoggerOptions): PlatformLogger {
  const logger = pino(
    {
      level: options.level,
      base: {
        'service.name': options.serviceName,
        'service.version': options.serviceVersion,
        env: options.env,
        pid: process.pid,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label) {
          return { level: label };
        },
        log: redactLogObject,
      },
      mixin() {
        const fields: Record<string, string> = {};
        const spanContext = trace.getActiveSpan()?.spanContext();
        if (spanContext !== undefined && isSpanContextValid(spanContext)) {
          fields['traceId'] = spanContext.traceId;
          fields['spanId'] = spanContext.spanId;
        }
        const correlationId = getCorrelationId();
        if (correlationId !== undefined) fields['correlationId'] = correlationId;
        return fields;
      },
    },
    // Synchronous stdout by default: shutdown-path lines (SIGTERM) must reach
    // the sink before the process is allowed to die; an async buffer would
    // drop exactly the forensic tail an incident needs.
    options.destination ?? pinoDestination({ fd: 1, sync: true }),
  );
  // SEALED misuse warnings surface through the real logger once one exists.
  setClassifiedWarnSink((message) => {
    logger.warn(message);
  });
  return logger;
}
