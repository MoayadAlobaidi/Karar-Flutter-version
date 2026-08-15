// @karar/platform/observability — structured logging and OTel-api telemetry
// helpers. Framework-thin by rule: this directory depends on `pino` and
// `@opentelemetry/api` only; SDKs, exporters and auto-instrumentation live in
// the apps (docs/architecture/backend.md §11).
//
// Error-logging rule (tested via the api exception-filter tests): an error is
// logged ONCE, at the boundary. See logger.ts.
export {
  DATA_CLASSIFICATIONS,
  REDACTED,
  REDACTED_HSF,
  SEALED_PLACEHOLDER,
  classified,
  resetClassifiedStateForTests,
  setClassifiedWarnSink,
  type DataClassification,
} from './classified.js';
export { getCorrelationId, withCorrelationId } from './correlation.js';
export {
  createLogger,
  redactLogObject,
  type CreateLoggerOptions,
  type PlatformLogger,
} from './logger.js';
export {
  METRIC_NAMES,
  getMeter,
  getTracer,
  makeCounter,
  makeGauge,
  makeHistogram,
  withSpan,
  type CounterHandle,
  type GaugeHandle,
  type HistogramHandle,
  type InstrumentOptions,
  type WithSpanOptions,
} from './telemetry.js';
