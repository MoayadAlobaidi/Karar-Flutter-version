-- 0089_financial_account_balance_snapshots
--
-- public.financial_account_balance_snapshots — balances AS A SOURCE
-- REPORTED THEM at a stated moment, never a figure this platform computed
-- (modules/financial-accounts/MODULE.md). SUBJECT_OWNED, classified
-- HIGHLY_SENSITIVE_FINANCIAL, erasure strategy CASCADE_DELETE.
--
-- THE ONE RULE THIS TABLE EXISTS TO KEEP. A balance here is a FACT SOMEONE
-- ELSE ASSERTED — the figure printed on a statement, or the figure the user
-- typed — recorded with WHO said it (source_kind), WHICH artefact said it
-- (source_reference), WHEN it was true (as_of), and WHEN this platform
-- learned it (captured_at). It is never derived by summing transactions.
-- Summing transactions produces a number that looks authoritative and is
-- wrong the moment a single transaction is missing, misdated, or
-- duplicated, and the user cannot tell the difference — so a computed
-- running balance is a different concept that must arrive with its own
-- name, its own column, and its own honest label, rather than being
-- silently written into this table. Nothing in this module computes one.
--
-- MONEY IS BIGINT MINOR UNITS, ALWAYS (ADR-0006; data-model.md §1).
-- amount_minor_units is BIGINT and currency_code names the currency whose
-- ISO 4217 exponent scales it — 1000 minor units is ten QAR or one KWD
-- depending on that code, so the code travels with every amount and the
-- exponent is never assumed. NUMERIC, DOUBLE PRECISION, and FLOAT appear
-- nowhere on a money path in this module; a binary float cannot represent
-- 0.10 exactly and a money path that rounds implicitly is the defect
-- ADR-0006 exists to prevent. The value is deliberately signed: a credit
-- card reports a negative balance, and forcing it positive would make the
-- schema lie about debt.
--
-- THE COMPOSITE FOREIGN KEY IS DOING TWO JOBS. (account_id, currency_code)
-- references financial_accounts (id, currency_code), so:
--   1. a snapshot can never carry a currency its account does not have —
--      a mismatched pair has no parent row to point at; and
--   2. an account's currency cannot change once any record exists — the
--      UPDATE has referencing rows and referential integrity refuses it.
-- That second effect is how the module's currency-immutability invariant
-- becomes true rather than merely stated. ON DELETE CASCADE carries the
-- module's declared CASCADE_DELETE erasure strategy: deleting an account
-- takes its balance history with it, by the database, whether or not
-- application code remembers.
--
-- as_of AND captured_at ARE BOTH REQUIRED and are deliberately not
-- constrained relative to each other. as_of is when the balance was true;
-- captured_at is when this platform recorded it. The obvious CHECK
-- (captured_at >= as_of) was considered and rejected: forward value dates
-- are real, and a constraint that rejects legitimate data teaches callers
-- to work around the schema. The ordering semantics are documented instead.
--
-- APPEND-ONLY, by two mechanisms (data-model.md §10). A reported fact does
-- not change: if a source reports a different figure, that is a NEW
-- snapshot at a new as_of, and the history of what was believed when stays
-- readable. karar_app therefore holds NO UPDATE grant, and the immutability
-- trigger raises on UPDATE and TRUNCATE even for the table owner. DELETE is
-- granted, exactly as on 0088 and for the same reason: erasure is
-- CASCADE_DELETE and the subject may delete their own records.
--
-- RLS decision — SUBJECT RECORDS, the same shape as 0088: RLS ENABLED and
-- FORCEd, one policy keyed on BOTH app.tenant_id AND app.user_id
-- (transaction-local GUCs bound by withPrincipalContext, never from client
-- input — tenancy.md §2), USING and WITH CHECK alike. NULLIF makes an unset
-- GUC a NULL predicate: no principal context, no rows — fail closed. The
-- tenant_id and user_id columns are carried on this table rather than only
-- reached through the account, so the policy is a predicate on the row
-- itself and does not depend on a join staying correct.
--
-- Data lifecycle (ADR-0026; canonical in
-- modules/financial-accounts/MODULE.md, mirrored in DATA_LIFECYCLE.md):
--   public.financial_account_balance_snapshots
--     Subject relationship: SUBJECT_OWNED — the subject's own balances.
--     Purpose: balances as a source reported them at a stated moment, with
--       the provenance that makes each figure explainable; never a figure
--       this platform computed.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: UNRESOLVED — the financial-data retention decision is a
--       legal one and has not been taken, so no period is written here.
--       Non-local ingestion fails closed until a PolicyPack decision
--       exists; LOCAL and TEST run on clearly synthetic fixtures with no
--       legal effect.
--     Export treatment: included — alongside the account.
--     Erasure strategy: CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP the trigger and function,
-- DROP POLICY, then DROP TABLE
-- public.financial_account_balance_snapshots — destroying every balance
-- every subject recorded, and releasing the referential guarantee that
-- currently makes an account's currency immutable while records exist. That
-- is a restore-from-backup decision, not a migration.

