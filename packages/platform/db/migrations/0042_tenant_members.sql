-- 0042_tenant_members
--
-- public.tenant_members — who belongs to a tenant (tenancy module;
-- modules/tenancy/MODULE.md). role_hint is INFORMATIONAL ONLY: authoritative
-- roles and permissions live in the authorization module's PolicyService
-- (Layer 1); nothing may authorize off role_hint. State history is carried by
-- audit events plus the state/effective columns — a decision, not an
-- omission: a separate membership-history table would duplicate what
-- audit.audit_events already records for every membership mutation.
--
-- THE AZ2 LESSON, inherited and guarded: the legacy's tenant roster has no
-- policy for its legitimate reader, so it returns EMPTY for everyone — and
-- "an empty roster is indistinguishable from correct isolation." The SELECT
-- policy below exists so that a member's own-tenant roster is NON-EMPTY, and
-- the adversarial suite asserts the non-empty case FIRST, before any
-- cross-tenant denial (tenancy.md §2 layer 4).
--
-- Policy shape (per command):
--   SELECT: tenant scope — the roster of one's own tenant. Which principals
--           may LIST it is Layer 1 (PolicyService permission
--           tenancy.member.read); RLS carries the tenant boundary.
--   INSERT: tenant scope AND user_id = app.user_id — a membership row can
--           only ever be created FOR the authenticated principal (Phase 3's
--           single creation path is invitation redemption; the database
--           enforces the redeemer binding even if application code regresses).
--   UPDATE: tenant scope — state transitions (suspend/remove) inside the
--           tenant; Layer 1 decides who.
--   DELETE: no policy, no grant — removal is a state change, never a row
--           deletion (the row is the evidence a membership existed).
--
-- Data lifecycle (ADR-0026; canonical in modules/tenancy/MODULE.md, mirrored
-- in packages/platform/db/DATA_LIFECYCLE.md): SUBJECT_OWNED / tenant
-- membership and seat state / CONFIDENTIAL / retention per PolicyPack
-- (Phase 3.5; interim policy-configuration placeholder: life of membership
-- plus 13 months) / included in export / CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE public.tenant_members
-- — destroying membership state and the seat record.

CREATE TABLE public.tenant_members (
  id             uuid        PRIMARY KEY,
  tenant_id      uuid        NOT NULL
    CONSTRAINT tenant_members_tenant_id_fkey REFERENCES public.tenants (id),
  user_id        uuid        NOT NULL,  -- identity_accounts.id; raw cross-module reference, no FK
  role_hint      text        NOT NULL DEFAULT 'MEMBER',  -- informational; PolicyService is authoritative
  state          text        NOT NULL DEFAULT 'ACTIVE'
    CONSTRAINT tenant_members_state_check
    CHECK (state IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED')),
  effective_from timestamptz NOT NULL,
  effective_to   timestamptz     NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_members_tenant_user_unique UNIQUE (tenant_id, user_id)
);

CREATE INDEX tenant_members_user_idx ON public.tenant_members (user_id);

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_members_tenant_select ON public.tenant_members
  FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_members_self_insert ON public.tenant_members
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

CREATE POLICY tenant_members_tenant_update ON public.tenant_members
  FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- No DELETE: removal is an UPDATE of state/effective_to.
GRANT SELECT, INSERT, UPDATE ON public.tenant_members TO karar_app;
