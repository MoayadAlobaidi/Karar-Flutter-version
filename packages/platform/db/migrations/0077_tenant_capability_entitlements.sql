-- 0077_tenant_capability_entitlements
--
-- public.tenant_capability_entitlements +
-- public.tenant_capability_entitlement_history — the PER-TENANT entitlement
-- dimension of capability resolution (capability-registry.md §4 gate 6;
-- modules/capability/MODULE.md). One CURRENT row per (tenant, capability):
-- status, an opaque source reference, effective dates, version, reason, and
-- actor provenance.
--
-- A MISSING row means ENTITLEMENT_MISSING — deny by default, the exact
-- inversion of the legacy's enforce-entitlements flag that defaulted to off
-- ("the paid-feature boundary is currently not a control", API-13). This is
-- what makes Scenario C structurally safe: a tenant does not have a
-- capability switched OFF — it was never on, because no row was ever
-- created.
--
-- RESTRICT-ONLY placement: an entitlement can satisfy its own gate and
-- nothing else. The descriptor, environment, jurisdiction/pack, and
-- availability gates run FIRST in the resolver's merge, so a row here can
-- never make unbuilt, undeployed, uncleared, or disabled code reachable
-- (property-harness-asserted over generated configurations).
--
-- source_ref is the PORT SEAM for where a grant came from: an opaque typed
-- reference ('operator:<ref>' today). A future subscription module (Phase
-- 10) becomes a source by minting its own references — there is deliberately
-- NO subscription, plan, or pricing logic in this phase, and no such columns
-- exist here.
--
-- capability_id is CLOSED at the database (CHECK), mirroring the
-- compile-time union in packages/capability-registry, and the write use case
-- validates against the production registry besides — a synthetic test id
-- can never reach a row.
--
-- Status vocabulary (CHECK): ACTIVE, REVOKED, EXPIRED. Resolution derives
-- lapse from the effective window regardless of stored status (an ACTIVE row
-- past effective_to resolves ENTITLEMENT_EXPIRED); REVOKED requires a
-- recorded end. effective_to >= effective_from permits the empty window a
-- revocation of a not-yet-started grant leaves behind.
--
-- Concurrency and history, DB-enforced (the kill-switch pattern, 0053):
-- version must increment by exactly one per UPDATE (guard trigger; the
-- application does optimistic UPDATE ... WHERE version = expected), identity
-- columns are immutable, DELETE/TRUNCATE raise even for the table owner
-- (withdrawal is REVOKED status, keeping accountability), and an AFTER
-- INSERT OR UPDATE trigger appends every state to the history ledger as
-- SECURITY DEFINER — karar_app holds NO INSERT on the history table. UNIQUE
-- (entitlement_id, version) forbids skipped or forked history. Why a
-- trigger ledger AND @karar/audit: same reasoning as 0076 — audit rows are
-- application-written guarded summaries; the ledger is unskippable by any
-- SQL path and is the exact referent of the resolver's TOCTOU entitlement
-- version pins. Audit alone is insufficient; both exist.
--
-- RLS decisions, per table:
--   tenant_capability_entitlements — TENANT-SCOPED: RLS ENABLED and FORCEd,
--     policy keyed on app.tenant_id (transaction-local GUC bound by the
--     platform's withPrincipalContext from the caller's own membership or —
--     for operator grants — the authorized target tenant; never from client
--     input, tenancy.md §2). The entitlement is a TENANT-level fact with no
--     user column, so the policy deliberately keys on the tenant GUC alone:
--     any principal bound to the tenant may read its entitlements; writes
--     are additionally gated on capability.entitlement.manage
--     (declared-but-unseeded this phase: absence denies) in the use case.
--     A session without a principal context sees nothing: NULLIF makes an
--     unset GUC a NULL predicate, which fails closed.
--   tenant_capability_entitlement_history — TENANT-SCOPED, same policy
--     shape, split into SELECT (tenant members may see their own ledger)
--     and INSERT (the WITH CHECK arm the SECURITY DEFINER append trigger
--     writes under — FORCE applies to the owner too, and the bound tenant
--     GUC must match the appended row). No UPDATE or DELETE policy exists:
--     under FORCEd RLS that alone denies both, before grants and the
--     immutability trigger deny them again.
--
-- Data lifecycle (ADR-0026; canonical in modules/capability/MODULE.md,
-- mirrored in DATA_LIFECYCLE.md):
--   public.tenant_capability_entitlements
--     Subject relationship: NON_PERSONAL — a fact about a tenant
--       organisation's contracted capability set; actor_ref is an operator
--       reference, not subject data.
--     Purpose: deny-by-default per-tenant capability entitlement with
--       source seam, effective window, and accountability.
--     Classification: INTERNAL.
--     Retention: life of the tenant relationship plus the PolicyPack's
--       post-termination period (Phase 3.5+), never a code constant.
--     Export treatment: n/a — no subject owns a tenant entitlement.
--     Erasure strategy: RETAIN_WITH_BASIS — the basis is access
--       accountability: the row (with its ledger) explains why the platform
--       ever answered AVAILABLE for this tenant.
--   public.tenant_capability_entitlement_history
--     Subject relationship: NON_PERSONAL — same content, append-only copies.
--     Purpose: the ledger behind every entitlement decision ever resolved,
--       in order, with actor, reason, source, and version (the TOCTOU pins'
--       referent).
--     Classification: INTERNAL.
--     Retention: entitlement history explains every past resolution;
--       PolicyPack owns any bound (Phase 3.5+).
--     Export treatment: n/a.
--     Erasure strategy: RETAIN_WITH_BASIS — same accountability basis.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP the triggers, functions,
-- and policies, then DROP TABLE public.tenant_capability_entitlement_history
-- and public.tenant_capability_entitlements — after which every capability
-- resolves ENTITLEMENT_MISSING for every tenant (the deny-by-default safe
-- direction), while destroying the entitlement accountability record, which
-- is why it would still need review.

