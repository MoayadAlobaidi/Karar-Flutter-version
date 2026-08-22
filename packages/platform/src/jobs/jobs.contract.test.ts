/**
 * Job foundation contract tests against a real PostgreSQL (ADR-0013):
 * idempotent enqueue, two workers claiming 100 jobs concurrently without
 * double execution (SKIP LOCKED proof), retry backoff, dead-lettering, lease
 * expiry recovery mid-run, graceful shutdown releasing leases, the payload
 * size guard, and priority ordering.
 *
 * Same execution model as ../db/contract.test.ts: one file, serial tests,
 * scratch database per run, loud skip when PostgreSQL is unreachable.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresPersistenceAdapter } from '../db/adapter.js';
import { bootstrapRolesAndDatabase } from '../db/bootstrap.js';
import { LocalPostgresConnectionProfile, maintenanceDatabase } from '../db/connection-profile.js';
import { migrateToLatest } from '../db/migrations.js';
import { JobPoller } from './poller.js';
import { PostgresJobQueue } from './postgres-queue.js';
import {
  createDiagnosticEchoHandler,
  JobHandlerRegistry,
  PLATFORM_DIAGNOSTIC_ECHO,
} from './registry.js';
import { JobPayloadTooLargeError } from './queue.js';
import { dropScratchDatabase } from '../db/scratch-database.js';
import { skipUnlessDatabaseRequired } from '../db/connection-budget.js';

const superuserMaintenanceProfile = LocalPostgresConnectionProfile.fromEnv('superuser', {
  database: maintenanceDatabase(),
});

async function probePostgres(): Promise<string | null> {
  const client = new pg.Client({
    host: superuserMaintenanceProfile.host,
    port: superuserMaintenanceProfile.port,
    database: superuserMaintenanceProfile.database,
    user: superuserMaintenanceProfile.user,
    password: superuserMaintenanceProfile.password.unwrap(),
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    await client.end();
    return null;
  } catch (error) {
    await client.end().catch(() => {});
    return error instanceof Error ? error.message : String(error);
  }
}

const unreachable = await probePostgres();
skipUnlessDatabaseRequired('platform jobs.contract suite', unreachable);
if (unreachable !== null) {
  process.stderr.write(
    [
      '='.repeat(76),
      `JOB CONTRACT TESTS SKIPPED — PostgreSQL is not reachable at ${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for the job foundation; a skipped run',
      'proves nothing. Start the local database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  PGPORT=5433 pnpm --filter @karar/platform test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const dbName = `karar_test_${process.pid}_jobs`;

/**
 * Bootstrap retries: role DDL is cluster-global, and parallel test files
 * (db, outbox, jobs contracts) may bootstrap concurrently. PostgreSQL
 * reports that race as XX000 "tuple concurrently updated"; it is transient,
 * so retry with jitter instead of serializing the whole suite.
 */
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

