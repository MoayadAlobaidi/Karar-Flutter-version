-- 0053_kill_switches
--
-- public.kill_switches + public.kill_switch_history — restrict-only
-- operational kill switches (control-plane module;
-- modules/control-plane/MODULE.md; access-control.md §3: OPERATOR is
-- restrict-only). One row per switch, seeded INACTIVE; the registry is CLOSED
-- at the database (id CHECK) and mirrored by the compile-time registry in
-- modules/control-plane/domain/kill-switch.ts — a new switch is a reviewed
-- forward migration plus the code change, never a runtime INSERT (karar_app
-- holds no INSERT here).
--
-- RESTRICT-ONLY, stated precisely: a switch can only DENY an operation.
-- INACTIVE (the seeded ground state), an expired ACTIVE_RESTRICTION, and even
-- a missing row all mean "no restriction recorded" — the operation proceeds
-- exactly as if this table did not exist. There is NO state that enables,
-- widens, or bypasses anything (the read API returns allow/deny with deny
-- reasons only; test-asserted). Distinct from that: a STORE OUTAGE on a
-- switch-guarded operation fails CLOSED — "cannot verify no restriction
-- exists" must not silently enable, so the read path answers 503
-- DEPENDENCY_UNAVAILABLE (documented and tested via a closed pool). Absence
-- of a restriction is an answer; absence of the store is not.
--
-- The four Phase 3 switches and the operations they may deny:
--   NEW_REGISTRATIONS  — identity registration
--   PASSWORD_LOGIN     — identity password login
--   SESSION_REFRESH    — identity token refresh
--   TENANT_INVITATIONS — tenancy invitation flows
--
-- Concurrency and history, DB-enforced: every UPDATE must increment version
-- by exactly one (the guard trigger raises otherwise; the application does
-- optimistic UPDATE ... WHERE version = expected), and an AFTER UPDATE
-- trigger appends the new state to kill_switch_history as a SECURITY DEFINER
-- function — karar_app holds NO INSERT on the history table, so history rows
-- can only ever come from an actual state change. The history is append-only
-- by BOTH mechanisms (grants + immutability trigger raising even for the
-- owner; data-model.md §10), like audit.
--
-- RLS decision — ALLOW-LISTED (packages/platform/db/rls-allow-list.json),
-- both tables: global operational records with no subject or tenant column
-- (scope is 'GLOBAL' by CHECK in Phase 3; per-tenant scoping would be a new
-- reviewed migration). Switch state must be readable PRE-AUTH — the switches
-- gate registration and login, which run before any principal exists — so no
-- principal-keyed policy can apply. Compensating controls: restrict-only
-- semantics (a readable row can only deny), minimal grants (kill_switches:
-- SELECT + UPDATE; history: SELECT only), the closed id registry, the
-- version/history triggers, and operate gated on
-- controlplane.killswitch.operate via the PolicyService (Layer 1) with every
-- change audited.
--
-- Data lifecycle (ADR-0026; canonical in modules/control-plane/MODULE.md,
-- mirrored in packages/platform/db/DATA_LIFECYCLE.md):
--   public.kill_switches
--     Subject relationship: NON_PERSONAL — operational state; actor is an
--       operator reference string, not subject data.
--     Purpose:              deny specific platform operations during
--       incidents, restrict-only, with reason and accountability.
--     Classification:       INTERNAL.
--     Retention:            current state lives with the platform; PolicyPack
--       owns any bound (Phase 3.5).
--     Export treatment:     n/a — no subject owns an operational switch.
--     Erasure strategy:     NON_PERSONAL_BY_DESIGN — rows hold switch state,
--       operator reference, and reason; nothing re-identifies a person.
--   public.kill_switch_history
--     Subject relationship: NON_PERSONAL — same content, append-only copies.
--     Purpose:              incident accountability — every switch state that
--       ever held, in order, with actor, reason, and version.
--     Classification:       INTERNAL.
--     Retention:            operational history explains every past denial;
--       PolicyPack owns any bound (Phase 3.5).
--     Export treatment:     n/a.
--     Erasure strategy:     RETAIN_WITH_BASIS — the basis is operational
--       accountability (why was this operation denied at time t, on whose
--       decision); rows name operator references, never subjects.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP the triggers and functions,
-- then DROP TABLE public.kill_switch_history, public.kill_switches —
-- removing the restriction mechanism entirely (operations then proceed
-- unrestricted, which is the restrict-only design's safe direction, and
-- destroying the operational history, which is why it would still need
-- review).

