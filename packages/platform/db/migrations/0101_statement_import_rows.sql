-- 0101_statement_import_rows
--
-- public.statement_import_rows and public.statement_import_row_errors — what
-- one CSV statement turned into, staged for a person to look at BEFORE any of
-- it becomes their financial records (modules/statement-imports/MODULE.md).
-- Both SUBJECT_OWNED, both HIGHLY_SENSITIVE_FINANCIAL, both CASCADE_DELETE.
--
-- STAGING IS NOT A PERFORMANCE TRICK. It is the whole review guarantee.
--
-- The legacy product parsed a statement and wrote transactions in the same
-- pass, so "import this file" and "add 312 records to my ledger" were one
-- irreversible action, and a mis-read decimal separator became 312 wrong
-- financial facts before anybody saw a screen. Here, parsing writes ROWS —
-- normalised, fingerprinted, and inert. A row in this table affects no
-- balance, appears in no total, and is not a transaction. Only
-- CommitStatementImport turns rows into transactions, and it can only run
-- from REVIEW_REQUIRED (0100, SQLSTATE KAR51).
--
-- WHICH IS WHY committed_transaction_id EXISTS AND IS WRITE-ONCE. It is the
-- link from a staged row to the canonical record it produced, and it is the
-- reason a retry after an ambiguous response is idempotent rather than
-- doubling somebody's spending: the second attempt finds the rows already
-- carrying transaction ids and re-reports the same result instead of writing
-- again. statement_import_rows_guard refuses to move or clear one (KAR56),
-- because re-pointing it would silently reassign a person's financial record
-- to a different statement line.
--
-- AN UNREADABLE AMOUNT IS AN ERROR, NEVER A ZERO.
--
-- amount_minor is NULL on a row that could not be read, and the row's state
-- is INVALID. There is no default, no coalesce, and no zero. A zero amount is
-- a real financial fact — a reversed fee genuinely produces one — so writing
-- zero for "we could not parse this" makes an unreadable line indistinguishable
-- from a real event, in a column that is later summed. The CHECK below
-- refuses a VALID row that is missing any of the four facts a transaction
-- cannot be built without.
--
-- NARRATIVE IS CIPHERTEXT, EXACTLY AS IT IS IN public.transactions (0090).
--
-- description and merchant are HIGHLY_SENSITIVE_FINANCIAL: ciphertext, nonce
-- and auth tag per field, with the algorithm and key version per row, and
-- tenant, user, table, row id and field bound as AEAD associated data. There
-- is no plaintext column for either. The same is true of the source's own
-- transaction reference and of any instrument mask the file carried: both are
-- another party's identifiers for this subject, and both exist only as
-- ciphertext.
--
-- THE ERROR TABLE CANNOT HOLD THE OFFENDING VALUE, AND THAT IS STRUCTURAL.
--
-- statement_import_row_errors has four meaningful columns: which import,
-- which row number, which SAFE FIELD NAME, and which REASON CODE. Both
-- vocabularies are closed CHECKs. There is deliberately no `detail`, no
-- `message`, no `raw_value`, no `context` and no jsonb column — because a
-- free-text column on an error table is where a subject's statement line ends
-- up, every time, written by whoever is debugging that week. A `CHECK` cannot
-- assert the absence of a column, so the guarantee is asserted the only way
-- it can be: an exhaustive-column test reads information_schema.columns and
-- fails on any column added, error-shaped or not.
--
-- MONEY. bigint minor units and char(3) currency codes only. No NUMERIC, no
-- DOUBLE PRECISION, no FLOAT anywhere near a statement line — the decimal
-- separator ambiguity this parser exists to refuse would be reintroduced by
-- the first float column.
--
-- RLS decision — SUBJECT RECORDS: ENABLE and FORCE on both tables, one policy
-- each on BOTH app.tenant_id AND app.user_id, USING and WITH CHECK alike.
-- NULLIF makes an unset GUC a NULL predicate — no principal context, no rows.
-- No allow-list entry for either table.
--
-- Data lifecycle (ADR-0026; canonical in
-- modules/statement-imports/MODULE.md):
--   public.statement_import_rows
--     Subject relationship: SUBJECT_OWNED.
--     Purpose: one line of a subject's statement after mapping and
--       normalisation, staged and inert, with the deduplication fingerprint
--       that says whether it is already recorded and the link to the
--       canonical transaction it produced if it was committed.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: UNRESOLVED — the financial-data retention decision is a
--       legal one and has not been taken, so no period is written here. Rows
--       exist only beneath an import whose retention_state is DECIDED,
--       because the source they were parsed from could not have been stored
--       otherwise (0100, KAR54). LOCAL and TEST run on a clearly synthetic
--       fixture with no legal effect.
--     Export treatment: included — a staged row is the subject's own
--       statement line, and the narrative decrypts for their export exactly
--       as a transaction's does. The dedup fingerprint is NOT exported: it is
--       a keyed value with no meaning outside this platform.
--     Erasure strategy: CASCADE_DELETE.
--   public.statement_import_row_errors
--     Subject relationship: SUBJECT_OWNED.
--     Purpose: why a line could not be read — the row number, a safe field
--       name and a stable reason code, and nothing else.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL. Not lowered because the
--       columns are codes: "row 14's amount could not be read" is still a
--       statement about a specific person's specific bank statement, and a
--       classification that follows the column types rather than the subject
--       is how sensitive data ends up in a less protected table.
--     Retention: as above — unresolved, inherited from the parent import.
--     Export treatment: included — a person is entitled to know which of
--       their lines were refused and why.
--     Erasure strategy: CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TRIGGER, DROP FUNCTION, DROP
-- POLICY, DROP TABLE public.statement_import_row_errors, DROP TABLE
-- public.statement_import_rows — which destroys the link between every
-- imported transaction and the statement line it came from, leaving
-- provenance naming a row that no longer exists. Restore from backup.

