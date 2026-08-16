-- 0040_user_profiles
--
-- First tenant-owned domain tables (users module; modules/users/MODULE.md;
-- ADR-0022): public.user_profiles and public.user_status_history. Born with
-- tenant_id, ENABLE + FORCE ROW LEVEL SECURITY, and per-command policies —
-- RLS is THE isolation boundary (tenancy.md §2-3); every application-layer
-- filter above it is convenience.
--
-- user_profiles.user_id is the PRIMARY KEY and IS the platform UserId — the
-- identity module's identity_accounts.id (Phase 3 contract; the GUC
-- app.user_id carries it). It is a cross-module reference: raw UUID, NO
-- foreign key across the module boundary (data-model.md §2).
--
-- Deliberately minimal PII: display_name and locale are the only
-- subject-editable fields in Phase 3. residency_jurisdiction_ref is a typed
-- UNRESOLVED reference (text) — Phase 3.5's PolicyPack machinery resolves it;
-- contracting_operating_entity_id is a raw UUID reference to the operating
-- entity module. Neither is client-writable in Phase 3.
--
-- Policy shape (per command, deliberately not FOR ALL — permissive policies
-- OR together, so a broad FOR ALL policy would swallow the narrower writes):
--   SELECT: tenant scope    — the tenant boundary; finer-than-tenant read
--                             authorization is Layer 1 (PolicyService).
--   INSERT: self only       — a profile row is created by its own subject
--                             (tenant AND user_id = app.user_id).
--   UPDATE: self only       — self-write; staff status paths arrive with the
--                             control plane and their own audited elevation.
--   DELETE: no policy, no grant — erasure machinery is a later phase and
--                             runs as its own audited actor, never karar_app.
-- All predicates read GUCs via NULLIF(current_setting(name, true), ''):
-- an unset or empty GUC yields NULL, which satisfies nothing — fail closed.
--
-- user_status_history is append-only evidence of status transitions
-- (ACTIVE → DISABLE_REQUESTED → DISABLED, DELETION_REQUESTED — the
-- disable/deletion-request FOUNDATION; the machinery that acts on recorded
-- intent is a later phase). No updated_at on purpose: rows never update, and
-- karar_app holds SELECT + INSERT only.
--
-- Data lifecycle (ADR-0026; canonical in modules/users/MODULE.md, mirrored in
-- packages/platform/db/DATA_LIFECYCLE.md):
--   public.user_profiles:      SUBJECT_OWNED / profile presentation & locale /
--     CONFIDENTIAL / retention per PolicyPack (Phase 3.5; interim
--     policy-configuration placeholder: life of account) / included in export /
--     CASCADE_DELETE.
--   public.user_status_history: SUBJECT_DERIVED / account-state
--     accountability / CONFIDENTIAL / retention per PolicyPack (Phase 3.5;
--     interim placeholder 13 months after account closure, in policy
--     configuration) / excluded (integrity record; export coverage note names
--     it) / RETAIN_WITH_BASIS.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE
-- public.user_status_history; DROP TABLE public.user_profiles; — destroying
-- subject profiles and status evidence, so it would need the same review as
-- any subject-data destruction.

CREATE TABLE public.user_profiles (
  user_id                         uuid        PRIMARY KEY,  -- identity_accounts.id; IS the platform UserId
  tenant_id                       uuid        NOT NULL,     -- RLS predicate
  display_name                    text        NOT NULL,
  locale                          text        NOT NULL,
  status                          text        NOT NULL DEFAULT 'ACTIVE'
    CONSTRAINT user_profiles_status_check
    CHECK (status IN ('ACTIVE', 'DISABLE_REQUESTED', 'DISABLED', 'DELETION_REQUESTED')),
  residency_jurisdiction_ref      text            NULL,     -- typed unresolved ref; Phase 3.5 resolves
  contracting_operating_entity_id uuid            NULL,     -- raw cross-module reference
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_profiles_tenant_idx ON public.user_profiles (tenant_id);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_tenant_select ON public.user_profiles
  FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY user_profiles_self_insert ON public.user_profiles
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

CREATE POLICY user_profiles_self_update ON public.user_profiles
  FOR UPDATE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Grant convention (README.md): minimal DML, table by table. No DELETE —
-- erasure is a later phase's audited machinery, not a runtime code path.
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO karar_app;

CREATE TABLE public.user_status_history (
  id          uuid        PRIMARY KEY,
  user_id     uuid        NOT NULL,   -- subject of the transition
  tenant_id   uuid        NOT NULL,   -- RLS predicate
  from_status text        NOT NULL,
  to_status   text        NOT NULL,
  reason      text            NULL,   -- subject-supplied reason, optional
  actor       text        NOT NULL,   -- opaque actor ref (e.g. 'user:<uuid>')
  occurred_at timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_status_history_user_idx
  ON public.user_status_history (tenant_id, user_id, occurred_at);

ALTER TABLE public.user_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_status_history FORCE ROW LEVEL SECURITY;

CREATE POLICY user_status_history_tenant_select ON public.user_status_history
  FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Phase 3 status transitions are self-service only, so the write binds to the
-- authenticated principal. Staff transition paths arrive with the control
-- plane and add their own policy then — never by widening this one silently.
CREATE POLICY user_status_history_self_insert ON public.user_status_history
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Append-only by revoked grants: no UPDATE, no DELETE (data-model.md §10 spirit).
GRANT SELECT, INSERT ON public.user_status_history TO karar_app;
