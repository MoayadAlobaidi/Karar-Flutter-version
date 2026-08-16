-- 0064_legal_documents
--
-- The legal document set, keyed on the (entity, jurisdiction) PAIR — never a
-- jurisdiction alone (ADR-0024): a privacy notice belongs to a specific
-- legal person in a specific regime.
--
--   public.legal_documents        — the catalogue: which document kinds exist
--                                   for which (entity, jurisdiction), covering
--                                   which processing purposes
--   public.legal_document_versions — the version lifecycle that consent pins
--
-- THE PUBLICATION RULE (ADR-0024 "Legal-document version lifecycle";
-- jurisdiction-policy.md §10): every republication is classified
-- MATERIAL_REACCEPTANCE_REQUIRED, NOTICE_REQUIRED, or
-- NO_USER_ACTION_REQUIRED — and NEITHER DIRECTION IS A DEFAULT. Classification
-- is NULL until a named reviewer classifies with a recorded reason, and
-- effective_at/published_at may be set ONLY when classification is NOT NULL
-- (CHECK constraints below, use-case guard above). An unclassified
-- republication blocks — the inversion of legacy P12, where publishing a new
-- version asked nobody to accept it.
--
-- Published versions are immutable (trigger): a consent grant pins a version
-- id, so editing a published version would rewrite what was accepted.
-- Correcting a published version means drafting a successor (prior_version_id
-- keeps the chain) and classifying it honestly.
--
-- RLS decision — ALLOW-LISTED, both tables (rls-allow-list.json): legal
-- documents are the platform's PUBLIC-facing legal texts, keyed on entity and
-- jurisdiction — no tenant_id exists to scope on, and subjects must read the
-- catalogue BEFORE they consent (a consent gate that cannot show its document
-- fails closed into uselessness). Consent MODULE.md declares the catalogue
-- PUBLIC "no RLS, correctly". Compensating controls: write paths are
-- platform-operator-only via the consent module's PolicyService port
-- (consent.document.publish), karar_app grants are minimal (no DELETE), and
-- version immutability is trigger-enforced.
--
-- Data lifecycle (ADR-0026; canonical in modules/consent/MODULE.md, mirrored
-- in DATA_LIFECYCLE.md):
--   public.legal_documents
--     Subject relationship: NON_PERSONAL — catalogue of legal texts.
--     Purpose: name which document governs which purposes for which
--       (entity, jurisdiction).
--     Classification: PUBLIC. Retention: RETAIN_WITH_BASIS — the catalogue
--       must outlive any single version. Export treatment: n/a.
--     Erasure strategy: RETAIN_WITH_BASIS.
--   public.legal_document_versions
--     Subject relationship: NON_PERSONAL — versioned legal text references
--       and their editorial provenance (author/reviewer are staff refs).
--     Purpose: the exact text a consent was given to, verifiable by
--       content_hash, with its re-consent classification.
--     Classification: PUBLIC. Retention: RETAIN_WITH_BASIS — grants pin
--       version ids; deleting a version orphans consent evidence.
--     Export treatment: n/a. Erasure strategy: RETAIN_WITH_BASIS.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TRIGGER/FUNCTION, DROP
-- TABLE public.legal_document_versions, DROP TABLE public.legal_documents —
-- destroying the record of what text was in force when, on which every
-- consent grant's meaning depends.

CREATE TABLE public.legal_documents (
  id               uuid        PRIMARY KEY,
  -- Cross-module reference to operating_entities (raw UUID; the consent
  -- module declares its own EntityRef — data-model.md §2). No FK across the
  -- module boundary; existence is checked in the use case via the
  -- operating-entity public API.
  entity_id        uuid        NOT NULL,
  jurisdiction_ref text        NOT NULL CHECK (jurisdiction_ref <> ''),
  purpose_refs     text[]      NOT NULL CHECK (cardinality(purpose_refs) > 0),
  -- e.g. 'TERMS_OF_SERVICE', 'PRIVACY_NOTICE'. Free text by design: document
  -- kinds are editorial vocabulary, not platform enum — but never blank.
  kind             text        NOT NULL CHECK (kind <> ''),
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- One catalogue entry per kind per (entity, jurisdiction): "the privacy
  -- notice for (entity, jurisdiction)" must be a lookup, not a search.
  CONSTRAINT legal_documents_entity_jurisdiction_kind_key
    UNIQUE (entity_id, jurisdiction_ref, kind)
);