describe.skipIf(unreachable !== null)('job foundation (live PostgreSQL)', () => {
  let app: PostgresPersistenceAdapter;
  let queue: PostgresJobQueue;

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
    app = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database: dbName }),
    );
    queue = new PostgresJobQueue(app, { backoffBaseMs: 4_000, backoffCapMs: 60_000 });
  }, 120_000);

  afterAll(async () => {
    await app?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await dropScratchDatabase(maintenance, dbName);
    } finally {
      await maintenance.end();
    }
  }, 60_000);

  async function jobRow(jobId: string) {
    const result = await app.query<{
      status: string;
      attempts: number;
      lease_owner: string | null;
      last_error: string | null;
      retry_in_seconds: string | null;
    }>(
      `SELECT status, attempts, lease_owner, last_error,
              extract(epoch FROM (available_at - now()))::text AS retry_in_seconds
         FROM platform.jobs WHERE id = $1`,
      [jobId],
    );
    expect(result.rowCount).toBe(1);
    return result.rows[0]!;
  }

  async function makeAvailableNow(jobId: string): Promise<void> {
    await app.query(`UPDATE platform.jobs SET available_at = now() WHERE id = $1`, [jobId]);
  }

  it('enqueue is idempotent via (job_type, idempotency_key): the second enqueue returns the first job', async () => {
    const first = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'idempotent' },
      idempotencyKey: 'idem-1',
    });
    const second = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'DIFFERENT PAYLOAD, same key' },
      idempotencyKey: 'idem-1',
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(second.job.payload).toEqual({ echo: 'idempotent' });

    const count = await app.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM platform.jobs
        WHERE job_type = $1 AND idempotency_key = 'idem-1'`,
      [PLATFORM_DIAGNOSTIC_ECHO],
    );
    expect(count.rows[0]?.count).toBe('1');

    // A different key (and no key at all) creates fresh jobs.
    const different = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'other' },
      idempotencyKey: 'idem-2',
    });
    expect(different.created).toBe(true);
    const keyless = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'keyless' },
    });
    expect(keyless.created).toBe(true);
  });

  it('refuses a payload over the byte budget — rejected, not degraded', async () => {
    const guarded = new PostgresJobQueue(app, { maxPayloadBytes: 1_024 });
    await expect(
      guarded.enqueue({
        jobType: PLATFORM_DIAGNOSTIC_ECHO,
        payload: { echo: 'x'.repeat(2_000) },
      }),
    ).rejects.toBeInstanceOf(JobPayloadTooLargeError);
    const count = await app.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM platform.jobs WHERE length(payload->>'echo') >= 2000`,
    );
    expect(count.rows[0]?.count).toBe('0');

    // Within budget passes through the same queue.
    const ok = await guarded.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'small' },
    });
    expect(ok.created).toBe(true);
  });

  it('claims respect priority first, then available_at order, and cap the batch', async () => {
    await cleanJobs();

    const low = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'low' },
      priority: 0,
    });
    const high = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'high' },
      priority: 10,
    });
    const mid = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'mid' },
      priority: 5,
    });

    const claimed = await queue.claim({ workerId: 'worker-priority', batchSize: 2 });
    expect(claimed.map((job) => job.id)).toEqual([high.job.id, mid.job.id]);

    const rest = await queue.claim({ workerId: 'worker-priority', batchSize: 2 });
    expect(rest.map((job) => job.id)).toEqual([low.job.id]);

    // A claim batch larger than the queue cap is clamped, not honoured.
    const capped = new PostgresJobQueue(app, { maxClaimBatch: 2 });
    for (const job of [...claimed, ...rest]) {
      await queue.release(job);
    }
    const clamped = await capped.claim({ workerId: 'worker-cap', batchSize: 50 });
    expect(clamped.length).toBe(2);
    for (const job of clamped) {
      await capped.release(job);
    }
  });

  it('two workers over 100 jobs: every job executed exactly once, claim sets disjoint', async () => {
    await cleanJobs();
    const enqueued: string[] = [];
    for (let i = 0; i < 100; i += 1) {
      const result = await queue.enqueue({
        jobType: PLATFORM_DIAGNOSTIC_ECHO,
        payload: { echo: `race-${i}` },
      });
      enqueued.push(result.job.id);
    }

    const adapterB = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database: dbName }),
    );
    try {
      const queueB = new PostgresJobQueue(adapterB);
      const executedByA: string[] = [];
      const executedByB: string[] = [];

      const work = async (
        q: PostgresJobQueue,
        workerId: string,
        executed: string[],
      ): Promise<void> => {
        const deadline = Date.now() + 60_000;
        for (;;) {
          const batch = await q.claim({ workerId, batchSize: 5 });
          if (batch.length === 0) {
            const remaining = await app.query<{ count: string }>(
              `SELECT count(*)::text AS count FROM platform.jobs WHERE status IN ('queued','failed_retryable','leased')`,
            );
            if (remaining.rows[0]?.count === '0') return;
            if (Date.now() > deadline) throw new Error(`worker ${workerId} stalled`);
            await new Promise((resolve) => setTimeout(resolve, 5));
            continue;
          }
          for (const job of batch) {
            executed.push(job.id);
            expect(await q.complete(job)).toBe('completed');
          }
        }
      };

      // Both workers claim and execute CONCURRENTLY.
      await Promise.all([
        work(queue, 'worker-race-a', executedByA),
        work(queueB, 'worker-race-b', executedByB),
      ]);

      const byA = new Set(executedByA);
      const byB = new Set(executedByB);
      // No double execution within a worker...
      expect(byA.size).toBe(executedByA.length);
      expect(byB.size).toBe(executedByB.length);
      // ...no job executed by both (SKIP LOCKED proof)...
      expect([...byA].filter((id) => byB.has(id))).toEqual([]);
      // ...and together they executed exactly the 100 enqueued jobs.
      expect(byA.size + byB.size).toBe(100);
      expect(new Set([...byA, ...byB])).toEqual(new Set(enqueued));
      // Both workers did real work.
      expect(byA.size).toBeGreaterThan(0);
      expect(byB.size).toBeGreaterThan(0);

      const succeeded = await app.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM platform.jobs WHERE status = 'succeeded' AND id = ANY($1::uuid[])`,
        [enqueued],
      );
      expect(succeeded.rows[0]?.count).toBe('100');
    } finally {
      await adapterB.end();
    }
  }, 90_000);

  it('failRetryable follows the exponential backoff schedule, then the retry succeeds', async () => {
    await cleanJobs();
    const { job } = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'retry-me' },
    });

    // Attempt 1 fails: retry in ~ base * 2^0 = 4s.
    let [claimed] = await queue.claim({ workerId: 'worker-retry', batchSize: 1 });
    expect(claimed?.attempts).toBe(1);
    expect(await queue.failRetryable(claimed!, new Error('first failure'))).toBe('scheduled_retry');
    let row = await jobRow(job.id);
    expect(row.status).toBe('failed_retryable');
    expect(row.last_error).toContain('first failure');
    const firstDelay = Number.parseFloat(row.retry_in_seconds ?? '0');
    expect(firstDelay).toBeGreaterThan(3);
    expect(firstDelay).toBeLessThanOrEqual(4.5);

    // Not claimable until the backoff elapses.
    expect(await queue.claim({ workerId: 'worker-retry', batchSize: 1 })).toEqual([]);

    // Attempt 2 fails: retry in ~ base * 2^1 = 8s — the schedule doubles.
    await makeAvailableNow(job.id);
    [claimed] = await queue.claim({ workerId: 'worker-retry', batchSize: 1 });
    expect(claimed?.attempts).toBe(2);
    expect(await queue.failRetryable(claimed!, new Error('second failure'))).toBe(
      'scheduled_retry',
    );
    row = await jobRow(job.id);
    const secondDelay = Number.parseFloat(row.retry_in_seconds ?? '0');
    expect(secondDelay).toBeGreaterThan(7);
    expect(secondDelay).toBeLessThanOrEqual(8.5);

    // Attempt 3 succeeds.
    await makeAvailableNow(job.id);
    [claimed] = await queue.claim({ workerId: 'worker-retry', batchSize: 1 });
    expect(await queue.complete(claimed!)).toBe('completed');
    row = await jobRow(job.id);
    expect(row.status).toBe('succeeded');
    expect(row.attempts).toBe(3);
  });

  it('dead-letters after max_attempts with the last error, and stays terminal', async () => {
    await cleanJobs();
    const { job } = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'doomed' },
      maxAttempts: 3,
    });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const [claimed] = await queue.claim({ workerId: 'worker-dead', batchSize: 1 });
      expect(claimed?.attempts).toBe(attempt);
      const outcome = await queue.failRetryable(claimed!, new Error(`failure ${attempt}`));
      expect(outcome).toBe(attempt < 3 ? 'scheduled_retry' : 'dead_lettered');
      if (attempt < 3) await makeAvailableNow(job.id);
    }

    const row = await jobRow(job.id);
    expect(row.status).toBe('dead');
    expect(row.attempts).toBe(3);
    expect(row.last_error).toContain('failure 3');
    expect(row.lease_owner).toBeNull();

    // Terminal: never claimed again.
    expect(await queue.claim({ workerId: 'worker-dead', batchSize: 10 })).toEqual([]);
  });

  it('an explicit deadLetter is terminal immediately, remaining attempts or not', async () => {
    await cleanJobs();
    const { job } = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'poison' },
      maxAttempts: 5,
    });
    const [claimed] = await queue.claim({ workerId: 'worker-poison', batchSize: 1 });
    expect(await queue.deadLetter(claimed!, new Error('malformed beyond retry'))).toBe(
      'dead_lettered',
    );
    const row = await jobRow(job.id);
    expect(row.status).toBe('dead');
    expect(row.attempts).toBe(1);
    expect(row.last_error).toContain('malformed beyond retry');
  });

  it('lease expiry mid-run: recovery reclaims the job, and the dead worker cannot report late', async () => {
    await cleanJobs();
    const { job } = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'orphaned' },
    });

    // Worker A claims, then "dies" mid-run: its lease expires.
    const [claimedByA] = await queue.claim({ workerId: 'worker-died', batchSize: 1 });
    expect(claimedByA).toBeDefined();
    await app.query(
      `UPDATE platform.jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
      [job.id],
    );

    // Recovery flips it back to claimable; the attempt stays spent.
    const sweep = await queue.recoverStaleLeases();
    expect(sweep).toEqual({ recovered: 1, deadLettered: 0 });
    let row = await jobRow(job.id);
    expect(row.status).toBe('failed_retryable');
    expect(row.last_error).toContain('lease expired');

    // Worker B completes it.
    const [claimedByB] = await queue.claim({ workerId: 'worker-heir', batchSize: 1 });
    expect(claimedByB?.attempts).toBe(2);
    expect(await queue.complete(claimedByB!)).toBe('completed');

    // The dead worker's late reports are refused — the lease is gone.
    expect(await queue.complete(claimedByA!)).toBe('lost_lease');
    expect(await queue.failRetryable(claimedByA!, new Error('late'))).toBe('lost_lease');
    expect(await queue.heartbeat(claimedByA!)).toBe('lost_lease');
    row = await jobRow(job.id);
    expect(row.status).toBe('succeeded');
  });

  it('a recovered stale lease that exhausted max_attempts goes dead, not back in the queue', async () => {
    await cleanJobs();
    const { job } = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'kills-workers' },
      maxAttempts: 1,
    });
    await queue.claim({ workerId: 'worker-crash', batchSize: 1 });
    await app.query(
      `UPDATE platform.jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
      [job.id],
    );
    const sweep = await queue.recoverStaleLeases();
    expect(sweep).toEqual({ recovered: 0, deadLettered: 1 });
    const row = await jobRow(job.id);
    expect(row.status).toBe('dead');
  });

  it('heartbeat extends a live lease so a long job outlives its initial TTL', async () => {
    await cleanJobs();
    const { job } = await queue.enqueue({
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'long-runner' },
    });
    const [claimed] = await queue.claim({
      workerId: 'worker-long',
      batchSize: 1,
      leaseTtlMs: 1_000,
    });
    expect(await queue.heartbeat(claimed!, 120_000)).toBe('extended');
    const lease = await app.query<{ seconds_left: string }>(
      `SELECT extract(epoch FROM (lease_expires_at - now()))::text AS seconds_left
         FROM platform.jobs WHERE id = $1`,
      [job.id],
    );
    expect(Number.parseFloat(lease.rows[0]?.seconds_left ?? '0')).toBeGreaterThan(60);
    expect(await queue.complete(claimed!)).toBe('completed');
  });

  it('the poller runs registered handlers end to end and a graceful stop releases unstarted claims', async () => {
    await cleanJobs();
    const echoes: string[] = [];
    const registry = new JobHandlerRegistry();
    registry.register(
      PLATFORM_DIAGNOSTIC_ECHO,
      createDiagnosticEchoHandler((e) => echoes.push(e)),
    );

    // Ten jobs; the handler for the SECOND one requests the stop, so the
    // poller must finish it, then release the remaining eight unstarted.
    // (Handlers resolve from the registry at execution time, so registering
    // the stop-requester after the poller exists is well-defined.)
    const poller = new JobPoller({
      queue,
      registry,
      workerId: 'worker-graceful',
      batchSize: 10,
      pollIntervalMs: 10,
    });
    const stopRequests: Array<Promise<void>> = [];
    registry.register('platform.test.stop-requester', async (job) => {
      echoes.push(job.payload['echo'] as string);
      if (stopRequests.length === 0) {
        stopRequests.push(poller.stop());
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const ids: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const result = await queue.enqueue({
        jobType: i === 1 ? 'platform.test.stop-requester' : PLATFORM_DIAGNOSTIC_ECHO,
        payload: { echo: `graceful-${i}` },
      });
      ids.push(result.job.id);
    }

    poller.start();
    expect(poller.isRunning).toBe(true);

    const deadline = Date.now() + 15_000;
    while (stopRequests.length === 0) {
      if (Date.now() > deadline) throw new Error('poller never reached the second job');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await stopRequests[0];
    expect(poller.isRunning).toBe(false);

    // Jobs 0 and 1 ran; nothing else did, and nothing is left leased.
    expect(echoes).toEqual(['graceful-0', 'graceful-1']);
    const states = await app.query<{ status: string; count: string }>(
      `SELECT status, count(*)::text AS count FROM platform.jobs
        WHERE id = ANY($1::uuid[]) GROUP BY status ORDER BY status`,
      [ids],
    );
    expect(Object.fromEntries(states.rows.map((r) => [r.status, r.count]))).toEqual({
      succeeded: '2',
      queued: '8',
    });
    const leased = await app.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM platform.jobs WHERE lease_owner = 'worker-graceful'`,
    );
    expect(leased.rows[0]?.count).toBe('0');

    // Released jobs kept their attempts intact for a successor.
    const attempts = await app.query<{ max: number }>(
      `SELECT max(attempts)::int AS max FROM platform.jobs WHERE status = 'queued' AND id = ANY($1::uuid[])`,
      [ids],
    );
    expect(attempts.rows[0]?.max).toBe(0);

    // A successor poller drains the remaining eight.
    const successor = new JobPoller({
      queue,
      registry,
      workerId: 'worker-successor',
      batchSize: 10,
    });
    const drained = await successor.runOnce();
    expect(drained).toMatchObject({ claimed: 8, completed: 8 });
    expect(echoes).toHaveLength(10);
  });

  it('a job type with no registered handler retries, then dead-letters alertably', async () => {
    await cleanJobs();
    const { job } = await queue.enqueue({
      jobType: 'platform.test.unregistered',
      payload: {},
      maxAttempts: 2,
    });
    const registry = new JobHandlerRegistry();
    const poller = new JobPoller({ queue, registry, workerId: 'worker-unhandled', batchSize: 5 });

    const first = await poller.runOnce();
    expect(first).toMatchObject({ claimed: 1, retried: 1 });
    await makeAvailableNow(job.id);
    const second = await poller.runOnce();
    expect(second).toMatchObject({ claimed: 1, deadLettered: 1 });
    const row = await jobRow(job.id);
    expect(row.status).toBe('dead');
    expect(row.last_error).toContain('No handler registered');
  });

  /** Jobs tables are append-heavy; tests clean between scenarios as superuser. */
  async function cleanJobs(): Promise<void> {
    const maintenance = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database: dbName }),
    );
    try {
      await maintenance.query(`DELETE FROM platform.jobs`);
    } finally {
      await maintenance.end();
    }
  }
});

