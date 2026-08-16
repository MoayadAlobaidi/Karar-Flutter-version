/**
 * Transactional outbox contract tests against a real PostgreSQL (ADR-0012;
 * docs/architecture/event-governance.md section 4). The full delivery matrix:
 * atomic commit/rollback with domain state, publish-marking only after
 * publisher success, receipt-based consumer idempotency, two CONCURRENT
 * relays over 200 events (SKIP LOCKED proof), backoff, dead-lettering,
 * stale-lease recovery, and graceful shutdown mid-batch.
 *
 * Same execution model as ../db/contract.test.ts: one file, serial tests,
 * scratch database per run, loud skip when PostgreSQL is unreachable.
 */
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Clock } from '@karar/shared-kernel';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readDefaultEventCatalogue, PLATFORM_DIAGNOSTIC_PING } from '@karar/api-contracts';

import { PostgresPersistenceAdapter } from '../db/adapter.js';
import { bootstrapRolesAndDatabase } from '../db/bootstrap.js';
import { LocalPostgresConnectionProfile, maintenanceDatabase } from '../db/connection-profile.js';
import { defaultMigrationsDir, migrateToLatest } from '../db/migrations.js';
import { InMemoryEventBus } from '../events/bus.js';
import { makeEnvelope, type EventEnvelope, type PendingEventEnvelope } from '../events/envelope.js';
import { enqueueInTransaction } from './enqueue.js';
import { withIdempotency } from './receipts.js';
import { OutboxRelay } from './relay.js';
import type { EventPublisher } from '../events/bus.js';

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
if (unreachable !== null) {
  process.stderr.write(
    [
      '='.repeat(76),
      `OUTBOX CONTRACT TESTS SKIPPED — PostgreSQL is not reachable at ${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for the transactional outbox; a skipped run',
      'proves nothing. Start the local database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  PGPORT=5433 pnpm --filter @karar/platform test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

/** Test-only probe: the "domain state" whose transaction the outbox must share. */
const PROBE_MIGRATION = `-- 9930_outbox_probe_state
-- Test-only probe table proving state change + outbox enqueue share one
-- transaction. Lives only in this scratch database.
-- rollback: test scratch database; removed by dropping the database.
CREATE TABLE platform.outbox_probe_state (
  id   text PRIMARY KEY,
  note text NOT NULL
);
GRANT SELECT, INSERT ON platform.outbox_probe_state TO karar_app;
`;

const catalogue = readDefaultEventCatalogue();

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

const clock = new Clock.Fixed(new Date('2026-08-15T10:00:00.000Z'));
const dbName = `karar_test_${process.pid}_outbox`;

/** Publisher that records deliveries; optionally fails on demand. */
class RecordingPublisher implements EventPublisher {
  readonly delivered: string[] = [];
  failuresRemaining = 0;
  failureMessage = 'transport unavailable';

  async publish(envelope: EventEnvelope): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error(this.failureMessage);
    }
    this.delivered.push(envelope.eventId);
  }
}

function pending(pingId: string): PendingEventEnvelope {
  return makeEnvelope(catalogue, {
    name: PLATFORM_DIAGNOSTIC_PING,
    payload: { pingId },
    producer: 'platform-tests',
    clock,
  });
}

describe.skipIf(unreachable !== null)('transactional outbox (live PostgreSQL)', () => {
  let app: PostgresPersistenceAdapter;
  const scratchDirs: string[] = [];

  beforeAll(async () => {
    await bootstrapWithRetry(dbName);
    const migrationsDir = await mkdtemp(join(tmpdir(), 'karar-outbox-migrations-'));
    scratchDirs.push(migrationsDir);
    for (const entry of await readdir(defaultMigrationsDir())) {
      if (entry.endsWith('.sql')) {
        await copyFile(join(defaultMigrationsDir(), entry), join(migrationsDir, entry));
      }
    }
    await writeFile(join(migrationsDir, '9930_outbox_probe_state.sql'), PROBE_MIGRATION);
    const migrator = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database: dbName }),
    );
    try {
      await migrateToLatest({ adapter: migrator, migrationsDir });
    } finally {
      await migrator.end();
    }
    app = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database: dbName }),
    );
  }, 120_000);

  afterAll(async () => {
    await app?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    } finally {
      await maintenance.end();
    }
    for (const dir of scratchDirs) {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  async function outboxRow(eventId: string) {
    const result = await app.query<{
      attempts: number;
      max_attempts: number;
      published_at: Date | null;
      dead_lettered_at: Date | null;
      last_error: string | null;
      claimed_by: string | null;
      claim_expires_at: Date | null;
      retry_in_seconds: string | null;
    }>(
      `SELECT attempts, max_attempts, published_at, dead_lettered_at, last_error, claimed_by,
              claim_expires_at, extract(epoch FROM (available_at - now()))::text AS retry_in_seconds
         FROM platform.outbox_events WHERE id = $1`,
      [eventId],
    );
    expect(result.rowCount).toBe(1);
    return result.rows[0]!;
  }

  async function makeAvailableNow(eventId: string): Promise<void> {
    await app.query(`UPDATE platform.outbox_events SET available_at = now() WHERE id = $1`, [
      eventId,
    ]);
  }

  /**
   * Test isolation: earlier tests leave unpublished rows behind on purpose
   * (commit/rollback proofs). Relay-driven tests mark them published first so
   * each test's claims are exactly its own events.
   */
  async function drainPending(): Promise<void> {
    await app.query(
      `UPDATE platform.outbox_events
          SET published_at = now(), claimed_by = NULL, claim_expires_at = NULL
        WHERE published_at IS NULL AND dead_lettered_at IS NULL`,
    );
  }

  it('commit persists domain state and outbox row atomically, stamping recordedAt at persist time', async () => {
    let envelope: EventEnvelope | undefined;
    await app.withTransaction(async (tx) => {
      await tx.query(`INSERT INTO platform.outbox_probe_state (id, note) VALUES ($1, $2)`, [
        'state-commit',
        'committed with its event',
      ]);
      envelope = await enqueueInTransaction(tx, pending('commit-1'), clock);
    });
    expect(envelope?.recordedAt).toBe('2026-08-15T10:00:00.000Z');

    const state = await app.query(
      `SELECT id FROM platform.outbox_probe_state WHERE id = 'state-commit'`,
    );
    expect(state.rowCount).toBe(1);
    const stored = await app.query<{ envelope: EventEnvelope; classification: string }>(
      `SELECT envelope, classification FROM platform.outbox_events WHERE id = $1`,
      [envelope!.eventId],
    );
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0]?.envelope).toEqual(envelope);
    expect(stored.rows[0]?.classification).toBe('INTERNAL');
  });

  it('rollback removes BOTH the state change and the outbox row', async () => {
    let eventId = '';
    class DomainFailure extends Error {}
    await expect(
      app.withTransaction(async (tx) => {
        await tx.query(`INSERT INTO platform.outbox_probe_state (id, note) VALUES ($1, $2)`, [
          'state-rollback',
          'must vanish',
        ]);
        const envelope = await enqueueInTransaction(tx, pending('rollback-1'), clock);
        eventId = envelope.eventId;
        throw new DomainFailure('abort after both inserts');
      }),
    ).rejects.toBeInstanceOf(DomainFailure);

    const state = await app.query(
      `SELECT id FROM platform.outbox_probe_state WHERE id = 'state-rollback'`,
    );
    expect(state.rowCount).toBe(0);
    const outbox = await app.query(`SELECT id FROM platform.outbox_events WHERE id = $1`, [
      eventId,
    ]);
    expect(outbox.rowCount).toBe(0);
  });

  it('marks published_at ONLY after publisher success: a failing publisher leaves it NULL', async () => {
    await drainPending();
    const envelope = await app.withTransaction((tx) =>
      enqueueInTransaction(tx, pending('exactly-once-1'), clock),
    );
    const publisher = new RecordingPublisher();
    publisher.failuresRemaining = 1;
    publisher.failureMessage = 'first delivery refused';
    const relay = new OutboxRelay({
      adapter: app,
      publisher,
      relayId: 'relay-exactly-once',
      backoffBaseMs: 1_000,
    });

    // Failed publish: no published_at, attempts counted, error recorded,
    // claim released, retry scheduled in the future.
    const failedRun = await relay.runOnce();
    expect(failedRun).toMatchObject({ claimed: 1, published: 0, failed: 1, deadLettered: 0 });
    const afterFailure = await outboxRow(envelope.eventId);
    expect(afterFailure.published_at).toBeNull();
    expect(afterFailure.attempts).toBe(1);
    expect(afterFailure.last_error).toContain('first delivery refused');
    expect(afterFailure.claimed_by).toBeNull();
    expect(Number.parseFloat(afterFailure.retry_in_seconds ?? '0')).toBeGreaterThan(0);
    expect(publisher.delivered).toEqual([]);

    // Successful publish: published exactly once, marked exactly once.
    await makeAvailableNow(envelope.eventId);
    const successRun = await relay.runOnce();
    expect(successRun).toMatchObject({ published: 1, failed: 0 });
    const afterSuccess = await outboxRow(envelope.eventId);
    expect(afterSuccess.published_at).not.toBeNull();
    expect(afterSuccess.claimed_by).toBeNull();
    expect(publisher.delivered).toEqual([envelope.eventId]);

    // Nothing left to claim for this event.
    const idleRun = await relay.runOnce();
    expect(idleRun.claimed).toBe(0);
  });

  it('duplicate delivery is a no-op through consumer receipts (handler effects once)', async () => {
    const envelope = await app.withTransaction((tx) =>
      enqueueInTransaction(tx, pending('dup-1'), clock),
    );

    let handlerRuns = 0;
    const consume = (delivered: EventEnvelope) =>
      app.withTransaction((tx) =>
        withIdempotency(tx, 'worker-diagnostics', delivered.eventId, async () => {
          handlerRuns += 1;
          await tx.query(`INSERT INTO platform.outbox_probe_state (id, note) VALUES ($1, $2)`, [
            `consumed-${delivered.eventId}`,
            'consumer effect',
          ]);
        }),
      );

    // The same envelope delivered twice — at-least-once delivery simulated.
    const first = await consume(envelope);
    const second = await consume(envelope);
    expect(first.executed).toBe(true);
    expect(second.executed).toBe(false);
    expect(handlerRuns).toBe(1);

    const effects = await app.query(`SELECT id FROM platform.outbox_probe_state WHERE id = $1`, [
      `consumed-${envelope.eventId}`,
    ]);
    expect(effects.rowCount).toBe(1);
    const receipts = await app.query(
      `SELECT consumer_name FROM platform.event_consumer_receipts WHERE event_id = $1`,
      [envelope.eventId],
    );
    expect(receipts.rowCount).toBe(1);
  });

  it('a rolled-back consumer rolls its receipt back too, so redelivery genuinely retries', async () => {
    const envelope = await app.withTransaction((tx) =>
      enqueueInTransaction(tx, pending('dup-2'), clock),
    );
    class ConsumerFailure extends Error {}
    await expect(
      app.withTransaction((tx) =>
        withIdempotency(tx, 'worker-diagnostics', envelope.eventId, async () => {
          throw new ConsumerFailure('handler failed after receipt insert');
        }),
      ),
    ).rejects.toBeInstanceOf(ConsumerFailure);

    // No receipt survived, so the retry executes.
    const retry = await app.withTransaction((tx) =>
      withIdempotency(tx, 'worker-diagnostics', envelope.eventId, () => Promise.resolve('done')),
    );
    expect(retry).toEqual({ executed: true, result: 'done' });
  });

  it('two concurrent relays over 200 events: disjoint claims, every event published exactly once', async () => {
    await drainPending();
    const enqueued: string[] = [];
    // Enqueue in batches to keep the setup fast.
    for (let batch = 0; batch < 10; batch += 1) {
      await app.withTransaction(async (tx) => {
        for (let i = 0; i < 20; i += 1) {
          const envelope = await enqueueInTransaction(tx, pending(`race-${batch}-${i}`), clock);
          enqueued.push(envelope.eventId);
        }
      });
    }
    expect(enqueued).toHaveLength(200);

    // Two relays on two separate pools — real concurrent sessions.
    const adapterB = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database: dbName }),
    );
    try {
      const publisherA = new RecordingPublisher();
      const publisherB = new RecordingPublisher();
      const relayA = new OutboxRelay({
        adapter: app,
        publisher: publisherA,
        relayId: 'relay-race-a',
        batchSize: 10,
      });
      const relayB = new OutboxRelay({
        adapter: adapterB,
        publisher: publisherB,
        relayId: 'relay-race-b',
        batchSize: 10,
      });

      const deadline = Date.now() + 60_000;
      while (publisherA.delivered.length + publisherB.delivered.length < 200) {
        if (Date.now() > deadline) {
          throw new Error(
            `relays stalled: ${publisherA.delivered.length} + ${publisherB.delivered.length} of 200`,
          );
        }
        // Both relays claim and publish CONCURRENTLY on every iteration.
        await Promise.all([relayA.runOnce(), relayB.runOnce()]);
      }

      const byA = new Set(publisherA.delivered);
      const byB = new Set(publisherB.delivered);
      // No duplicate deliveries within either relay...
      expect(byA.size).toBe(publisherA.delivered.length);
      expect(byB.size).toBe(publisherB.delivered.length);
      // ...no event claimed by both (SKIP LOCKED proof)...
      const intersection = [...byA].filter((id) => byB.has(id));
      expect(intersection).toEqual([]);
      // ...and the union is exactly the 200 enqueued events.
      expect(byA.size + byB.size).toBe(200);
      expect(new Set([...byA, ...byB])).toEqual(new Set(enqueued));
      // Both relays did real work — the race was a race.
      expect(byA.size).toBeGreaterThan(0);
      expect(byB.size).toBeGreaterThan(0);

      const published = await app.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM platform.outbox_events
            WHERE published_at IS NOT NULL AND id = ANY($1::uuid[])`,
        [enqueued],
      );
      expect(published.rows[0]?.count).toBe('200');
    } finally {
      await adapterB.end();
    }
  }, 90_000);

  it('temporary failure follows the exponential backoff schedule, then succeeds', async () => {
    await drainPending();
    const envelope = await app.withTransaction((tx) =>
      enqueueInTransaction(tx, pending('backoff-1'), clock),
    );
    const publisher = new RecordingPublisher();
    publisher.failuresRemaining = 2;
    publisher.failureMessage = 'temporarily down';
    const relay = new OutboxRelay({
      adapter: app,
      publisher,
      relayId: 'relay-backoff',
      backoffBaseMs: 4_000,
      backoffCapMs: 60_000,
    });

    // Attempt 1 fails: retry in ~ base * 2^0 = 4s.
    await relay.runOnce();
    const afterFirst = await outboxRow(envelope.eventId);
    expect(afterFirst.attempts).toBe(1);
    const firstDelay = Number.parseFloat(afterFirst.retry_in_seconds ?? '0');
    expect(firstDelay).toBeGreaterThan(3);
    expect(firstDelay).toBeLessThanOrEqual(4.5);

    // Attempt 2 fails: retry in ~ base * 2^1 = 8s — the schedule doubles.
    await makeAvailableNow(envelope.eventId);
    await relay.runOnce();
    const afterSecond = await outboxRow(envelope.eventId);
    expect(afterSecond.attempts).toBe(2);
    const secondDelay = Number.parseFloat(afterSecond.retry_in_seconds ?? '0');
    expect(secondDelay).toBeGreaterThan(7);
    expect(secondDelay).toBeLessThanOrEqual(8.5);
    expect(afterSecond.last_error).toContain('temporarily down');

    // Attempt 3 succeeds; attempts stop counting, the error stays as history.
    await makeAvailableNow(envelope.eventId);
    const finalRun = await relay.runOnce();
    expect(finalRun).toMatchObject({ published: 1, failed: 0, deadLettered: 0 });
    const afterSuccess = await outboxRow(envelope.eventId);
    expect(afterSuccess.published_at).not.toBeNull();
    expect(afterSuccess.attempts).toBe(2);
    expect(publisher.delivered).toEqual([envelope.eventId]);
  });

  it('permanent failure dead-letters after max_attempts with the last error, terminally', async () => {
    await drainPending();
    const envelope = await app.withTransaction((tx) =>
      enqueueInTransaction(tx, pending('dead-1'), clock),
    );
    await app.query(`UPDATE platform.outbox_events SET max_attempts = 3 WHERE id = $1`, [
      envelope.eventId,
    ]);
    const publisher = new RecordingPublisher();
    publisher.failuresRemaining = Number.MAX_SAFE_INTEGER;
    publisher.failureMessage = 'permanently broken transport';
    const relay = new OutboxRelay({
      adapter: app,
      publisher,
      relayId: 'relay-dead',
      backoffBaseMs: 1_000,
    });

    const outcomes: Array<{ failed: number; deadLettered: number }> = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const run = await relay.runOnce();
      outcomes.push({ failed: run.failed, deadLettered: run.deadLettered });
      await makeAvailableNow(envelope.eventId);
    }
    expect(outcomes).toEqual([
      { failed: 1, deadLettered: 0 },
      { failed: 1, deadLettered: 0 },
      { failed: 0, deadLettered: 1 },
    ]);

    const row = await outboxRow(envelope.eventId);
    expect(row.dead_lettered_at).not.toBeNull();
    expect(row.published_at).toBeNull();
    expect(row.attempts).toBe(3);
    expect(row.last_error).toContain('permanently broken transport');
    expect(row.claimed_by).toBeNull();

    // Terminal: no relay ever claims it again.
    const afterDead = await relay.runOnce();
    expect(afterDead.claimed).toBe(0);
  });

  it('an expired claim is stale, and another relay recovers the event', async () => {
    await drainPending();
    const envelope = await app.withTransaction((tx) =>
      enqueueInTransaction(tx, pending('stale-1'), clock),
    );
    // A relay claimed it and died: the claim is held with a live lease.
    await app.query(
      `UPDATE platform.outbox_events
          SET claimed_by = 'relay-crashed', claim_expires_at = now() + interval '1 hour'
        WHERE id = $1`,
      [envelope.eventId],
    );
    const publisher = new RecordingPublisher();
    const relay = new OutboxRelay({ adapter: app, publisher, relayId: 'relay-recovery' });

    // While the lease is live, the event is NOT claimable by others.
    const whileHeld = await relay.runOnce();
    expect(whileHeld.claimed).toBe(0);

    // Lease expires — manually, as a crashed relay's would — and recovery happens.
    await app.query(
      `UPDATE platform.outbox_events SET claim_expires_at = now() - interval '1 second'
        WHERE id = $1`,
      [envelope.eventId],
    );
    const afterExpiry = await relay.runOnce();
    expect(afterExpiry).toMatchObject({ claimed: 1, published: 1 });
    expect(publisher.delivered).toEqual([envelope.eventId]);
  });

  it('graceful shutdown mid-batch: in-flight event finishes, the rest release, nothing is lost or stuck', async () => {
    await drainPending();
    const enqueued: string[] = [];
    await app.withTransaction(async (tx) => {
      for (let i = 0; i < 10; i += 1) {
        const envelope = await enqueueInTransaction(tx, pending(`shutdown-${i}`), clock);
        enqueued.push(envelope.eventId);
      }
    });

    // Publisher that asks the relay to stop DURING the second delivery: the
    // second event must still complete; events 3..10 must be released. The
    // holder breaks the construction cycle (publisher is a relay input).
    const relayRef: { current: OutboxRelay | null } = { current: null };
    const delivered: string[] = [];
    const stopRequests: Array<Promise<void>> = [];
    const publisher: EventPublisher = {
      async publish(envelope) {
        delivered.push(envelope.eventId);
        if (delivered.length === 2) {
          stopRequests.push(relayRef.current!.stop());
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      },
    };
    const relay = new OutboxRelay({
      adapter: app,
      publisher,
      relayId: 'relay-shutdown',
      batchSize: 10,
      pollIntervalMs: 10,
    });
    relayRef.current = relay;
    relay.start();
    expect(relay.isRunning).toBe(true);

    const deadline = Date.now() + 15_000;
    while (stopRequests.length === 0) {
      if (Date.now() > deadline) throw new Error('relay never reached the second event');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await stopRequests[0];
    expect(relay.isRunning).toBe(false);

    // The in-flight event finished and was marked; intake stopped afterwards.
    expect(delivered).toHaveLength(2);
    const published = await app.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM platform.outbox_events
        WHERE published_at IS NOT NULL AND id = ANY($1::uuid[])`,
      [enqueued],
    );
    expect(published.rows[0]?.count).toBe('2');

    // Nothing remains claimed by the stopped relay; the rest are claimable.
    const stuck = await app.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM platform.outbox_events WHERE claimed_by = 'relay-shutdown'`,
    );
    expect(stuck.rows[0]?.count).toBe('0');

    // A successor relay drains the remaining 8 — no event was lost.
    const successorPublisher = new RecordingPublisher();
    const successor = new OutboxRelay({
      adapter: app,
      publisher: successorPublisher,
      relayId: 'relay-successor',
      batchSize: 10,
    });
    const drain = await successor.runOnce();
    expect(drain).toMatchObject({ claimed: 8, published: 8 });
    const total = new Set([...delivered, ...successorPublisher.delivered]);
    expect(total).toEqual(new Set(enqueued));
  });

  it('the in-memory bus is a working relay publisher end to end', async () => {
    await drainPending();
    const envelope = await app.withTransaction((tx) =>
      enqueueInTransaction(tx, pending('bus-1'), clock),
    );
    const seen: string[] = [];
    const bus = new InMemoryEventBus(catalogue);
    bus.subscribe('platform-tests', PLATFORM_DIAGNOSTIC_PING, (received) => {
      seen.push(received.payload['pingId'] as string);
    });
    const relay = new OutboxRelay({ adapter: app, publisher: bus, relayId: 'relay-bus' });
    const run = await relay.runOnce();
    expect(run).toMatchObject({ claimed: 1, published: 1 });
    expect(seen).toContain('bus-1');
    const row = await outboxRow(envelope.eventId);
    expect(row.published_at).not.toBeNull();
  });
});
