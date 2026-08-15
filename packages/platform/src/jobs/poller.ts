/**
 * The worker's job execution loop: recover stale leases (rate-limited), claim
 * a batch, run each job's registered handler, and report the outcome to the
 * queue. This is the BOUNDARY that converts handler errors into job outcomes,
 * so it is where they are logged (once) and measured — interior code rethrows,
 * never logs (observability/logger.ts).
 *
 * Graceful shutdown: the job in flight finishes and reports; claimed jobs not
 * yet started are released WITHOUT spending their attempt; nothing is left
 * leased by a stopped worker.
 */
import type { PlatformLogger } from '../observability/logger.js';
import { makeCounter, makeGauge, makeHistogram } from '../observability/telemetry.js';
import type { JobHandlerRegistry } from './registry.js';
import type { ClaimedJob, JobQueue } from './queue.js';

/** Provider-neutral instrument names (backend.md section 11: job outcomes). */
export const JOB_METRIC_NAMES = {
  /** Counter — jobs that completed successfully. */
  completed: 'karar.jobs.completed',
  /** Counter — jobs that failed and were scheduled for retry. */
  retried: 'karar.jobs.retried',
  /** Counter — jobs that went dead (terminal). ALERT on this. */
  deadLettered: 'karar.jobs.dead_lettered',
  /** Gauge — jobs this worker is executing right now. */
  active: 'karar.jobs.active',
  /** Histogram, ms — handler execution duration. */
  durationMs: 'karar.jobs.duration_ms',
} as const;

const completedCounter = makeCounter(JOB_METRIC_NAMES.completed, {
  description: 'Jobs completed successfully',
});
const retriedCounter = makeCounter(JOB_METRIC_NAMES.retried, {
  description: 'Jobs that failed and were scheduled for retry',
});
const deadLetteredCounter = makeCounter(JOB_METRIC_NAMES.deadLettered, {
  description: 'Jobs dead-lettered (terminal failure)',
});
const activeGauge = makeGauge(JOB_METRIC_NAMES.active, {
  description: 'Jobs currently executing in this worker',
});
const durationHistogram = makeHistogram(JOB_METRIC_NAMES.durationMs, {
  description: 'Job handler execution duration',
  unit: 'ms',
});

export interface JobPollerOptions {
  readonly queue: JobQueue;
  readonly registry: JobHandlerRegistry;
  /** Owns the leases this poller claims (e.g. `karar-worker@host:pid`). */
  readonly workerId: string;
  /** Jobs claimed per run; the queue additionally caps this. Default 10. */
  readonly batchSize?: number;
  readonly leaseTtlMs?: number;
  /** Idle delay between runs when `start()` drives the loop. Default 500ms. */
  readonly pollIntervalMs?: number;
  /** How often `runOnce` also sweeps stale leases. Default 30s. */
  readonly staleRecoveryIntervalMs?: number;
  readonly logger?: PlatformLogger;
}

export interface PollerRunReport {
  readonly claimed: number;
  readonly completed: number;
  readonly retried: number;
  readonly deadLettered: number;
  readonly released: number;
  readonly staleRecovered: number;
}

export class JobPoller {
  private readonly queue: JobQueue;
  private readonly registry: JobHandlerRegistry;
  private readonly workerId: string;
  private readonly batchSize: number;
  private readonly leaseTtlMs: number | undefined;
  private readonly pollIntervalMs: number;
  private readonly staleRecoveryIntervalMs: number;
  private readonly logger: PlatformLogger | undefined;

  private stopping = false;
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<PollerRunReport> | null = null;
  private lastTickAtMs: number | null = null;
  private lastStaleSweepAtMs = 0;
  private activeCount = 0;

  constructor(options: JobPollerOptions) {
    if (options.workerId.trim() === '') {
      throw new Error('JobPoller requires a non-empty workerId');
    }
    this.queue = options.queue;
    this.registry = options.registry;
    this.workerId = options.workerId;
    this.batchSize = options.batchSize ?? 10;
    this.leaseTtlMs = options.leaseTtlMs;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.staleRecoveryIntervalMs = options.staleRecoveryIntervalMs ?? 30_000;
    this.logger = options.logger;
  }

  /** Liveness heartbeat for /readyz: epoch ms of the last completed run. */
  get lastTickAt(): number | null {
    return this.lastTickAtMs;
  }

  get isRunning(): boolean {
    return this.running && !this.stopping;
  }