CREATE TABLE public.statement_import_rows (
  id                          uuid        PRIMARY KEY,
  tenant_id                   uuid        NOT NULL,
  user_id                     uuid        NOT NULL,

  -- In-module FK: statement_imports (0100) belongs to this module.
  import_id                   uuid        NOT NULL
    CONSTRAINT statement_import_rows_import_fkey
    REFERENCES public.statement_imports (id) ON DELETE CASCADE,

  -- The 1-based line number in the DATA rows of the file, so an error message
  -- can name it without quoting anything from it. Unique per import: a second
  -- row claiming line 14 would make "which line failed?" unanswerable, and it
  -- is also what makes a re-parse replace rather than accumulate.
  row_number                  integer     NOT NULL
    CONSTRAINT statement_import_rows_row_number_check CHECK (row_number >= 1),
  CONSTRAINT statement_import_rows_line_key UNIQUE (import_id, row_number),

  row_state                   text        NOT NULL
    CONSTRAINT statement_import_rows_row_state_check
    CHECK (row_state IN (
      'VALID',
      'INVALID',
      'EXACT_DUPLICATE',
      'PROBABLE_DUPLICATE',
      'COMMITTED',
      'SKIPPED')),

  -- WHAT THE LINE SAID, after mapping and normalisation. Every one of these
  -- is NULL on an INVALID row, and that is the point: see the header.
  booking_date                date            NULL,
  value_date                  date            NULL,
  -- The instant the movement happened, ONLY when the source supplied a real
  -- one. Nothing derives it from booking_date: midnight on a booked day is a
  -- moment nobody observed (ADR-0027).
  event_occurred_at           timestamptz     NULL,
  -- The IANA zone the SOURCE stated, if it stated one. Never the server's,
  -- never the device's, and never inferred from the account's country.
  source_timezone             text            NULL
    CONSTRAINT statement_import_rows_source_timezone_check CHECK (source_timezone <> ''),
  CONSTRAINT statement_import_rows_timezone_needs_an_instant
    CHECK (source_timezone IS NULL OR event_occurred_at IS NOT NULL),

  -- Exact minor units, signed under the canonical convention (money out is
  -- negative, from the account holder's point of view — modules/transactions
  -- domain/sign-convention.ts). NULL means unreadable, never zero.
  amount_minor                bigint          NULL,
  currency_code               char(3)         NULL
    CONSTRAINT statement_import_rows_currency_code_check
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  -- What the SOURCE literally said about direction, preserved so a later
  -- discovery that one export uses the bank-ledger frame is a re-derivation
  -- from stored facts rather than an archaeological dig.
  source_direction            text            NULL
    CONSTRAINT statement_import_rows_source_direction_check
    CHECK (source_direction IN ('DEBIT', 'CREDIT', 'NOT_STATED')),
  direction_mapping           text            NULL
    CONSTRAINT statement_import_rows_direction_mapping_check
    CHECK (direction_mapping IN (
      'SOURCE_DIRECTION_WORD',
      'SOURCE_SIGNED_AMOUNT',
      'SOURCE_SIGNED_AMOUNT_INVERTED')),

  -- Encryption context for this row's HSF fields (ADR-0017 provenance). One
  -- algorithm and one key version per ROW, as in 0090.
  hsf_algorithm               text            NULL
    CONSTRAINT statement_import_rows_hsf_algorithm_check CHECK (hsf_algorithm <> ''),
  hsf_key_version             text            NULL
    CONSTRAINT statement_import_rows_hsf_key_version_check CHECK (hsf_key_version <> ''),

  description_ciphertext      bytea           NULL,
  description_nonce           bytea           NULL
    CONSTRAINT statement_import_rows_description_nonce_check
    CHECK (octet_length(description_nonce) = 12),
  description_auth_tag        bytea           NULL
    CONSTRAINT statement_import_rows_description_auth_tag_check
    CHECK (octet_length(description_auth_tag) = 16),
  CONSTRAINT statement_import_rows_description_parts_complete
    CHECK ((description_ciphertext IS NULL) = (description_nonce IS NULL)
       AND (description_ciphertext IS NULL) = (description_auth_tag IS NULL)),

  merchant_ciphertext         bytea           NULL,
  merchant_nonce              bytea           NULL
    CONSTRAINT statement_import_rows_merchant_nonce_check
    CHECK (octet_length(merchant_nonce) = 12),
  merchant_auth_tag           bytea           NULL
    CONSTRAINT statement_import_rows_merchant_auth_tag_check
    CHECK (octet_length(merchant_auth_tag) = 16),
  CONSTRAINT statement_import_rows_merchant_parts_complete
    CHECK ((merchant_ciphertext IS NULL) = (merchant_nonce IS NULL)
       AND (merchant_ciphertext IS NULL) = (merchant_auth_tag IS NULL)),

  -- The source's OWN transaction reference, when the file carried one. It is
  -- another party's identifier for this subject, so it exists only as
  -- ciphertext — never as a plaintext column, never in an error, and never in
  -- a preview.
  source_reference_ciphertext bytea           NULL,
  source_reference_nonce      bytea           NULL
    CONSTRAINT statement_import_rows_source_reference_nonce_check
    CHECK (octet_length(source_reference_nonce) = 12),
  source_reference_auth_tag   bytea           NULL
    CONSTRAINT statement_import_rows_source_reference_auth_tag_check
    CHECK (octet_length(source_reference_auth_tag) = 16),
  CONSTRAINT statement_import_rows_source_reference_parts_complete
    CHECK ((source_reference_ciphertext IS NULL) = (source_reference_nonce IS NULL)
       AND (source_reference_ciphertext IS NULL) = (source_reference_auth_tag IS NULL)),

  -- The instrument mask the line referred to (a card tail, typically), when
  -- the file carried one. Ciphertext for the same reason, and bounded so the
  -- column cannot quietly become storage for a full card number.
  instrument_mask_ciphertext  bytea           NULL
    CONSTRAINT statement_import_rows_instrument_mask_bound_check
    CHECK (octet_length(instrument_mask_ciphertext) <= 32),
  instrument_mask_nonce       bytea           NULL
    CONSTRAINT statement_import_rows_instrument_mask_nonce_check
    CHECK (octet_length(instrument_mask_nonce) = 12),
  instrument_mask_auth_tag    bytea           NULL
    CONSTRAINT statement_import_rows_instrument_mask_auth_tag_check
    CHECK (octet_length(instrument_mask_auth_tag) = 16),
  CONSTRAINT statement_import_rows_instrument_mask_parts_complete
    CHECK ((instrument_mask_ciphertext IS NULL) = (instrument_mask_nonce IS NULL)
       AND (instrument_mask_ciphertext IS NULL) = (instrument_mask_auth_tag IS NULL)),

  -- Every HSF field on this row shares one algorithm and one key version, so
  -- a ciphertext with no key version recorded cannot exist.
  CONSTRAINT statement_import_rows_ciphertext_needs_key_provenance
    CHECK ((description_ciphertext IS NULL
            AND merchant_ciphertext IS NULL
            AND source_reference_ciphertext IS NULL
            AND instrument_mask_ciphertext IS NULL)
           OR (hsf_algorithm IS NOT NULL AND hsf_key_version IS NOT NULL)),

  -- The balance this LINE stated, when the file carried a running balance.
  -- Exact minor units in the row's own currency; never derived.
  source_balance_minor        bigint          NULL,
  source_balance_kind         text            NULL
    CONSTRAINT statement_import_rows_source_balance_kind_check
    CHECK (source_balance_kind IN ('RUNNING', 'LEDGER', 'AVAILABLE', 'CLOSING')),
  CONSTRAINT statement_import_rows_source_balance_complete
    CHECK ((source_balance_minor IS NULL) = (source_balance_kind IS NULL)),

  -- CONTENT IDENTITY, computed through modules/transactions'
  -- DedupFingerprintPort — the canonical algorithm, not a second one. Keyed,
  -- per-subject and versioned there; opaque here.
  staged_row_fingerprint      text            NULL
    CONSTRAINT statement_import_rows_staged_row_fingerprint_check
    CHECK (staged_row_fingerprint <> ''),
  staged_row_fingerprint_version text         NULL
    CONSTRAINT statement_import_rows_staged_row_fingerprint_version_check
    CHECK (staged_row_fingerprint_version <> ''),
  CONSTRAINT statement_import_rows_fingerprint_parts_complete
    CHECK ((staged_row_fingerprint IS NULL) = (staged_row_fingerprint_version IS NULL)),
  -- Which occurrence of that content this line claims to be. Separate from
  -- the digest for the reason modules/transactions records: two identical
  -- coffees in one day are one content identity occurring twice, and folding
  -- the count into the digest makes "have I seen this before?" unaskable.
  staged_row_ordinal          integer         NULL
    CONSTRAINT statement_import_rows_staged_row_ordinal_check
    CHECK (staged_row_ordinal >= 1),

  -- A row that could not be read has none of the four facts a transaction
  -- cannot be built without. A row that COULD is required to have all of
  -- them, so "valid" is a checkable claim rather than a label.
  CONSTRAINT statement_import_rows_valid_rows_are_complete
    CHECK (row_state = 'INVALID'
           OR (booking_date IS NOT NULL
               AND amount_minor IS NOT NULL
               AND currency_code IS NOT NULL
               AND staged_row_fingerprint IS NOT NULL
               AND description_ciphertext IS NOT NULL)),
  CONSTRAINT statement_import_rows_invalid_rows_carry_no_amount
    CHECK (row_state <> 'INVALID' OR amount_minor IS NULL),

  -- THE LINK TO THE CANONICAL RECORD. Raw uuid: public.transactions belongs
  -- to another module, so no foreign key crosses the boundary
  -- (data-model.md §2). Write-once by trigger.
  committed_transaction_id    uuid            NULL,
  committed_at                timestamptz     NULL,
  CONSTRAINT statement_import_rows_committed_state_matches_link
    CHECK ((row_state = 'COMMITTED') = (committed_transaction_id IS NOT NULL)
       AND (row_state = 'COMMITTED') = (committed_at IS NOT NULL)),

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL
);