CREATE TABLE public.tenant_capability_entitlements (
  id             uuid        PRIMARY KEY,
  -- Cross-module reference (raw UUID, no FK across module boundaries —
  -- data-model.md §2): tenant_id -> tenancy.tenants.
  tenant_id      uuid        NOT NULL,
  capability_id  text        NOT NULL
    CONSTRAINT tenant_capability_entitlements_capability_id_check
    CHECK (capability_id IN
      ('TRANSACTIONS', 'BUDGETS', 'GOALS', 'INSIGHTS', 'AI_ADVISOR', 'ZAKAT', 'AMANAT')),
  status         text        NOT NULL
    CONSTRAINT tenant_capability_entitlements_status_check
    CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  source_ref     text        NOT NULL
    CONSTRAINT tenant_capability_entitlements_source_ref_check CHECK (source_ref <> ''),
  reason         text        NOT NULL
    CONSTRAINT tenant_capability_entitlements_reason_check CHECK (reason <> ''),
  actor_ref      text        NOT NULL
    CONSTRAINT tenant_capability_entitlements_actor_ref_check CHECK (actor_ref <> ''),
  effective_from timestamptz NOT NULL,
  effective_to   timestamptz     NULL,
  version        integer     NOT NULL DEFAULT 1
    CONSTRAINT tenant_capability_entitlements_version_check CHECK (version >= 1),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL,
  CONSTRAINT tenant_capability_entitlements_window_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
  -- A revocation records when the entitlement ended.
  CONSTRAINT tenant_capability_entitlements_revoked_end_check
    CHECK (status <> 'REVOKED' OR effective_to IS NOT NULL),
  CONSTRAINT tenant_capability_entitlements_tenant_capability_key
    UNIQUE (tenant_id, capability_id)
);

COMMENT ON TABLE public.tenant_capability_entitlements IS
  'INTERNAL. Per-tenant capability entitlements — deny by default (a missing '
  'row is ENTITLEMENT_MISSING) and restrict-only (an entitlement can never '
  'override the descriptor, environment, jurisdiction, or availability '
  'gates). source_ref is the opaque seam a future subscription module fills; '
  'no plan or pricing logic exists here. RLS FORCEd on the tenant principal '
  'GUC. Version-incrementing updates auto-append the history ledger. Writes '
  'only via the permission-gated operator use cases '
  '(capability.entitlement.manage). Lifecycle: 0077 header + '
  'DATA_LIFECYCLE.md.';

ALTER TABLE public.tenant_capability_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_capability_entitlements FORCE ROW LEVEL SECURITY;

-- Tenant-scoped rows: visible and writable only inside a transaction bound
-- to the row's tenant (GUC set by withPrincipalContext, never from client
-- input). Unset GUCs fail closed via NULLIF.
CREATE POLICY tenant_capability_entitlements_tenant
  ON public.tenant_capability_entitlements
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE public.tenant_capability_entitlement_history (
  id             uuid        PRIMARY KEY,
  entitlement_id uuid        NOT NULL
    CONSTRAINT tenant_capability_entitlement_history_entitlement_id_fkey
    REFERENCES public.tenant_capability_entitlements (id),
  tenant_id      uuid        NOT NULL,
  capability_id  text        NOT NULL,
  status         text        NOT NULL,
  source_ref     text        NOT NULL,
  reason         text        NOT NULL,
  actor_ref      text        NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to   timestamptz     NULL,
  version        integer     NOT NULL
    CONSTRAINT tenant_capability_entitlement_history_version_check CHECK (version >= 1),
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  -- One ledger row per (entitlement, version): history cannot skip or fork.
  CONSTRAINT tenant_capability_entitlement_history_row_version_key
    UNIQUE (entitlement_id, version)
);

