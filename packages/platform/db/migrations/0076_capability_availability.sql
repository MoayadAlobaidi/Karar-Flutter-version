-- 0076_capability_availability
--
-- public.capability_availability + public.capability_availability_history —
-- the DYNAMIC availability dimension of the capability registry
-- (capability-registry.md §3; modules/capability/MODULE.md). One row per
-- (environment, jurisdiction?, capability): the operator-configured exposure
-- state for a capability in one environment, optionally narrowed to one
-- jurisdiction (jurisdiction_ref NULL = environment-wide row).
--
-- DENY BY DEFAULT, stated precisely: a capability with NO row here is
-- DISABLED. A row can therefore only ever be consulted, never assumed — and
-- a row can never WIDEN access: resolution is a restrict-only MEET in which
-- the compile-time descriptor (implementation/deployment) and the policy-pack
-- ceiling run FIRST, so a row state of AVAILABLE for unbuilt, undeployed, or
-- uncleared code changes no outcome (test-asserted, including by the
-- generated-configuration property harness). The write use case refuses to
-- even RECORD an allowing state above the descriptor ceiling (ABOVE_CEILING,
-- audited as DENIED).
--
-- The stored state vocabulary is CLOSED by CHECK (AVAILABLE, BETA,
-- INTERNAL_ONLY, PARTNER_ONLY, DISABLED, PENDING_PROVIDER,
-- PENDING_LEGAL_REVIEW, PENDING_REGULATORY_REVIEW). Only AVAILABLE and BETA
-- permit exposure; INTERNAL_ONLY/PARTNER_ONLY deny in this phase because no
-- internal/partner audience model exists to check against. Denial REASONS
-- are modelled separately in code — the row stores state, the resolver
-- reports reason.
--
-- capability_id is CLOSED at the database (CHECK), mirroring the
-- compile-time union in packages/capability-registry — a new capability is a
-- reviewed code change plus a migration, never a runtime string. This is
-- also what keeps synthetic TEST ids structurally out of real rows: test
-- suites that need a positive fixture build in-memory registries and fakes,
-- never rows.
--
-- Concurrency and history, DB-enforced (the kill-switch pattern, 0053):
-- every UPDATE must increment version by exactly one (guard trigger; the
-- application does optimistic UPDATE ... WHERE version = expected), identity
-- columns are immutable, DELETE/TRUNCATE raise even for the table owner (a
-- capability is withdrawn by setting DISABLED, keeping accountability), and
-- an AFTER INSERT OR UPDATE trigger appends every state to
-- capability_availability_history as SECURITY DEFINER — karar_app holds NO
-- INSERT on the history table, so ledger rows can only come from an actual
-- state change. UNIQUE (availability_id, version) forbids skipped or forked
-- history.
--
-- Why a trigger ledger AND @karar/audit (both, deliberately): audit rows are
-- application-written summaries under the metadata guard — they answer
-- who/why and can name only guarded scalars, and a write path that bypassed
-- the use case would also bypass them. The ledger is written by the database
-- itself on every change, cannot be skipped by any SQL path, and is the
-- exact referent of the resolver's TOCTOU provenance pins (row id +
-- version): every pinned version is forever explainable from the ledger.
-- Audit alone is insufficient here; both exist, each doing its own job.
--
-- The row's own provenance columns (actor_ref, reason, version, timestamps)
-- are operational accountability, not the data-model.md §5 legal-consequence
-- pinning signature — these rows GATE features; they do not record legal
-- acts about subjects (no jurisdiction_at_creation-style columns, by
-- design).
--
-- RLS decision — ALLOW-LISTED (packages/platform/db/rls-allow-list.json),
-- both tables: deployment-wide configuration consulted while resolving
-- EVERY tenant's availability; rows carry no tenant or subject column by
-- design — the per-tenant dimension lives in tenant_capability_entitlements
-- (0077), which IS RLS-FORCEd. A tenant predicate here would fabricate a
-- relationship and break resolution for all tenants at once. Compensating
-- controls: deny-by-default reads (a missing row is DISABLED), restrict-only
-- resolution (a readable row can never widen access beyond the code+pack
-- ceiling), minimal grants (main table SELECT/INSERT/UPDATE, no DELETE;
-- history SELECT-only, trigger-written), writes reachable only through the
-- permission-gated operator use case (capability.availability.manage,
-- declared-but-unseeded this phase: absence denies), the closed
-- capability_id CHECK, the version/history triggers, and every change —
-- and every refused above-ceiling attempt — audited via @karar/audit.
--
-- Data lifecycle (ADR-0026; canonical in modules/capability/MODULE.md,
-- mirrored in DATA_LIFECYCLE.md):
--   public.capability_availability
--     Subject relationship: NON_PERSONAL — configuration state; actor_ref is
--       an operator reference, not subject data.
--     Purpose: the audited, restrict-only exposure state per (environment,
--       jurisdiction?, capability); a missing row means DISABLED.
--     Classification: INTERNAL.
--     Retention: current configuration lives with the platform; PolicyPack
--       owns any bound (Phase 3.5+), never a code constant.
--     Export treatment: n/a — no subject owns configuration.
--     Erasure strategy: NON_PERSONAL_BY_DESIGN — rows hold environment,
--       jurisdiction and capability references, state, operator reference,
--       and reason; nothing re-identifies a person.
--   public.capability_availability_history
--     Subject relationship: NON_PERSONAL — same content, append-only copies.
--     Purpose: the ledger behind every availability decision ever resolved —
--       which state held, in order, with actor, reason, and version (the
--       TOCTOU pins' referent).
--     Classification: INTERNAL.
--     Retention: configuration history explains every past resolution;
--       PolicyPack owns any bound (Phase 3.5+).
--     Export treatment: n/a.
--     Erasure strategy: RETAIN_WITH_BASIS — the basis is exposure
--       accountability (why was this capability reachable at time t, on
--       whose decision); rows name operator references, never subjects.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP the triggers and functions,
-- then DROP TABLE public.capability_availability_history and
-- public.capability_availability — after which every capability resolves
-- DISABLED (the deny-by-default design's safe direction), while destroying
-- the exposure accountability record, which is why it would still need the
-- same review as destroying any ledger.

CREATE TABLE public.capability_availability (
  id               uuid        PRIMARY KEY,
  environment      text        NOT NULL
    CONSTRAINT capability_availability_environment_check
    CHECK (environment IN ('local', 'dev', 'staging', 'production')),
  -- NULL = environment-wide row. Uniqueness of the non-null triple is
  -- DB-enforced below; the single null-scope row per (environment,
  -- capability) is enforced by the operator use case inside its
  -- read-then-write flow (kept out of the schema as a partial index would
  -- not survive the Prisma drift gate exactly), and resolution picks
  -- deterministically (jurisdiction-specific first, then latest write).
  jurisdiction_ref text            NULL
    CONSTRAINT capability_availability_jurisdiction_ref_check
    CHECK (jurisdiction_ref <> ''),
  -- Closed registry: mirrors the compile-time CapabilityId union
  -- (packages/capability-registry). A new capability is a reviewed code
  -- change plus a migration.
  capability_id    text        NOT NULL
    CONSTRAINT capability_availability_capability_id_check
    CHECK (capability_id IN
      ('TRANSACTIONS', 'BUDGETS', 'GOALS', 'INSIGHTS', 'AI_ADVISOR', 'ZAKAT', 'AMANAT')),
  state            text        NOT NULL
    CONSTRAINT capability_availability_state_check
    CHECK (state IN
      ('AVAILABLE', 'BETA', 'INTERNAL_ONLY', 'PARTNER_ONLY', 'DISABLED',
       'PENDING_PROVIDER', 'PENDING_LEGAL_REVIEW', 'PENDING_REGULATORY_REVIEW')),
  reason           text        NOT NULL
    CONSTRAINT capability_availability_reason_check CHECK (reason <> ''),
  actor_ref        text        NOT NULL
    CONSTRAINT capability_availability_actor_ref_check CHECK (actor_ref <> ''),
  version          integer     NOT NULL DEFAULT 1
    CONSTRAINT capability_availability_version_check CHECK (version >= 1),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL,
  CONSTRAINT capability_availability_scope_key
    UNIQUE (environment, jurisdiction_ref, capability_id)
);

COMMENT ON TABLE public.capability_availability IS
  'INTERNAL. Audited, restrict-only capability exposure state per '
  '(environment, jurisdiction?, capability). A MISSING row means DISABLED '
  '(deny by default), and no row can widen access beyond the compile-time '
  'descriptor + policy-pack ceiling (restrict-only merge). Closed '
  'capability_id and state vocabularies by CHECK. Version-incrementing '
  'updates auto-append capability_availability_history. Writes only via the '
  'permission-gated operator use case (capability.availability.manage). '
  'Allow-listed from RLS as deployment-wide configuration. '
  'Lifecycle: 0076 header + DATA_LIFECYCLE.md.';

CREATE INDEX capability_availability_lookup_idx
  ON public.capability_availability (capability_id, environment);

CREATE TABLE public.capability_availability_history (
  id               uuid        PRIMARY KEY,
  availability_id  uuid        NOT NULL
    CONSTRAINT capability_availability_history_availability_id_fkey
    REFERENCES public.capability_availability (id),
  environment      text        NOT NULL,
  jurisdiction_ref text            NULL,
  capability_id    text        NOT NULL,
  state            text        NOT NULL,
  reason           text        NOT NULL,
  actor_ref        text        NOT NULL,
  version          integer     NOT NULL
    CONSTRAINT capability_availability_history_version_check CHECK (version >= 1),
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  -- One ledger row per (row, version): history cannot skip or fork.
  CONSTRAINT capability_availability_history_row_version_key
    UNIQUE (availability_id, version)
);

COMMENT ON TABLE public.capability_availability_history IS
  'INTERNAL. Append-only capability-availability state ledger, one row per '
  'version — the referent of the resolver''s TOCTOU provenance pins. Rows '
  'are written ONLY by the capability_availability AFTER INSERT OR UPDATE '
  'trigger (SECURITY DEFINER; karar_app holds no INSERT) and are immutable '
  'even for the table owner. Lifecycle: 0076 header + DATA_LIFECYCLE.md.';

-- Reads for resolution; INSERT/UPDATE for the operator use case. No DELETE:
-- a capability is withdrawn by setting DISABLED, never by removing the row.
GRANT SELECT, INSERT, UPDATE ON public.capability_availability TO karar_app;
-- History: read-only for the application; rows arrive via the trigger only.
GRANT SELECT ON public.capability_availability_history TO karar_app;

-- Guard: identity columns immutable, version must increment by exactly one
-- per UPDATE (optimistic concurrency stays honest), updated_at maintained
-- here, DELETE raises even for the table owner.
CREATE FUNCTION public.capability_availability_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'capability_availability rows are the exposure record: DELETE is not permitted, even for the table owner (withdraw by setting state DISABLED)'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.environment      IS DISTINCT FROM OLD.environment
    OR NEW.jurisdiction_ref IS DISTINCT FROM OLD.jurisdiction_ref
    OR NEW.capability_id    IS DISTINCT FROM OLD.capability_id
    OR NEW.created_at       IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'capability_availability % identity is immutable; a different scope is a new row',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'capability_availability % updates must increment version by exactly one (got % after %)',
      OLD.id, NEW.version, OLD.version USING ERRCODE = 'raise_exception';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER capability_availability_guard
  BEFORE UPDATE OR DELETE ON public.capability_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.capability_availability_guard();

CREATE FUNCTION public.capability_availability_no_truncate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'capability_availability rows are the exposure record: TRUNCATE is not permitted, even for the table owner'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER capability_availability_no_truncate
  BEFORE TRUNCATE ON public.capability_availability
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.capability_availability_no_truncate();

-- Ledger append on EVERY state (INSERT and UPDATE): SECURITY DEFINER so the
-- row is written with the owner's privilege — karar_app deliberately holds
-- no INSERT on the history table, making the trigger the ONLY writer.
-- search_path pinned (definer hygiene). gen_random_uuid() is core since
-- PostgreSQL 13.
CREATE FUNCTION public.capability_availability_append_history() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.capability_availability_history
    (id, availability_id, environment, jurisdiction_ref, capability_id,
     state, reason, actor_ref, version)
  VALUES
    (gen_random_uuid(), NEW.id, NEW.environment, NEW.jurisdiction_ref,
     NEW.capability_id, NEW.state, NEW.reason, NEW.actor_ref, NEW.version);
  RETURN NULL;
END;
$$;

CREATE TRIGGER capability_availability_append_history
  AFTER INSERT OR UPDATE ON public.capability_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.capability_availability_append_history();

-- History immutability: mechanism two (mechanism one is the absent grants).
CREATE FUNCTION public.capability_availability_history_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'capability_availability_history is append-only: % is not permitted, even for the table owner (data-model.md §10)',
    TG_OP USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER capability_availability_history_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.capability_availability_history
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.capability_availability_history_immutable();

-- No seed rows, deliberately: deny-by-default means the ground state is the
-- ABSENCE of rows — every capability in every environment and jurisdiction
-- is DISABLED until a reviewed, audited operator act says otherwise.
