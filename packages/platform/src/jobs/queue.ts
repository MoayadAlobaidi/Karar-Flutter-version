/**
 * The provider-neutral JobQueue port (infrastructure-portability.md section 5)
 * and its job vocabulary.
 *
 * JOBS ARE WORK, EVENTS ARE FACTS. An event records that something HAPPENED —
 * past tense, immutable, published through the outbox, consumed by whoever the
 * catalogue allows. A job REQUESTS that something be done — it may retry, it
 * has exactly one executor at a time (a lease), and it ends in an outcome
 * (succeeded / failed_retryable / dead). Publishing a command as an event
 * invites RPC-over-bus (event-governance.md section 5); modelling a fact as a
 * job loses its consumers. When in doubt: if it can fail and be retried, it
 * is a job; if it is true forever once said, it is an event.
 *
 * Jobs call use cases (ADR-0013): a handler cannot make a transition a human
 * path could not. The queue moves work; it never contains business logic.
 */

export const JOB_STATUSES = ['queued', 'leased', 'succeeded', 'failed_retryable', 'dead'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface EnqueueJobInput {
  readonly jobType: string;
  readonly payload: Record<string, unknown>;
  /** One of the six data classifications; defaults to INTERNAL. */
  readonly classification?: string;
  /** Same (jobType, idempotencyKey) enqueued twice returns the first job. */
  readonly idempotencyKey?: string;
  /** Higher runs first. Default 0. */
  readonly priority?: number;
  /** Delay before the job becomes claimable. Default 0. */
  readonly delayMs?: number;
  /** Execution attempts before the job is dead. Default 5. */
  readonly maxAttempts?: number;
  readonly correlationId?: string;
  readonly causationId?: string;
}

export interface JobRecord {
  readonly id: string;
  readonly jobType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly classification: string;
  readonly idempotencyKey: string | null;
  readonly status: JobStatus;
  readonly priority: number;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly correlationId: string | null;
  readonly causationId: string | null;
}

export interface EnqueueResult {
  readonly job: JobRecord;
  /** False when the idempotency key matched an existing job (which is returned). */
  readonly created: boolean;
}

/** A job held under lease by one worker. `attempts` already counts this run. */
export interface ClaimedJob {
  readonly id: string;
  readonly jobType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly classification: string;
  readonly priority: number;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly leaseOwner: string;
  readonly correlationId: string | null;
  readonly causationId: string | null;
}

export interface ClaimOptions {
  /** Owns the leases this claim creates. */
  readonly workerId: string;
  /** Jobs per claim; clamped to the queue's batch cap (resource limits). */
  readonly batchSize?: number;
  /** Lease duration; an expired lease is recoverable. */
  readonly leaseTtlMs?: number;
}

export type CompleteOutcome = 'completed' | 'lost_lease';
export type FailOutcome = 'scheduled_retry' | 'dead_lettered' | 'lost_lease';
export type HeartbeatOutcome = 'extended' | 'lost_lease';
export type ReleaseOutcome = 'released' | 'lost_lease';

export interface StaleRecoveryReport {
  /** Jobs whose expired lease was recovered back to claimable. */
  readonly recovered: number;
  /** Jobs whose expired lease exhausted max_attempts and went dead. */
  readonly deadLettered: number;
}

/**
 * Provider-neutral queue contract. `PostgresJobQueue` is the Phase 2
 * implementation; any future provider implements this same port and the
 * worker never changes.
 */
export interface JobQueue {
  enqueue(input: EnqueueJobInput): Promise<EnqueueResult>;
  claim(options: ClaimOptions): Promise<ClaimedJob[]>;
  complete(job: ClaimedJob): Promise<CompleteOutcome>;
  /** Failure that may retry: backoff via available_at, dead after max_attempts. */
  failRetryable(job: ClaimedJob, error: unknown): Promise<FailOutcome>;
  /** Immediate terminal failure — no retry regardless of remaining attempts. */
  deadLetter(job: ClaimedJob, error: unknown): Promise<'dead_lettered' | 'lost_lease'>;
  /** Extends the lease of a long-running job. */
  heartbeat(job: ClaimedJob, extendMs?: number): Promise<HeartbeatOutcome>;
  /** Returns a claimed-but-unstarted job without spending the attempt (shutdown path). */
  release(job: ClaimedJob): Promise<ReleaseOutcome>;
  /** Flips expired leases back to claimable (or dead when exhausted). */
  recoverStaleLeases(): Promise<StaleRecoveryReport>;
}

/** Typed enqueue refusal for the payload-size resource guard. */
export class JobPayloadTooLargeError extends Error {
  constructor(jobType: string, bytes: number, maxBytes: number) {
    super(
      `Job '${jobType}' payload is ${bytes} bytes; the queue accepts at most ${maxBytes}. ` +
        'Store large inputs behind a reference, not in the job row.',
    );
    this.name = 'JobPayloadTooLargeError';
  }
}