  async runOnce(): Promise<PollerRunReport> {
    let staleRecovered = 0;
    if (Date.now() - this.lastStaleSweepAtMs >= this.staleRecoveryIntervalMs) {
      this.lastStaleSweepAtMs = Date.now();
      const sweep = await this.queue.recoverStaleLeases();
      staleRecovered = sweep.recovered;
      deadLetteredCounter.add(sweep.deadLettered);
      if (sweep.recovered > 0 || sweep.deadLettered > 0) {
        this.logger?.warn(
          { recovered: sweep.recovered, deadLettered: sweep.deadLettered },
          'recovered stale job leases',
        );
      }
    }

    const claimed = await this.queue.claim({
      workerId: this.workerId,
      batchSize: this.batchSize,
      ...(this.leaseTtlMs !== undefined ? { leaseTtlMs: this.leaseTtlMs } : {}),
    });
    let completed = 0;
    let retried = 0;
    let deadLettered = 0;
    let released = 0;
    for (let index = 0; index < claimed.length; index += 1) {
      const job = claimed[index] as ClaimedJob;
      if (this.stopping) {
        // Graceful shutdown: unstarted jobs go back without spending attempts.
        if ((await this.queue.release(job)) === 'released') released += 1;
        continue;
      }
      const outcome = await this.executeOne(job);
      if (outcome === 'completed') completed += 1;
      else if (outcome === 'scheduled_retry') retried += 1;
      else if (outcome === 'dead_lettered') deadLettered += 1;
    }
    this.lastTickAtMs = Date.now();
    return { claimed: claimed.length, completed, retried, deadLettered, released, staleRecovered };
  }

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
          this.logger?.error({ err: error, workerId: this.workerId }, 'job poller run failed');
          return {
            claimed: 0,
            completed: 0,
            retried: 0,
            deadLettered: 0,
            released: 0,
            staleRecovered: 0,
          };
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

  /** Stop intake, finish the job in flight, release the unstarted remainder. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.inFlight !== null) {
      await this.inFlight.catch(() => undefined);
    }
    this.running = false;
  }

  private async executeOne(
    job: ClaimedJob,
  ): Promise<'completed' | 'scheduled_retry' | 'dead_lettered' | 'lost_lease'> {
    const handler = this.registry.resolve(job.jobType);
    if (handler === undefined) {
      // An unregistered type is a deployment error, not a poison loop: it
      // burns its attempts through normal retry and dead-letters, alertably.
      const outcome = await this.queue.failRetryable(
        job,
        new Error(`No handler registered for job type '${job.jobType}'`),
      );
      this.recordFailure(job, outcome, new Error(`no handler for '${job.jobType}'`));
      return outcome;
    }

    const startedAt = Date.now();
    this.activeCount += 1;
    activeGauge.record(this.activeCount);
    try {
      await handler(job, {
        heartbeat: (extendMs) => this.queue.heartbeat(job, extendMs),
        ...(this.logger !== undefined ? { logger: this.logger } : {}),
      });
    } catch (error) {
      const outcome = await this.queue.failRetryable(job, error);
      this.recordFailure(job, outcome, error);
      return outcome;
    } finally {
      this.activeCount -= 1;
      activeGauge.record(this.activeCount);
      durationHistogram.record(Date.now() - startedAt, { job_type: job.jobType });
    }
    const outcome = await this.queue.complete(job);
    if (outcome === 'completed') {
      completedCounter.add(1, { job_type: job.jobType });
      return 'completed';
    }
    this.logger?.warn(
      { jobId: job.id, jobType: job.jobType, workerId: this.workerId },
      'job finished after its lease was lost; another worker may rerun it',
    );
    return 'lost_lease';
  }

  private recordFailure(
    job: ClaimedJob,
    outcome: 'scheduled_retry' | 'dead_lettered' | 'lost_lease',
    error: unknown,
  ): void {
    // The one place a job failure is logged (error-logging rule).
    if (outcome === 'dead_lettered') {
      deadLetteredCounter.add(1, { job_type: job.jobType });
      this.logger?.error(
        { err: error, jobId: job.id, jobType: job.jobType, attempts: job.attempts },
        'job dead-lettered',
      );
    } else if (outcome === 'scheduled_retry') {
      retriedCounter.add(1, { job_type: job.jobType });
      this.logger?.warn(
        { err: error, jobId: job.id, jobType: job.jobType, attempts: job.attempts },
        'job failed; scheduled for retry',
      );
    }
  }
}
