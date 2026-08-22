-- 0088_financial_accounts
--
-- public.financial_accounts — the accounts a subject holds, AS THE SUBJECT
-- OR THEIR STATEMENT DECLARED THEM (modules/financial-accounts/MODULE.md).
-- This is the anchor every transaction, import, and balance snapshot is
-- scoped to, and it is the most sensitive table this phase creates:
-- SUBJECT_OWNED, classified HIGHLY_SENSITIVE_FINANCIAL, erasure strategy
-- CASCADE_DELETE.
--
-- WHAT CANNOT BE STORED HERE, AND WHY THAT IS THE POINT. There is no
-- account-number column, no IBAN column, no PAN column, no CVV column, no
-- credential column, and no synchronisation cursor. The only identifying
-- fragment the schema admits is the mask, and the column that holds it is
-- bounded at EIGHT BYTES of ciphertext — a column that cannot hold a
-- 13-to-19-digit card number or a 15-to-34-character IBAN no matter what a
-- caller sends. That is a structural guarantee, not a validation someone
-- can forget to call, and it is asserted by test. A stolen dump of this
-- table does not let anyone move money.
--
-- WHY THE SUBJECT-NARRATIVE COLUMNS ARE CIPHERTEXT AND NOT TEXT
--
-- display_name, user_supplied_institution_label and mask are
-- HIGHLY_SENSITIVE_FINANCIAL. "Al Bayt joint savings" plus an unlisted bank
-- name plus a four-digit tail identifies a person's banking relationships;
-- the table's classification always said so, and until this was corrected
-- the columns said otherwise. public.transactions (0090) — same
-- classification, same phase — stored ITS narrative as ciphertext from the
-- first line. Two modules under one classification with opposite treatment
-- means the weaker one decides what a stolen dump yields, so the weaker one
-- was the defect and this is the correction.
--
-- There is no plaintext column for any of the three: the structure, not a
-- convention, is what guarantees plaintext never lands here. Each field
-- stores ciphertext, its own fresh nonce, and its own AEAD authentication
-- tag; the algorithm and the key VERSION that produced them are per row
-- (ADR-0017: key and version provenance recorded for every encryption, so a
-- rotation leaves old rows readable and a key loss is detectable rather
-- than discovered by a user). The auth tag is the integrity metadata:
-- without it a modified ciphertext decrypts to garbage instead of failing.
-- The application binds tenant, user, table, row id and field as associated
-- data, so a ciphertext moved between columns, between rows, or between two
-- members of one household tenant fails authentication instead of
-- decrypting into a plausible wrong record.
--
-- THE MASK CHECK THAT COULD NOT SURVIVE, AND WHAT REPLACED IT. This table
-- used to carry CHECK (mask ~ '^[*xX#]{0,4}[0-9]{2,4}$') — the same regular
-- expression the domain applies. A CHECK cannot read a ciphertext, so that
-- constraint could not survive encryption and was REMOVED rather than left
-- in place as a rule that can no longer fire. The shape rule now lives in
-- exactly one place, modules/financial-accounts/domain/financial-account.ts,
-- and a test asserts this file no longer claims otherwise.
--
-- What did survive is the property that actually mattered. AES-256-GCM is
-- length-preserving, so |ciphertext| = |plaintext| exactly: bounding
-- mask_ciphertext at eight bytes bounds the mask at eight characters, which
-- is the longest string the domain pattern admits (four masking characters
-- plus four digits). A 16-digit PAN is sixteen bytes and is refused by the
-- database, encrypted or not. The identifying-fragment guarantee is
-- therefore still enforced by the schema, not merely by the application.
-- The same reasoning gives the two display fields a 360-byte bound: 120
-- characters at no more than three UTF-8 bytes per UTF-16 code unit, so a
-- field named for a NAME still cannot become a place to keep notes the
-- classification does not cover.
--
-- ORIGIN IS NOT THE CURRENT SOURCE, AND THIS TABLE USED TO CONFUSE THEM
-- (ADR-0028). origin_kind records ONE fact and only one: how this account
-- FIRST CAME TO EXIST. MANUAL (the user typed it — the first-class path, and
-- the one a cash account or an unlisted institution takes), CSV (a reviewed
-- statement import created it), or EXTERNAL_PROVIDER, which is MODELLED AND
-- UNREACHABLE — no provider is integrated in Phase 5, no code path
-- constructs that value, and the seam exists so the schema does not have to
-- be rewritten when one arrives. Origin is immutable, enforced by the guard
-- trigger below, because a different origin is a different account.
--
-- WHAT WAS REMOVED AND WHY IT HAD TO BE. This table carried source_kind and
-- a provider_connection_ref bound to it by a biconditional CHECK — a shape
-- that asserts an account has EXACTLY ONE CURRENT DATA SOURCE, permanently,
-- for its whole life. That assertion is false about real accounts and
-- expensive once anyone's data exists: an account typed by hand, then fed by
-- CSV imports, then linked to an API, then corrected by hand is ONE account
-- throughout, and a model that cannot say so forces a second account to be
-- created and the person's history to split in two (ADR-0028). Both the
-- column and its CHECK are therefore GONE rather than left as a rule that
-- describes something untrue. Current and historical sources are many per
-- account and live in an ACCOUNT-SOURCE-LINK table owned by a separate
-- workstream; nothing here models one, and nothing here may be read as
-- naming one.
--
-- The corollary is enforced by absence: a provider-origin account still
-- accepts user corrections. No column, CHECK, trigger clause, or grant on
-- this table makes an UPDATE conditional on origin_kind — the guard trigger
-- freezes origin and identity, and freezes nothing else — so an account
-- whose origin is EXTERNAL_PROVIDER is exactly as editable as one the person
-- typed. That is asserted by test against the live database rather than
-- claimed here.
--
-- MULTIPLICITY IS A HARD INVARIANT, AND IT IS ENFORCED BY WHAT IS NOT HERE.
-- An account is identified by its id and by NOTHING ELSE. There is no UNIQUE
-- constraint and no unique index over (institution_ref, user_id),
-- (institution_ref, account_type), (institution_ref, currency_code),
-- (institution_ref, account_type, currency_code), or (institution_ref,
-- wallet_kind) — and none may be added. Every one of those forbids something
-- a real person actually has: two current accounts at one bank in one
-- currency is ordinary, two credit cards from one issuer is ordinary, and two
-- mobile-money wallets from one issuer is ordinary (ADR-0028). Institution,
-- type, currency and wallet kind are ATTRIBUTES, not identity. The ONLY
-- UNIQUE constraint on this table is (id, currency_code), which adds no
-- restriction whatever — id is already the primary key — and exists solely to
-- be the target of 0089's composite foreign key. A test creates the whole
-- awkward set against live PostgreSQL, because a missing constraint is
-- exactly the kind of guarantee that is silently reintroduced by someone
-- tidying up.
--
-- THE LEGACY SURFACE THIS REPLACES. The legacy connect-a-bank screen
-- inserted a fabricated account row with an invented masked number and a
-- Synced badge; its own audit called that the single most misleading
-- surface in the product. Nothing in this schema can express that claim:
-- the status vocabulary is the account's OWN lifecycle (ACTIVE, ARCHIVED,
-- CLOSED) and contains no value meaning connected or synced, and a test
-- asserts that it never gains one.
--
-- HOW AN INSTITUTION IS NAMED, in exactly one of two ways. Either
-- institution_ref points at the reviewed catalogue (0087), or
-- user_supplied_institution_label carries what the subject typed — never
-- both, by CHECK on the PRESENCE of the label's ciphertext, which is a
-- question the database can still answer without reading the value. The
-- label is deliberately stored HERE, on the subject-owned row, and never in
-- the catalogue: one person's typed bank name must not become global
-- reference data every other tenant reads
-- (modules/financial-accounts/MODULE.md). Both may be null: a cash or
-- wallet account names no institution at all.
--
-- RETENTION IS ENFORCED IN CODE, NOT ONLY DECLARED HERE. The lifecycle
-- block below says non-local durable creation fails closed while the
-- retention decision is unresolved. That was a paragraph and nothing else
-- until CreateManualAccount and RecordReportedBalance were gated on
-- FinancialAccountRetentionDecisionPort, which refuses BEFORE any field is
-- encrypted and before any statement reaches this table. A retention claim
-- no code path can refuse is worse than an absent one, because it is
-- believed.
--
-- MONEY. This table stores no amount. Every amount in this module is BIGINT
-- MINOR UNITS plus its currency code (ADR-0006; data-model.md §1) and lives
-- in 0089; NUMERIC, DOUBLE PRECISION, and FLOAT appear nowhere on a money
-- path. currency_code is CLOSED at the database, mirroring the compile-time
-- registry in packages/shared-kernel/src/currency.ts, because an amount in
-- a currency whose minor-unit exponent the platform does not know is an
-- amount nothing can interpret. The two sets are asserted equal by test;
-- adding a currency is the reviewed process in the Currency doc comment
-- plus a migration here.
--
-- CURRENCY IMMUTABILITY, enforced where it is enforceable. An account's
-- currency may not change once financial records exist. Rather than freeze
-- the column outright — which would be wrong, since a user who mistyped the
-- currency of an empty account should be able to fix it — the rule rides
-- the composite foreign key from 0089: snapshots reference
-- (account_id, currency_code), so PostgreSQL's referential integrity
-- refuses the UPDATE the moment a single record exists. UNIQUE
-- (id, currency_code) below exists solely to be that FK's target. The use
-- case states the rule in the caller's vocabulary; the database is what
-- makes it true.
--
-- CONCURRENCY. version is the optimistic-concurrency token: the repository
-- issues UPDATE ... WHERE id = $1 AND version = $2, and the guard trigger
-- requires every UPDATE to increment it by exactly one (the kill-switch
-- pattern, 0053; the entitlement pattern, 0077). Identity columns are
-- immutable by the same trigger.
--
-- DELETE IS GRANTED HERE, which is unusual in this schema and deliberate.
-- Most tables in this repository forbid DELETE because their rows are
-- evidence. An account is not evidence — it is the subject's own record,
-- the module declares CASCADE_DELETE, and the compulsory consent document
-- promises customers they can delete individual accounts. The legacy
-- exposed a single GET and created accounts only as a side effect of
-- statement commit while making that promise; that contradiction is not
-- carried forward. Deleting an account cascades to its snapshots (0089).
--
-- RLS decision — SUBJECT RECORDS: RLS ENABLED and FORCEd, one policy keyed
-- on BOTH app.tenant_id AND app.user_id (transaction-local GUCs bound by
-- the platform's withPrincipalContext from the caller's own session and
-- membership, never from client input — tenancy.md §2), with matching USING
-- and WITH CHECK arms so reads, writes, and inserts are bounded alike.
-- NULLIF makes an unset GUC a NULL predicate: no principal context, no
-- rows — fail closed. Tenant scoping alone would be insufficient here and
-- is the failure this table cannot afford: two members of one household
-- tenant must not see each other's accounts, so the user arm is load-
-- bearing and is asserted by an adversarial same-tenant test. No allow-list
-- entry: no staff surface returns one customer's accounts, by design
-- (modules/financial-accounts/MODULE.md §Permissions).
--
-- Data lifecycle (ADR-0026; canonical in
-- modules/financial-accounts/MODULE.md, mirrored in DATA_LIFECYCLE.md):
--   public.financial_accounts
--     Subject relationship: SUBJECT_OWNED — the subject's own accounts.
--     Purpose: the accounts a subject holds, as the subject or their
--       statement declared them; the anchor every transaction and import is
--       scoped to.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: UNRESOLVED — the financial-data retention decision is a
--       legal one and has not been taken, so no period is written here.
--       Non-local ingestion fails closed until a PolicyPack decision
--       exists; LOCAL and TEST run on clearly synthetic fixtures with no
--       legal effect.
--     Export treatment: included — the subject's export contains their own
--       accounts.
--     Erasure strategy: CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP the trigger and function,
-- DROP POLICY, then DROP TABLE public.financial_accounts — which destroys
-- every subject's account record and, through 0089's cascade, every balance
-- they ever recorded. That is customer data with no other copy, so the
-- reversal is a restore-from-backup decision, not a migration.

