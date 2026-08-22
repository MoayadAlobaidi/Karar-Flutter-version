-- 0094_institution_markets
--
-- public.institution_markets — WHERE an issuer operates, one row per
-- (institution, country), and under what reviewed status
-- (modules/financial-accounts/MODULE.md; ADR-0028). A global issuer that
-- operates in four countries is ONE row in public.institutions (0087) and
-- FOUR rows here. It is never four issuers.
--
-- THE SHAPE THIS TABLE EXISTS TO PREVENT. The obvious alternative is to put
-- the country on the catalogue row itself — one institution row per country,
-- codes prefixed with the country, done in an afternoon. It fails in a way
-- nobody notices until data exists: the same group becomes several issuers,
-- accounts scatter across them by whichever one a picker happened to show,
-- and the only repair is a MERGE. Merging catalogue rows means rewriting the
-- institution_ref on subject-owned account rows across every tenant at once,
-- which is the single operation most likely to attach one person's account to
-- another person's institution and be undiscoverable afterwards. So the
-- duplication is prevented by the schema rather than repaired later: the
-- issuer is identified once, and everything geographic hangs off this table.
--
-- COUNTRY IS NOT JURISDICTION, AND THIS TABLE KEYS ON COUNTRY.
-- docs/architecture/jurisdiction-policy.md §1 keeps the two apart on purpose
-- and this module follows it exactly: Country (0070) is WHERE,
-- geographically — an ISO 3166-1 alpha-2 code carrying no business rule.
-- Jurisdiction (0071) is WHICH LEGAL REGIME GOVERNS — the POLICY KEY, usually
-- but not always one per country (AE and AE-DIFC are one country and two
-- regimes). Market presence is a question about the first, not the second: an
-- issuer operates in a country, and whether Karar may serve a subject under a
-- given regime is a PolicyPack decision that has nothing to do with which
-- issuers exist there. Keying this table on a jurisdiction code would import
-- a legal-regime dimension into reference data that asserts no legal fact,
-- and would silently multiply an issuer's rows every time a free zone was
-- declared. There is therefore NO jurisdiction column here and none may be
-- added; a test asserts its absence.
--
-- country_code IS A RAW REFERENCE, NOT A FOREIGN KEY, and that is the
-- repository's rule rather than an omission: public.countries is owned by
-- modules/jurisdiction and no foreign key crosses a module boundary
-- (data-model.md §2). The pattern CHECK is what keeps the column an ISO code
-- instead of a place name, exactly as public.capability_availability holds
-- its jurisdiction_ref (0076). institution_ref IS a real foreign key, because
-- public.institutions is owned by THIS module.
--
-- A ROW ASSERTS NO LEGAL FACT, AND THE EVIDENCE COLUMNS ARE HOW THAT STAYS
-- TRUE. regulatory_status_evidence_ref holds either a structured reference to
-- the evidence a review recorded, or the literal 'UNVERIFIED'. There is no
-- third option and no way to write a bare claim: the only string that can say
-- anything other than UNVERIFIED is one that NAMES its evidence, so
-- "regulated" without a reference is not a state this schema can express
-- (the licence-register discipline of 0061; ADR-0024 — a row never implies a
-- legal fact). UNVERIFIED is the DEFAULT and the honest ground state, because
-- no review has happened.
--
-- PROVIDER ACCESS IS A PER-MARKET STATUS AND IS ALMOST ALWAYS NOTHING.
-- provider_access_status says whether Karar can receive data about accounts
-- at this issuer in this country. It is NOT_IMPLEMENTED by default and that
-- is the truth everywhere: only MANUAL entry and user CSV upload are
-- implemented, no provider is integrated, no credential is stored anywhere in
-- this platform, and no issuer named in this catalogue exposes an API to
-- Karar (ADR-0028). AVAILABLE cannot be written without evidence — the CHECK
-- below refuses it while provider_access_evidence_ref is UNVERIFIED — so the
-- claim that would be most damaging to make carelessly is the one claim the
-- schema will not accept on its own say-so. No interface may render any of
-- these values as "Connected".
--
-- REVIEWED DISPLAY INFORMATION, and why it is optional. The issuer's own
-- en/ar names live on the catalogue row. A market may need DIFFERENT names —
-- a group trading under a local brand — so this table carries an optional
-- local pair, all-or-nothing (a market cannot ship half-translated any more
-- than the catalogue can), and display_review_ref names the review that
-- approved what this row displays. When the local pair is absent the issuer's
-- own names are what the product shows; there is deliberately no fallback
-- logic in the schema, because a NULL that means "use the other one" is
-- clearer than a copy that can drift.
--
-- SEEDED EMPTY, for the same reason 0087 is. Naming an issuer is a
-- commercial and legal act; naming the countries it operates in and the
-- status it holds there is a larger one. The review has not happened, the
-- product is fully functional with zero rows (an account names its
-- institution through the subject-owned label path), and each future entry
-- arrives as its own reviewed migration.
--
-- RLS decision — ALLOW-LISTED (packages/platform/db/rls-allow-list.json),
-- NOT RLS, exactly as public.institutions is. This is PUBLIC platform
-- reference data about ORGANISATIONS: there is no tenant column, no user
-- column, no account column and no column that can hold subject-supplied
-- text, so there is no principal predicate to build a policy from, and every
-- principal in every tenant — including the pre-tenant composition that
-- renders a picker — reads the same rows. RLS ENABLEd with USING (true) was
-- considered and rejected for the reason recorded in 0087: it protects
-- nothing while removing the table from the register of tables consciously
-- left outside the tenant boundary, which is the one place a reviewer looks.
-- Compensating controls: karar_app is SELECT-ONLY (no INSERT, UPDATE or
-- DELETE grant exists at all), the set changes only by reviewed migration,
-- withdrawal from a market is a STATUS and never a vanished row, and the
-- shape forbids subject linkage.
--
-- Data lifecycle (ADR-0026; canonical in
-- modules/financial-accounts/MODULE.md, mirrored in DATA_LIFECYCLE.md):
--   public.institution_markets
--     Subject relationship: NON_PERSONAL — issuer, country, review states and
--       evidence references; no column references a person, and no linkage to
--       any subject exists, so re-identification is impossible by
--       construction.
--     Purpose: where a reviewed issuer operates, per country, with the market
--       status, the regulatory evidence reference, the reviewed display
--       information and the provider-access status that apply there.
--     Classification: PUBLIC.
--     Retention: the catalogue outlives any account naming the issuer; no
--       subject-derived bound applies.
--     Export treatment: n/a — no subject owns a catalogue row.
--     Erasure strategy: NON_PERSONAL_BY_DESIGN.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE
-- public.institution_markets, which destroys the only record of which
-- markets were reviewed and on what evidence; withdrawing a market is the
-- WITHDRAWN status, never a removed row.

