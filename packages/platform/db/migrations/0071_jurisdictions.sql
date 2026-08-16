-- 0071_jurisdictions
--
-- The Jurisdiction register (docs/architecture/jurisdiction-policy.md §1;
-- ADR-0014/0015): which legal regime governs — the POLICY KEY, deliberately
-- separate from Country (0070). Usually 1:1 with a country, not always:
-- free zones (AE-DIFC) run distinct regimes, so nothing here assumes one
-- jurisdiction per country, and the code is the key rather than the country.
--
-- A row records a regime DECLARED by the platform with an explicit review
-- lifecycle. It asserts no legal fact: status carries where the declaration
-- stands (DRAFT -> PENDING_LEGAL_REVIEW -> APPROVED -> RETIRED), review_status
-- carries where legal review stands, and provenance says who declared it on
-- what footing. Every seeded row is DRAFT — approval is a legal decision no
-- migration can take, and no seeded jurisdiction claims one. Effective dates
-- stay NULL until a reviewed decision supplies them; they are never invented
-- and never rewritten (a change is a new reviewed migration).
--
-- The typed source of truth is packages/jurisdiction-policy/src/
-- jurisdiction.ts; this table exists for runtime referential integrity
-- (assignments 0072/0073, settings 0074, activations 0075 all FK here).
--
-- RLS decision — ALLOW-LISTED (rls-allow-list.json): platform-global
-- reference data with no tenant or subject column; jurisdiction resolution
-- runs for every principal (and pre-principal during bootstrap composition).
-- Compensating controls: karar_app SELECT-ONLY; the register changes by
-- reviewed migration only this phase (no operator use case exists, by
-- design — the mission's use cases are assignment- and activation-side).
--
-- Data lifecycle (ADR-0026; canonical in modules/jurisdiction/MODULE.md,
-- mirrored in DATA_LIFECYCLE.md):
--   public.jurisdictions
--     Subject relationship: NON_PERSONAL — regime codes, lifecycle labels,
--       provenance prose about the platform's own declarations; no person is
--       referenced and no subject linkage exists.
--     Purpose: the legal-regime register runtime rows key on; keeps
--       jurisdiction distinct from country so historical records never need
--       re-derivation (jurisdiction-policy.md §1).
--     Classification: INTERNAL (review states and provenance are the
--       platform's own governance record).
--     Retention: life of the platform register; PolicyPack owns any bound
--       (Phase 3.5), never a code constant.
--     Export treatment: n/a — no subject owns a register row.
--     Erasure strategy: NON_PERSONAL_BY_DESIGN.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE public.jurisdictions
-- — breaking the FKs from 0072-0075 and orphaning every assignment's regime
-- reference; retirement of a regime is a status, never a vanished row.

CREATE TABLE public.jurisdictions (
  code           text        PRIMARY KEY CHECK (code <> ''),
  country_code   text        NOT NULL REFERENCES public.countries (code),
  type           text        NOT NULL
    CHECK (type IN ('NATIONAL', 'FINANCIAL_FREE_ZONE', 'SPECIAL_REGIME')),
  status         text        NOT NULL
    CHECK (status IN ('DRAFT', 'PENDING_LEGAL_REVIEW', 'APPROVED', 'RETIRED')),
  review_status  text        NOT NULL
    CHECK (review_status IN ('NOT_SUBMITTED', 'PENDING_LEGAL_REVIEW', 'REVIEW_COMPLETE')),
  effective_from timestamptz     NULL,
  effective_to   timestamptz     NULL,
  -- Who declared the regime entry and on what footing — not a legal claim.
  provenance     text        NOT NULL CHECK (provenance <> ''),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL,
  CHECK (effective_to IS NULL OR (effective_from IS NOT NULL AND effective_to > effective_from))
);

COMMENT ON TABLE public.jurisdictions IS
  'Legal-regime register — the policy key, distinct from country '
  '(jurisdiction-policy.md §1). Declarations with an explicit review '
  'lifecycle; a row asserts no legal fact and no seeded row is APPROVED. '
  'karar_app SELECT-only; changes are reviewed migrations. Mirrors '
  'packages/jurisdiction-policy/src/jurisdiction.ts.';

CREATE INDEX jurisdictions_country_idx ON public.jurisdictions (country_code);

-- Read-only for the application: the register changes by migration.
GRANT SELECT ON public.jurisdictions TO karar_app;

-- The Phase 3.5 declarations, mirroring JURISDICTIONS in jurisdiction-policy:
-- QA is submitted for review alongside the qa/v1 draft pack; the AE pair
-- exists to keep country!=jurisdiction honest (one country, two regimes).
-- All DRAFT; none approved; no effective dates invented.
INSERT INTO public.jurisdictions
  (code, country_code, type, status, review_status, effective_from, effective_to, provenance, updated_at)
VALUES
  ('QA', 'QA', 'NATIONAL', 'DRAFT', 'PENDING_LEGAL_REVIEW', NULL, NULL,
   'Declared by engineering in Phase 3.5 alongside the qa/v1 draft pack; submitted for legal review, no approval recorded.',
   now()),
  ('AE', 'AE', 'NATIONAL', 'DRAFT', 'NOT_SUBMITTED', NULL, NULL,
   'Declared by engineering in Phase 3.5 as reference structure only; not submitted for review.',
   now()),
  ('AE-DIFC', 'AE', 'FINANCIAL_FREE_ZONE', 'DRAFT', 'NOT_SUBMITTED', NULL, NULL,
   'Declared by engineering in Phase 3.5 to model a free-zone regime distinct from its country; not submitted for review.',
   now());
