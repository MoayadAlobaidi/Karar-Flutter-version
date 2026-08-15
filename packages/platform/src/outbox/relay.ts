/**
 * Outbox relay (ADR-0012; event-governance.md section 4): claims pending
 * envelopes with plain-PostgreSQL `FOR UPDATE SKIP LOCKED`, publishes through
 * the injected `EventPublisher` port (the in-memory bus locally; a cloud bus
 * adapter would implement the same port), and marks outcomes:
 *
 * - `published_at` is set ONLY after the publisher succeeded — never before.
 * - Failure: attempts+1, `last_error`, exponential backoff via `available_at`,
 *   claim released.
 * - attempts >= max_attempts: `dead_lettered_at` (terminal). Dead-lettered
 *   events ALERT via the `karar.outbox.dead_lettered` counter and an error
 *   log — a silent DLQ fills up unnoticed (ADR-0012).
 * - Stale claims (expired `claim_expires_at`) are reclaimable by any relay.
 * - Graceful shutdown: the in-flight event finishes, the rest of the batch is
 *   released unclaimed, nothing is lost or stuck.
 *
 * Concurrency: any number of relays may run; SKIP LOCKED guarantees two
 * relays never claim the same row, which the contract tests prove with two
 * concurrent relays over 200 events.
 */
import type { PostgresPersistenceAdapter } from '../db/adapter.js';
import type { EventEnvelope } from '../events/envelope.js';
import type { EventPublisher } from '../events/bus.js';
import type { PlatformLogger } from '../observability/logger.js';
import { makeCounter, makeGauge } from '../observability/telemetry.js';

/** Provider-neutral instrument names (backend.md section 11: outbox lag is a first-class metric). */
export const OUTBOX_METRIC_NAMES = {
  /** Counter — envelopes published (publisher succeeded, published_at set). */
  published: 'karar.outbox.published',
  /** Counter — publish attempts that failed and were scheduled for retry. */
  failed: 'karar.outbox.failed',
  /** Counter — envelopes dead-lettered (terminal). ALERT on this. */
  deadLettered: 'karar.outbox.dead_lettered',
  /** Gauge, seconds — age of the oldest unpublished envelope (0 when none). */
  lagSeconds: 'karar.outbox.lag_seconds',
} as const;

const publishedCounter = makeCounter(OUTBOX_METRIC_NAMES.published, {
  description: 'Outbox envelopes published',
});
const failedCounter = makeCounter(OUTBOX_METRIC_NAMES.failed, {
  description: 'Outbox publish attempts that failed and will retry',
});
const deadLetteredCounter = makeCounter(OUTBOX_METRIC_NAMES.deadLettered, {
  description: 'Outbox envelopes dead-lettered after exhausting max_attempts',
});
const lagGauge = makeGauge(OUTBOX_METRIC_NAMES.lagSeconds, {
  description: 'Age in seconds of the oldest unpublished outbox envelope',
  unit: 's',
});

export interface OutboxRelayOptions {
  readonly adapter: PostgresPersistenceAdapter;
  readonly publisher: EventPublisher;
  /** Unique per relay instance (e.g. `worker@host:pid`); owns claims. */
  readonly relayId: string;
  /** Rows claimed per run. Default 25, hard cap 100 (resource limits). */
  readonly batchSize?: number;
  /** Claim lease; an expired claim is reclaimable by any relay. Default 30s. */
  readonly claimTtlMs?: number;
  /** Backoff base: delay = base * 2^(attempts-1), capped. Default 1s. */
  readonly backoffBaseMs?: number;
  /** Backoff cap. Default 60s. */
  readonly backoffCapMs?: number;
  /** Idle delay between runs when `start()` drives the loop. Default 500ms. */
  readonly pollIntervalMs?: number;
  readonly logger?: PlatformLogger;
}

export interface RelayRunReport {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
  readonly deadLettered: number;
}

interface ClaimedRow {
  readonly id: string;
  readonly envelope: EventEnvelope;
  readonly attempts: number;
  readonly max_attempts: number;
}

const MAX_BATCH_SIZE = 100;
const MAX_LAST_ERROR_LENGTH = 2_000;

function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.length > MAX_LAST_ERROR_LENGTH ? `${text.slice(0, MAX_LAST_ERROR_LENGTH)}…` : text;
}

export class OutboxRelay {
  private readonly adapter: PostgresPersistenceAdapter;
  private readonly publisher: EventPublisher;
  private readonly relayId: string;
  private readonly batchSize: number;
  private readonly claimTtlMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffCapMs: number;
  private readonly pollIntervalMs: number;
  private readonly logger: PlatformLogger | undefined;

  private stopping = false;
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<RelayRunReport> | null = null;
  private lastTickAtMs: number | null = null;

  constructor(options: OutboxRelayOptions) {
    if (options.relayId.trim() === '') {
      throw new Error('OutboxRelay requires a non-empty relayId');
    }
    this.adapter = options.adapter;
    this.publisher = options.publisher;
    this.relayId = options.relayId;
    this.batchSize = Math.min(Math.max(1, options.batchSize ?? 25), MAX_BATCH_SIZE);
    this.claimTtlMs = options.claimTtlMs ?? 30_000;
    this.backoffBaseMs = options.backoffBaseMs ?? 1_000;
    this.backoffCapMs = options.backoffCapMs ?? 60_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.logger = options.logger;
  }

  /** Liveness heartbeat for /readyz: epoch ms of the last completed run. */
  get lastTickAt(): number | null {
    return this.lastTickAtMs;
  }

  get isRunning(): boolean {
    return this.running && !this.stopping;
  }

