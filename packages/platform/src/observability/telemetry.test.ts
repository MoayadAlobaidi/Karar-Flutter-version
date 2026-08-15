import { describe, expect, it } from 'vitest';
import {
  METRIC_NAMES,
  getMeter,
  getTracer,
  makeCounter,
  makeGauge,
  makeHistogram,
  withSpan,
} from './telemetry.js';

describe('metric name declarations', () => {
  it('pins the provider-neutral instrument names', () => {
    expect(METRIC_NAMES.httpServerDuration).toBe('http.server.duration');
    expect(METRIC_NAMES.readinessState).toBe('karar.readiness.state');
    expect(METRIC_NAMES.dbUp).toBe('karar.db.up');
  });
});

describe('withSpan', () => {
  it('propagates the return value', async () => {
    const result = await withSpan('unit.test', () => 41 + 1);
    expect(result).toBe(42);
  });

  it('propagates async results and receives a span handle', async () => {
    const result = await withSpan('unit.test.async', async (span) => {
      expect(typeof span.end).toBe('function');
      await Promise.resolve();
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('rethrows errors unchanged (spans observe, they never swallow)', async () => {
    const boom = new Error('boom');
    await expect(withSpan('unit.test.error', () => Promise.reject(boom))).rejects.toBe(boom);
  });
});

describe('api-only helpers degrade to no-ops without a registered SDK', () => {
  it('returns tracer and meter handles', () => {
    expect(getTracer()).toBeDefined();
    expect(getMeter('custom-scope')).toBeDefined();
  });

  it('counter, histogram and gauge handles record without throwing', () => {
    const counter = makeCounter('karar.test.counter', { description: 'test', unit: '1' });
    const histogram = makeHistogram(METRIC_NAMES.httpServerDuration, { unit: 'ms' });
    const gauge = makeGauge(METRIC_NAMES.readinessState);
    expect(() => {
      counter.add(1, { outcome: 'ok' });
      histogram.record(12.5, { 'http.route': '/healthz' });
      gauge.record(1);
      gauge.record(0);
    }).not.toThrow();
  });
});