CREATE TABLE public.institution_markets (
  id                             uuid        PRIMARY KEY,
  -- In-module FK: public.institutions is owned by this module (0087), so the
  -- reference is a real constraint. Retirement of an issuer is a status
  -- there, so this FK never has to survive a deleted parent.
  institution_ref                uuid        NOT NULL
    CONSTRAINT institution_markets_institution_ref_fkey
    REFERENCES public.institutions (id),
  -- COUNTRY (0070), never Jurisdiction (0071) — see the header. Raw
  -- reference with a shape CHECK rather than a foreign key, because
  -- public.countries belongs to modules/jurisdiction and no FK crosses a
  -- module boundary (data-model.md §2).
  country_code                   text        NOT NULL
    CONSTRAINT institution_markets_country_code_check CHECK (country_code ~ '^[A-Z]{2}$'),
  -- Whether the issuer operates here, as the review found it. UNKNOWN is a
  -- legitimate and honest answer; it is not a placeholder, and it is what a
  -- row says before anyone has established otherwise.
  market_status                  text        NOT NULL DEFAULT 'UNKNOWN'
    CONSTRAINT institution_markets_market_status_check
    CHECK (market_status IN ('OPERATING', 'SUSPENDED', 'WITHDRAWN', 'UNKNOWN')),
  -- Either the literal 'UNVERIFIED', or a reference that NAMES the evidence.
  -- A bare regulatory claim has no representation here at all.
  regulatory_status_evidence_ref text        NOT NULL DEFAULT 'UNVERIFIED'
    CONSTRAINT institution_markets_regulatory_evidence_check
    CHECK (regulatory_status_evidence_ref = 'UNVERIFIED'
           OR regulatory_status_evidence_ref ~ '^[a-z][a-z0-9-]{2,31}:[A-Za-z0-9._~/-]{1,128}$'),
  -- The local trading names, when this market shows something other than the
  -- issuer's own. All-or-nothing: a market cannot ship half-translated.
  local_display_name_en          text            NULL
    CONSTRAINT institution_markets_local_display_name_en_check
    CHECK (btrim(local_display_name_en) <> ''),
  local_display_name_ar          text            NULL
    CONSTRAINT institution_markets_local_display_name_ar_check
    CHECK (btrim(local_display_name_ar) <> ''),
  -- Which review approved what this row displays. Required, so an unreviewed
  -- market entry has nowhere to hide (the merchant-pattern discipline, 0092).
  display_review_ref             text        NOT NULL
    CONSTRAINT institution_markets_display_review_ref_check
    CHECK (btrim(display_review_ref) <> ''),
  -- Whether Karar can receive data about accounts at this issuer here.
  -- NOT_IMPLEMENTED is the default and is the truth in every market today.
  provider_access_status         text        NOT NULL DEFAULT 'NOT_IMPLEMENTED'
    CONSTRAINT institution_markets_provider_access_status_check
    CHECK (provider_access_status IN
      ('NOT_IMPLEMENTED', 'UNAVAILABLE', 'UNDER_EVALUATION', 'AVAILABLE')),
  provider_access_evidence_ref   text        NOT NULL DEFAULT 'UNVERIFIED'
    CONSTRAINT institution_markets_provider_access_evidence_check
    CHECK (provider_access_evidence_ref = 'UNVERIFIED'
           OR provider_access_evidence_ref ~ '^[a-z][a-z0-9-]{2,31}:[A-Za-z0-9._~/-]{1,128}$'),
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL,
  -- ONE market row per issuer per country. This is the uniqueness that STOPS
  -- the issuer being duplicated, and it is the only uniqueness this design
  -- wants anywhere: note that no constraint in this module ever makes an
  -- ACCOUNT unique by institution, type, currency or wallet kind (0088).
  CONSTRAINT institution_markets_institution_country_key
    UNIQUE (institution_ref, country_code),
  -- Both local names or neither.
  CONSTRAINT institution_markets_local_display_pair
    CHECK ((local_display_name_en IS NULL) = (local_display_name_ar IS NULL)),
  -- The one claim the schema refuses on its own say-so: AVAILABLE requires
  -- named evidence. Nothing is AVAILABLE today, and nothing may become so
  -- because a row was edited hopefully.
  CONSTRAINT institution_markets_available_requires_evidence
    CHECK (provider_access_status <> 'AVAILABLE'
           OR provider_access_evidence_ref <> 'UNVERIFIED')
);

