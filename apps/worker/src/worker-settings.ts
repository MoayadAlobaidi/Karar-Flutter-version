/**
 * Worker-specific settings, parsed with the platform's typed schema tools so
 * validation, defaults, and value-free failure messages match `loadConfig`.
 * The environment object is HANDED IN by the composition root (main.ts); this
 * file never touches `process.env` itself (config convention,
 * packages/platform/src/config/config.ts).
 */
import { ConfigurationError, field, int, parseSchema } from '@karar/platform/dist/config/index.js';

export interface WorkerSettings {
  /** Health endpoint port; the server binds loopback only. */
  readonly port: number;
  /** Outbox relay idle delay between runs. */
  readonly outboxIntervalMs: number;
  /** Outbox rows claimed per relay run (the relay additionally caps this). */
  readonly outboxBatchSize: number;
  /** Job poller idle delay between runs. */
  readonly jobsIntervalMs: number;
  /** Jobs claimed per poll (the queue additionally caps this). */
  readonly jobsBatchSize: number;
  /** Job lease duration; heartbeats extend it for long jobs. */
  readonly jobsLeaseTtlMs: number;
  /** A loop whose last heartbeat is older than this reports not-ready. */
  readonly loopStaleAfterMs: number;
}

/** Parses worker settings from the injected environment; throws `ConfigurationError`. */
export function loadWorkerSettings(env: NodeJS.ProcessEnv): WorkerSettings {
  const outcome = parseSchema(
    {
      port: field('KARAR_WORKER_PORT', int({ default: 3001, min: 1, max: 65535 })),
      outboxIntervalMs: field(
        'KARAR_OUTBOX_RELAY_INTERVAL_MS',
        int({ default: 500, min: 10, max: 60_000 }),
      ),
      outboxBatchSize: field(
        'KARAR_OUTBOX_RELAY_BATCH_SIZE',
        int({ default: 25, min: 1, max: 100 }),
      ),
      jobsIntervalMs: field(
        'KARAR_JOBS_POLL_INTERVAL_MS',
        int({ default: 500, min: 10, max: 60_000 }),
      ),
      jobsBatchSize: field('KARAR_JOBS_POLL_BATCH_SIZE', int({ default: 10, min: 1, max: 25 })),
      jobsLeaseTtlMs: field(
        'KARAR_JOBS_LEASE_TTL_MS',
        int({ default: 30_000, min: 1_000, max: 3_600_000 }),
      ),
      loopStaleAfterMs: field(
        'KARAR_WORKER_LOOP_STALE_MS',
        int({ default: 15_000, min: 1_000, max: 3_600_000 }),
      ),
    },
    env,
    'worker.',
  );
  if (!outcome.ok) {
    throw new ConfigurationError(outcome.issues);
  }
  return Object.freeze(outcome.value);
}
