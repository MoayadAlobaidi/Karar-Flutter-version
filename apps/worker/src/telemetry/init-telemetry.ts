/**
 * OpenTelemetry SDK initialization for the worker entrypoint — the ONLY place
 * this app touches SDK/exporter packages. Deliberately parallel to
 * apps/api/src/telemetry/init-telemetry.ts: each entrypoint owns its SDK
 * wiring (the platform emits through `@opentelemetry/api` only,
 * docs/architecture/backend.md §11), and the OTLP stream goes to whatever
 * collector the deployment profile points at.
 */
import { context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { AppConfig } from '@karar/platform/dist/config/index.js';

export interface Telemetry {
  /** Flushes pending spans/metrics and stops exporters. Part of graceful shutdown. */
  shutdown(): Promise<void>;
}

export function initTelemetry(config: AppConfig): Telemetry {
  if (!config.telemetry.enabled) {
    // Exporters off, but async context propagation stays on so correlation ids
    // and any future spans still flow through logs.
    const manager = new AsyncLocalStorageContextManager();
    manager.enable();
    context.setGlobalContextManager(manager);
    return {
      async shutdown() {
        context.disable();
      },
    };
  }

  const endpoint = config.telemetry.otlpEndpoint.replace(/\/+$/, '');
  const sdk = new NodeSDK({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.service.name,
        [ATTR_SERVICE_VERSION]: config.service.version,
        // Stable name pending in semconv incubating entry-point; the literal keeps us off unstable imports.
        'deployment.environment.name': config.env,
      }),
    ),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: 10_000,
      }),
    ],
  });
  sdk.start();
  return {
    shutdown: () => sdk.shutdown(),
  };
}