COMMENT ON TABLE public.institution_markets IS
  'PUBLIC, NON_PERSONAL. Where a reviewed issuer operates: one row per '
  '(institution, country), so a global issuer in four countries stays ONE '
  'issuer (0087) with four market rows rather than four issuers that would '
  'later have to be merged. Keyed on COUNTRY (0070) and never on '
  'JURISDICTION (0071) — country is geography, jurisdiction is the legal '
  'policy key, and there is no jurisdiction column here by design '
  '(jurisdiction-policy.md §1). country_code is a raw reference with a shape '
  'CHECK because no FK crosses a module boundary; institution_ref IS an FK '
  'because 0087 is owned here. A row asserts NO legal fact: the regulatory '
  'column holds either named evidence or the literal UNVERIFIED, which is '
  'the default. provider_access_status is NOT_IMPLEMENTED everywhere — no '
  'provider is integrated and no credential is stored — and AVAILABLE is '
  'refused by CHECK unless evidence is named. Structurally incapable of '
  'subject linkage: no tenant, user, account, or subject-supplied column. '
  'Allow-listed rather than RLS''d (rls-allow-list.json); karar_app is '
  'SELECT-only and the set changes by reviewed migration. Seeded EMPTY. '
  'Lifecycle: 0094 header + DATA_LIFECYCLE.md.';

COMMENT ON COLUMN public.institution_markets.country_code IS
  'ISO 3166-1 alpha-2, referencing public.countries (0070) WITHOUT a foreign '
  'key — no FK crosses a module boundary (data-model.md §2). Country, not '
  'Jurisdiction: geography, carrying no business rule and no legal regime.';

COMMENT ON COLUMN public.institution_markets.regulatory_status_evidence_ref IS
  'Either the literal ''UNVERIFIED'' — the default and the honest ground '
  'state — or a structured reference naming the evidence a review recorded. '
  'There is no way to state a regulatory position without naming its '
  'evidence, which is what keeps a catalogue row from implying a legal fact '
  '(ADR-0024).';

COMMENT ON COLUMN public.institution_markets.provider_access_status IS
  'Whether Karar can receive data about accounts at this issuer in this '
  'country. NOT_IMPLEMENTED by default and in fact: only manual entry and '
  'user CSV upload are implemented, and no issuer exposes an API to this '
  'platform (ADR-0028). AVAILABLE requires named evidence by CHECK. No '
  'interface may render any value here as ''Connected''.';

-- The two reads this table serves: "which markets does this issuer have?"
-- (covered by the unique constraint's index) and "which issuers operate in
-- this country?", which is the picker's question.
CREATE INDEX institution_markets_country_idx
  ON public.institution_markets (country_code, market_status);

-- Read-only for the application, exactly as the catalogue is: market
-- presence changes by reviewed migration, and no runtime write path exists.
GRANT SELECT ON public.institution_markets TO karar_app;

-- No seed rows, deliberately: see SEEDED EMPTY above.
