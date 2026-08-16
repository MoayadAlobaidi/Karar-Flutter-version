-- 0061_entity_licences
--
-- Licences as typed references (ADR-0024; operating-entity.md §3): a row in
-- public.entity_licences NEVER implies a legal fact. It records that someone
-- — named in source_provenance — claimed or evidenced a licence reference,
-- with a review owner accountable for the claim. Karar's documentation
-- claims no licence, approval, or clearance anywhere; the status vocabulary
-- therefore carries provenance in the value itself:
--
--   CLAIMED_UNVERIFIED — asserted by an operator or partner; no evidence held
--   EVIDENCED          — an evidence_reference is on file (enforced by CHECK);
--                        still a record of evidence, not a regulator's word
--   EXPIRED            — the recorded expiry date has passed, per our record
--   REVOKED            — we recorded a revocation; the reference says by whom
--
-- Capability/licence RESOLUTION is Phase 3.5 (capability-registry.md:
-- requiredOperatingEntityLicenses). Nothing in the platform enables on the
-- free-text of this table; capabilities gate on typed licence_type_ref
-- values resolved by the registry, and until that phase nothing gates on
-- this table at all.
--
-- RLS decision — ALLOW-LISTED (rls-allow-list.json): platform-global legal
-- reference records tied to entities, not tenants; same reasoning and
-- compensating controls as 0060 (platform-operator-only writes via the
-- authorization port; minimal grants; purpose-built consumer reads).
--
-- Data lifecycle (ADR-0026; canonical in modules/operating-entity/MODULE.md,
-- mirrored in DATA_LIFECYCLE.md):
--   Subject relationship: NON_PERSONAL — licence claims about legal persons.
--   Purpose:              honest licence bookkeeping for later capability
--     gating; review accountability for every claim.
--   Classification:       INTERNAL.
--   Retention:            RETAIN_WITH_BASIS — licence history explains why a
--     capability was ever enabled; PolicyPack owns any bound from Phase 3.5.
--   Export treatment:     n/a — no subject owns a licence row.
--   Erasure strategy:     RETAIN_WITH_BASIS.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE
-- public.entity_licences; — destroying the record of what was claimed and
-- evidenced when, which future capability-gating audits would rely on.

CREATE TABLE public.entity_licences (
  id                uuid        PRIMARY KEY,
  entity_id         uuid        NOT NULL REFERENCES public.operating_entities (id),
  licence_type_ref  text        NOT NULL CHECK (licence_type_ref <> ''),
  status            text        NOT NULL
    CHECK (status IN ('CLAIMED_UNVERIFIED', 'EVIDENCED', 'EXPIRED', 'REVOKED')),
  -- Who asserted this row: an operator reference, a partner document
  -- reference — never blank, because a claim from nowhere is not a claim.
  source_provenance text        NOT NULL CHECK (source_provenance <> ''),
  effective_date    date            NULL,
  expiry_date       date            NULL,
  -- The named owner accountable for reviewing this claim.
  review_owner      text        NOT NULL CHECK (review_owner <> ''),
  evidence_reference text           NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL,
  -- Status honesty: EVIDENCED without evidence on file is a contradiction,
  -- and the database refuses to store it.
  CHECK (status <> 'EVIDENCED' OR evidence_reference IS NOT NULL),
  CHECK (expiry_date IS NULL OR effective_date IS NULL OR expiry_date >= effective_date)
);

COMMENT ON TABLE public.entity_licences IS
  'Typed licence references per operating entity (ADR-0024). A row never '
  'implies a legal fact: the status vocabulary carries provenance '
  '(CLAIMED_UNVERIFIED/EVIDENCED/EXPIRED/REVOKED), and capability/licence '
  'resolution is Phase 3.5 — nothing enables on free text.';

CREATE INDEX entity_licences_entity_idx
  ON public.entity_licences (entity_id, licence_type_ref);

-- Minimal DML (README.md). No DELETE: a withdrawn claim becomes REVOKED or
-- EXPIRED with its provenance intact, never an absent row.
GRANT SELECT, INSERT, UPDATE ON public.entity_licences TO karar_app;