CREATE TABLE public.financial_accounts (
  id                             uuid        PRIMARY KEY,
  -- Cross-module references (raw UUIDs, no FK across module boundaries —
  -- data-model.md §2): tenant_id -> tenancy.tenants, user_id -> identity
  -- accounts (identity_accounts.id IS the platform UserId).
  tenant_id                      uuid        NOT NULL,
  user_id                        uuid        NOT NULL,
  -- In-module FK: the catalogue is owned by this module (0087), so the
  -- reference is a real constraint rather than a raw id.
  institution_ref                uuid            NULL
    CONSTRAINT financial_accounts_institution_ref_fkey
    REFERENCES public.institutions (id),
  account_type                   text        NOT NULL
    CONSTRAINT financial_accounts_account_type_check
    CHECK (account_type IN ('CURRENT', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'WALLET', 'OTHER')),
  -- Closed at the database, mirroring the shared-kernel Currency registry.
  currency_code                  text        NOT NULL
    CONSTRAINT financial_accounts_currency_code_check
    CHECK (currency_code IN
      ('QAR', 'SAR', 'AED', 'OMR', 'KWD', 'BHD', 'USD', 'EUR', 'GBP')),

  -- Encryption context for this row's HSF fields (ADR-0017 provenance). One
  -- algorithm and one key version per ROW: the three fields are written
  -- together, always, and per-field versions would make a rotation a partial
  -- state every reader has to reason about for no gain.
  hsf_algorithm                  text        NOT NULL
    CONSTRAINT financial_accounts_hsf_algorithm_check CHECK (hsf_algorithm <> ''),
  hsf_key_version                text        NOT NULL
    CONSTRAINT financial_accounts_hsf_key_version_check CHECK (hsf_key_version <> ''),

  -- display_name is REQUIRED: an account a person cannot recognise in a list
  -- is not usable. 360 bytes is 120 characters at no more than three UTF-8
  -- bytes per UTF-16 code unit — the domain bound, expressed in the only
  -- unit an encrypted column can still measure.
  display_name_ciphertext        bytea       NOT NULL
    CONSTRAINT financial_accounts_display_name_bound_check
    CHECK (octet_length(display_name_ciphertext) <= 360),
  display_name_nonce             bytea       NOT NULL
    CONSTRAINT financial_accounts_display_name_nonce_check
    CHECK (octet_length(display_name_nonce) = 12),
  display_name_auth_tag          bytea       NOT NULL
    CONSTRAINT financial_accounts_display_name_auth_tag_check
    CHECK (octet_length(display_name_auth_tag) = 16),

  -- Subject-supplied text, and the reason it lives on this row rather than
  -- in the catalogue. Optional, as an ALL-OR-NOTHING triple: a ciphertext
  -- without its nonce or its tag is unreadable and unverifiable, so a
  -- half-written field must not be representable.
  user_supplied_institution_label_ciphertext bytea NULL
    CONSTRAINT financial_accounts_institution_label_bound_check
    CHECK (octet_length(user_supplied_institution_label_ciphertext) <= 360),
  user_supplied_institution_label_nonce      bytea NULL
    CONSTRAINT financial_accounts_institution_label_nonce_check
    CHECK (octet_length(user_supplied_institution_label_nonce) = 12),
  user_supplied_institution_label_auth_tag   bytea NULL
    CONSTRAINT financial_accounts_institution_label_auth_tag_check
    CHECK (octet_length(user_supplied_institution_label_auth_tag) = 16),
  CONSTRAINT financial_accounts_institution_label_triple
    CHECK (
      (user_supplied_institution_label_ciphertext IS NULL
       AND user_supplied_institution_label_nonce IS NULL
       AND user_supplied_institution_label_auth_tag IS NULL)
      OR (user_supplied_institution_label_ciphertext IS NOT NULL
          AND user_supplied_institution_label_nonce IS NOT NULL
          AND user_supplied_institution_label_auth_tag IS NOT NULL)
    ),

  -- MASK ONLY. Eight ciphertext bytes is eight plaintext characters under a
  -- length-preserving cipher, and eight characters is the longest string the
  -- domain's mask pattern admits: four masking characters plus four digits.
  -- A PAN (13-19 digits) and an IBAN (15-34 alphanumerics) therefore remain
  -- unrepresentable here — that is the column's entire purpose, and it
  -- survives encryption intact.
  mask_ciphertext                bytea           NULL
    CONSTRAINT financial_accounts_mask_bound_check
    CHECK (octet_length(mask_ciphertext) <= 8),
  mask_nonce                     bytea           NULL
    CONSTRAINT financial_accounts_mask_nonce_check
    CHECK (octet_length(mask_nonce) = 12),
  mask_auth_tag                  bytea           NULL
    CONSTRAINT financial_accounts_mask_auth_tag_check
    CHECK (octet_length(mask_auth_tag) = 16),
  CONSTRAINT financial_accounts_mask_triple
    CHECK (
      (mask_ciphertext IS NULL AND mask_nonce IS NULL AND mask_auth_tag IS NULL)
      OR (mask_ciphertext IS NOT NULL AND mask_nonce IS NOT NULL AND mask_auth_tag IS NOT NULL)
    ),

  -- The account's OWN lifecycle. No value means connected or synced, and
  -- none may be added: capability state is shown honestly, never implied by
  -- a status badge (modules/financial-accounts/MODULE.md).
  status                         text        NOT NULL
    CONSTRAINT financial_accounts_status_check
    CHECK (status IN ('ACTIVE', 'ARCHIVED', 'CLOSED')),
  -- HOW THIS ACCOUNT FIRST CAME TO EXIST, and nothing else. Immutable. It
  -- does not say where data comes from now, and no column here does: see the
  -- header. There is deliberately no companion connection reference.
  origin_kind                    text        NOT NULL
    CONSTRAINT financial_accounts_origin_kind_check
    CHECK (origin_kind IN ('MANUAL', 'CSV', 'EXTERNAL_PROVIDER')),
  version                        integer     NOT NULL DEFAULT 1
    CONSTRAINT financial_accounts_version_check CHECK (version >= 1),
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL,
  -- An institution is named exactly one way, or not at all. Presence, not
  -- content: whether a label EXISTS is still visible to the database once
  -- the label itself is not.
  CONSTRAINT financial_accounts_institution_naming_check
    CHECK (NOT (institution_ref IS NOT NULL
                AND user_supplied_institution_label_ciphertext IS NOT NULL)),
  -- Sole purpose: the target of 0089's composite FK, which is what makes
  -- "currency cannot change once records exist" true rather than intended.
  CONSTRAINT financial_accounts_id_currency_key UNIQUE (id, currency_code)
);

