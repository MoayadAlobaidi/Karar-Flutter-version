-- 0062_data_protection_role_assignments
--
-- The data-protection role is PER RELATIONSHIP, not per entity (ADR-0024;
-- operating-entity.md §3): the same entity is controller for its own
-- customers and processor for a partner bank's. Storing one role on the
-- entity would force a second entity record to express a second relationship
-- — so the role lives here, scoped by (entity, tenant, purpose,
-- jurisdiction) with an effective window.
--
-- Rows are STORED LEGAL DECISIONS, not software conclusions: someone decided,
-- against a contract (contract_reference), that for this relationship this
-- entity acts as CONTROLLER / JOINT_CONTROLLER / PROCESSOR. The software
-- records and resolves the decision; it never derives one. Hence created_by
-- NOT NULL, and hence the guard trigger: an assignment is corrected by
-- ENDING it (setting effective_to, once) and inserting a successor — never
-- by editing the decision in place, and never by deleting it.
--
-- tenant_id NULL means the entity's own direct-consumer relationship (no
-- partner tenant in between). The white-label inversion (bank = CONTROLLER,
-- Karar = PROCESSOR) is rows in this table — configuration, not code.
--
-- RLS decision — ALLOW-LISTED (rls-allow-list.json): relationship-scoped
-- legal decisions ABOUT tenants, owned by the platform operator — not
-- tenant-owned domain rows. A tenant-keyed policy would deny the platform
-- the resolution query this table exists for (who is controller for tenant T
-- in jurisdiction J at time t), and rows with tenant_id NULL have no tenant
-- predicate at all. Compensating controls as 0060: platform-operator-only
-- writes via the authorization port, minimal grants (no DELETE), guard
-- trigger, purpose-built resolution reads.
--
-- Data lifecycle (ADR-0026; canonical in modules/operating-entity/MODULE.md,
-- mirrored in DATA_LIFECYCLE.md):
--   Subject relationship: NON_PERSONAL — relationships between legal persons
--     and tenants; created_by is an operator reference, not subject data.
--   Purpose:              record who answers a data-subject request, who
--     notifies a breach, whose privacy notice applies — per relationship.
--   Classification:       INTERNAL.
--   Retention:            RETAIN_WITH_BASIS — controllership history is what
--     makes past disclosures explainable; PolicyPack owns any bound (3.5).
--   Export treatment:     n/a — no subject owns a role assignment.
--   Erasure strategy:     RETAIN_WITH_BASIS.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TRIGGER + DROP FUNCTION +
-- DROP TABLE public.data_protection_role_assignments; — destroying the
-- record of who was legally responsible when, which is why it would need
-- legal review, not an engineering decision.

CREATE TABLE public.data_protection_role_assignments (
  id                  uuid        PRIMARY KEY,
  operating_entity_id uuid        NOT NULL REFERENCES public.operating_entities (id),
  -- NULL = the entity's own direct-consumer relationship. Cross-module
  -- reference to the tenancy module's tenants table (raw UUID, no FK across
  -- module boundaries — data-model.md §2).
  tenant_id           uuid            NULL,
  purpose_ref         text        NOT NULL CHECK (purpose_ref <> ''),
  jurisdiction_ref    text        NOT NULL CHECK (jurisdiction_ref <> ''),
  role                text        NOT NULL
    CHECK (role IN ('CONTROLLER', 'JOINT_CONTROLLER', 'PROCESSOR')),
  effective_from      timestamptz NOT NULL,
  effective_to        timestamptz     NULL,
  -- The contract (DPA, white-label agreement) this decision rests on. NULL
  -- only for an entity's own direct relationship, where the legal document
  -- set itself is the basis.
  contract_reference  text            NULL,
  created_by          text        NOT NULL CHECK (created_by <> ''),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

COMMENT ON TABLE public.data_protection_role_assignments IS
  'Relationship-scoped data-protection roles (ADR-0024): stored legal '
  'decisions, never software conclusions. Corrected by ending + inserting, '
  'never by editing in place.';

CREATE INDEX data_protection_role_assignments_resolution_idx
  ON public.data_protection_role_assignments
    (operating_entity_id, jurisdiction_ref, purpose_ref, effective_from);
-- Full (not partial) index: the Prisma mapping must express every index
-- exactly, and partial indexes are outside its schema language — the drift
-- gate (make prisma-drift) stays meaningful this way.
CREATE INDEX data_protection_role_assignments_tenant_idx
  ON public.data_protection_role_assignments (tenant_id);

-- Guard: the only permitted UPDATE is ending an open assignment — setting
-- effective_to from NULL, leaving every other column exactly as decided.
-- DELETE and TRUNCATE raise even for the table owner (same two-mechanism
-- reasoning as audit: data-model.md §10).
CREATE FUNCTION public.data_protection_role_assignments_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'data_protection_role_assignments rows are legal decisions: % is not permitted, even for the table owner (ADR-0024)',
      TG_OP USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'data_protection_role_assignment % is ended and immutable; record a successor assignment instead (ADR-0024)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id                  IS DISTINCT FROM OLD.id
    OR NEW.operating_entity_id IS DISTINCT FROM OLD.operating_entity_id
    OR NEW.tenant_id           IS DISTINCT FROM OLD.tenant_id
    OR NEW.purpose_ref         IS DISTINCT FROM OLD.purpose_ref
    OR NEW.jurisdiction_ref    IS DISTINCT FROM OLD.jurisdiction_ref
    OR NEW.role                IS DISTINCT FROM OLD.role
    OR NEW.effective_from      IS DISTINCT FROM OLD.effective_from
    OR NEW.contract_reference  IS DISTINCT FROM OLD.contract_reference
    OR NEW.created_by          IS DISTINCT FROM OLD.created_by
    OR NEW.created_at          IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'data_protection_role_assignment % may only be ended (effective_to), never edited; record a successor assignment (ADR-0024)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.effective_to IS NULL THEN
    RAISE EXCEPTION 'ending data_protection_role_assignment % requires a non-null effective_to',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER data_protection_role_assignments_guard
  BEFORE UPDATE OR DELETE ON public.data_protection_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.data_protection_role_assignments_guard();

CREATE FUNCTION public.data_protection_role_assignments_no_truncate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'data_protection_role_assignments rows are legal decisions: TRUNCATE is not permitted, even for the table owner (ADR-0024)'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER data_protection_role_assignments_no_truncate
  BEFORE TRUNCATE ON public.data_protection_role_assignments
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.data_protection_role_assignments_no_truncate();

-- Minimal DML (README.md): no DELETE — enforced twice, by absent grant and
-- by trigger.
GRANT SELECT, INSERT, UPDATE ON public.data_protection_role_assignments TO karar_app;
