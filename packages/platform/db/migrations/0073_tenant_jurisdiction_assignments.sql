-- 0073_tenant_jurisdiction_assignments
--
-- Which legal regime a TENANT operates under, as explicit effective-dated
-- history — the organizational counterpart of 0072. Same source and
-- verification axes with the same structural constraints (an organization's
-- self-declared regime is exactly as unverified as a person's), same
-- forward-binding discipline: end and supersede, never edit.
--
-- RLS decision — TENANT-SCOPED: ENABLE + FORCE, policy keyed on the
-- app.tenant_id principal GUC (bound transaction-locally by
-- withPrincipalContext, never from client input). A tenant reads and writes
-- only its own regime history; there is no cross-tenant path and no
-- platform-wide enumeration through this table. A session without a tenant
-- context sees nothing (NULLIF fails closed).
--
-- Data lifecycle (ADR-0026; canonical in modules/jurisdiction/MODULE.md,
-- mirrored in DATA_LIFECYCLE.md):
--   public.tenant_jurisdiction_assignments
--     Subject relationship: NON_PERSONAL — rows are about a tenant
--       organization's operating regime; assigned_by is an actor reference
--       recorded in an official capacity.
--     Purpose: resolve which legal regime a tenant operates under, now and
--       at any past instant, with source and verification provenance.
--     Classification: INTERNAL.
--     Retention: RETAIN_WITH_BASIS — regime history explains which rules
--       governed which period of the tenant's operation; PolicyPack owns any
--       bound (Phase 3.5), never a code constant.
--     Export treatment: n/a — no subject owns a tenant regime row.
--     Erasure strategy: RETAIN_WITH_BASIS.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP POLICY, DROP TRIGGER/
-- FUNCTION pairs, DROP TABLE public.tenant_jurisdiction_assignments —
-- destroying the tenant regime history capability resolution depends on.

CREATE TABLE public.tenant_jurisdiction_assignments (
  id                  uuid        PRIMARY KEY,
  -- Cross-module reference (raw UUID, no FK across module boundaries —
  -- data-model.md §2): tenant_id -> tenancy.tenants.
  tenant_id           uuid        NOT NULL,
  jurisdiction_code   text        NOT NULL REFERENCES public.jurisdictions (code),
  source              text        NOT NULL
    CHECK (source IN ('USER_DECLARED', 'PROVIDER_VERIFIED', 'OPERATOR_ASSIGNED', 'CONTRACT_DERIVED')),
  verification_status text        NOT NULL
    CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED')),
  effective_from      timestamptz NOT NULL,
  effective_to        timestamptz     NULL,
  reason              text        NOT NULL CHECK (reason <> ''),
  assigned_by         text        NOT NULL CHECK (assigned_by <> ''),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (source <> 'USER_DECLARED' OR verification_status = 'UNVERIFIED'),
  CHECK (source <> 'PROVIDER_VERIFIED' OR verification_status = 'VERIFIED')
);

COMMENT ON TABLE public.tenant_jurisdiction_assignments IS
  'Effective-dated tenant-to-jurisdiction assignment history (Phase 3.5). '
  'Same source/verification axes as 0072. Forward-binding: rows are ended '
  'and superseded, never edited. RLS FORCEd on the tenant principal GUC.';

CREATE INDEX tenant_jurisdiction_assignments_tenant_idx
  ON public.tenant_jurisdiction_assignments (tenant_id, effective_from);
CREATE INDEX tenant_jurisdiction_assignments_jurisdiction_idx
  ON public.tenant_jurisdiction_assignments (jurisdiction_code);

ALTER TABLE public.tenant_jurisdiction_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_jurisdiction_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_jurisdiction_assignments_tenant ON public.tenant_jurisdiction_assignments
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE FUNCTION public.tenant_jurisdiction_assignments_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'tenant_jurisdiction_assignments rows are assignment history: DELETE is not permitted, even for the table owner'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_jurisdiction_assignment % is ended and immutable; insert a successor assignment instead',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id                  IS DISTINCT FROM OLD.id
    OR NEW.tenant_id           IS DISTINCT FROM OLD.tenant_id
    OR NEW.jurisdiction_code   IS DISTINCT FROM OLD.jurisdiction_code
    OR NEW.source              IS DISTINCT FROM OLD.source
    OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
    OR NEW.effective_from      IS DISTINCT FROM OLD.effective_from
    OR NEW.reason              IS DISTINCT FROM OLD.reason
    OR NEW.assigned_by         IS DISTINCT FROM OLD.assigned_by
    OR NEW.created_at          IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'tenant_jurisdiction_assignment % may only be ended (effective_to), never edited',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.effective_to IS NULL THEN
    RAISE EXCEPTION 'ending tenant_jurisdiction_assignment % requires a non-null effective_to',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenant_jurisdiction_assignments_guard
  BEFORE UPDATE OR DELETE ON public.tenant_jurisdiction_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.tenant_jurisdiction_assignments_guard();

CREATE FUNCTION public.tenant_jurisdiction_assignments_no_truncate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tenant_jurisdiction_assignments rows are assignment history: TRUNCATE is not permitted, even for the table owner'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER tenant_jurisdiction_assignments_no_truncate
  BEFORE TRUNCATE ON public.tenant_jurisdiction_assignments
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.tenant_jurisdiction_assignments_no_truncate();

-- Minimal DML (README.md): no DELETE — absent grant first, trigger second.
GRANT SELECT, INSERT, UPDATE ON public.tenant_jurisdiction_assignments TO karar_app;
