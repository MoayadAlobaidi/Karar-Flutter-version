import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '@karar/platform/dist/config/index.js';
import { loadWorkerSettings } from './worker-settings.js';

describe('loadWorkerSettings', () => {
  it('applies the documented defaults on an empty environment', () => {
    expect(loadWorkerSettings({})).toEqual({
      port: 3001,
      outboxIntervalMs: 500,
      outboxBatchSize: 25,
      jobsIntervalMs: 500,
      jobsBatchSize: 10,
      jobsLeaseTtlMs: 30_000,
      loopStaleAfterMs: 15_000,
    });
  });

  it('reads overrides from the injected environment', () => {
    const settings = loadWorkerSettings({
      KARAR_WORKER_PORT: '3456',
      KARAR_OUTBOX_RELAY_INTERVAL_MS: '100',
      KARAR_OUTBOX_RELAY_BATCH_SIZE: '50',
      KARAR_JOBS_POLL_INTERVAL_MS: '250',
      KARAR_JOBS_POLL_BATCH_SIZE: '5',
      KARAR_JOBS_LEASE_TTL_MS: '60000',
      KARAR_WORKER_LOOP_STALE_MS: '20000',
    });
    expect(settings).toEqual({
      port: 3456,
      outboxIntervalMs: 100,
      outboxBatchSize: 50,
      jobsIntervalMs: 250,
      jobsBatchSize: 5,
      jobsLeaseTtlMs: 60_000,
      loopStaleAfterMs: 20_000,
    });
  });

  it('rejects malformed values with field names, never echoing the value', () => {
    let failure: ConfigurationError | undefined;
    try {
      loadWorkerSettings({ KARAR_WORKER_PORT: 'not-a-port-9x' });
    } catch (error) {
      failure = error as ConfigurationError;
    }
    expect(failure).toBeInstanceOf(ConfigurationError);
    expect(failure?.message).toContain('KARAR_WORKER_PORT');
    expect(failure?.message).not.toContain('not-a-port-9x');
  });

  it('rejects out-of-range batch sizes (resource limits are validated, not clamped silently)', () => {
    expect(() => loadWorkerSettings({ KARAR_OUTBOX_RELAY_BATCH_SIZE: '5000' })).toThrowError(
      ConfigurationError,
    );
    expect(() => loadWorkerSettings({ KARAR_JOBS_POLL_BATCH_SIZE: '0' })).toThrowError(
      ConfigurationError,
    );
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(loadWorkerSettings({}))).toBe(true);
  });
});
