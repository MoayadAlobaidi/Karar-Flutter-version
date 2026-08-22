-- 0092_financial_categories_and_merchant_rules
--
-- The two NON_PERSONAL tables of the transactions module: the versioned
-- category catalogue every assignment references, and the reviewed merchant
-- pattern corpus the deterministic rules path reads.
--
-- BOTH TABLES ARE STRUCTURALLY INCAPABLE OF SUBJECT LINKAGE
--
-- Not "we do not put subject data here" — the shape makes it impossible.
-- Neither table carries a tenant id, a user id, an account id, a transaction
-- id, a statement id, or a statement-row id. There is no column any of those
-- could be written into, so a future writer cannot quietly start linking
-- rows to people; introducing such a column would be a reviewed migration
-- that a reader would immediately question. That is what
-- NON_PERSONAL_BY_DESIGN means in MODULE.md, and it is asserted by test
-- against information_schema rather than trusted.
--
-- WHY merchant_rules NEEDS THE PATTERN CONSTRAINTS
--
-- The legacy's equivalent table held narrative text lifted VERBATIM from
-- individual customers' statements — unencrypted, permanent, and global
-- (legacy C12). Nothing about that table's shape prevented it: it was a text
-- column, and text columns accept whatever the import loop passes. One
-- customer's "POS PURCHASE 4111********1111 REF 8837261 DOHA" therefore
-- became platform-wide reference data linking a card fragment and a reference
-- number to a category.
--
-- Patterns here are reviewed and generalised before entry, and the schema
-- enforces the generalisation rather than relying on the reviewer:
--
--   * NO DIGITS, in any script — ASCII, Arabic-Indic (٠-٩) or extended
--     Arabic-Indic (۰-۹). Card masks, reference numbers, IBANs, account
--     numbers and transaction ids are all digit-bearing, so a single rule
--     removes the entire class. A generalised merchant token never needs one.
--   * NO MASKING OR REFERENCE PUNCTUATION (* # | @ _) — the characters that
--     appear in redacted card numbers and reference identifiers.
--   * AT MOST FOUR TOKENS, single-spaced, no leading or trailing space, at
--     most 64 characters. A verbatim statement narrative is long and
--     multi-part; a generalised merchant name is short.
--   * LOWERCASE ONLY, so matching is exact rather than case-folded at read
--     time, and so two reviewers cannot enter the same pattern twice.
--   * review_ref NOT NULL — every pattern names the review that generalised
--     it, so an unreviewed entry has nowhere to hide.
--
-- Arabic script passes these rules unharmed (Arabic letters are not digits),
-- which matters: a rule set that only accepted Latin text would be a corpus
-- for one of the product's two languages.
--
-- NO SCORES, ANYWHERE
--
-- A rule row carries a category and the reviewed rule version that produced
-- it. There is no confidence column, no weight, no ranking, and no ordered
-- candidate list — a rule matched or it did not (MODULE.md: deterministic
-- only; no AI, no LLM). A score column is all it would take for "probably
-- groceries" to become "groceries" one release later.
--
-- Note also what is absent by design: no LENGTH(pattern) ordering is possible
-- or needed here, so this table does not inherit the legacy's constraint that
-- forced its pattern column to stay unencrypted (data-model.md §9). Nothing
-- in it is subject data, so nothing in it needs encrypting.
--
-- RLS DECISION: NEITHER TABLE IS RLS-SCOPED, AND BOTH NEED AN ALLOW-LIST
-- ENTRY (packages/platform/db/rls-allow-list.json, lead-owned). They are
-- platform-global reference data with no tenant, subject or principal column
-- to build a predicate from; every principal in every tenant reads the same
-- rows, and a tenant predicate would fabricate a relationship these tables
-- exist to be incapable of. The compensating control is the grant: karar_app
-- holds SELECT ONLY on both — no INSERT, no UPDATE, no DELETE — so the
-- catalogue and the corpus change exclusively by reviewed migration, the same
-- discipline the permissions catalogue follows (migration 0050). There is no
-- runtime write path to authorize, rate-limit, or abuse.
--
-- Data lifecycle (ADR-0026; canonical in modules/transactions/MODULE.md):
--   public.financial_categories
--     Subject relationship: NON_PERSONAL.
--     Purpose: versioned catalogue of category codes with English and Arabic
--       labels.
--     Classification: PUBLIC.
--     Retention: the catalogue outlives any assignment referencing it.
--     Export treatment: n/a — no subject owns a catalogue row.
--     Erasure strategy: NON_PERSONAL_BY_DESIGN.
--
--   public.merchant_rules
--     Subject relationship: NON_PERSONAL.
--     Purpose: reviewed, generalised patterns mapping merchant text to a
--       category, derived from many subjects and linked to none.
--     Classification: INTERNAL.
--     Retention: no subject-derived bound applies because no subject is
--       linked.
--     Export treatment: n/a.
--     Erasure strategy: NON_PERSONAL_BY_DESIGN.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE public.merchant_rules,
-- public.financial_categories — which the FK from
-- transaction_category_assignments (0093) would refuse while any assignment
-- exists, correctly: retiring a code is a status change, never a vanished row.

CREATE TABLE public.financial_categories (
  -- The code IS the hierarchy: uppercase ASCII segments, at most three
  -- levels. ASCII because codes appear in rules, exports and migrations, and
  -- a localisable identifier is a broken join waiting to happen — the
  -- human-visible names are the labels below.
  code              text        PRIMARY KEY
    CHECK (code ~ '^[A-Z][A-Z0-9_]{1,31}(\.[A-Z][A-Z0-9_]{1,31}){0,2}$'),
  parent_code       text            NULL
    REFERENCES public.financial_categories (code),
  -- Both languages required. An Arabic-first market with an English-only
  -- fallback is a product that is not bilingual; NOT NULL means a category
  -- cannot ship half-translated.
  label_en          text        NOT NULL CHECK (btrim(label_en) <> ''),
  label_ar          text        NOT NULL CHECK (btrim(label_ar) <> ''),
  catalogue_version text        NOT NULL CHECK (catalogue_version <> ''),
  -- Retirement, not deletion: assignments already referencing a code stay
  -- resolvable, which is why the catalogue outlives them.
  retired_at        timestamptz     NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.financial_categories IS
  'NON_PERSONAL_BY_DESIGN category catalogue (PUBLIC). Carries no tenant, '
  'user, account, transaction or statement-row column — subject linkage is '
  'structurally impossible, not merely avoided. Both en and ar labels are '
  'required so no category ships half-translated. karar_app holds SELECT '
  'ONLY: the catalogue changes by reviewed migration, never at runtime. '
  'Deliberately outside RLS with an allow-list entry (rls-allow-list.json).';

-- Starter catalogue, version 1. Deliberately small: a taxonomy is a product
-- decision, and every extra level multiplies the rules that must agree.
-- Expanding it is a reviewed migration, exactly like this one.
INSERT INTO public.financial_categories (code, parent_code, label_en, label_ar, catalogue_version)
VALUES
  ('FOOD',            NULL,     'Food and drink',      'طعام وشراب',   'catalogue/1'),
  ('FOOD.GROCERIES',  'FOOD',   'Groceries',           'بقالة',        'catalogue/1'),
  ('FOOD.DINING',     'FOOD',   'Restaurants',         'مطاعم',        'catalogue/1'),
  ('TRANSPORT',       NULL,     'Transport',           'مواصلات',      'catalogue/1'),
  ('TRANSPORT.FUEL',  'TRANSPORT', 'Fuel',             'وقود',         'catalogue/1'),
  ('HOUSING',         NULL,     'Housing',             'سكن',          'catalogue/1'),
  ('UTILITIES',       NULL,     'Utilities',           'مرافق',        'catalogue/1'),
  ('HEALTH',          NULL,     'Health',              'صحة',          'catalogue/1'),
  ('EDUCATION',       NULL,     'Education',           'تعليم',        'catalogue/1'),
  ('SHOPPING',        NULL,     'Shopping',            'تسوق',         'catalogue/1'),
  ('INCOME',          NULL,     'Income',              'دخل',          'catalogue/1'),
  ('TRANSFER',        NULL,     'Transfers',           'تحويلات',      'catalogue/1'),
  ('FEES',            NULL,     'Fees and charges',    'رسوم',         'catalogue/1'),
  ('OTHER',           NULL,     'Other',               'أخرى',         'catalogue/1');

-- SELECT only. No INSERT/UPDATE/DELETE grant exists, so there is no runtime
-- write path at all (the permissions-catalogue discipline, migration 0050).
GRANT SELECT ON public.financial_categories TO karar_app;

CREATE TABLE public.merchant_rules (
  id            uuid        PRIMARY KEY,
  pattern_kind  text        NOT NULL CHECK (pattern_kind IN ('EXACT', 'PREFIX')),
  -- The generalised, reviewed token. See the header for why each constraint
  -- exists; together they make a verbatim customer narrative unstorable.
  pattern_token text        NOT NULL,
  CONSTRAINT merchant_rules_pattern_is_lowercase
    CHECK (pattern_token = lower(pattern_token)),
  CONSTRAINT merchant_rules_pattern_length
    CHECK (length(pattern_token) BETWEEN 2 AND 64),
  CONSTRAINT merchant_rules_pattern_has_no_digits
    CHECK (pattern_token !~ '[0-9٠-٩۰-۹]'),
  CONSTRAINT merchant_rules_pattern_has_no_reference_punctuation
    CHECK (pattern_token !~ '[*#|@_]'),
  CONSTRAINT merchant_rules_pattern_is_short_and_single_spaced
    CHECK (pattern_token ~ '^[^[:space:]]+( [^[:space:]]+){0,3}$'),

  category_code text        NOT NULL REFERENCES public.financial_categories (code),
  -- The reviewed rule version that produced a match. An unversioned rule
  -- result cannot be re-derived, which makes it indistinguishable from a
  -- guess — and a guess is exactly what this module does not do.
  rule_version  text        NOT NULL CHECK (rule_version <> ''),
  -- Evidence the pattern was reviewed and generalised before entry.
  review_ref    text        NOT NULL CHECK (btrim(review_ref) <> ''),
  retired_at    timestamptz     NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT merchant_rules_unique_pattern
    UNIQUE (pattern_kind, pattern_token, rule_version)
);

COMMENT ON TABLE public.merchant_rules IS
  'NON_PERSONAL_BY_DESIGN reviewed merchant patterns (INTERNAL). Carries no '
  'tenant, user, account, transaction or statement-row column: subject '
  'linkage is structurally impossible. Patterns are generalised by '
  'constraint, not by convention — no digits in any script, no masking or '
  'reference punctuation, at most four single-spaced lowercase tokens, at '
  'most 64 characters — so the legacy''s verbatim customer narratives (C12) '
  'cannot be stored here. No score, weight or confidence column exists: a '
  'rule matched or it did not. karar_app holds SELECT ONLY. Deliberately '
  'outside RLS with an allow-list entry (rls-allow-list.json).';

CREATE INDEX merchant_rules_lookup_idx
  ON public.merchant_rules (pattern_kind, pattern_token)
  WHERE retired_at IS NULL;

GRANT SELECT ON public.merchant_rules TO karar_app;
