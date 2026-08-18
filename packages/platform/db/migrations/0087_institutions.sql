-- 0087_institutions
--
-- public.institutions — the reviewed catalogue of institutions a financial
-- account may NAME (modules/financial-accounts/MODULE.md). Reference data
-- about organisations, never about people: an identifier, a stable code, the
-- two display names the product renders (en + ar), and the code's own
-- lifecycle. Nothing here describes, references, or can be joined to a
-- subject.
--
-- WHY THE SHAPE IS THE CONTROL. The module declares this table
-- NON_PERSONAL / NON_PERSONAL_BY_DESIGN, and that declaration is only
-- credible if the schema makes subject linkage impossible rather than
-- merely unusual. So: there is no tenant_id column, no user_id column, no
-- account_id column, and no column that can hold text a subject typed. A
-- user who banks somewhere this catalogue does not list records that on
-- THEIR OWN ACCOUNT ROW (financial_accounts.user_supplied_institution_label,
-- 0088), which is SUBJECT_OWNED and classified HIGHLY_SENSITIVE_FINANCIAL —
-- precisely so that one person's typed bank name cannot become global
-- reference data that every other tenant reads. The separation is enforced
-- by two tables with different columns, not by a convention someone has to
-- remember, and it is asserted by test.
--
-- WHAT A ROW DOES NOT MEAN. A row is a NAME the product may show and an
-- account may point at. It is not a connection, not an integration, not a
-- provider, and not a statement that this platform can reach the
-- institution in any way. No credential column exists here or anywhere in
-- this module's schema, and no synchronisation cursor exists; the legacy
-- product's connect-a-bank screen fabricated an account row with an
-- invented masked number and a Synced badge, and nothing in this schema can
-- express that claim (modules/financial-accounts/MODULE.md).
--
-- SEEDED EMPTY, DELIBERATELY. The catalogue is a REVIEWED set, and the
-- review has not happened: naming institutions is a commercial and legal
-- act (the name is shown to customers, and an entry implies the platform
-- vouches that the name is the right one). An empty catalogue is fully
-- functional — every account can name its institution through the
-- subject-owned label path — so the honest ground state is zero rows, and
-- each future entry arrives as its own reviewed migration exactly like the
-- permissions catalogue (0050) and the country reference set (0070).
--
-- RLS decision — ALLOW-LISTED (packages/platform/db/rls-allow-list.json),
-- NOT RLS. This is PUBLIC platform reference data with no subject linkage:
-- the table carries no tenant, user, or subject column to build a predicate
-- from, and every principal — in any tenant, and the pre-tenant composition
-- that renders a picker — reads the same rows. A tenant predicate here
-- would have to invent a relationship the table exists to keep out. The
-- alternative shape, RLS ENABLEd with a USING (true) policy, was considered
-- and rejected: it protects exactly nothing while removing the table from
-- the register of tables consciously left outside the tenant boundary,
-- which is the one place a reviewer looks. Compensating controls: karar_app
-- is SELECT-ONLY (no INSERT, UPDATE, or DELETE grant exists at all), the
-- set changes only by reviewed migration, retirement is a status and never
-- a vanished row, and the schema itself forbids subject linkage.
--
-- Data lifecycle (ADR-0026; canonical in
-- modules/financial-accounts/MODULE.md, mirrored in DATA_LIFECYCLE.md):
--   public.institutions
--     Subject relationship: NON_PERSONAL — organisation names and codes; no
--       column references a person, and no linkage to any subject exists,
--       so re-identification is impossible by construction.
--     Purpose: reviewed catalogue of institutions an account may name, with
--       the localized display names the product renders.
--     Classification: PUBLIC.
--     Retention: the catalogue outlives any account referencing it; no
--       subject-derived bound applies.
--     Export treatment: n/a — no subject owns a catalogue row.
--     Erasure strategy: NON_PERSONAL_BY_DESIGN.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE public.institutions,
-- which breaks the FK from public.financial_accounts (0088); that is why
-- withdrawing an institution is the RETIRED status and never a removed row,
-- and why the reversal would have to be preceded by clearing every
-- institution_ref that points at the catalogue.

CREATE TABLE public.institutions (
  id               uuid        PRIMARY KEY,
  -- Stable machine code, country-prefixed. The pattern is a control, not
  -- cosmetics: a code cannot be a sentence, so no free-text institution
  -- name can arrive through this column by accident.
  code             text        NOT NULL
    CONSTRAINT institutions_code_check CHECK (code ~ '^[A-Z]{2}_[A-Z0-9_]{2,32}$'),
  -- Both display names are required. An Arabic-first product that lets a
  -- catalogue row ship with only English display name has already decided
  -- which language is optional; this NOT NULL is that decision, inverted.
  display_name_en  text        NOT NULL
    CONSTRAINT institutions_display_name_en_check CHECK (btrim(display_name_en) <> ''),
  display_name_ar  text        NOT NULL
    CONSTRAINT institutions_display_name_ar_check CHECK (btrim(display_name_ar) <> ''),
  status           text        NOT NULL
    CONSTRAINT institutions_status_check CHECK (status IN ('ACTIVE', 'RETIRED')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL,
  CONSTRAINT institutions_code_key UNIQUE (code)
);

COMMENT ON TABLE public.institutions IS
  'PUBLIC. Reviewed catalogue of institutions an account may name: code, '
  'en/ar display names, status. Structurally incapable of subject linkage — '
  'no tenant_id, no user_id, no account_id, and no column that can hold '
  'subject-supplied text (an unlisted institution is named on the '
  'SUBJECT-OWNED financial_accounts.user_supplied_institution_label '
  'instead). A row is a NAME, never a connection: no credential and no sync '
  'cursor exists anywhere in this module. Allow-listed rather than RLS''d '
  '(rls-allow-list.json) because no principal predicate fits reference data; '
  'karar_app is SELECT-only and the set changes by reviewed migration. '
  'Lifecycle: 0087 header + DATA_LIFECYCLE.md.';

COMMENT ON COLUMN public.institutions.code IS
  'Country-prefixed machine code (^[A-Z]{2}_[A-Z0-9_]{2,32}$). The pattern '
  'keeps free text out of the catalogue structurally.';

-- Read-only for the application: the catalogue changes by migration, and no
-- runtime write path exists — an unlisted institution is named on the
-- subject''s own account row, never added here.
GRANT SELECT ON public.institutions TO karar_app;

-- No seed rows, deliberately: see SEEDED EMPTY above. Naming an institution
-- is a reviewed act, and an empty catalogue is fully functional because the
-- subject-owned label path covers every unlisted institution.
