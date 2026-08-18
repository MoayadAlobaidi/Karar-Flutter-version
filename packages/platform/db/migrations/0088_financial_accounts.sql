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
-- fragment the schema admits is `mask`, whose CHECK permits at most FOUR
-- digits with optional masking characters — a column that cannot hold a
-- 13-to-19-digit card number or a 15-to-34-character IBAN no matter what a
-- caller sends. That is a structural guarantee, not a validation someone
-- can forget to call, and it is asserted by test. A stolen dump of this
-- table does not let anyone move money.
--
-- WHERE AN ACCOUNT COMES FROM. source_kind names the path: MANUAL (the user
-- typed it — the first-class path, and the one a cash account or an
-- unlisted institution takes), CSV (a reviewed statement import created it),
-- or EXTERNAL_PROVIDER, which is MODELLED AND UNREACHABLE. No provider is
-- integrated in Phase 5, no code path constructs that value, and the seam
-- exists so the schema does not have to be rewritten when one arrives. The
-- biconditional CHECK below is what makes "a manual account must not claim a
-- provider connection" a fact about the data rather than a comment: a row
-- carries a provider_connection_ref IF AND ONLY IF its source_kind is
-- EXTERNAL_PROVIDER. provider_connection_ref is an OPAQUE REFERENCE and is
-- never a credential — no column in this module may hold one.
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
-- both, by CHECK. The label is deliberately stored HERE, on the
-- subject-owned row, and never in the catalogue: one person's typed bank
-- name must not become global reference data every other tenant reads
-- (modules/financial-accounts/MODULE.md). Both may be null: a cash or
-- wallet account names no institution at all.
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
  -- Subject-supplied text, and the reason it lives on this row rather than
  -- in the catalogue. Bounded so it stays a name and cannot become a note.
  user_supplied_institution_label text           NULL
    CONSTRAINT financial_accounts_user_supplied_institution_label_check
    CHECK (user_supplied_institution_label IS NULL
           OR (btrim(user_supplied_institution_label) <> ''
               AND length(user_supplied_institution_label) <= 120)),
  account_type                   text        NOT NULL
    CONSTRAINT financial_accounts_account_type_check
    CHECK (account_type IN ('CURRENT', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'WALLET', 'OTHER')),
  -- Closed at the database, mirroring the shared-kernel Currency registry.
  currency_code                  text        NOT NULL
    CONSTRAINT financial_accounts_currency_code_check
    CHECK (currency_code IN
      ('QAR', 'SAR', 'AED', 'OMR', 'KWD', 'BHD', 'USD', 'EUR', 'GBP')),
  display_name                   text        NOT NULL
    CONSTRAINT financial_accounts_display_name_check
    CHECK (btrim(display_name) <> '' AND length(display_name) <= 120),
  -- MASK ONLY. At most four digits, optionally preceded by masking
  -- characters. A PAN (13-19 digits) and an IBAN (15-34 alphanumerics) are
  -- both unrepresentable here; that is the column's entire purpose.
  mask                           text            NULL
    CONSTRAINT financial_accounts_mask_check
    CHECK (mask IS NULL OR mask ~ '^[*xX#]{0,4}[0-9]{2,4}$'),
  -- The account's OWN lifecycle. No value means connected or synced, and
  -- none may be added: capability state is shown honestly, never implied by
  -- a status badge (modules/financial-accounts/MODULE.md).
  status                         text        NOT NULL
    CONSTRAINT financial_accounts_status_check
    CHECK (status IN ('ACTIVE', 'ARCHIVED', 'CLOSED')),
  source_kind                    text        NOT NULL
    CONSTRAINT financial_accounts_source_kind_check
    CHECK (source_kind IN ('MANUAL', 'CSV', 'EXTERNAL_PROVIDER')),
  -- OPAQUE reference to a future provider connection, NEVER a credential.
  -- Unreachable in Phase 5: no code path produces EXTERNAL_PROVIDER, and
  -- the biconditional below means no other source_kind may carry one.
  provider_connection_ref        text            NULL
    CONSTRAINT financial_accounts_provider_connection_ref_check
    CHECK (provider_connection_ref IS NULL OR btrim(provider_connection_ref) <> ''),
  version                        integer     NOT NULL DEFAULT 1
    CONSTRAINT financial_accounts_version_check CHECK (version >= 1),
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL,
  -- A manual (or CSV) account cannot claim a provider connection, and an
  -- external-provider account cannot exist without one.
  CONSTRAINT financial_accounts_provider_connection_check
    CHECK ((source_kind = 'EXTERNAL_PROVIDER') = (provider_connection_ref IS NOT NULL)),
  -- An institution is named exactly one way, or not at all.
  CONSTRAINT financial_accounts_institution_naming_check
    CHECK (NOT (institution_ref IS NOT NULL AND user_supplied_institution_label IS NOT NULL)),
  -- Sole purpose: the target of 0089's composite FK, which is what makes
  -- "currency cannot change once records exist" true rather than intended.
  CONSTRAINT financial_accounts_id_currency_key UNIQUE (id, currency_code)
);

COMMENT ON TABLE public.financial_accounts IS
  'HIGHLY_SENSITIVE_FINANCIAL, SUBJECT_OWNED. The accounts a subject holds '
  'as they or their statement declared them. Stores NO account number, '
  'IBAN, PAN, CVV, credential, or sync cursor — the mask column admits at '
  'most four digits by CHECK, so the sensitive identifier is structurally '
  'absent rather than merely unused. source_kind EXTERNAL_PROVIDER is '
  'modelled and unreachable (no provider is integrated); the biconditional '
  'CHECK forbids any other source_kind from carrying a provider connection. '
  'Status is the account''s own lifecycle and never means connected or '
  'synced. RLS FORCEd on BOTH principal GUCs — tenant scoping alone would '
  'let one household member read another''s accounts. version is the '
  'optimistic-concurrency token, incremented by exactly one per UPDATE by '
  'trigger. DELETE is granted deliberately: erasure strategy is '
  'CASCADE_DELETE and deleting an account is a promised first-class '
  'operation. Lifecycle: 0088 header + DATA_LIFECYCLE.md.';

COMMENT ON COLUMN public.financial_accounts.mask IS
  'Masked fragment ONLY (^[*xX#]{0,4}[0-9]{2,4}$). Never a full account '
  'number, IBAN, or PAN — those have no column anywhere in this module.';

COMMENT ON COLUMN public.financial_accounts.provider_connection_ref IS
  'Opaque forward reference for a future provider integration. NEVER a '
  'credential. Unreachable in Phase 5 — nothing constructs EXTERNAL_PROVIDER.';

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

-- Guard: identity and provenance columns immutable, version must increment
-- by exactly one per UPDATE, updated_at maintained here so no caller can
-- forge it. DELETE is deliberately NOT raised on — see the header.
CREATE FUNCTION public.financial_accounts_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id   IS DISTINCT FROM OLD.tenant_id
    OR NEW.user_id     IS DISTINCT FROM OLD.user_id
    OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
    OR NEW.created_at  IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'financial_account % identity and provenance are immutable (id, tenant_id, user_id, source_kind, created_at); a different owner or origin is a different account',
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