COMMENT ON TABLE public.statement_import_rows IS
  'HIGHLY_SENSITIVE_FINANCIAL, SUBJECT_OWNED. One line of a subject''s CSV '
  'statement after mapping and normalisation — STAGED AND INERT. A row here '
  'affects no balance, appears in no total, and is not a transaction; only '
  'CommitStatementImport turns rows into canonical records, and it can only '
  'run from REVIEW_REQUIRED (0100, KAR51). committed_transaction_id is the '
  'link to the record a row produced and is write-once by trigger (KAR56), '
  'which is what makes a retry after an ambiguous response idempotent instead '
  'of doubling somebody''s spending. An unreadable amount is NULL and the row '
  'is INVALID — never zero, because zero is a real financial fact and a '
  'column that is later summed must not conflate the two. Narrative, the '
  'source''s own transaction reference and any instrument mask exist only as '
  'ciphertext. RLS ENABLEd and FORCEd on BOTH principal GUCs. Lifecycle: 0101 '
  'header + modules/statement-imports/MODULE.md.';

COMMENT ON COLUMN public.statement_import_rows.amount_minor IS
  'Exact minor units, signed under the canonical convention (money out is '
  'negative from the account holder''s point of view). NULL when the line''s '
  'amount could not be read, with row_state INVALID — NEVER zero. A zero '
  'amount is a real financial fact that reversals genuinely produce, so '
  'writing zero for "unreadable" makes a refused line indistinguishable from '
  'a real event in a column that is later summed.';

