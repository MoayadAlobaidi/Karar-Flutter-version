/**
 * Worker runtime integration against a real PostgreSQL: outbox event →
 * relay → in-memory bus → allow-listed diagnostic consumer (receipt written),
 * diagnostic echo job → poller → handler → succeeded, readiness truth-telling
 * before/during/after, and graceful stop leaving nothing claimed or leased.
 *
 * Same execution model as the platform contract tests: scratch database per
 * run, loud skip when PostgreSQL is unreachable.
 */
import { Clock } from '@karar/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_DIAGNOSTIC_PING, readDefaultEventCatalogue } from '@karar/api-contracts';
import {
  LocalPostgresConnectionProfile,
  PostgresPersistenceAdapter,
  bootstrapRolesAndDatabase,
  maintenanceDatabase,
  migrateToLatest,
} from '@karar/platform/dist/db/index.js';
import { makeEnvelope } from '@karar/platform/dist/events/index.js';
import { PLATFORM_DIAGNOSTIC_ECHO } from '@karar/platform/dist/jobs/index.js';
import { enqueueInTransaction } from '@karar/platform/dist/outbox/index.js';
import { createLogger } from '@karar/platform/dist/observability/index.js';
import { WORKER_DIAGNOSTICS_CONSUMER, WorkerRuntime } from './runtime.js';
import { startHealthServer } from './health-server.js';
import { loadWorkerSettings } from './worker-settings.js';

const superuserMaintenanceProfile = LocalPostgresConnectionProfile.fromEnv('superuser', {
  database: maintenanceDatabase(),
});

