-- 0072_user_jurisdiction_assignments
--
-- Which legal regime governs a USER, as explicit effective-dated history
-- (docs/architecture/jurisdiction-policy.md; phase 3.5 objective: "explicit
-- audited jurisdiction assignments"). A row records one assignment act:
-- who was assigned which jurisdiction, from when, on what source, with what
-- verification state, by whom, and why.
--
-- Source and verification are SEPARATE axes, constrained structurally:
--   source: USER_DECLARED | PROVIDER_VERIFIED | OPERATOR_ASSIGNED |
--           CONTRACT_DERIVED
--   verification_status: UNVERIFIED | VERIFIED
-- A user-selected country NEVER automatically becomes a verified
-- jurisdiction: USER_DECLARED rows are CHECK-bound to UNVERIFIED (a later
-- provider verification is a NEW row with source PROVIDER_VERIFIED, which is
-- CHECK-bound to VERIFIED). Capabilities that require a verified
-- jurisdiction fail closed on UNVERIFIED — the module exposes the state
-- typed so the capability resolver can enforce exactly that.
--
-- FORWARD-BINDING, like operating_entity_assignments (0063): an assignment
-- change affects what happens after it. Records with legal consequence pin
-- their own jurisdiction at creation (consent_grants.jurisdiction_ref
-- already does; PolicyPack-version pinning is this phase's capability
-- workstream); this table is the assignment HISTORY those pins are explained
-- by, so rows are never edited — the only UPDATE is ending an open row
-- (effective_to, once), enforced by trigger even for the table owner.
--
-- RLS decision — SUBJECT-OWNED: ENABLE + FORCE, policy keyed on BOTH
-- principal GUCs (app.tenant_id AND app.user_id, bound transaction-locally
-- by withPrincipalContext, never from client input). A session without a
-- principal context sees nothing (NULLIF fails closed). Operator/seed-side
-- writers act by establishing the TARGET subject's principal context inside
-- the use case — there is no cross-subject read path.
--
-- Data lifecycle (ADR-0026; canonical in modules/jurisdiction/MODULE.md,
-- mirrored in DATA_LIFECYCLE.md):
--   public.user_jurisdiction_assignments
--     Subject relationship: SUBJECT_OWNED — the subject's own governing-
--       regime record, sometimes declared by the subject themselves.
--     Purpose: resolve which legal regime governs this user now and at any
--       past instant, with source and verification provenance.
--     Classification: CONFIDENTIAL — where a person falls under law is
--       personal data.
--     Retention: RETAIN_WITH_BASIS — assignment history explains which
--       regime governed which period of the subject's records; PolicyPack
--       owns the period per jurisdiction (Phase 3.5), never a code constant.
--     Export treatment: included — a subject's export names their regime
--       bindings and since when.
--     Erasure strategy: RETAIN_WITH_BASIS — user_id is an opaque cross-
--       module reference that resolves to nothing once the subject's
--       identity is erased; the binding fact survives for accountability.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP POLICY, DROP TRIGGER/
-- FUNCTION pairs, DROP TABLE public.user_jurisdiction_assignments —
-- destroying the history that explains every jurisdiction-pinned record.

CREATE TABLE public.user_jurisdiction_assignments (
  id                  uuid        PRIMARY KEY,
  -- Cross-module references (raw UUIDs, no FK across module boundaries —
  -- data-model.md §2): user_id -> identity accounts (the platform UserId),
  -- tenant_id -> tenancy.tenants.
  user_id             uuid        NOT NULL,
  tenant_id           uuid        NOT NULL,
  jurisdiction_code   text        NOT NULL REFERENCES public.jurisdictions (code),
  source              text        NOT NULL
    CHECK (source IN ('USER_DECLARED', 'PROVIDER_VERIFIED', 'OPERATOR_ASSIGNED', 'CONTRACT_DERIVED')),
  verification_status text        NOT NULL
    CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED')),
  effective_from      timestamptz NOT NULL,
  effective_to        timestamptz     NULL,
  reason              text        NOT NULL CHECK (reason <> ''),
  -- The actor or system that recorded the assignment (staff ref, 'system:…',
  -- or the subject's own principal ref for USER_DECLARED).
  assigned_by         text        NOT NULL CHECK (assigned_by <> ''),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  -- A self-declaration is never verified by itself…
  CHECK (source <> 'USER_DECLARED' OR verification_status = 'UNVERIFIED'),
  -- …and a provider verification is what VERIFIED means.
  CHECK (source <> 'PROVIDER_VERIFIED' OR verification_status = 'VERIFIED')
);

COMMENT ON TABLE public.user_jurisdiction_assignments IS
  'Effective-dated user-to-jurisdiction assignment history (Phase 3.5). '
  'Source and verification are separate axes; USER_DECLARED is structurally '
  'UNVERIFIED. Forward-binding: rows are ended and superseded, never edited. '
  'RLS FORCEd on tenant+user principal GUCs.';

CREATE INDEX user_jurisdiction_assignments_principal_idx
  ON public.user_jurisdiction_assignments (user_id, tenant_id, effective_from);
CREATE INDEX user_jurisdiction_assignments_jurisdiction_idx
  ON public.user_jurisdiction_assignments (jurisdiction_code);

ALTER TABLE public.user_jurisdiction_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_jurisdiction_assignments FORCE ROW LEVEL SECURITY;

-- Subject records: visible and writable only inside a transaction carrying
-- BOTH principal GUCs (tenancy.md §2). Unset GUCs fail closed via NULLIF.
CREATE POLICY user_jurisdiction_assignments_subject ON public.user_jurisdiction_assignments
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Assignment history discipline (0063 pattern): the only UPDATE is ending an
-- open row, exactly once; DELETE and TRUNCATE raise even for the owner.
CREATE FUNCTION public.user_jurisdiction_assignments_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'user_jurisdiction_assignments rows are assignment history: DELETE is not permitted, even for the table owner'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'user_jurisdiction_assignment % is ended and immutable; insert a successor assignment instead',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id                  IS DISTINCT FROM OLD.id
    OR NEW.user_id             IS DISTINCT FROM OLD.user_id
    OR NEW.tenant_id           IS DISTINCT FROM OLD.tenant_id
    OR NEW.jurisdiction_code   IS DISTINCT FROM OLD.jurisdiction_code
    OR NEW.source              IS DISTINCT FROM OLD.source
    OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
    OR NEW.effective_from      IS DISTINCT FROM OLD.effective_from
    OR NEW.reason              IS DISTINCT FROM OLD.reason
    OR NEW.assigned_by         IS DISTINCT FROM OLD.assigned_by
    OR NEW.created_at          IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'user_jurisdiction_assignment % may only be ended (effective_to), never edited',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.effective_to IS NULL THEN
    RAISE EXCEPTION 'ending user_jurisdiction_assignment % requires a non-null effective_to',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_jurisdiction_assignments_guard
  BEFORE UPDATE OR DELETE ON public.user_jurisdiction_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.user_jurisdiction_assignments_guard();

CREATE FUNCTION public.user_jurisdiction_assignments_no_truncate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'user_jurisdiction_assignments rows are assignment history: TRUNCATE is not permitted, even for the table owner'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER user_jurisdiction_assignments_no_truncate
  BEFORE TRUNCATE ON public.user_jurisdiction_assignments
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.user_jurisdiction_assignments_no_truncate();

-- Minimal DML (README.md): no DELETE — absent grant first, trigger second.
GRANT SELECT, INSERT, UPDATE ON public.user_jurisdiction_assignments TO karar_app;