CREATE TABLE public.kill_switches (
  id             text        PRIMARY KEY
    -- Closed registry: a new switch is a migration, mirrored in code.
    CONSTRAINT kill_switches_id_check
    CHECK (id IN ('NEW_REGISTRATIONS', 'PASSWORD_LOGIN', 'SESSION_REFRESH', 'TENANT_INVITATIONS')),
  state          text        NOT NULL DEFAULT 'INACTIVE'
    CONSTRAINT kill_switches_state_check
    CHECK (state IN ('ACTIVE_RESTRICTION', 'INACTIVE')),
  scope          text        NOT NULL DEFAULT 'GLOBAL'
    -- Phase 3 semantics are global-only; widening scope is a reviewed
    -- migration, not a data change.
    CONSTRAINT kill_switches_scope_check
    CHECK (scope = 'GLOBAL'),
  reason         text        NOT NULL
    CONSTRAINT kill_switches_reason_check CHECK (reason <> ''),
  actor          text        NOT NULL
    CONSTRAINT kill_switches_actor_check CHECK (actor <> ''),
  version        integer     NOT NULL DEFAULT 1
    CONSTRAINT kill_switches_version_check CHECK (version >= 1),
  effective_from timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz     NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Expiry belongs to a restriction: an INACTIVE switch has nothing to expire.
  CONSTRAINT kill_switches_expiry_state_check
    CHECK (state = 'ACTIVE_RESTRICTION' OR expires_at IS NULL),
  CONSTRAINT kill_switches_expiry_window_check
    CHECK (expires_at IS NULL OR expires_at > effective_from)
);

COMMENT ON TABLE public.kill_switches IS
  'INTERNAL. Restrict-only kill switches (GLOBAL scope, closed id registry). A switch '
  'can only DENY an operation; INACTIVE/expired/missing all mean unrestricted. Readable '
  'pre-auth (allow-listed from RLS); operate is UPDATE-only, version-incrementing, '
  'history-appending, gated on controlplane.killswitch.operate. '
  'Lifecycle: 0053 header + DATA_LIFECYCLE.md.';

CREATE TABLE public.kill_switch_history (
  id             uuid        PRIMARY KEY,
  switch_id      text        NOT NULL
    CONSTRAINT kill_switch_history_switch_id_fkey REFERENCES public.kill_switches (id),
  state          text        NOT NULL
    CONSTRAINT kill_switch_history_state_check
    CHECK (state IN ('ACTIVE_RESTRICTION', 'INACTIVE')),
  scope          text        NOT NULL,
  reason         text        NOT NULL,
  actor          text        NOT NULL,
  version        integer     NOT NULL
    CONSTRAINT kill_switch_history_version_check CHECK (version >= 1),
  effective_from timestamptz NOT NULL,
  expires_at     timestamptz     NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  -- One history row per (switch, version): the ledger cannot skip or fork.
  CONSTRAINT kill_switch_history_switch_version_unique UNIQUE (switch_id, version)
);

COMMENT ON TABLE public.kill_switch_history IS
  'INTERNAL. Append-only kill-switch state ledger, one row per version. Rows are '
  'written ONLY by the kill_switches AFTER UPDATE trigger (SECURITY DEFINER; karar_app '
  'holds no INSERT) and are immutable even for the table owner. '
  'Lifecycle: 0053 header + DATA_LIFECYCLE.md.';