COMMENT ON TABLE public.financial_accounts IS
  'HIGHLY_SENSITIVE_FINANCIAL, SUBJECT_OWNED. The accounts a subject holds '
  'as they or their statement declared them. Stores NO account number, '
  'IBAN, PAN, CVV, credential, or sync cursor — the mask column admits at '
  'most eight ciphertext bytes, which under a length-preserving cipher is '
  'at most eight characters, so the sensitive identifier is structurally '
  'absent rather than merely unused. display_name, '
  'user_supplied_institution_label and mask exist ONLY as ciphertext + '
  'nonce + auth tag, with the algorithm and key version per row; no '
  'plaintext column exists for any of them, and tenant, user, table, row id '
  'and field are bound as associated data so a ciphertext cannot be moved '
  'between rows, columns, or subjects. origin_kind is IMMUTABLE and says '
  'only how the account FIRST came to exist (ADR-0028); it does not name a '
  'current data source, and no column here does — the one-source shape '
  '(source_kind plus a bound provider_connection_ref) was REMOVED because an '
  'account may be typed, then imported into, then linked, then corrected and '
  'remain one account. EXTERNAL_PROVIDER is modelled and unreachable (no '
  'provider is integrated), and nothing makes an UPDATE conditional on '
  'origin, so a provider-origin account still accepts user corrections. '
  'IDENTITY IS THE ID ALONE: no UNIQUE constraint exists over institution + '
  'user, institution + type, institution + currency, institution + type + '
  'currency, or issuer + wallet kind, and none may be added — two current '
  'accounts at one bank in one currency, two credit cards from one issuer, '
  'and two wallets from one issuer are all ordinary. Status is the '
  'account''s own lifecycle and never means connected or '
  'synced. RLS FORCEd on BOTH principal GUCs — tenant scoping alone would '
  'let one household member read another''s accounts. version is the '
  'optimistic-concurrency token, incremented by exactly one per UPDATE by '
  'trigger. DELETE is granted deliberately: erasure strategy is '
  'CASCADE_DELETE and deleting an account is a promised first-class '
  'operation. Lifecycle: 0088 header + DATA_LIFECYCLE.md.';

