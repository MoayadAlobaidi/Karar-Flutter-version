-- 0065_consent_grants
--
-- Consent as immutable, versioned, entity-pinned evidence (ADR-0024;
-- operating-entity.md §6). Three tables:
--
--   public.consent_grants             — the subject's acceptance records
--   public.reconsent_evaluations      — reviewed re-consent decisions per
--                                       republished version (never a default)
--   public.processing_basis_references — typed basis references per
--                                       (purpose, jurisdiction)
--
-- consent_grants are IMMUTABLE HISTORICAL RECORDS. A grant is keyed for
-- RESOLUTION on the triple (operating_entity, purpose, jurisdiction) — the
-- triple is a resolution dimension, not the row's identity: the row's
-- identity is the acceptance act itself (id, who, when, which version,
-- what evidence). Consent given to Entity A is not automatically valid for
-- Entity B, which is why the entity is pinned on the row at creation and
-- never rewritten (data-model.md §5). The only permitted transitions, by
-- trigger: ACTIVE -> WITHDRAWN (sets withdrawn_at, preserves the row) and
-- ACTIVE -> SUPERSEDED (a re-grant inserts a NEW row and marks the old one).
-- Nothing else changes, nothing is deleted; re-consent is a new row.
--
-- reconsent_evaluations record the reviewed classification decision for a
-- republished version per affected purpose (ADR-0024: material /
-- notice / no-action, NO DEFAULT). affected_query_notes records how the
-- affected-subject set was determined — the query, not archaeology.
--
-- processing_basis_references: consent is ONE legal basis among several
-- (ADR-0024 "Consent is one legal basis, not the only one"). A row holds a
-- TYPED REFERENCE to the declared basis for (purpose, jurisdiction) — it
-- invents no jurisdictional conclusion; which basis a jurisdiction
-- recognises for which purpose is the PolicyPack's declaration, resolved in
-- Phase 3.5. A purpose with no declared basis fails closed.
--
-- RLS decisions, per table (rls-allow-list.json for the allow-listed ones):
--   consent_grants — SUBJECT RECORDS: RLS ENABLED and FORCEd, policy keyed
--     on BOTH app.tenant_id AND app.user_id (transaction-local GUCs set by
--     the principal context, never from client input — tenancy.md §2). A
--     session without a principal context sees nothing: NULLIF(...) makes an
--     unset GUC a NULL predicate, which fails closed.
--   reconsent_evaluations — ALLOW-LISTED: a reviewed decision about a
--     DOCUMENT VERSION, applying to every affected subject; it carries no
--     tenant/user columns by design (the affected-subject set is derived by
--     querying consent_grants — which IS RLS-protected — against the
--     version). Subjects must be able to learn why their status says
--     RECONSENT_REQUIRED. Append-only by grants and trigger.
--   processing_basis_references — ALLOW-LISTED: platform-global typed
--     reference data (no subject, no tenant); write paths platform-operator-
--     only via the authorization port; minimal grants.
--
-- Data lifecycle (ADR-0026; canonical in modules/consent/MODULE.md, mirrored
-- in DATA_LIFECYCLE.md):
--   public.consent_grants
--     Subject relationship: SUBJECT_OWNED — the subject's own consent acts.
--     Purpose: prove and resolve the consent basis per (entity, purpose,
--       jurisdiction); the evidentiary record of acceptance and withdrawal.
--     Classification: CONFIDENTIAL.
--     Retention: RETAIN_WITH_BASIS — consent evidence must outlive the
--       consent itself; PolicyPack owns the period per jurisdiction (3.5),
--       never a code constant.
--     Export treatment: included — a subject's export contains their own
--       grant and withdrawal history.
--     Erasure strategy: RETAIN_WITH_BASIS — the legal basis is defence of
--       processing already performed; user_id resolves to nothing once the
--       subject's identity is erased.
--   public.reconsent_evaluations
--     Subject relationship: NON_PERSONAL — decisions about document
--       versions; evaluated_by is a staff reference.
--     Purpose: record the reviewed material/notice/no-action decision that
--       republication legally requires (ADR-0024, legacy P12).
--     Classification: INTERNAL. Retention: RETAIN_WITH_BASIS — the decision
--       explains every RECONSENT_REQUIRED the platform ever returned.
--     Export treatment: n/a. Erasure strategy: RETAIN_WITH_BASIS.
--   public.processing_basis_references
--     Subject relationship: NON_PERSONAL — typed references only.
--     Purpose: name the declared legal basis per (purpose, jurisdiction) so
--       consent machinery gates only the purposes whose basis IS consent.
--     Classification: INTERNAL. Retention: RETAIN_WITH_BASIS — basis history
--       explains past gating. Export treatment: n/a.
--     Erasure strategy: RETAIN_WITH_BASIS.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP POLICY, DROP TRIGGER/
-- FUNCTION pairs, DROP TABLE public.processing_basis_references, DROP TABLE
-- public.reconsent_evaluations, DROP TABLE public.consent_grants —
-- destroying consent evidence, which is why it would need the same review
-- as destroying any evidence record.

