-- 0043_tenant_invitations
--
-- public.tenant_invitations — secure membership invitations (tenancy module;
-- modules/tenancy/MODULE.md). The legacy's version of this table held a
-- bearer invite code WITH NO RLS AT ALL (ADR-0022 evidence); this one is born
-- ENABLE + FORCE with tenant-scoped policies, and the narrow redemption
-- policies follow in 0044.
--
-- TOKEN DISCIPLINE: the invitation token is 32 random bytes, shown ONCE to
-- the creator at issue time. Only sha256(token) is stored (token_hash,
-- UNIQUE); the raw token never reaches the database, logs, or events. A
-- database read yields nothing redeemable.
--
-- EMAIL AT REST, the decision recorded: redemption must match the invited
-- email against the authenticated redeemer, so a one-way digest alone cannot
-- carry the product need (the creator also needs to SEE whom they invited,
-- and a digest cannot render). Phase 3 minimal: the NORMALIZED email (trim +
-- lowercase) is stored as plain text, classified CONFIDENTIAL, lifecycle
-- declared below — revisited when column-level encryption machinery arrives
-- (data-model.md §9; deterministic-match columns need their own design).
--
-- Redemption misuse is attempt-capped: attempts counts failed redemption
-- checks (wrong account email, expired probe); at max_attempts the
-- invitation is dead. One-time redemption is enforced by the conditional
-- UPDATE ... WHERE redeemed_at IS NULL ... RETURNING — a lost race returns
-- zero rows, never a second membership.
--
-- Policy shape (per command):
--   SELECT: tenant scope — creators/admins list their tenant's invitations.
--   INSERT: tenant scope AND created_by = app.user_id — an invitation is
--           created by the authenticated principal inside their own tenant
--           (Layer 1 checks tenancy.invitation.create above this).
--   UPDATE: tenant scope — revocation and redemption bookkeeping in-tenant.
--   DELETE: no policy, no grant — revocation is an UPDATE (revoked_at); the
--           row is the evidence an invitation existed.
-- 0044 adds the token-scoped SELECT/UPDATE policies for the redeemer, who is
-- authenticated but NOT yet a member (the RLS-04 lesson).
--
-- Data lifecycle (ADR-0026; canonical in modules/tenancy/MODULE.md, mirrored
-- in packages/platform/db/DATA_LIFECYCLE.md): SUBJECT_DERIVED / secure
-- membership invitation and its redemption evidence / CONFIDENTIAL /
-- retention per PolicyPack (Phase 3.5; interim policy-configuration
-- placeholder 13 months from terminal state) / excluded (operational security
-- record holding a third party's email; the export coverage note names it) /
-- CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE
-- public.tenant_invitations — destroying invitation and redemption evidence.

CREATE TABLE public.tenant_invitations (
  id           uuid        PRIMARY KEY,
  tenant_id    uuid        NOT NULL
    CONSTRAINT tenant_invitations_tenant_id_fkey REFERENCES public.tenants (id),
  email        text        NOT NULL,  -- normalized (trim+lowercase); CONFIDENTIAL
  token_hash   text        NOT NULL
    CONSTRAINT tenant_invitations_token_hash_unique UNIQUE,  -- sha256 hex; raw token never at rest
  role_hint    text        NOT NULL DEFAULT 'MEMBER',
  expires_at   timestamptz NOT NULL,
  redeemed_at  timestamptz     NULL,
  redeemed_by  uuid            NULL,  -- identity_accounts.id of the redeemer
  revoked_at   timestamptz     NULL,
  attempts     integer     NOT NULL DEFAULT 0
    CONSTRAINT tenant_invitations_attempts_check CHECK (attempts >= 0),
  max_attempts integer     NOT NULL DEFAULT 5
    CONSTRAINT tenant_invitations_max_attempts_check CHECK (max_attempts > 0),
  created_by   uuid        NOT NULL,  -- identity_accounts.id of the creator
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tenant_invitations_tenant_idx
  ON public.tenant_invitations (tenant_id, created_at);

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_invitations_tenant_select ON public.tenant_invitations
  FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_invitations_tenant_insert ON public.tenant_invitations
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND created_by = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

CREATE POLICY tenant_invitations_tenant_update ON public.tenant_invitations
  FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- No DELETE: revocation is an UPDATE (revoked_at), preserving evidence.
GRANT SELECT, INSERT, UPDATE ON public.tenant_invitations TO karar_app;