COMMENT ON COLUMN public.financial_accounts.mask_ciphertext IS
  'Encrypted masked fragment ONLY, bounded at 8 bytes. AES-256-GCM is '
  'length-preserving, so this bound is the domain pattern''s own maximum '
  '(^[*xX#]{0,4}[0-9]{2,4}$ — four masking characters plus four digits) '
  'expressed in the unit an encrypted column can still measure. A full '
  'account number, IBAN, or PAN does not fit and has no column anywhere in '
  'this module. The SHAPE rule lives in the domain: a CHECK cannot read a '
  'ciphertext, so it was removed rather than kept as a rule that cannot '
  'fire.';

COMMENT ON COLUMN public.financial_accounts.hsf_key_version IS
  'The key version that produced this row''s ciphertexts (ADR-0017). Per '
  'row, so a rotation leaves earlier rows readable instead of turning a key '
  'change into data loss a user discovers.';

COMMENT ON COLUMN public.financial_accounts.origin_kind IS
  'How this account FIRST came to exist — MANUAL, CSV, or the modelled and '
  'unreachable EXTERNAL_PROVIDER. Immutable by trigger. NOT the current data '
  'source: an account may later receive imports, be linked, and be corrected '
  'by hand while remaining one account, and the sources it has now are many '
  'and live outside this table (ADR-0028). Carries no connection reference '
  'and never a credential.';