COMMENT ON COLUMN public.statement_import_rows.staged_row_fingerprint IS
  'Content identity, computed through modules/transactions'' '
  'DedupFingerprintPort — the canonical ALGORITHM this platform has, never a '
  'second one written here. Keyed, derived per (tenant, user), and versioned '
  'there; opaque here, equality only, and only against a value of the same '
  'staged_row_fingerprint_version. Never exposed to a client and never '
  'logged. '
  'THE COLUMN NAME IS DELIBERATELY NOT dedup_fingerprint. public.transactions '
  '(0090) carries that name for the dedup identity of a CANONICAL '
  'transaction, and modules/transactions asserts against the live catalogue '
  'that no other table wears it; modules/financial-connections hit the same '
  'collision and renamed its own column rather than relax that assertion '
  '(0097). The rule is worth more than the convenience, and here it is also '
  'more honest: a staged row is a CANDIDATE awaiting review, so it is not the '
  'canonical dedup identity and must not read as though it were.';

CREATE INDEX statement_import_rows_import_idx
  ON public.statement_import_rows (tenant_id, user_id, import_id, row_number);
CREATE INDEX statement_import_rows_state_idx
  ON public.statement_import_rows (tenant_id, user_id, import_id, row_state);
CREATE INDEX statement_import_rows_fingerprint_idx
  ON public.statement_import_rows
     (tenant_id, user_id, staged_row_fingerprint_version, staged_row_fingerprint);

