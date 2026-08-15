-- 0021_jobs
--
-- Background-job foundation (ADR-0013). Jobs are REQUESTED WORK — commands
-- with retry, lease, and outcome semantics — never facts; facts travel as
-- events through the outbox (0020, ADR-0012/0025). Workers claim with plain
-- PostgreSQL FOR UPDATE SKIP LOCKED (no cloud queue), hold a lease with an
-- expiry, and finish through succeeded / failed_retryable(backoff) / dead.
-- An expired lease is recoverable by any worker; attempts >= max_attempts is
-- terminal ('dead', alertable). Idempotent enqueue is the partial unique
-- index on (job_type, idempotency_key): the second enqueue finds the first.
--
-- updated_at is maintained by application statements, not a trigger — every
-- UPDATE the queue issues sets it explicitly, and nothing else updates jobs.
--
-- Lifecycle (ADR-0026; row mirrored in db/DATA_LIFECYCLE.md):
--   platform.jobs
--     subject relationship: SUBJECT_DERIVED (payloads may reference tenant or
--                           subject identifiers when later phases enqueue
--                           tenant-scoped work)
--     purpose:              reliable background work execution (retry, lease,
--                           dead-letter semantics for the worker entrypoint)
--     classification:       mirrors the payload's classification column; at
--                           most CONFIDENTIAL in Phase 2 (only the diagnostic
--                           echo job exists, INTERNAL)
--     retention:            short operational window; succeeded and dead rows
--                           are purged by a later-phase retention job (why
--                           karar_app has no DELETE)
--     export treatment:     not applicable — execution plumbing; the owning
--                           module's tables are the authoritative record
--     erasure strategy:     RETAIN_WITH_BASIS (basis: work-in-flight
--                           integrity and incident forensics over a short
--                           window; payloads may carry identifiers, so
--                           NON_PERSONAL_BY_DESIGN would be a false claim)
--
-- rollback: forward-only (db/migrations/README.md). A failed apply leaves
-- nothing (single transaction). Deliberate reversal would be DROP TABLE
-- platform.jobs — acceptable only while nothing enqueues, and it destroys
-- queued work, so drain (or accept the loss of) pending jobs first.

CREATE TABLE platform.jobs (
  id               uuid        PRIMARY KEY,
  job_type         text        NOT NULL,
  payload          jsonb       NOT NULL,
  classification   text        NOT NULL DEFAULT 'INTERNAL' CHECK (classification IN
                     ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL',
                      'HIGHLY_SENSITIVE_FINANCIAL', 'SECRET', 'SEALED')),
  idempotency_key  text,
  status           text        NOT NULL DEFAULT 'queued' CHECK (status IN
                     ('queued', 'leased', 'succeeded', 'failed_retryable', 'dead')),
  priority         integer     NOT NULL DEFAULT 0,
  available_at     timestamptz NOT NULL DEFAULT now(),
  lease_owner      text,
  lease_expires_at timestamptz,
  attempts         integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts     integer     NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  last_error       text,
  correlation_id   text,
  causation_id     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Exactly the leased rows carry a lease; everything else carries none.
  CONSTRAINT jobs_lease_shape CHECK (
    (status = 'leased') = (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

-- Idempotent enqueue: one live row per (job_type, idempotency_key).
CREATE UNIQUE INDEX jobs_idempotency_key_idx
  ON platform.jobs (job_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The claim scan: highest priority first, then earliest available. Partial,
-- so completed history never bloats it.
CREATE INDEX jobs_claimable_idx
  ON platform.jobs (priority DESC, available_at, created_at)
  WHERE status IN ('queued', 'failed_retryable');

-- Stale-lease recovery scan.
CREATE INDEX jobs_leased_expiry_idx
  ON platform.jobs (lease_expires_at)
  WHERE status = 'leased';

-- Enqueue INSERTs, workers UPDATE claims/outcomes, health and tests SELECT.
-- No DELETE: purging finished history is a later-phase retention job.
GRANT SELECT, INSERT, UPDATE ON platform.jobs TO karar_app;