describe('job handler registry (no database required)', () => {
  it('registers, resolves, and lists handlers; duplicates and empty types are refused', () => {
    const registry = new JobHandlerRegistry();
    const handler = createDiagnosticEchoHandler();
    registry.register(PLATFORM_DIAGNOSTIC_ECHO, handler);
    expect(registry.resolve(PLATFORM_DIAGNOSTIC_ECHO)).toBe(handler);
    expect(registry.resolve('platform.test.other')).toBeUndefined();
    expect(registry.registeredTypes()).toEqual([PLATFORM_DIAGNOSTIC_ECHO]);
    expect(() => registry.register(PLATFORM_DIAGNOSTIC_ECHO, handler)).toThrowError(
      /already registered/,
    );
    expect(() => registry.register('  ', handler)).toThrowError(/non-empty/);
  });

  it('the diagnostic echo handler validates its payload shape', async () => {
    const echoes: string[] = [];
    const handler = createDiagnosticEchoHandler((e) => echoes.push(e));
    const job = {
      id: '00000000-0000-0000-0000-000000000000',
      jobType: PLATFORM_DIAGNOSTIC_ECHO,
      payload: { echo: 'hello' },
      classification: 'INTERNAL',
      priority: 0,
      attempts: 1,
      maxAttempts: 5,
      leaseOwner: 'test',
      correlationId: null,
      causationId: null,
    };
    await handler(job, { heartbeat: () => Promise.resolve('extended' as const) });
    expect(echoes).toEqual(['hello']);
    await expect(
      handler(
        { ...job, payload: { echo: 7 } },
        { heartbeat: () => Promise.resolve('extended' as const) },
      ),
    ).rejects.toThrowError(/string 'echo' field/);
  });
});
