-- 0063_operating_entity_assignments
--
-- Two tables that make the entity binding explicit and its changes loud
-- (ADR-0024; operating-entity.md §4-5):
--
--   public.operating_entity_assignments — which entity serves a tenant
--     (TENANT_DEFAULT) and which entity a user contracted with
--     (USER_CONTRACTING), as effective-dated history rows.
--   public.entity_migrations — the ONLY path by which a binding moves from
--     one entity to another: an explicit, audited workflow with a re-consent
--     evaluation step. Never a silent UPDATE.
--
-- FORWARD-BINDING ONLY. An assignment change affects records created after
-- it. Every legally-consequential record pins operating_entity_at_creation
-- at creation (data-model.md §5) — in this phase, consent_grants (0065) pin
-- operating_entity_id explicitly — and a completed migration never rewrites
-- those pins: a record created under Entity A remains a record created under
-- Entity A, because that is what happened.
--
-- entity_migrations state machine (operating-entity.md §5):
--   PROPOSED -> RECONSENT_EVALUATED -> AWAITING_ACCEPTANCE -> MIGRATED
--                                   \-> MIGRATED (no re-consent required)
--   AWAITING_ACCEPTANCE -> BLOCKED (declined / lapsed)
-- Every post-PROPOSED state carries its reconsent_evaluation_id (CHECK
-- below): a migration cannot reach MIGRATED without a recorded evaluation —
-- "never silent" is a constraint, not a convention. Terminal rows (MIGRATED,
-- BLOCKED) are immutable history, enforced by trigger even for the owner.
--
-- RLS decision — ALLOW-LISTED, both tables (rls-allow-list.json): these are
-- platform-operator records ABOUT tenants and users (which legal person
-- serves whom), not tenant-owned domain data. The resolution query — "which
-- entity applies to this principal now" — must run for every tenant from
-- one place, and migration history must remain queryable across the tenants
-- an entity serves. Compensating controls as 0060: platform-operator-only
-- writes via the authorization port, minimal grants (no DELETE), guard
-- triggers, purpose-built consumer reads (a consumer learns its own
-- effective entity, never the register).
--
-- Data lifecycle (ADR-0026; canonical in modules/operating-entity/MODULE.md,
-- mirrored in DATA_LIFECYCLE.md):
--   public.operating_entity_assignments
--     Subject relationship: SUBJECT_DERIVED — USER_CONTRACTING rows reference
--       a user; the row records the platform's binding decision about them.
--     Purpose: resolve which legal person serves a tenant / contracted with
--       a user, now and at any past instant.
--     Classification: INTERNAL.
--     Retention: RETAIN_WITH_BASIS — binding history explains which entity
--       stood behind which period of service; PolicyPack owns bounds (3.5).
--     Export treatment: included — a subject's export names the entity they
--       contracted with and since when.
--     Erasure strategy: RETAIN_WITH_BASIS — user_id references resolve to
--       nothing once the subject is erased; the binding fact must survive
--       for the entity's own accountability.
--   public.entity_migrations
--     Subject relationship: SUBJECT_DERIVED — subject_ref names the tenant or
--       user whose binding migrated.
--     Purpose: audited record that a binding moved, under which evaluation,
--       with which outcome (ADR-0024: never silent).
--     Classification: INTERNAL.
--     Retention: RETAIN_WITH_BASIS — migration history with re-consent
--       outcomes is what the Super Admin Operating Entities Center shows.
--     Export treatment: included — a subject's export shows migrations of
--       their own binding.
--     Erasure strategy: RETAIN_WITH_BASIS — subject_ref is opaque and
--       resolves to nothing once the subject is erased.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TRIGGER/FUNCTION pairs and
-- DROP TABLE public.entity_migrations; DROP TABLE
-- public.operating_entity_assignments; — destroying binding history and the
-- evidence that no entity change was ever silent.

