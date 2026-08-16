-- 0070_countries
--
-- Country REFERENCE data (docs/architecture/jurisdiction-policy.md §1;
-- ADR-0014): where, geographically — ISO 3166-1 alpha-2 codes with a
-- localization key, a default-currency reference, and the code's own
-- lifecycle. A country row is DATA and carries NO business rule: policy
-- keys on Jurisdiction (0071), and this table exists so runtime rows can
-- reference countries with integrity while the typed source of truth stays
-- packages/jurisdiction-policy/src/country.ts. The two are seeded from the
-- same reviewed set; growing the set is a reviewed migration, never runtime
-- configuration.
--
-- RLS decision — ALLOW-LISTED (rls-allow-list.json): platform-global
-- reference data. No tenant or subject column exists to scope on, and every
-- principal's formatting/display resolution may need to read any row.
-- Compensating controls: karar_app is SELECT-ONLY — the set changes by
-- reviewed migration exactly like the permissions catalogue (0050); there is
-- no write path at runtime, no operator use case, no DELETE ever.
--
-- Data lifecycle (ADR-0026; canonical in modules/jurisdiction/MODULE.md,
-- mirrored in DATA_LIFECYCLE.md):
--   public.countries
--     Subject relationship: NON_PERSONAL — ISO codes, localization keys,
--       currency codes; no column references a person and no linkage to any
--       subject exists, so re-identification is impossible by construction.
--     Purpose: geographic reference — display keys and formatting defaults;
--       the attribute dimension Jurisdiction is deliberately separate from.
--     Classification: PUBLIC (ISO reference data).
--     Retention: life of the platform reference set; PolicyPack owns any
--       bound (Phase 3.5), never a code constant.
--     Export treatment: n/a — no subject owns a reference row.
--     Erasure strategy: NON_PERSONAL_BY_DESIGN.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE public.countries —
-- breaking the FK from jurisdictions (0071), which is why removal of a
-- country is a status change (RETIRED), never a vanished row.

CREATE TABLE public.countries (
  code             text        PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  display_name_key text        NOT NULL CHECK (display_name_key <> ''),
  -- ISO 4217 reference for formatting defaults — an attribute, not a
  -- currency POLICY; which currencies may be transacted is the PolicyPack's
  -- currencyPolicy decision.
  default_currency text        NOT NULL CHECK (default_currency ~ '^[A-Z]{3}$'),
  status           text        NOT NULL CHECK (status IN ('ACTIVE', 'RETIRED')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL
);

COMMENT ON TABLE public.countries IS
  'ISO 3166-1 country reference data (jurisdiction-policy.md §1): display '
  'key, default currency, code lifecycle. Data, never policy — no business '
  'rule keys on a country. Seeded by migration; karar_app is SELECT-only; '
  'mirrors packages/jurisdiction-policy/src/country.ts.';

-- Read-only for the application: the reference set changes by migration.
GRANT SELECT ON public.countries TO karar_app;

-- The Phase 3.5 reference set: the launch focus (QA) and the GCC countries
-- the roadmap names. Mirrors COUNTRIES in the jurisdiction-policy package.
INSERT INTO public.countries (code, display_name_key, default_currency, status, updated_at) VALUES
  ('QA', 'country.qa', 'QAR', 'ACTIVE', now()),
  ('SA', 'country.sa', 'SAR', 'ACTIVE', now()),
  ('AE', 'country.ae', 'AED', 'ACTIVE', now()),
  ('OM', 'country.om', 'OMR', 'ACTIVE', now()),
  ('KW', 'country.kw', 'KWD', 'ACTIVE', now()),
  ('BH', 'country.bh', 'BHD', 'ACTIVE', now());