-- Reads happen pre-auth; operate is an UPDATE. No INSERT (registry is closed),
-- no DELETE (a switch row is the mechanism; removal is a migration).
GRANT SELECT, UPDATE ON public.kill_switches TO karar_app;
-- History: read-only for the application; rows arrive via the trigger only.
GRANT SELECT ON public.kill_switch_history TO karar_app;

-- Guard: id/scope immutable, version must increment by exactly one per
-- UPDATE (optimistic concurrency stays honest), updated_at maintained here,
-- DELETE raises even for the owner.
CREATE FUNCTION public.kill_switches_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'kill_switches rows are the restriction mechanism: DELETE is not permitted, even for the table owner (deregistering a switch is a migration)'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'kill_switch ids are immutable' USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'kill_switch % updates must increment version by exactly one (got % after %)',
      OLD.id, NEW.version, OLD.version USING ERRCODE = 'raise_exception';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER kill_switches_guard
  BEFORE UPDATE OR DELETE ON public.kill_switches
  FOR EACH ROW
  EXECUTE FUNCTION public.kill_switches_guard();

CREATE FUNCTION public.kill_switches_no_truncate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'kill_switches rows are the restriction mechanism: TRUNCATE is not permitted, even for the table owner'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER kill_switches_no_truncate
  BEFORE TRUNCATE ON public.kill_switches
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.kill_switches_no_truncate();

-- History append: SECURITY DEFINER so the ledger row is written with the
-- owner's privilege — karar_app deliberately holds no INSERT on the history
-- table, making the trigger the ONLY writer. search_path pinned (definer
-- hygiene). gen_random_uuid() is pgcrypto-free core since PostgreSQL 13.
CREATE FUNCTION public.kill_switches_append_history() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.kill_switch_history
    (id, switch_id, state, scope, reason, actor, version, effective_from, expires_at)
  VALUES
    (gen_random_uuid(), NEW.id, NEW.state, NEW.scope, NEW.reason, NEW.actor,
     NEW.version, NEW.effective_from, NEW.expires_at);
  RETURN NULL;
END;
$$;

CREATE TRIGGER kill_switches_append_history
  AFTER UPDATE ON public.kill_switches
  FOR EACH ROW
  EXECUTE FUNCTION public.kill_switches_append_history();

-- History immutability: mechanism two (mechanism one is the absent grants).
CREATE FUNCTION public.kill_switch_history_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'kill_switch_history is append-only: % is not permitted, even for the table owner (data-model.md §10)',
    TG_OP USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER kill_switch_history_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.kill_switch_history
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.kill_switch_history_immutable();

-- Seed the closed registry INACTIVE (the restrict-only ground state), and
-- open each switch's ledger at version 1. The seed rows are the one history
-- write that does not come from the trigger — recorded here, in the same
-- reviewed migration that defines the mechanism.
INSERT INTO public.kill_switches (id, state, reason, actor, version, effective_from) VALUES
  ('NEW_REGISTRATIONS',  'INACTIVE', 'seeded ground state - no restriction', 'migration:0053_kill_switches', 1, now()),
  ('PASSWORD_LOGIN',     'INACTIVE', 'seeded ground state - no restriction', 'migration:0053_kill_switches', 1, now()),
  ('SESSION_REFRESH',    'INACTIVE', 'seeded ground state - no restriction', 'migration:0053_kill_switches', 1, now()),
  ('TENANT_INVITATIONS', 'INACTIVE', 'seeded ground state - no restriction', 'migration:0053_kill_switches', 1, now());

INSERT INTO public.kill_switch_history
  (id, switch_id, state, scope, reason, actor, version, effective_from, expires_at)
SELECT gen_random_uuid(), id, state, scope, reason, actor, version, effective_from, expires_at
FROM public.kill_switches;
