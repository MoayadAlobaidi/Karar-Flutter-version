-- 0020_outbox
--
-- Transactional outbox (ADR-0012; docs/architecture/event-governance.md
-- section 4) and consumer idempotency receipts. A use case inserts the event
-- envelope into platform.outbox_events INSIDE the same transaction as its
-- state change; the relay in apps/worker claims rows with FOR UPDATE SKIP
-- LOCKED (plain PostgreSQL — no cloud feature), publishes them through the
-- EventBus port, and marks published_at only AFTER the publisher succeeded.
-- Bounded retry with exponential backoff via available_at; attempts >=
-- max_attempts dead-letters the row (terminal, alertable). Consumers record
-- (consumer_name, event_id) receipts inside their own transactions, which is
-- what makes at-least-once delivery safe (idempotent consumers, ADR-0012).
--
-- Lifecycle (ADR-0026; row mirrored in db/DATA_LIFECYCLE.md):
--   platform.outbox_events
--     subject relationship: SUBJECT_DERIVED (envelopes may carry tenant ids)
--     purpose:              reliable event delivery (transactional outbox)
--     classification:       mirrors the envelope's classification column;
--                           at most CONFIDENTIAL in Phase 2 (SEALED events
--                           carry identifiers/status only by ADR-0025)
--     retention:            short operational window; published and
--                           dead-lettered rows are purged by a later-phase
--                           retention job (why karar_app has no DELETE)
--     export treatment:     not applicable — delivery plumbing; the owning
--                           module's tables are the authoritative record
--     erasure strategy:     RETAIN_WITH_BASIS (basis: reliable delivery and
--                           incident forensics over a short window; rows may
--                           reference tenant ids, so NON_PERSONAL_BY_DESIGN
--                           would be a false claim)
--   platform.event_consumer_receipts
--     subject relationship: SUBJECT_DERIVED (event_id links to an envelope
--                           that may concern a subject; pseudonymous, and
--                           pseudonymization is not anonymization)
--     purpose:              consumer idempotency (duplicate delivery is a
--                           no-op keyed on event id)
--     classification:       INTERNAL (names and uuids only)
--     retention:            short operational window, aligned to the outbox
--     export treatment:     not applicable — delivery plumbing
--     erasure strategy:     RETAIN_WITH_BASIS (same basis and window)
--
-- rollback: forward-only (db/migrations/README.md). A failed apply leaves
-- nothing (single transaction). Deliberate reversal would be DROP TABLE
-- platform.event_consumer_receipts, then DROP TABLE platform.outbox_events —
-- acceptable only while no producer writes to them, and it destroys any
-- not-yet-published events, so drain the outbox first.

CREATE TABLE platform.outbox_events (
  id               uuid        PRIMARY KEY,
  event_name       text        NOT NULL,
  schema_version   integer     NOT NULL CHECK (schema_version >= 1),
  envelope         jsonb       NOT NULL,
  classification   text        NOT NULL CHECK (classification IN
                     ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL',
                      'HIGHLY_SENSITIVE_FINANCIAL', 'SECRET', 'SEALED')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  available_at     timestamptz NOT NULL DEFAULT now(),
  claimed_by       text,
  claim_expires_at timestamptz,
  attempts         integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts     integer     NOT NULL DEFAULT 8 CHECK (max_attempts >= 1),
  published_at     timestamptz,
  dead_lettered_at timestamptz,
  last_error       text,
  -- A row has exactly one terminal state; a claim always carries its expiry.
  CONSTRAINT outbox_events_one_terminal_state
    CHECK (published_at IS NULL OR dead_lettered_at IS NULL),
  CONSTRAINT outbox_events_claim_has_expiry
    CHECK ((claimed_by IS NULL) = (claim_expires_at IS NULL))
);

-- The relay's scan: pending work in arrival order. Partial, so the index
-- stays small no matter how much published history is awaiting purge.
CREATE INDEX outbox_events_pending_idx
  ON platform.outbox_events (available_at, created_at)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;

-- Claim bookkeeping: release-on-shutdown and stale-claim inspection by owner.
CREATE INDEX outbox_events_claimed_by_idx
  ON platform.outbox_events (claimed_by);

-- Producers INSERT (in their own transactions), the relay UPDATEs claims and
-- outcomes, readiness/lag queries SELECT. No DELETE: purging published and
-- dead-lettered history is a later-phase retention job, not application DML.
GRANT SELECT, INSERT, UPDATE ON platform.outbox_events TO karar_app;

CREATE TABLE platform.event_consumer_receipts (
  consumer_name text        NOT NULL,
  event_id      uuid        NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, event_id)
);

-- Append-only by grant: a receipt is a fact that processing happened; nothing
-- updates or deletes it from application code (purge is the retention job's).
GRANT SELECT, INSERT ON platform.event_consumer_receipts TO karar_app;