CREATE TABLE public.consent_grants (
  id                        uuid        PRIMARY KEY,
  -- Cross-module references (raw UUIDs, no FK across module boundaries —
  -- data-model.md §2): user_id -> identity accounts (platform UserId),
  -- tenant_id -> tenancy.tenants, operating_entity_id ->
  -- operating_entities. The entity is PINNED at creation (data-model.md §5).
  user_id                   uuid        NOT NULL,
  tenant_id                 uuid        NOT NULL,
  operating_entity_id       uuid        NOT NULL,
  jurisdiction_ref          text        NOT NULL CHECK (jurisdiction_ref <> ''),
  purpose_ref               text        NOT NULL CHECK (purpose_ref <> ''),
  -- The human-readable version string of the accepted document version,
  -- denormalised for evidence; legal_document_version_id is the exact pin.
  consent_version           text        NOT NULL CHECK (consent_version <> ''),
  legal_document_version_id uuid        NOT NULL REFERENCES public.legal_document_versions (id),
  granted_at                timestamptz NOT NULL,
  withdrawn_at              timestamptz     NULL,
  status                    text        NOT NULL
    CHECK (status IN ('ACTIVE', 'WITHDRAWN', 'SUPERSEDED')),
  -- Evidence of the acceptance act (request reference, session reference).
  -- NOT NULL: a consent record without evidence is an assertion, not a record.
  evidence_reference        text        NOT NULL CHECK (evidence_reference <> ''),
  created_at                timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'WITHDRAWN') = (withdrawn_at IS NOT NULL)),
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= granted_at)
);

COMMENT ON TABLE public.consent_grants IS
  'Immutable consent evidence pinned to (operating_entity, purpose, '
  'jurisdiction) — the resolution triple, not the row identity (ADR-0024). '
  'Transitions by trigger: ACTIVE->WITHDRAWN and ACTIVE->SUPERSEDED only; '
  're-grant is a NEW row. RLS FORCEd on tenant+user principal GUCs. '
  'Single-ACTIVE-per-triple is enforced by the re-grant use case inside the '
  'principal-context transaction, not by a partial index (kept out of the '
  'schema so the Prisma mapping stays exact for the drift gate).';

CREATE INDEX consent_grants_resolution_idx
  ON public.consent_grants
    (user_id, tenant_id, operating_entity_id, purpose_ref, jurisdiction_ref, granted_at);
CREATE INDEX consent_grants_version_idx
  ON public.consent_grants (legal_document_version_id);

ALTER TABLE public.consent_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_grants FORCE ROW LEVEL SECURITY;

-- Subject records: visible and writable only inside a transaction that
-- carries BOTH principal GUCs, bound from the caller's own record — never
-- from client input (tenancy.md §2). Unset GUCs fail closed via NULLIF.
CREATE POLICY consent_grants_subject ON public.consent_grants
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Immutable evidence: the two legal transitions and nothing else.
CREATE FUNCTION public.consent_grants_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'consent_grants rows are consent evidence: DELETE is not permitted, even for the table owner (ADR-0024)'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id                        IS DISTINCT FROM OLD.id
    OR NEW.user_id                   IS DISTINCT FROM OLD.user_id
    OR NEW.tenant_id                 IS DISTINCT FROM OLD.tenant_id
    OR NEW.operating_entity_id       IS DISTINCT FROM OLD.operating_entity_id
    OR NEW.jurisdiction_ref          IS DISTINCT FROM OLD.jurisdiction_ref
    OR NEW.purpose_ref               IS DISTINCT FROM OLD.purpose_ref
    OR NEW.consent_version           IS DISTINCT FROM OLD.consent_version
    OR NEW.legal_document_version_id IS DISTINCT FROM OLD.legal_document_version_id
    OR NEW.granted_at                IS DISTINCT FROM OLD.granted_at
    OR NEW.evidence_reference        IS DISTINCT FROM OLD.evidence_reference
    OR NEW.created_at                IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'consent_grant % content is immutable; re-consent is a new row (ADR-0024)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.status = 'ACTIVE' AND NEW.status = 'WITHDRAWN'
    AND OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'ACTIVE' AND NEW.status = 'SUPERSEDED'
    AND NEW.withdrawn_at IS NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'consent_grant % permits only ACTIVE->WITHDRAWN (with withdrawn_at) and ACTIVE->SUPERSEDED; got % -> % (ADR-0024)',
    OLD.id, OLD.status, NEW.status USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER consent_grants_guard
  BEFORE UPDATE OR DELETE ON public.consent_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.consent_grants_guard();

