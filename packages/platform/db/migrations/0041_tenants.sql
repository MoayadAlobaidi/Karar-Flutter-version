-- 0041_tenants
--
-- public.tenants — the tenant registry (tenancy module;
-- modules/tenancy/MODULE.md; tenancy.md §5). type distinguishes the three
-- tenant kinds; the controller/processor inversion of a WHITE_LABEL tenant is
-- configuration on the operating-entity side, never code.
--
-- THE GLOBAL-TABLE DECISION, recorded: a tenants row is cross-tenant
-- metadata — the one table whose rows do not belong to a tenant but ARE the
-- tenants. Three options existed:
--   (a) no RLS + allow-list entry (packages/platform/db/rls-allow-list.json);
--   (b) a membership-subquery read policy;
--   (c) ENABLE + FORCE with a self-row policy: a principal sees exactly the
--       row whose id equals its own bound app.tenant_id.
-- Phase 3 ships (c) as the simplest SOUND shape: no allow-list hole, no
-- recursive policy surface, and the visibility every Phase 3 read path needs
-- ("my tenant"). Platform-admin cross-tenant reads arrive with the control
-- plane (Phase 8) through projections and their own audited elevation
-- (tenancy.md §7) — NOT by widening this policy.
--
-- No INSERT/UPDATE/DELETE policies and no write grants for karar_app:
-- tenant provisioning is a control-plane operation, not a runtime request
-- path. Local development and tests seed tenants as the compose bootstrap
-- superuser (which bypasses RLS by being a superuser — a role that never
-- serves runtime traffic and exists only locally; production provisioning
-- lands with the control plane).
--
-- FORCE matters here specifically: karar_migrator OWNS this table, and
-- without FORCE the owner would silently bypass the policy — the legacy's
-- RLS-02 shape. The adversarial suite probes exactly that.
--
-- Data lifecycle (ADR-0026; canonical in modules/tenancy/MODULE.md, mirrored
-- in packages/platform/db/DATA_LIFECYCLE.md): NON_PERSONAL / tenant registry
-- and contractual record / INTERNAL / retained for the life of the contract
-- plus the PolicyPack's post-termination period (Phase 3.5; interim
-- policy-configuration placeholder 6 years) / n/a (no subject) /
-- RETAIN_WITH_BASIS.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE public.tenants (after
-- dropping the 0042/0043 tables that reference it) — destroying the tenant
-- registry, which is a contractual record.

CREATE TABLE public.tenants (
  id                          uuid        PRIMARY KEY,
  type                        text        NOT NULL
    CONSTRAINT tenants_type_check
    CHECK (type IN ('FIRST_PARTY', 'WHITE_LABEL', 'INTERNAL')),
  name                        text        NOT NULL,
  status                      text        NOT NULL DEFAULT 'ACTIVE'
    CONSTRAINT tenants_status_check
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  default_operating_entity_id uuid            NULL,  -- raw cross-module reference (operating-entity module)
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

-- A principal sees only its own tenant: the row's id must equal the
-- transaction-bound app.tenant_id (which is resolved from the caller's own
-- membership/session record, never from client input — tenancy.md §6).
CREATE POLICY tenants_own_row_select ON public.tenants
  FOR SELECT
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT ON public.tenants TO karar_app;