COMMENT ON TABLE public.tenant_capability_entitlement_history IS
  'INTERNAL. Append-only tenant-entitlement state ledger, one row per '
  'version — the referent of the resolver''s TOCTOU entitlement pins. Rows '
  'are written ONLY by the tenant_capability_entitlements AFTER INSERT OR '
  'UPDATE trigger (SECURITY DEFINER; karar_app holds no INSERT) and are '
  'immutable even for the table owner. RLS FORCEd on the tenant principal '
  'GUC. Lifecycle: 0077 header + DATA_LIFECYCLE.md.';

ALTER TABLE public.tenant_capability_entitlement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_capability_entitlement_history FORCE ROW LEVEL SECURITY;

-- Ledger reads stay tenant-confined; the INSERT arm is what the SECURITY
-- DEFINER append trigger writes under (FORCE applies to the owner too).
-- No UPDATE/DELETE policy exists — under FORCEd RLS that alone denies both.
CREATE POLICY tenant_capability_entitlement_history_select
  ON public.tenant_capability_entitlement_history
  FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_capability_entitlement_history_insert
  ON public.tenant_capability_entitlement_history
  FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Reads for resolution; INSERT/UPDATE for the operator use cases. No
-- DELETE: withdrawal is the REVOKED status, never an absent row.
GRANT SELECT, INSERT, UPDATE ON public.tenant_capability_entitlements TO karar_app;
-- History: read-only for the application; rows arrive via the trigger only.
GRANT SELECT ON public.tenant_capability_entitlement_history TO karar_app;

-- Guard: identity columns immutable, version must increment by exactly one
-- per UPDATE, updated_at maintained here, DELETE raises even for the owner.
CREATE FUNCTION public.tenant_capability_entitlements_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'tenant_capability_entitlements rows are the entitlement record: DELETE is not permitted, even for the table owner (withdraw by REVOKED status)'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id     IS DISTINCT FROM OLD.tenant_id
    OR NEW.capability_id IS DISTINCT FROM OLD.capability_id
    OR NEW.created_at    IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'tenant_capability_entitlement % identity is immutable; a different (tenant, capability) is a new row',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'tenant_capability_entitlement % updates must increment version by exactly one (got % after %)',
      OLD.id, NEW.version, OLD.version USING ERRCODE = 'raise_exception';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenant_capability_entitlements_guard
  BEFORE UPDATE OR DELETE ON public.tenant_capability_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.tenant_capability_entitlements_guard();

CREATE FUNCTION public.tenant_capability_entitlements_no_truncate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tenant_capability_entitlements rows are the entitlement record: TRUNCATE is not permitted, even for the table owner'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER tenant_capability_entitlements_no_truncate
  BEFORE TRUNCATE ON public.tenant_capability_entitlements
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.tenant_capability_entitlements_no_truncate();

-- Ledger append on EVERY state (INSERT and UPDATE): SECURITY DEFINER so the
-- row is written with the owner's privilege — karar_app deliberately holds
-- no INSERT on the history table. The insert runs under the same
-- transaction-local tenant GUC as the triggering statement, which the
-- history INSERT policy's WITH CHECK arm re-verifies (FORCE applies to the
-- owner too). search_path pinned (definer hygiene).
CREATE FUNCTION public.tenant_capability_entitlements_append_history() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.tenant_capability_entitlement_history
    (id, entitlement_id, tenant_id, capability_id, status, source_ref,
     reason, actor_ref, effective_from, effective_to, version)
  VALUES
    (gen_random_uuid(), NEW.id, NEW.tenant_id, NEW.capability_id, NEW.status,
     NEW.source_ref, NEW.reason, NEW.actor_ref, NEW.effective_from,
     NEW.effective_to, NEW.version);
  RETURN NULL;
END;
$$;

CREATE TRIGGER tenant_capability_entitlements_append_history
  AFTER INSERT OR UPDATE ON public.tenant_capability_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.tenant_capability_entitlements_append_history();

-- History immutability: mechanism two (mechanism one is the absent grants
-- and the absent UPDATE/DELETE policies under FORCEd RLS).
CREATE FUNCTION public.tenant_capability_entitlement_history_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tenant_capability_entitlement_history is append-only: % is not permitted, even for the table owner (data-model.md §10)',
    TG_OP USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER tenant_capability_entitlement_history_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tenant_capability_entitlement_history
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.tenant_capability_entitlement_history_immutable();

-- No seed rows, deliberately: deny-by-default means the ground state is the
-- ABSENCE of entitlements — no tenant reaches any capability until a
-- reviewed, audited grant says otherwise.