async function probePostgres(): Promise<string | null> {
  const probe = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe.query('SELECT 1'),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('probe timeout')), 3_000);
      }),
    ]);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timer);
    await probe.end().catch(() => undefined);
  }
}

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    [
      '='.repeat(76),
      `WORKER INTEGRATION TESTS SKIPPED — PostgreSQL is not reachable at ${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for the worker runtime; a skipped run',
      'proves nothing. Start the local database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  PGPORT=5433 pnpm --filter @karar/worker test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const dbName = `karar_test_${process.pid}_worker`;
const clock = new Clock.Fixed(new Date('2026-08-15T12:00:00.000Z'));

async function bootstrapWithRetry(database: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await bootstrapRolesAndDatabase({ database });
      return;
    } catch (error) {
      const transient =
        error instanceof Error && error.message.includes('tuple concurrently updated');
      if (!transient || attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt + Math.random() * 200));
    }
  }
}

async function waitFor(
  condition: () => Promise<boolean>,
  what: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await condition()) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe.skipIf(unreachable !== null)('worker runtime against live PostgreSQL', () => {
  let adapter: PostgresPersistenceAdapter;
  let runtime: WorkerRuntime;

  const settings = loadWorkerSettings({
    KARAR_OUTBOX_RELAY_INTERVAL_MS: '50',
    KARAR_JOBS_POLL_INTERVAL_MS: '50',
  });
  const logger = createLogger({
    serviceName: 'karar-worker',
    serviceVersion: 'integration',
    env: 'local',
    level: 'fatal',
    destination: { write: () => true },
  });

  beforeAll(async () => {
    await bootstrapWithRetry(dbName);
    const migrator = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database: dbName }),
    );
    try {
      await migrateToLatest({ adapter: migrator });
    } finally {
      await migrator.end();
    }
    adapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database: dbName }),
    );
    runtime = new WorkerRuntime({
      adapter,
      catalogue: readDefaultEventCatalogue(),
      settings,
      logger,
      workerId: `worker-integration:${process.pid}`,
    });
  }, 120_000);

  afterAll(async () => {
    await adapter?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    } finally {
      await maintenance.end();
    }
  }, 60_000);

  it('reports not-ready before the loops start: postgres up, loops stale', async () => {
    const report = await runtime.readiness();
    expect(report.ready).toBe(false);
    expect(report.checks).toEqual({
      postgres: 'up',
      migrations: 'ok',
      outboxRelay: 'stale',
      jobPoller: 'stale',
    });
  });

  it('starts, flips ready, and serves both endpoints over the loopback health server', async () => {
    runtime.start();
    await waitFor(async () => (await runtime.readiness()).ready, 'runtime readiness');

    const health = await startHealthServer({ port: 0, readiness: () => runtime.readiness() });
    try {
      const live = await fetch(`http://127.0.0.1:${health.port}/healthz`);
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: 'ok' });

      const ready = await fetch(`http://127.0.0.1:${health.port}/readyz`);
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({
        status: 'ok',
        checks: { postgres: 'up', migrations: 'ok', outboxRelay: 'alive', jobPoller: 'alive' },
      });
    } finally {
      await health.close();
    }
  });

  it('delivers an outbox diagnostic ping to the allow-listed consumer exactly once (receipt proof)', async () => {
    const envelope = await adapter.withTransaction((tx) =>
      enqueueInTransaction(
        tx,
        makeEnvelope(readDefaultEventCatalogue(), {
          name: PLATFORM_DIAGNOSTIC_PING,
          payload: { pingId: `worker-ping-${process.pid}` },
          producer: 'karar-worker-integration',
          clock,
        }),
        clock,
      ),
    );

    await waitFor(async () => {
      const receipts = await adapter.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM platform.event_consumer_receipts
          WHERE consumer_name = $1 AND event_id = $2`,
        [WORKER_DIAGNOSTICS_CONSUMER, envelope.eventId],
      );
      return receipts.rows[0]?.count === '1';
    }, 'diagnostic consumer receipt');

    // The receipt is written in the consumer's transaction during delivery;
    // the relay marks published_at in its own follow-up statement. The outbox
    // contract guarantees the row becomes published — not that it is published
    // in the same instant the receipt appears — so this assertion polls too
    // (observed once as a timing flake right after a postgres restart).
    await waitFor(async () => {
      const row = await adapter.query<{ published_at: Date | null; claimed_by: string | null }>(
        `SELECT published_at, claimed_by FROM platform.outbox_events WHERE id = $1`,
        [envelope.eventId],
      );
      return row.rows[0]?.published_at !== null && row.rows[0]?.claimed_by === null;
    }, 'outbox row marked published and claim released');
  });

  it('executes the diagnostic echo job through the poller to succeeded', async () => {
    const { job } = await runtime.queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: `worker-echo-${process.pid}` },
    });

    await waitFor(async () => {
      const status = await adapter.query<{ status: string }>(
        `SELECT status FROM platform.jobs WHERE id = $1`,
        [job.id],
      );
      return status.rows[0]?.status === 'succeeded';
    }, 'diagnostic echo job completion');

    const finished = await adapter.query<{ lease_owner: string | null; attempts: number }>(
      `SELECT lease_owner, attempts FROM platform.jobs WHERE id = $1`,
      [job.id],
    );
    expect(finished.rows[0]?.lease_owner).toBeNull();
    expect(finished.rows[0]?.attempts).toBe(1);
  });

  it('graceful stop: loops end, nothing stays claimed or leased, readiness reports stale', async () => {
    await runtime.stop();
    expect(runtime.relay.isRunning).toBe(false);
    expect(runtime.poller.isRunning).toBe(false);

    const claimed = await adapter.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM platform.outbox_events WHERE claimed_by IS NOT NULL`,
    );
    expect(claimed.rows[0]?.count).toBe('0');
    const leased = await adapter.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM platform.jobs WHERE status = 'leased'`,
    );
    expect(leased.rows[0]?.count).toBe('0');

    const report = await runtime.readiness();
    expect(report.ready).toBe(false);
    expect(report.checks.outboxRelay).toBe('stale');
    expect(report.checks.jobPoller).toBe('stale');
  });
});
