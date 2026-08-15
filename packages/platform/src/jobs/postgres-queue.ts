/**
 * PostgreSQL implementation of the JobQueue port over `platform.jobs`
 * (migration 0021). Standard PostgreSQL only: claims use FOR UPDATE SKIP
 * LOCKED, leases are (lease_owner, lease_expires_at), idempotent enqueue is
 * the partial unique index on (job_type, idempotency_key).
 *
 * Resource limits (ADR-0013: a poorly bounded job must not exhaust shared
 * resources): claims are capped per batch, and payloads over the byte budget
 * are refused at enqueue — rejected, not degraded.
 */
import { randomUUID } from 'node:crypto';

import type { PostgresPersistenceAdapter, TransactionClient } from '../db/adapter.js';
import {
  JobPayloadTooLargeError,
  type ClaimOptions,
  type ClaimedJob,
  type CompleteOutcome,
  type EnqueueJobInput,
  type EnqueueResult,
  type FailOutcome,
  type HeartbeatOutcome,
  type JobQueue,
  type JobRecord,
  type JobStatus,
  type ReleaseOutcome,
  type StaleRecoveryReport,
} from './queue.js';

export interface PostgresJobQueueOptions {
  /** Payload byte budget (JSON length). Default 262144 (256 KiB). */
  readonly maxPayloadBytes?: number;
  /** Per-claim batch cap. Default 25. */
  readonly maxClaimBatch?: number;
  /** Retry backoff base: delay = base * 2^(attempts-1), capped. Default 1s. */
  readonly backoffBaseMs?: number;
  /** Retry backoff cap. Default 5 minutes. */
  readonly backoffCapMs?: number;
  /** Default lease duration for claims. Default 30s. */
  readonly defaultLeaseTtlMs?: number;
}

const MAX_LAST_ERROR_LENGTH = 2_000;
const STALE_LEASE_ERROR = 'lease expired before the worker reported an outcome';

function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.length > MAX_LAST_ERROR_LENGTH ? `${text.slice(0, MAX_LAST_ERROR_LENGTH)}…` : text;
}

interface JobRow {
  readonly id: string;
  readonly job_type: string;
  readonly payload: Record<string, unknown>;
  readonly classification: string;
  readonly idempotency_key: string | null;
  readonly status: JobStatus;
  readonly priority: number;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly lease_owner: string | null;
  readonly correlation_id: string | null;
  readonly causation_id: string | null;
}

const JOB_COLUMNS =
  'id, job_type, payload, classification, idempotency_key, status, priority, attempts, max_attempts, lease_owner, correlation_id, causation_id';

function toRecord(row: JobRow): JobRecord {
  return Object.freeze({
    id: row.id,
    jobType: row.job_type,
    payload: Object.freeze({ ...row.payload }),
    classification: row.classification,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
  });
}

function toClaimed(row: JobRow): ClaimedJob {
  return Object.freeze({
    id: row.id,
    jobType: row.job_type,
    payload: Object.freeze({ ...row.payload }),
    classification: row.classification,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    leaseOwner: row.lease_owner as string,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
  });
}

export class PostgresJobQueue implements JobQueue {
  private readonly adapter: PostgresPersistenceAdapter;
  private readonly maxPayloadBytes: number;
  private readonly maxClaimBatch: number;
  private readonly backoffBaseMs: number;
  private readonly backoffCapMs: number;
  private readonly defaultLeaseTtlMs: number;

  constructor(adapter: PostgresPersistenceAdapter, options: PostgresJobQueueOptions = {}) {
    this.adapter = adapter;
    this.maxPayloadBytes = options.maxPayloadBytes ?? 256 * 1024;
    this.maxClaimBatch = options.maxClaimBatch ?? 25;
    this.backoffBaseMs = options.backoffBaseMs ?? 1_000;
    this.backoffCapMs = options.backoffCapMs ?? 5 * 60_000;
    this.defaultLeaseTtlMs = options.defaultLeaseTtlMs ?? 30_000;
  }

  /**
   * Enqueues on the shared pool. For work that must ride a domain
   * transaction, pass the `TransactionClient` via `enqueueWith`.
   */
  async enqueue(input: EnqueueJobInput): Promise<EnqueueResult> {
    return this.enqueueWith(this.adapter, input);
  }

  /** Enqueue variant sharing the caller's transaction (same pattern as the outbox). */
  async enqueueWith(
    client: Pick<TransactionClient, 'query'>,
    input: EnqueueJobInput,
  ): Promise<EnqueueResult> {
    if (input.jobType.trim() === '') {
      throw new Error('enqueue requires a non-empty jobType');
    }
    const payloadJson = JSON.stringify(input.payload);
    const payloadBytes = Buffer.byteLength(payloadJson, 'utf8');
    if (payloadBytes > this.maxPayloadBytes) {
      throw new JobPayloadTooLargeError(input.jobType, payloadBytes, this.maxPayloadBytes);
    }

    const inserted = await client.query<JobRow>(
      `INSERT INTO platform.jobs
         (id, job_type, payload, classification, idempotency_key, priority,
          available_at, max_attempts, correlation_id, causation_id)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6,
               now() + make_interval(secs => $7::double precision), $8, $9, $10)
       ON CONFLICT (job_type, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING ${JOB_COLUMNS}`,
      [
        randomUUID(),
        input.jobType,
        payloadJson,
        input.classification ?? 'INTERNAL',
        input.idempotencyKey ?? null,
        input.priority ?? 0,
        (input.delayMs ?? 0) / 1_000,
        input.maxAttempts ?? 5,
        input.correlationId ?? null,
        input.causationId ?? null,
      ],
    );
    const row = inserted.rows[0];
    if (row !== undefined) {
      return { job: toRecord(row), created: true };
    }
    // Idempotency key matched: return the existing job, whatever its state.
    const existing = await client.query<JobRow>(
      `SELECT ${JOB_COLUMNS} FROM platform.jobs WHERE job_type = $1 AND idempotency_key = $2`,
      [input.jobType, input.idempotencyKey ?? null],
    );
    const existingRow = existing.rows[0];
    if (existingRow === undefined) {
      // The winning insert vanished between statements — enqueue is safe to retry.
      throw new Error(
        `Idempotent enqueue race for job '${input.jobType}': existing row not found; retry`,
      );
    }
    return { job: toRecord(existingRow), created: false };
  }