CREATE TABLE public.operating_entity_assignments (
  id             uuid        PRIMARY KEY,
  scope          text        NOT NULL CHECK (scope IN ('TENANT_DEFAULT', 'USER_CONTRACTING')),
  -- Cross-module references (raw UUIDs, no FK across module boundaries —
  -- data-model.md §2): tenant_id -> tenancy.tenants, user_id -> identity
  -- accounts (the platform UserId).
  tenant_id      uuid            NULL,
  user_id        uuid            NULL,
  entity_id      uuid        NOT NULL REFERENCES public.operating_entities (id),
  effective_from timestamptz NOT NULL,
  effective_to   timestamptz     NULL,
  created_by     text        NOT NULL CHECK (created_by <> ''),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (
    (scope = 'TENANT_DEFAULT'   AND tenant_id IS NOT NULL AND user_id IS NULL)
    OR
    (scope = 'USER_CONTRACTING' AND user_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.operating_entity_assignments IS
  'Effective-dated entity bindings (ADR-0024 §4): tenant default and user '
  'contracting entity. Forward-binding only — changing an assignment affects '
  'future records; pinned operating_entity columns on existing records never '
  'move. Superseded by ending (effective_to) + inserting, never by editing.';

-- Full (not partial) indexes: partial indexes are outside the Prisma schema
-- language, and the mapping must stay exact for the drift gate.
CREATE INDEX operating_entity_assignments_tenant_idx
  ON public.operating_entity_assignments (tenant_id, scope, effective_from);
CREATE INDEX operating_entity_assignments_user_idx
  ON public.operating_entity_assignments (user_id, scope, effective_from);

-- Same guard discipline as 0062: the only UPDATE is ending an open row.
CREATE FUNCTION public.operating_entity_assignments_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'operating_entity_assignments rows are binding history: DELETE is not permitted, even for the table owner (ADR-0024)'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'operating_entity_assignment % is ended and immutable; insert a successor assignment instead (ADR-0024)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id             IS DISTINCT FROM OLD.id
    OR NEW.scope          IS DISTINCT FROM OLD.scope
    OR NEW.tenant_id      IS DISTINCT FROM OLD.tenant_id
    OR NEW.user_id        IS DISTINCT FROM OLD.user_id
    OR NEW.entity_id      IS DISTINCT FROM OLD.entity_id
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.created_by     IS DISTINCT FROM OLD.created_by
    OR NEW.created_at     IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'operating_entity_assignment % may only be ended (effective_to), never edited (ADR-0024)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.effective_to IS NULL THEN
    RAISE EXCEPTION 'ending operating_entity_assignment % requires a non-null effective_to',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER operating_entity_assignments_guard
  BEFORE UPDATE OR DELETE ON public.operating_entity_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.operating_entity_assignments_guard();

CREATE FUNCTION public.operating_entity_assignments_no_truncate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'operating_entity_assignments rows are binding history: TRUNCATE is not permitted, even for the table owner (ADR-0024)'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER operating_entity_assignments_no_truncate
  BEFORE TRUNCATE ON public.operating_entity_assignments
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.operating_entity_assignments_no_truncate();

CREATE TABLE public.entity_migrations (
  id                       uuid        PRIMARY KEY,
  scope                    text        NOT NULL
    CHECK (scope IN ('TENANT_DEFAULT', 'USER_CONTRACTING')),
  -- Opaque reference to the tenant or user whose binding migrates.
  subject_ref              text        NOT NULL CHECK (subject_ref <> ''),
  from_entity              uuid        NOT NULL REFERENCES public.operating_entities (id),
  to_entity                uuid        NOT NULL REFERENCES public.operating_entities (id),
  status                   text        NOT NULL
    CHECK (status IN ('PROPOSED', 'RECONSENT_EVALUATED', 'AWAITING_ACCEPTANCE', 'MIGRATED', 'BLOCKED')),
  reason                   text        NOT NULL CHECK (reason <> ''),
  -- Cross-module reference to the consent module's reconsent_evaluations
  -- (raw UUID, no FK across module boundaries — data-model.md §2).
  reconsent_evaluation_id  uuid            NULL,
  proposed_by              text        NOT NULL CHECK (proposed_by <> ''),
  proposed_at              timestamptz NOT NULL,
  completed_at             timestamptz     NULL,
  CHECK (from_entity <> to_entity),
  -- Terminal states and only terminal states carry a completion instant.
  CHECK ((status IN ('MIGRATED', 'BLOCKED')) = (completed_at IS NOT NULL)),
  -- Never silent: every state past PROPOSED carries its recorded evaluation.
  CHECK (status = 'PROPOSED' OR reconsent_evaluation_id IS NOT NULL)
);

COMMENT ON TABLE public.entity_migrations IS
  'The only path an entity binding may change (ADR-0024 §5): explicit, '
  'audited, with a recorded re-consent evaluation. Terminal rows (MIGRATED, '
  'BLOCKED) are immutable history; historical records keep their original '
  'pinned entity.';

CREATE INDEX entity_migrations_subject_idx
  ON public.entity_migrations (subject_ref, proposed_at);

-- Immutable history: terminal rows never change; identity and provenance
-- columns never change on any row; DELETE/TRUNCATE raise even for the owner.
CREATE FUNCTION public.entity_migrations_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'entity_migrations rows are audited history: DELETE is not permitted, even for the table owner (ADR-0024)'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.status IN ('MIGRATED', 'BLOCKED') THEN
    RAISE EXCEPTION 'entity_migration % is % and immutable (ADR-0024: history is never rewritten)',
      OLD.id, OLD.status USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id          IS DISTINCT FROM OLD.id
    OR NEW.scope       IS DISTINCT FROM OLD.scope
    OR NEW.subject_ref IS DISTINCT FROM OLD.subject_ref
    OR NEW.from_entity IS DISTINCT FROM OLD.from_entity
    OR NEW.to_entity   IS DISTINCT FROM OLD.to_entity
    OR NEW.reason      IS DISTINCT FROM OLD.reason
    OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by
    OR NEW.proposed_at IS DISTINCT FROM OLD.proposed_at
  THEN
    RAISE EXCEPTION 'entity_migration % identity/provenance columns are immutable; only status, reconsent_evaluation_id and completed_at may advance (ADR-0024)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  -- An evaluation, once linked, is never unlinked or swapped.
  IF OLD.reconsent_evaluation_id IS NOT NULL
    AND NEW.reconsent_evaluation_id IS DISTINCT FROM OLD.reconsent_evaluation_id
  THEN
    RAISE EXCEPTION 'entity_migration % re-consent evaluation link is immutable once recorded (ADR-0024)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER entity_migrations_guard
  BEFORE UPDATE OR DELETE ON public.entity_migrations
  FOR EACH ROW
  EXECUTE FUNCTION public.entity_migrations_guard();

CREATE FUNCTION public.entity_migrations_no_truncate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'entity_migrations rows are audited history: TRUNCATE is not permitted, even for the table owner (ADR-0024)'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER entity_migrations_no_truncate
  BEFORE TRUNCATE ON public.entity_migrations
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.entity_migrations_no_truncate();

-- Minimal DML (README.md): no DELETE on either table — absent grant first,
-- trigger second.
GRANT SELECT, INSERT, UPDATE ON public.operating_entity_assignments TO karar_app;
GRANT SELECT, INSERT, UPDATE ON public.entity_migrations TO karar_app;
