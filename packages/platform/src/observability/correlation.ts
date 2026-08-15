/**
 * Correlation-id propagation over the OpenTelemetry context — provider-neutral
 * by construction: whatever context manager the runtime registers (the OTel
 * NodeSDK's AsyncLocalStorage manager in the apps) carries the id across
 * awaits, so every log line inside a request can attach it (backend.md §11).
 */
import { context, createContextKey } from '@opentelemetry/api';

const CORRELATION_ID_KEY = createContextKey('karar.correlation-id');

/** Runs `fn` with `correlationId` active; logs inside pick it up via the logger mixin. */
export function withCorrelationId<T>(correlationId: string, fn: () => T): T {
  return context.with(context.active().setValue(CORRELATION_ID_KEY, correlationId), fn);
}

export function getCorrelationId(): string | undefined {
  const value = context.active().getValue(CORRELATION_ID_KEY);
  return typeof value === 'string' ? value : undefined;
}