  /**
   * One claim-publish-mark cycle. Safe to call directly (tests, drains) or
   * via `start()`. Records the lag gauge after processing.
   */
  async runOnce(): Promise<RelayRunReport> {
    const rows = await this.claimBatch();
    let published = 0;
    let failed = 0;
    let deadLettered = 0;
    let index = 0;
    for (; index < rows.length; index += 1) {
      const row = rows[index] as ClaimedRow;
      const outcome = await this.publishOne(row);
      if (outcome === 'published') published += 1;
      else if (outcome === 'failed') failed += 1;
      else deadLettered += 1;
      // Graceful shutdown: finish the event in flight, release the rest.
      if (this.stopping && index + 1 < rows.length) {
        await this.releaseOwnClaims();
        break;
      }
    }
    await this.recordLag();
    this.lastTickAtMs = Date.now();
    return { claimed: rows.length, published, failed, deadLettered };
  }

  /** Starts the polling loop. Runs do not overlap; errors are logged, never fatal. */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.stopping = false;
    const tick = (): void => {
      if (this.stopping) {
        return;
      }
      this.inFlight = this.runOnce();
      void this.inFlight
        .catch((error: unknown) => {
          // The loop is the boundary for its own failures: log once, keep polling.
          this.logger?.error({ err: error, relayId: this.relayId }, 'outbox relay run failed');
          return { claimed: 0, published: 0, failed: 0, deadLettered: 0 };
        })
        .then(() => {
          this.inFlight = null;
          if (!this.stopping) {
            this.timer = setTimeout(tick, this.pollIntervalMs);
          }
        });
    };
    tick();
  }

  /**
   * Graceful shutdown: stop intake, wait for the in-flight run (which
   * finishes its current event and releases the rest), then release any claim
   * still held by this relay. Unpublished events remain claimable by others.
   */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.inFlight !== null) {
      await this.inFlight.catch(() => undefined);
    }
    await this.releaseOwnClaims();
    this.running = false;
  }

  private async claimBatch(): Promise<ClaimedRow[]> {
    const result = await this.adapter.query<ClaimedRow>(
      `UPDATE platform.outbox_events o
          SET claimed_by = $1,
              claim_expires_at = now() + make_interval(secs => $2::double precision)
         FROM (
           SELECT id
             FROM platform.outbox_events
            WHERE published_at IS NULL
              AND dead_lettered_at IS NULL
              AND available_at <= now()
              AND (claimed_by IS NULL OR claim_expires_at < now())
            ORDER BY created_at, id
            LIMIT $3
              FOR UPDATE SKIP LOCKED
         ) pick
        WHERE o.id = pick.id
        RETURNING o.id, o.envelope, o.attempts, o.max_attempts`,
      [this.relayId, this.claimTtlMs / 1_000, this.batchSize],
    );
    return result.rows;
  }

  private async publishOne(row: ClaimedRow): Promise<'published' | 'failed' | 'dead_lettered'> {
    try {
      await this.publisher.publish(row.envelope);
    } catch (error) {
      return this.markFailed(row, error);
    }
    // Success is marked only here — after the publisher resolved.
    await this.adapter.query(
      `UPDATE platform.outbox_events
          SET published_at = now(), claimed_by = NULL, claim_expires_at = NULL
        WHERE id = $1 AND published_at IS NULL`,
      [row.id],
    );
    publishedCounter.add(1, { event_name: row.envelope.eventName });
    return 'published';
  }

  private async markFailed(row: ClaimedRow, error: unknown): Promise<'failed' | 'dead_lettered'> {
    const attemptsAfter = row.attempts + 1;
    const lastError = describeError(error);
    if (attemptsAfter >= row.max_attempts) {
      await this.adapter.query(
        `UPDATE platform.outbox_events
            SET attempts = $2, last_error = $3, dead_lettered_at = now(),
                claimed_by = NULL, claim_expires_at = NULL
          WHERE id = $1`,
        [row.id, attemptsAfter, lastError],
      );
      deadLetteredCounter.add(1, { event_name: row.envelope.eventName });
      // Dead-lettered events alert (ADR-0012): counter above + error log here.
      this.logger?.error(
        { eventId: row.id, eventName: row.envelope.eventName, attempts: attemptsAfter },
        'outbox event dead-lettered',
      );
      return 'dead_lettered';
    }
    const backoffMs = Math.min(this.backoffCapMs, this.backoffBaseMs * 2 ** (attemptsAfter - 1));
    await this.adapter.query(
      `UPDATE platform.outbox_events
          SET attempts = $2, last_error = $3,
              available_at = now() + make_interval(secs => $4::double precision),
              claimed_by = NULL, claim_expires_at = NULL
        WHERE id = $1`,
      [row.id, attemptsAfter, lastError, backoffMs / 1_000],
    );
    failedCounter.add(1, { event_name: row.envelope.eventName });
    this.logger?.warn(
      { eventId: row.id, eventName: row.envelope.eventName, attempts: attemptsAfter, backoffMs },
      'outbox publish failed; scheduled for retry',
    );
    return 'failed';
  }

  private async releaseOwnClaims(): Promise<void> {
    await this.adapter.query(
      `UPDATE platform.outbox_events
          SET claimed_by = NULL, claim_expires_at = NULL
        WHERE claimed_by = $1 AND published_at IS NULL AND dead_lettered_at IS NULL`,
      [this.relayId],
    );
  }

  private async recordLag(): Promise<void> {
    const result = await this.adapter.query<{ lag_seconds: string | null }>(
      `SELECT extract(epoch FROM (now() - min(created_at)))::text AS lag_seconds
         FROM platform.outbox_events
        WHERE published_at IS NULL AND dead_lettered_at IS NULL`,
    );
    const raw = result.rows[0]?.lag_seconds ?? null;
    lagGauge.record(raw === null ? 0 : Math.max(0, Number.parseFloat(raw)));
  }
}