CREATE FUNCTION public.consent_grants_no_truncate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'consent_grants rows are consent evidence: TRUNCATE is not permitted, even for the table owner (ADR-0024)'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER consent_grants_no_truncate
  BEFORE TRUNCATE ON public.consent_grants
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.consent_grants_no_truncate();

CREATE TABLE public.reconsent_evaluations (
  id                        uuid        PRIMARY KEY,
  legal_document_version_id uuid        NOT NULL REFERENCES public.legal_document_versions (id),
  purpose_ref               text        NOT NULL CHECK (purpose_ref <> ''),
  -- Same vocabulary as the version classification; the use case asserts the
  -- recorded evaluation MATCHES the version's classification (a cross-row
  -- equality no CHECK can express), and the integration suite proves it.
  evaluation                text        NOT NULL
    CHECK (evaluation IN
      ('MATERIAL_REACCEPTANCE_REQUIRED', 'NOTICE_REQUIRED', 'NO_USER_ACTION_REQUIRED')),
  evaluated_by              text        NOT NULL CHECK (evaluated_by <> ''),
  evaluated_at              timestamptz NOT NULL,
  -- HOW the affected-subject set was determined: the recorded query/method.
  -- This is what makes re-consent "a query rather than an archaeology
  -- project" (ADR-0024).
  affected_query_notes      text        NOT NULL CHECK (affected_query_notes <> ''),
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconsent_evaluations_version_purpose_key
    UNIQUE (legal_document_version_id, purpose_ref)
);

COMMENT ON TABLE public.reconsent_evaluations IS
  'Reviewed re-consent decisions per republished version and purpose '
  '(ADR-0024: material/notice/no-action, no default). Append-only; '
  'allow-listed from RLS as a version-scoped decision record — subject '
  'consequences are resolved by querying RLS-protected consent_grants.';

CREATE INDEX reconsent_evaluations_version_idx
  ON public.reconsent_evaluations (legal_document_version_id);

-- Append-only, both mechanisms (data-model.md §10): grants below are
-- INSERT+SELECT only, and the trigger raises even for the table owner.
CREATE FUNCTION public.reconsent_evaluations_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'reconsent_evaluations is append-only: % is not permitted, even for the table owner (ADR-0024)',
    TG_OP USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER reconsent_evaluations_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.reconsent_evaluations
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.reconsent_evaluations_immutable();

CREATE TABLE public.processing_basis_references (
  id               uuid        PRIMARY KEY,
  purpose_ref      text        NOT NULL CHECK (purpose_ref <> ''),
  jurisdiction_ref text        NOT NULL CHECK (jurisdiction_ref <> ''),
  -- A typed reference to the declared basis (e.g. 'basis:consent',
  -- 'basis:contract-performance'). The reference asserts nothing about any
  -- jurisdiction's law; the PolicyPack declaration it points at is resolved
  -- in Phase 3.5. No declared basis = the purpose fails closed (ADR-0024).
  basis_ref        text        NOT NULL CHECK (basis_ref <> ''),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL,
  CONSTRAINT processing_basis_references_purpose_jurisdiction_key
    UNIQUE (purpose_ref, jurisdiction_ref)
);

COMMENT ON TABLE public.processing_basis_references IS
  'Typed legal-basis references per (purpose, jurisdiction) — consent is one '
  'basis among several (ADR-0024). References only; resolution is Phase 3.5; '
  'an absent row fails closed.';

-- Minimal DML (README.md): consent_grants never DELETEs (transitions only);
-- reconsent_evaluations is append-only; basis references are maintained
-- reference data.
GRANT SELECT, INSERT, UPDATE ON public.consent_grants TO karar_app;
GRANT SELECT, INSERT ON public.reconsent_evaluations TO karar_app;
GRANT SELECT, INSERT, UPDATE ON public.processing_basis_references TO karar_app;