  async claim(options: ClaimOptions): Promise<ClaimedJob[]> {
    if (options.workerId.trim() === '') {
      throw new Error('claim requires a non-empty workerId');
    }
    const batch = Math.min(
      Math.max(1, options.batchSize ?? this.maxClaimBatch),
      this.maxClaimBatch,
    );
    const leaseTtlMs = options.leaseTtlMs ?? this.defaultLeaseTtlMs;
    const result = await this.adapter.query<JobRow>(
      `UPDATE platform.jobs j
          SET status = 'leased',
              lease_owner = $1,
              lease_expires_at = now() + make_interval(secs => $2::double precision),
              attempts = j.attempts + 1,
              updated_at = now()
         FROM (
           SELECT id
             FROM platform.jobs
            WHERE status IN ('queued', 'failed_retryable')
              AND available_at <= now()
            ORDER BY priority DESC, available_at, created_at, id
            LIMIT $3
              FOR UPDATE SKIP LOCKED
         ) pick
        WHERE j.id = pick.id
        RETURNING j.id, j.job_type, j.payload, j.classification, j.idempotency_key, j.status,
                  j.priority, j.attempts, j.max_attempts, j.lease_owner, j.correlation_id, j.causation_id`,
      [options.workerId, leaseTtlMs / 1_000, batch],
    );
    return result.rows.map(toClaimed);
  }

  async complete(job: ClaimedJob): Promise<CompleteOutcome> {
    const result = await this.adapter.query(
      `UPDATE platform.jobs
          SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND lease_owner = $2 AND status = 'leased'`,
      [job.id, job.leaseOwner],
    );
    return (result.rowCount ?? 0) === 1 ? 'completed' : 'lost_lease';
  }

  async failRetryable(job: ClaimedJob, error: unknown): Promise<FailOutcome> {
    if (job.attempts >= job.maxAttempts) {
      return this.deadLetter(job, error);
    }
    const backoffMs = Math.min(this.backoffCapMs, this.backoffBaseMs * 2 ** (job.attempts - 1));
    const result = await this.adapter.query(
      `UPDATE platform.jobs
          SET status = 'failed_retryable', last_error = $3,
              available_at = now() + make_interval(secs => $4::double precision),
              lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND lease_owner = $2 AND status = 'leased'`,
      [job.id, job.leaseOwner, describeError(error), backoffMs / 1_000],
    );
    return (result.rowCount ?? 0) === 1 ? 'scheduled_retry' : 'lost_lease';
  }

  async deadLetter(job: ClaimedJob, error: unknown): Promise<'dead_lettered' | 'lost_lease'> {
    const result = await this.adapter.query(
      `UPDATE platform.jobs
          SET status = 'dead', last_error = $3,
              lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND lease_owner = $2 AND status = 'leased'`,
      [job.id, job.leaseOwner, describeError(error)],
    );
    return (result.rowCount ?? 0) === 1 ? 'dead_lettered' : 'lost_lease';
  }

  async heartbeat(job: ClaimedJob, extendMs?: number): Promise<HeartbeatOutcome> {
    const result = await this.adapter.query(
      `UPDATE platform.jobs
          SET lease_expires_at = now() + make_interval(secs => $3::double precision),
              updated_at = now()
        WHERE id = $1 AND lease_owner = $2 AND status = 'leased'`,
      [job.id, job.leaseOwner, (extendMs ?? this.defaultLeaseTtlMs) / 1_000],
    );
    return (result.rowCount ?? 0) === 1 ? 'extended' : 'lost_lease';
  }

  async release(job: ClaimedJob): Promise<ReleaseOutcome> {
    // Undo the claim: back to claimable, the attempt uncounted — a released
    // job was never run, so a shutdown must not spend its retries.
    const result = await this.adapter.query(
      `UPDATE platform.jobs
          SET status = 'queued', attempts = greatest(attempts - 1, 0),
              lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND lease_owner = $2 AND status = 'leased'`,
      [job.id, job.leaseOwner],
    );
    return (result.rowCount ?? 0) === 1 ? 'released' : 'lost_lease';
  }

  async recoverStaleLeases(): Promise<StaleRecoveryReport> {
    // The attempt was counted at claim; a worker that died mid-run gets no
    // refund, so a job that always kills its worker still dead-letters.
    const result = await this.adapter.query<{ status: JobStatus }>(
      `UPDATE platform.jobs
          SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'failed_retryable' END,
              last_error = $1,
              available_at = now(),
              lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE status = 'leased' AND lease_expires_at < now()
        RETURNING status`,
      [STALE_LEASE_ERROR],
    );
    let recovered = 0;
    let deadLettered = 0;
    for (const row of result.rows) {
      if (row.status === 'dead') deadLettered += 1;
      else recovered += 1;
    }
    return { recovered, deadLettered };
  }
}