ALTER TABLE public.statement_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_import_rows FORCE ROW LEVEL SECURITY;

CREATE POLICY statement_import_rows_subject ON public.statement_import_rows
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Guard: staged rows may only be written while the import is being parsed,
-- and a row's link to its canonical transaction is write-once.
--
-- SECURITY INVOKER (the default) so the parent import it reads is the
-- caller's own row under the caller's own RLS policy.
--
--   KAR56  a committed row's identity or transaction link rewritten.
--   KAR57  a staged row written for an import that is not being parsed, or
--          for one this principal cannot see.
CREATE FUNCTION public.statement_import_rows_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_state text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id         IS DISTINCT FROM OLD.id
      OR NEW.tenant_id  IS DISTINCT FROM OLD.tenant_id
      OR NEW.user_id    IS DISTINCT FROM OLD.user_id
      OR NEW.import_id  IS DISTINCT FROM OLD.import_id
      OR NEW.row_number IS DISTINCT FROM OLD.row_number
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'statement_import_row % may not have its identity rewritten: the import and line number are what say WHICH statement line this row is',
        OLD.id USING ERRCODE = 'KAR56';
    END IF;
    -- Once a row has produced a canonical transaction, the link is a fact
    -- about somebody's financial record. Moving it reassigns that record to a
    -- different statement line; clearing it makes the record unexplainable
    -- and lets a retry write a second one.
    IF OLD.committed_transaction_id IS NOT NULL
      AND NEW.committed_transaction_id IS DISTINCT FROM OLD.committed_transaction_id
    THEN
      RAISE EXCEPTION 'statement_import_row % already produced transaction %, and the link is write-once: moving it would reassign a financial record to a different statement line, and clearing it would let a retry write the record a second time',
        OLD.id, OLD.committed_transaction_id USING ERRCODE = 'KAR56';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- INSERT. Staged rows appear during PARSING and at no other time. A row
  -- arriving under a REVIEW_REQUIRED import would change what the person is
  -- reviewing after they started reading it; one arriving under COMMITTING or
  -- COMMITTED would add lines to a commit already in progress.
  SELECT state INTO parent_state
    FROM public.statement_imports
   WHERE id = NEW.import_id;

  IF parent_state IS NULL THEN
    RAISE EXCEPTION 'statement_import_row names import %, which is not visible to this principal',
      NEW.import_id USING ERRCODE = 'KAR57';
  END IF;
  IF parent_state <> 'PARSING' THEN
    RAISE EXCEPTION 'statement_import % is %, so no staged row may be written for it: rows appear during PARSING and at no other time, or the set a person reviewed would not be the set that gets committed',
      NEW.import_id, parent_state USING ERRCODE = 'KAR57';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER statement_import_rows_guard
  BEFORE INSERT OR UPDATE ON public.statement_import_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.statement_import_rows_guard();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.statement_import_rows TO karar_app;

-- ---------------------------------------------------------------------------
-- public.statement_import_row_errors
-- ---------------------------------------------------------------------------

