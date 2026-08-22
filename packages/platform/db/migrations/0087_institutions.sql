-- 0087_institutions
--
-- public.institutions — the reviewed catalogue of ISSUERS a financial account
-- may NAME (modules/financial-accounts/MODULE.md; ADR-0028). Reference data
-- about organisations, never about people: an identifier, a stable code, the
-- KIND of issuer it is, the two display names the product renders (en + ar),
-- and the code's own lifecycle. Nothing here describes, references, or can be
-- joined to a subject.
--
-- ONE ISSUER, GLOBALLY, AND WHY THE CODE STOPPED NAMING A COUNTRY. An issuer
-- is identified once and only once. Where it operates, under what market
-- status, and with what reviewed local display information is a SEPARATE
-- table keyed on (institution, country) — public.institution_markets (0094).
-- The alternative shape, one catalogue row per country, was the obvious one
-- and is wrong: a group operating in four countries would become four
-- issuers, every account pointing at the wrong one of them would be
-- unfixable without a merge, and the merge is precisely the operation that
-- silently joins two people's records (ADR-0028). So this row is the issuer
-- and nothing about a place.
--
-- That is also why the code CHECK no longer forces a two-letter COUNTRY
-- prefix. A code beginning `QA_` reads as a fact about where the issuer
-- belongs, and the moment the same issuer appears in a second market that
-- fact is false — and a reader resolving the contradiction would create a
-- second row, which is the failure this table exists to prevent. The code is
-- now a stable machine identifier and asserts nothing about geography; the
-- constraint that mattered survives untouched, because an uppercase
-- underscore-joined token still cannot be a sentence, so no free-text
-- institution name can arrive through the column by accident.
--
-- KIND IS WHAT THE ISSUER IS, NEVER WHAT KARAR CAN REACH. A bank, an
-- e-money institution, a mobile-money operator, a telco's financial arm, a
-- payment institution, a fintech wallet, a card issuer, an exchange house, or
-- OTHER. The vocabulary exists because a mobile-money wallet from a telco and
-- a current account at a bank are different products with different rules,
-- and a catalogue that cannot tell them apart forces the difference to be
-- inferred from a display name. It is NOT a capability flag: no value here
-- means integrated, connected, reachable, or supported, and none may be
-- added — provider access is a per-market status carrying its own evidence
-- (0094), never an issuer-level implication. NO PROVIDER-SPECIFIC VALUE
-- EXISTS: the vocabulary names categories of issuer and never an individual
-- one, so no code path anywhere may branch on which issuer a row is
-- (ADR-0028).
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
  -- Stable machine code, deliberately WITHOUT a country prefix — see the
  -- header: geography belongs to the market rows (0094), and a code that
  -- names a country invites a second issuer row the moment a second market
  -- appears. The pattern is a control, not cosmetics: a code cannot be a
  -- sentence, so no free-text institution name can arrive through this
  -- column by accident.
  code             text        NOT NULL
    CONSTRAINT institutions_code_check CHECK (code ~ '^[A-Z][A-Z0-9_]{2,47}$'),
  -- WHAT the issuer is. Categories only; no value names an individual issuer,
  -- and no value means reachable — see the header.
  kind             text        NOT NULL
    CONSTRAINT institutions_kind_check CHECK (kind IN
      ('BANK', 'E_MONEY_ISSUER', 'MOBILE_MONEY_OPERATOR', 'TELCO_FINANCIAL_SERVICES',
       'PAYMENT_INSTITUTION', 'FINTECH_WALLET', 'CARD_ISSUER', 'EXCHANGE_HOUSE', 'OTHER')),
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
  'PUBLIC. Reviewed catalogue of ISSUERS an account may name: code, issuer '
  'kind, en/ar display names, status. ONE ROW PER ISSUER GLOBALLY — where it '
  'operates is public.institution_markets (0094), keyed on (institution, '
  'country), so a group in four countries is one issuer with four market '
  'rows and never four issuers. Structurally incapable of subject linkage — '
  'no tenant_id, no user_id, no account_id, and no column that can hold '
  'subject-supplied text (an unlisted institution is named on the '
  'SUBJECT-OWNED financial_accounts.user_supplied_institution_label '
  'instead). A row is a NAME, never a connection: no credential and no sync '
  'cursor exists anywhere in this module. Allow-listed rather than RLS''d '
  '(rls-allow-list.json) because no principal predicate fits reference data; '
  'karar_app is SELECT-only and the set changes by reviewed migration. '
  'Lifecycle: 0087 header + DATA_LIFECYCLE.md.';

COMMENT ON COLUMN public.institutions.code IS
  'Stable machine code (^[A-Z][A-Z0-9_]{2,47}$), asserting nothing about '
  'geography: an issuer''s countries are market rows (0094), and a '
  'country-prefixed code would make one multi-market issuer look like '
  'several. The pattern keeps free text out of the catalogue structurally.';

COMMENT ON COLUMN public.institutions.kind IS
  'What the issuer IS — BANK, E_MONEY_ISSUER, MOBILE_MONEY_OPERATOR, '
  'TELCO_FINANCIAL_SERVICES, PAYMENT_INSTITUTION, FINTECH_WALLET, '
  'CARD_ISSUER, EXCHANGE_HOUSE, OTHER. Categories, never an individual '
  'issuer: no domain or application code may branch on which issuer a row is '
  '(ADR-0028). NOT a capability flag — no value means integrated, connected '
  'or reachable, and provider access is a per-market status with its own '
  'evidence (0094).';

-- Read-only for the application: the catalogue changes by migration, and no
-- runtime write path exists — an unlisted institution is named on the
-- subject''s own account row, never added here.
GRANT SELECT ON public.institutions TO karar_app;

-- No seed rows, deliberately: see SEEDED EMPTY above. Naming an institution
-- is a reviewed act, and an empty catalogue is fully functional because the
-- subject-owned label path covers every unlisted institution.