COMMENT ON TABLE public.legal_documents IS
  'Legal document catalogue per (entity, jurisdiction) pair (ADR-0024). '
  'Platform-global and PUBLIC: subjects read this before consenting. '
  'Allow-listed from RLS with compensating controls (rls-allow-list.json).';

CREATE TABLE public.legal_document_versions (
  id               uuid        PRIMARY KEY,
  document_id      uuid        NOT NULL REFERENCES public.legal_documents (id),
  version          text        NOT NULL CHECK (version <> ''),
  -- sha256 of the canonical document bytes: what was accepted is verifiable.
  content_hash     text        NOT NULL CHECK (content_hash <> ''),
  storage_ref      text        NOT NULL CHECK (storage_ref <> ''),
  -- NULL until a reviewer classifies. No default — defaulting either way is
  -- a legal position taken by whoever wrote the branch (ADR-0024).
  classification   text            NULL
    CHECK (classification IN
      ('MATERIAL_REACCEPTANCE_REQUIRED', 'NOTICE_REQUIRED', 'NO_USER_ACTION_REQUIRED')),
  author           text        NOT NULL CHECK (author <> ''),
  reviewer         text            NULL,
  reason           text            NULL,
  effective_at     timestamptz     NULL,
  published_at     timestamptz     NULL,
  prior_version_id uuid            NULL REFERENCES public.legal_document_versions (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_document_versions_document_id_version_key
    UNIQUE (document_id, version),
  -- Classification is a reviewed decision with a recorded reason, or it did
  -- not happen.
  CHECK (classification IS NULL OR (reviewer IS NOT NULL AND reason IS NOT NULL)),
  -- THE PUBLICATION RULE: no effective instant without a classification.
  CHECK (effective_at IS NULL OR classification IS NOT NULL),
  -- Published means classified AND carrying its effective instant.
  CHECK (published_at IS NULL OR (classification IS NOT NULL AND effective_at IS NOT NULL))
);

COMMENT ON TABLE public.legal_document_versions IS
  'Version lifecycle for legal documents (ADR-0024): classification has no '
  'default, unclassified publication is blocked by CHECK, and published '
  'versions are immutable by trigger — consent grants pin these ids.';

CREATE INDEX legal_document_versions_document_idx
  ON public.legal_document_versions (document_id, effective_at);

-- Published versions are immutable; no version row is ever deleted.
CREATE FUNCTION public.legal_document_versions_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'legal_document_versions rows are consent evidence: DELETE is not permitted, even for the table owner (ADR-0024)'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'legal_document_version % is published and immutable; draft a successor version instead (ADR-0024)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  -- Draft rows may be classified and published, but their identity — which
  -- document, which version string, which content — never changes.
  IF NEW.id             IS DISTINCT FROM OLD.id
    OR NEW.document_id    IS DISTINCT FROM OLD.document_id
    OR NEW.version        IS DISTINCT FROM OLD.version
    OR NEW.content_hash   IS DISTINCT FROM OLD.content_hash
    OR NEW.storage_ref    IS DISTINCT FROM OLD.storage_ref
    OR NEW.author         IS DISTINCT FROM OLD.author
    OR NEW.prior_version_id IS DISTINCT FROM OLD.prior_version_id
    OR NEW.created_at     IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'legal_document_version % identity/content columns are immutable; draft a successor version (ADR-0024)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER legal_document_versions_guard
  BEFORE UPDATE OR DELETE ON public.legal_document_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.legal_document_versions_guard();

CREATE FUNCTION public.legal_document_versions_no_truncate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'legal_document_versions rows are consent evidence: TRUNCATE is not permitted, even for the table owner (ADR-0024)'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER legal_document_versions_no_truncate
  BEFORE TRUNCATE ON public.legal_document_versions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.legal_document_versions_no_truncate();

-- Minimal DML (README.md). legal_documents: catalogue rows are created and
-- read; there is nothing to update in Phase 3 (purpose/kind changes are new
-- documents) and nothing is deleted. Versions: UPDATE carries the
-- classify/publish lifecycle, bounded by the trigger above.
GRANT SELECT, INSERT ON public.legal_documents TO karar_app;
GRANT SELECT, INSERT, UPDATE ON public.legal_document_versions TO karar_app;
