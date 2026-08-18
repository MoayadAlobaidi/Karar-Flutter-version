-- 0090_transactions
--
-- The canonical transaction table (modules/transactions/MODULE.md): the
-- records a subject entered manually or committed from a reviewed import.
-- This is the core the CSV pipeline commits INTO; the staging, parsing and
-- review tables belong to the ingestion migration that follows this range.
--
-- WHY MONEY IS TWO INTEGER-AND-CODE COLUMNS AND NOTHING ELSE
--
-- amount_minor is BIGINT minor units, currency_code is the ISO 4217 alphabetic
-- code, and the exponent lives on the Currency type in code (ADR-0006,
-- data-model.md §1). There is no NUMERIC, no DOUBLE PRECISION, and no FLOAT in
-- any money path in this file, deliberately: NUMERIC would invite an
-- application-side float conversion at the driver boundary, and floating point
-- cannot represent 0.1 at all. Karar's markets mix three-decimal currencies
-- (KWD, BHD, OMR) with two-decimal ones, so "minor units means cents" is wrong
-- for a third of the region — the exponent must come from Currency, never from
-- an assumption baked into a column type.
--
-- THE SIGN CONVENTION, RECORDED WHERE THE DATA LIVES
--
-- amount_minor is signed from the ACCOUNT HOLDER's point of view: money
-- leaving the account is negative, money entering it is positive. One
-- convention, every row, every currency. The alternative — an unsigned
-- magnitude plus a direction column — makes SUM(amount_minor) wrong for any
-- consumer that forgets the second column, and a plausible wrong total is
-- worse than a crash. What the SOURCE called the movement (its own DEBIT/
-- CREDIT wording, and whether it spoke in the bank-ledger frame where the
-- customer's deposit is a liability) is preserved in transaction_provenance
-- (0091), not dissolved into this sign.
--
-- WHY THE NARRATIVE COLUMNS ARE CIPHERTEXT AND NOT TEXT
--
-- Merchant, description and note are HIGHLY_SENSITIVE_FINANCIAL: a merchant
-- name plus an amount plus a date is a behavioural record of a person. There
-- is no plaintext column for any of them — the structure, not a convention, is
-- what guarantees plaintext never lands here. Each field stores ciphertext,
-- its own fresh nonce, and its own AEAD authentication tag; the algorithm and
-- the key VERSION that produced them are per row (ADR-0017: key and version
-- provenance recorded for every encryption, so a rotation leaves old rows
-- readable and a key loss is detectable rather than discovered by a user).
-- The auth tag is the integrity metadata: without it a modified ciphertext
-- decrypts to garbage instead of failing, and a financial narrative that
-- silently becomes garbage is worse than one that fails to load. The
-- application binds (table, row id, field) as associated data, so a ciphertext
-- moved between columns or rows fails authentication instead of decrypting
-- into a plausible wrong record.
--
-- THREE SEPARATE CONCEPTS, AND WHY THE KEY KEEPS THEM SEPARATE
--
-- Deduplication here is three questions, not one, and collapsing any two of
-- them is how a dedup scheme starts lying:
--
--   1. CONTENT IDENTITY — "are these the same financial content?"  That is
--      dedup_fingerprint: a keyed MAC over normalised content only (account,
--      booking day, signed minor units, currency, normalised narrative). It
--      says nothing about how many times that content occurred, and NOTHING
--      about occurrence participates in the digest. Two identical coffees
--      have ONE content identity, which is the honest answer.
--   2. LEGITIMATE REPEAT — "did that same content genuinely happen more than
--      once?"  That is occurrence_ordinal, an explicit integer column a
--      person or a reviewed import supplies. The system never guesses that a
--      repeat is legitimate.
--   3. DUPLICATE HANDLING — "has this exact occurrence already been
--      recorded?"  That is transactions_dedup_key, the unique constraint over
--      both of the above.
--
-- The earlier draft folded the occurrence ordinal INTO the fingerprint input
-- while leaving it out of the unique key. That made the digest mean "content
-- and occurrence" while the key it fed meant "content", so the commentary and
-- the SQL described different schemes, and content identity was no longer
-- recoverable from the stored digest — "how many times did this content
-- occur?" became unanswerable without recomputing every candidate ordinal.
-- The three concepts are kept apart above precisely so that cannot recur.
--
-- WHY THE UNIQUE CONSTRAINT IS SHAPED THE WAY IT IS
--
-- transactions_dedup_key makes committing the exact same occurrence of the
-- exact same content twice impossible under concurrency — not "unlikely",
-- impossible: two concurrent commits of the same statement row race for the
-- same index entry and exactly one wins, with the loser receiving 23505 and
-- the application turning it into a typed DUPLICATE_TRANSACTION outcome. An
-- application-side "SELECT then INSERT" check cannot do this; it is the
-- textbook TOCTOU that produces duplicate financial records under a
-- double-submit.
--
-- Every part of the key earns its place:
--   * dedup_fingerprint is a KEYED MAC over content, keyed per subject, never
--     a plain hash of predictable fields. A plain sha256(date|amount|merchant)
--     is a confirmation oracle: the input space is small and guessable, so
--     anyone who can read this column can test "did this person pay 45.00 QAR
--     at this merchant that day?" offline and get a definitive yes — handing
--     back exactly the behaviour the ciphertext columns exist to protect. A
--     per-subject key also stops the column becoming a cross-subject join key
--     inside a shared table.
--   * fingerprint_version participates in the key so a redefinition of the
--     fingerprint starts a fresh namespace instead of colliding with values
--     computed under the old rules. Values minted under two definitions never
--     meet, so a version bump cannot resurrect a duplicate or hide a new row.
--   * occurrence_ordinal is what keeps "exact duplicates are impossible" from
--     also meaning "two identical coffees on one day are impossible". It is a
--     column, in the key, and NOT in the digest, so the second genuine repeat
--     commits as occurrence 2 of one content identity rather than as a
--     second, unrelated identity.
--
-- WHY AN ARBITRARY ORDINAL IS NOT AN ESCAPE HATCH
--
-- If any integer were acceptable, duplicate review would be one field away
-- from optional: submit the same statement row twice with occurrence_ordinal
-- 1 and then 9999, and both commit, because (fingerprint, 9999) collides with
-- nothing. transactions_occurrence_guard closes that: an inserted ordinal
-- must be exactly one more than the highest ordinal already recorded for the
-- same (tenant, user, account, fingerprint_version, dedup_fingerprint), or 1
-- when none is recorded. So occurrence 2 is reachable only once occurrence 1
-- exists, and the only ordinal a caller can ever choose is the next one —
-- which is a claim about a real repeat, not a way around the constraint.
--
-- The guard also freezes the identity columns on UPDATE. A correction may
-- move an amount or a date (it appends a revision saying so), but rewriting
-- account_id, the fingerprint, its version, or the ordinal would relabel
-- which content and which occurrence a row IS — the same bypass by a
-- different verb.
--
-- The application repeats the same next-ordinal check inside the writing
-- transaction. That is not redundancy for its own sake: the check exists so a
-- caller gets a typed outcome naming the ordinal that WOULD be accepted, and
-- the trigger exists so the rule holds for every writer, including raw SQL
-- and the ingestion pipeline that is not built yet.
--
-- RLS decision: SUBJECT RECORDS — ENABLE and FORCE, one policy requiring BOTH
-- principal GUCs (app.tenant_id AND app.user_id), on USING and WITH CHECK
-- alike. The GUCs are transaction-local, bound by the platform's
-- withPrincipalContext from the caller's own record and never from client
-- input (tenancy.md §2). NULLIF turns an unset GUC into a NULL predicate: no
-- principal context, no rows — fail closed. Requiring BOTH is the point: one
-- tenant member must not see another member's transactions, so a tenant-only
-- predicate would be a hole inside every tenant.
--
-- DELETE is granted here, unusually for this repository, because the declared
-- erasure strategy is CASCADE_DELETE and a subject deleting their own
-- transaction is a first-class product path (MODULE.md; the legacy promised
-- exactly this in a compulsory consent document while exposing no delete path
-- at all — legacy C4/M7). The RLS policy applies to DELETE too, so the grant
-- reaches only the principal's own rows.
--
-- Data lifecycle (ADR-0026; canonical in modules/transactions/MODULE.md):
--   public.transactions
--     Subject relationship: SUBJECT_OWNED — the subject's own records.
--     Purpose: the canonical transaction records a subject entered manually
--       or committed from a reviewed import.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: UNRESOLVED — a legal decision nobody here may take. No
--       period is written; non-local ingestion fails closed until a PolicyPack
--       decision exists, and LOCAL/TEST run on synthetic fixtures with no
--       legal effect.
--     Export treatment: included — the subject's export contains their own
--       transactions.
--     Erasure strategy: CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TRIGGER and DROP FUNCTION
-- for transactions_occurrence_guard, DROP POLICY, DROP TABLE
-- public.transactions — destroying every subject's financial records and,
-- through the cascades added in 0091 and 0093, their revision history and
-- provenance with them. It would need the same review as destroying the
-- records themselves, because that is what it is.

CREATE TABLE public.transactions (
  id                     uuid        PRIMARY KEY,
  -- Cross-module references are raw UUIDs plus a locally-declared reference
  -- type (data-model.md §2): no FK crosses a module boundary, and
  -- account_reference_type says what account_id points at without a reader
  -- having to open another module's source. The closed vocabulary is a CHECK
  -- so a caller cannot invent a third kind at runtime.
  tenant_id              uuid        NOT NULL,
  user_id                uuid        NOT NULL,
  account_id             uuid        NOT NULL,
  account_reference_type text        NOT NULL
    CHECK (account_reference_type IN ('FINANCIAL_ACCOUNT')),

  -- Money: BIGINT minor units + ISO 4217 code. No NUMERIC, no FLOAT, ever.
  amount_minor           bigint      NOT NULL,
  currency_code          char(3)     NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),

  -- The amount a source stated in ITS currency, as an ALL-OR-NOTHING pair.
  -- No derived exchange rate is computed or stored anywhere: dividing the
  -- booked amount by the original would produce a figure that silently
  -- absorbs the institution's spread, its fees and its rounding — a number
  -- this platform never observed and could not defend.
  original_amount_minor  bigint          NULL,
  original_currency_code char(3)         NULL CHECK (original_currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT transactions_original_amount_pair
    CHECK ((original_amount_minor IS NULL) = (original_currency_code IS NULL)),
  -- A "source currency" equal to the booked currency records nothing and
  -- invites a redundant second copy of the same figure that can drift.
  CONSTRAINT transactions_original_currency_differs
    CHECK (original_currency_code IS NULL OR original_currency_code <> currency_code),

  booking_date           date        NOT NULL,
  -- Optional and never inferred: a value date copied from the booking date
  -- would assert a fact the source did not state.
  value_date             date            NULL,

  -- Encryption context for this row's HSF fields (ADR-0017 provenance).
  hsf_algorithm          text        NOT NULL CHECK (hsf_algorithm <> ''),
  hsf_key_version        text        NOT NULL CHECK (hsf_key_version <> ''),

  -- description is required: a transaction with no narrative at all cannot be
  -- explained to the person it belongs to.
  description_ciphertext bytea       NOT NULL,
  description_nonce      bytea       NOT NULL CHECK (octet_length(description_nonce) = 12),
  description_auth_tag   bytea       NOT NULL CHECK (octet_length(description_auth_tag) = 16),

  -- merchant and note are optional, each as an all-or-nothing triple: a
  -- ciphertext without its nonce or its tag is unreadable and unverifiable,
  -- so a half-written field must not be representable.
  merchant_ciphertext    bytea           NULL,
  merchant_nonce         bytea           NULL CHECK (octet_length(merchant_nonce) = 12),
  merchant_auth_tag      bytea           NULL CHECK (octet_length(merchant_auth_tag) = 16),
  CONSTRAINT transactions_merchant_triple
    CHECK (
      (merchant_ciphertext IS NULL AND merchant_nonce IS NULL AND merchant_auth_tag IS NULL)
      OR (merchant_ciphertext IS NOT NULL AND merchant_nonce IS NOT NULL AND merchant_auth_tag IS NOT NULL)
    ),

  note_ciphertext        bytea           NULL,
  note_nonce             bytea           NULL CHECK (octet_length(note_nonce) = 12),
  note_auth_tag          bytea           NULL CHECK (octet_length(note_auth_tag) = 16),
  CONSTRAINT transactions_note_triple
    CHECK (
      (note_ciphertext IS NULL AND note_nonce IS NULL AND note_auth_tag IS NULL)
      OR (note_ciphertext IS NOT NULL AND note_nonce IS NOT NULL AND note_auth_tag IS NOT NULL)
    ),

  source_kind            text        NOT NULL CHECK (source_kind IN ('MANUAL', 'CSV')),
  status                 text        NOT NULL CHECK (status IN ('POSTED', 'VOIDED')),

  -- Keyed, versioned CONTENT identity — occurrence plays no part in it.
  -- Opaque: the only supported operation is equality against another value of
  -- the same version.
  dedup_fingerprint      text        NOT NULL CHECK (dedup_fingerprint <> ''),
  fingerprint_version    text        NOT NULL CHECK (fingerprint_version <> ''),
  -- Which occurrence of that content this row is. Explicit, never inferred,
  -- and constrained to the next unused value by transactions_occurrence_guard.
  occurrence_ordinal     integer     NOT NULL DEFAULT 1 CHECK (occurrence_ordinal >= 1),

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- Optimistic concurrency: incremented by exactly one per accepted
  -- correction, so two concurrent editors cannot silently discard each
  -- other's change.
  version                integer     NOT NULL DEFAULT 1 CHECK (version >= 1),

  -- Content identity AND occurrence. Both, because one without the other
  -- either forbids a genuine repeat or permits an unlimited number of them.
  CONSTRAINT transactions_dedup_key
    UNIQUE (tenant_id, user_id, account_id, fingerprint_version, dedup_fingerprint,
            occurrence_ordinal)
);

COMMENT ON TABLE public.transactions IS
  'SUBJECT_OWNED canonical transactions (HIGHLY_SENSITIVE_FINANCIAL). Money is '
  'BIGINT minor units + ISO 4217 code — no NUMERIC, no FLOAT anywhere in the '
  'money path (ADR-0006). Amounts are signed from the ACCOUNT HOLDER''s frame: '
  'money out is negative. The source''s own debit/credit wording is preserved '
  'in transaction_provenance, never dissolved into the sign. Merchant, '
  'description and note exist ONLY as ciphertext + nonce + auth tag, with the '
  'algorithm and key version per row; no plaintext column exists. '
  'Deduplication keeps three concepts apart: dedup_fingerprint is CONTENT '
  'identity (a per-subject keyed MAC over normalised content, never a plain '
  'hash of predictable fields, and carrying nothing about occurrence); '
  'occurrence_ordinal is which legitimate repeat of that content a row is; '
  'transactions_dedup_key is duplicate handling, unique over both, so an '
  'exact duplicate is impossible under concurrency while a genuine repeat '
  'stays recordable. transactions_occurrence_guard forces an inserted ordinal '
  'to be the next unused one, so duplicate review cannot be skipped by '
  'choosing a high number, and freezes the identity columns on UPDATE. RLS '
  'ENABLEd and FORCEd on BOTH principal GUCs.';

COMMENT ON COLUMN public.transactions.amount_minor IS
  'Signed minor units in currency_code. Negative = money left the account. '
  'The exponent lives on the Currency type (KWD/BHD/OMR are 3-decimal).';
COMMENT ON COLUMN public.transactions.dedup_fingerprint IS
  'CONTENT identity: a per-subject keyed MAC over normalised content (never '
  'over ciphertext or key material, which change on rotation, and never over '
  'occurrence_ordinal, which is a separate column so that content identity '
  'stays recoverable). Opaque; equality only.';
COMMENT ON COLUMN public.transactions.occurrence_ordinal IS
  'Which occurrence of dedup_fingerprint this row is: 1 for the first, 2 for a '
  'genuine identical repeat. Supplied explicitly by a person or a reviewed '
  'import, never inferred, and constrained by transactions_occurrence_guard to '
  'the next unused ordinal for its content identity.';

-- Keyset pagination reads newest-first, either across all of a principal's
-- accounts or within one. Two indexes because the leading columns differ; a
-- single index would leave the cross-account read scanning.
CREATE INDEX transactions_owner_recent_idx
  ON public.transactions (tenant_id, user_id, booking_date DESC, id DESC);
CREATE INDEX transactions_account_recent_idx
  ON public.transactions (tenant_id, user_id, account_id, booking_date DESC, id DESC);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;

-- Both GUCs, on read and on write. An unset GUC is NULL after NULLIF, and
-- `column = NULL` is never true: no principal context, no rows.
CREATE POLICY transactions_subject ON public.transactions
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- DELETE is granted deliberately (see header): CASCADE_DELETE is the declared
-- erasure strategy and subject-initiated deletion is a product promise.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO karar_app;

-- The next-ordinal rule and the identity freeze (see the header). BEFORE ROW
-- so the refusal happens before the row exists, and SECURITY INVOKER so the
-- lookup runs under the caller's own RLS policy — the only rows that may
-- inform the answer are the principal's own, which is exactly the scope the
-- content identity is defined over.
-- Custom SQLSTATEs, so a caller can tell these apart structurally instead of by
-- reading the message text.
--
--   KAR01  the occurrence ordinal is not the next unused one for this content
--          identity. Under concurrency this is the arm that fires: the writer's
--          own pre-check passed because it read max(ordinal) before the winner
--          committed, and this trigger is what catches it. A caller that cannot
--          distinguish it from a generic failure cannot tell "this row is a
--          duplicate, skip it" from "the store is broken, stop" — which is the
--          distinction a bulk statement import is built on.
--   KAR02  the dedup identity of an existing row was rewritten.
--
-- PostgreSQL reserves class 'P0' for PL/pgSQL (P0001 is the generic
-- raise_exception both of these used to raise). 'KAR' is outside every class
-- the standard and PostgreSQL assign, so it cannot collide with a server error.

CREATE FUNCTION public.transactions_occurrence_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_ordinal integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- A correction moves values and appends a revision; it never relabels
    -- WHICH content or WHICH occurrence the row is.
    IF NEW.tenant_id           IS DISTINCT FROM OLD.tenant_id
      OR NEW.user_id            IS DISTINCT FROM OLD.user_id
      OR NEW.account_id         IS DISTINCT FROM OLD.account_id
      OR NEW.fingerprint_version IS DISTINCT FROM OLD.fingerprint_version
      OR NEW.dedup_fingerprint  IS DISTINCT FROM OLD.dedup_fingerprint
      OR NEW.occurrence_ordinal IS DISTINCT FROM OLD.occurrence_ordinal
    THEN
      RAISE EXCEPTION 'transaction % may not have its dedup identity rewritten: tenant, user, account, fingerprint, fingerprint version and occurrence ordinal are what say which content and which occurrence this row IS. A different movement is a different transaction (modules/transactions/MODULE.md)',
        OLD.id USING ERRCODE = 'KAR02';
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(max(existing.occurrence_ordinal), 0) + 1
    INTO next_ordinal
    FROM public.transactions AS existing
   WHERE existing.tenant_id           = NEW.tenant_id
     AND existing.user_id             = NEW.user_id
     AND existing.account_id          = NEW.account_id
     AND existing.fingerprint_version = NEW.fingerprint_version
     AND existing.dedup_fingerprint   = NEW.dedup_fingerprint;

  IF NEW.occurrence_ordinal <> next_ordinal THEN
    RAISE EXCEPTION 'occurrence_ordinal % is not the next occurrence of this content identity (the next unused ordinal is %). An occurrence ordinal claims that identical content genuinely happened again; choosing an arbitrary higher number would commit a duplicate without any review having taken place (modules/transactions/MODULE.md)',
      NEW.occurrence_ordinal, next_ordinal USING ERRCODE = 'KAR01';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_occurrence_guard
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.transactions_occurrence_guard();