CREATE TABLE public.financial_account_balance_snapshots (
  id                 uuid        PRIMARY KEY,
  -- Cross-module references (raw UUIDs, no FK across module boundaries —
  -- data-model.md §2): tenant_id -> tenancy.tenants, user_id -> identity
  -- accounts. Carried on the row so the RLS predicate needs no join.
  tenant_id          uuid        NOT NULL,
  user_id            uuid        NOT NULL,
  account_id         uuid        NOT NULL,
  -- Exact integer minor units, signed (a credit card owes money).
  amount_minor_units bigint      NOT NULL,
  -- The currency whose ISO 4217 exponent scales the minor units. Closed at
  -- the database, mirroring the shared-kernel Currency registry and 0088.
  currency_code      text        NOT NULL
    CONSTRAINT financial_account_balance_snapshots_currency_code_check
    CHECK (currency_code IN
      ('QAR', 'SAR', 'AED', 'OMR', 'KWD', 'BHD', 'USD', 'EUR', 'GBP')),
  -- When the balance was true, per the source.
  as_of              timestamptz NOT NULL,
  -- Who reported it. EXTERNAL_PROVIDER is modelled and unreachable in Phase
  -- 5, exactly as on the account (0088).
  source_kind        text        NOT NULL
    CONSTRAINT financial_account_balance_snapshots_source_kind_check
    CHECK (source_kind IN ('MANUAL', 'CSV', 'EXTERNAL_PROVIDER')),
  -- WHICH artefact reported it: an opaque in-module reference such as the
  -- statement import that produced the figure. Required, because a balance
  -- whose origin is unrecorded cannot be explained to the person it belongs
  -- to.
  source_reference   text        NOT NULL
    CONSTRAINT financial_account_balance_snapshots_source_reference_check
    CHECK (btrim(source_reference) <> '' AND length(source_reference) <= 200),
  -- When this platform learned it. Deliberately unconstrained against
  -- as_of; see the header.
  captured_at        timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Two guarantees in one constraint: a snapshot's currency always matches
  -- its account's, and an account's currency cannot change while any
  -- snapshot exists. CASCADE carries the declared CASCADE_DELETE erasure.
  CONSTRAINT financial_account_balance_snapshots_account_fkey
    FOREIGN KEY (account_id, currency_code)
    REFERENCES public.financial_accounts (id, currency_code)
    ON DELETE CASCADE
);

COMMENT ON TABLE public.financial_account_balance_snapshots IS
  'HIGHLY_SENSITIVE_FINANCIAL, SUBJECT_OWNED. Balances AS A SOURCE REPORTED '
  'THEM, with provenance (source_kind, source_reference), the instant they '
  'were true (as_of), and the instant this platform learned them '
  '(captured_at). NEVER computed by summing transactions — a derived '
  'running balance is a different concept and has no column here. Money is '
  'BIGINT minor units plus its currency code; no NUMERIC, DOUBLE PRECISION, '
  'or FLOAT exists on any money path. The composite FK to '
  '(financial_accounts.id, currency_code) makes a currency mismatch '
  'unrepresentable AND freezes an account''s currency while records exist; '
  'ON DELETE CASCADE carries the declared CASCADE_DELETE erasure. '
  'Append-only by both mechanisms: no UPDATE grant, plus a trigger raising '
  'on UPDATE/TRUNCATE even for the owner. RLS FORCEd on BOTH principal '
  'GUCs. Lifecycle: 0089 header + DATA_LIFECYCLE.md.';

COMMENT ON COLUMN public.financial_account_balance_snapshots.amount_minor_units IS
  'Exact signed integer minor units; scale is 10^exponent of currency_code '
  '(ADR-0006). Never a float, never assumed to be cents.';

-- The read this module serves: one owner's snapshots for one account, in
-- balance-date order.
CREATE INDEX financial_account_balance_snapshots_owner_idx
  ON public.financial_account_balance_snapshots (tenant_id, user_id, account_id, as_of);

ALTER TABLE public.financial_account_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_account_balance_snapshots FORCE ROW LEVEL SECURITY;

-- Same subject-record shape as 0088: BOTH principal GUCs, USING and WITH
-- CHECK, unset GUCs failing closed through NULLIF.
CREATE POLICY financial_account_balance_snapshots_subject
  ON public.financial_account_balance_snapshots
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Immutability: mechanism two (mechanism one is the absent UPDATE grant).
-- FOR EACH STATEMENT so a zero-row UPDATE raises too — an UPDATE that
-- silently matched nothing is still an attempt to rewrite a reported fact.
CREATE FUNCTION public.financial_account_balance_snapshots_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'financial_account_balance_snapshots rows are reported facts: % is not permitted, even for the table owner — a corrected figure is a NEW snapshot (data-model.md §10)',
    TG_OP USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER financial_account_balance_snapshots_immutable
  BEFORE UPDATE OR TRUNCATE ON public.financial_account_balance_snapshots
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.financial_account_balance_snapshots_immutable();

-- No UPDATE: a reported fact is never edited. DELETE for the same reason as
-- 0088 — CASCADE_DELETE erasure, and the subject may delete their own
-- records; the FK cascade covers the account-deleted path besides.
GRANT SELECT, INSERT, DELETE ON public.financial_account_balance_snapshots TO karar_app;