-- The owner listing: every read this module serves is "my accounts, newest
-- or oldest first", inside one tenant.
CREATE INDEX financial_accounts_owner_idx
  ON public.financial_accounts (tenant_id, user_id, created_at);

-- Supports the catalogue-retirement question ("which accounts still point at
-- this institution?") without a sequential scan of subject data.
CREATE INDEX financial_accounts_institution_idx
  ON public.financial_accounts (institution_ref);

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts FORCE ROW LEVEL SECURITY;

-- Subject records: visible and writable only inside a transaction carrying
-- BOTH principal GUCs, bound from the caller's own session and membership —
-- never from client input (tenancy.md §2). Unset GUCs fail closed via
-- NULLIF. The user arm is load-bearing: two members of one tenant are two
-- different subjects here.
CREATE POLICY financial_accounts_subject ON public.financial_accounts
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Guard: identity and ORIGIN immutable, version must increment by exactly one
-- per UPDATE, updated_at maintained here so no caller can forge it. Note what
-- it does NOT freeze: every descriptive column stays editable regardless of
-- origin_kind, which is what keeps a provider-origin account correctable by
-- the person it belongs to (ADR-0028). DELETE is deliberately NOT raised
-- on — see the header.
CREATE FUNCTION public.financial_accounts_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id   IS DISTINCT FROM OLD.tenant_id
    OR NEW.user_id     IS DISTINCT FROM OLD.user_id
    OR NEW.origin_kind IS DISTINCT FROM OLD.origin_kind
    OR NEW.created_at  IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'financial_account % identity and origin are immutable (id, tenant_id, user_id, origin_kind, created_at); a different owner or origin is a different account, and origin never means the current data source',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'financial_account % updates must increment version by exactly one (got % after %) — the optimistic-concurrency token is not optional',
      OLD.id, NEW.version, OLD.version USING ERRCODE = 'raise_exception';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER financial_accounts_guard
  BEFORE UPDATE ON public.financial_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.financial_accounts_guard();

-- DELETE is granted here and nearly nowhere else in this schema: the module
-- declares CASCADE_DELETE and deleting an individual account is a promised
-- operation, not an administrative escape hatch.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_accounts TO karar_app;