CREATE TABLE public.statement_import_row_errors (
  id                          uuid        PRIMARY KEY,
  tenant_id                   uuid        NOT NULL,
  user_id                     uuid        NOT NULL,

  import_id                   uuid        NOT NULL
    CONSTRAINT statement_import_row_errors_import_fkey
    REFERENCES public.statement_imports (id) ON DELETE CASCADE,
  -- Nullable, because an error can precede a row: a line that could not be
  -- split into fields at all never becomes a staged row, and the person still
  -- needs to be told which line it was.
  row_id                      uuid            NULL
    CONSTRAINT statement_import_row_errors_row_fkey
    REFERENCES public.statement_import_rows (id) ON DELETE CASCADE,
  row_number                  integer     NOT NULL
    CONSTRAINT statement_import_row_errors_row_number_check CHECK (row_number >= 1),

  -- WHICH FIELD, as one of this module's own safe names. Never the header
  -- text the file used: a column header is content from the file, and a
  -- header can carry an account number as easily as the word "Amount".
  safe_field                  text        NOT NULL
    CONSTRAINT statement_import_row_errors_safe_field_check
    CHECK (safe_field IN (
      'ROW',
      'BOOKING_DATE',
      'VALUE_DATE',
      'EVENT_OCCURRED_AT',
      'SOURCE_TIMEZONE',
      'AMOUNT',
      'DEBIT_AMOUNT',
      'CREDIT_AMOUNT',
      'CURRENCY',
      'DESCRIPTION',
      'MERCHANT',
      'SOURCE_BALANCE',
      'SOURCE_REFERENCE',
      'INSTRUMENT_MASK')),

  -- WHY, as one of this module's own stable codes. A closed vocabulary, so a
  -- client can translate it and a support engineer can search for it without
  -- anybody quoting the line.
  reason_code                 text        NOT NULL
    CONSTRAINT statement_import_row_errors_reason_code_check
    CHECK (reason_code IN (
      'REQUIRED_FIELD_MISSING',
      'UNREADABLE_AMOUNT',
      'AMBIGUOUS_DECIMAL_SEPARATOR',
      'AMBIGUOUS_DATE_ORDER',
      'UNREADABLE_DATE',
      'UNREADABLE_INSTANT',
      'UNKNOWN_TIMEZONE',
      'UNKNOWN_CURRENCY',
      'CURRENCY_MISMATCH',
      'AMBIGUOUS_DIRECTION',
      'DEBIT_AND_CREDIT_BOTH_PRESENT',
      'DEBIT_AND_CREDIT_BOTH_ABSENT',
      'FIELD_TOO_LARGE',
      'TOO_MANY_COLUMNS',
      'COLUMN_COUNT_MISMATCH',
      'INVALID_ENCODING',
      'MALFORMED_QUOTING',
      'AMOUNT_EXCEEDS_RANGE',
      'DECIMAL_PLACES_EXCEED_CURRENCY')),

  created_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.statement_import_row_errors IS
  'HIGHLY_SENSITIVE_FINANCIAL, SUBJECT_OWNED. Why one statement line could '
  'not be read: the import, the line number, a SAFE FIELD NAME from this '
  'module''s own vocabulary and a stable REASON CODE. There is deliberately '
  'no detail, message, raw_value, context or jsonb column, and none may be '
  'added — a free-text column on an error table is where a subject''s bank '
  'statement line ends up, written by whoever is debugging that week. A CHECK '
  'cannot assert the absence of a column, so an exhaustive-column test reads '
  'information_schema.columns and fails on any column added at all. The safe '
  'field is never the header text the file used, because a header is content '
  'from the file and can carry an account number as easily as the word '
  '"Amount". Classification is NOT lowered because the columns are codes: '
  '"row 14''s amount could not be read" is still a statement about one '
  'person''s bank statement. RLS ENABLEd and FORCEd on BOTH principal GUCs. '
  'Lifecycle: 0101 header + modules/statement-imports/MODULE.md.';

CREATE INDEX statement_import_row_errors_import_idx
  ON public.statement_import_row_errors (tenant_id, user_id, import_id, row_number);

ALTER TABLE public.statement_import_row_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_import_row_errors FORCE ROW LEVEL SECURITY;

CREATE POLICY statement_import_row_errors_subject ON public.statement_import_row_errors
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.statement_import_row_errors TO karar_app;
