-- 0010_audit_events
--
-- The append-only audit foundation: audit.audit_events (data-model.md §10;
-- modules/audit/MODULE.md). Every mutation, every staff read of a customer
-- record (including reads returning nothing), every capability availability
-- change, every policy and entity change, and every attempted sealed access
-- lands here through the audit module's writer — the app role can INSERT and
-- SELECT, and nothing on this cluster can UPDATE or DELETE a recorded row.
--
-- Append-only is enforced by BOTH mechanisms, deliberately (data-model.md
-- §10): revoked grants first (karar_app receives INSERT and SELECT only,
-- per the convention in README.md), and a trigger that raises on UPDATE,
-- DELETE, and TRUNCATE **even for the table owner** (karar_migrator). Two
-- mechanisms because the legacy's audit table itself carried the schema's
-- one flagged anomaly (RLS FORCEd but not enabled) and no guard caught it;
-- a single mechanism is one misconfiguration away from silent tampering.
-- The trigger fires FOR EACH STATEMENT, so even an UPDATE matching zero
-- rows raises instead of succeeding vacuously.
--
-- Data lifecycle (ADR-0026, all six fields; mirrored in
-- modules/audit/MODULE.md and packages/platform/db/DATA_LIFECYCLE.md):
--   Subject relationship: SUBJECT_DERIVED — rows describe actions; where an
--     actor or tenant appears it is a reference derived from the acting
--     subject, and the row does not belong to that subject.
--   Purpose:              accountability — tamper-evident record of who did
--     what, when, to which resource, with what outcome.
--   Classification:      CONFIDENTIAL (references and action metadata; the
--     module's metadata guard keeps financial payloads and secrets out).
--   Retention:           from the PolicyPack per jurisdiction when packs
--     arrive (Phase 3.5); until then the local development placeholder is
--     13 months, and that number lives in policy configuration — never as a
--     constant in code.
--   Export treatment:    excluded, with reason — this is an integrity record
--     about the subject's account, not the subject's own content; exporting
--     it verbatim would leak operational and staff identifiers. The export's
--     coverage note names this exclusion (ADR-0026, legacy P5).
--   Erasure strategy:    RETAIN_WITH_BASIS — legal basis: accountability and
--     security obligations survive account closure for the retention period;
--     actor/tenant references are opaque and resolve to nothing once the
--     referenced subject is erased.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — the
-- file runs in a single transaction. Deliberate reversal, were it ever
-- required, would be DROP TRIGGER audit_events_immutable ON
-- audit.audit_events; DROP FUNCTION audit.audit_events_immutable();
-- DROP TABLE audit.audit_events; — destroying recorded audit history, which
-- is why it would need the same review as destroying any evidence record.

CREATE TABLE audit.audit_events (
  audit_event_id  uuid        PRIMARY KEY,
  occurred_at     timestamptz NOT NULL,             -- when the audited action happened (caller clock)
  recorded_at     timestamptz NOT NULL DEFAULT now(), -- when this row was written (database clock)
  environment     text        NOT NULL,             -- asserted environment identity (data-model.md §13)
  actor_ref       text            NULL,             -- opaque reference; null for system actions
  tenant_ref      text            NULL,             -- opaque reference; null for platform-level actions
  action          text        NOT NULL,             -- e.g. 'audit.migration.applied', 'user.record.read'
  resource_type   text        NOT NULL,
  resource_id     text        NOT NULL,
  reason          text            NULL,             -- operator-supplied reason where the gateway captures one
  request_id      text            NULL,
  trace_id        text            NULL,
  correlation_id  text            NULL,
  before_metadata jsonb           NULL,             -- guarded: identifiers/status/small scalars, never payloads
  after_metadata  jsonb           NULL,             -- guarded: same rules as before_metadata
  outcome         text        NOT NULL              -- 'SUCCESS' | 'DENIED' | 'FAILURE'
);

-- Grant convention for audit tables (README.md): INSERT and SELECT only.
-- No UPDATE, no DELETE, no TRUNCATE — append-only by revoked grants first.
GRANT SELECT, INSERT ON audit.audit_events TO karar_app;

-- Mechanism two: the immutability trigger, raising even for the owner.
CREATE FUNCTION audit.audit_events_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit.audit_events is append-only: % is not permitted, even for the table owner (data-model.md §10)',
    TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit.audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit.audit_events_immutable();

-- Read paths: time-ordered scans for review, and per-resource history.
CREATE INDEX audit_events_recorded_at_idx
  ON audit.audit_events (recorded_at);
CREATE INDEX audit_events_resource_idx
  ON audit.audit_events (resource_type, resource_id);
