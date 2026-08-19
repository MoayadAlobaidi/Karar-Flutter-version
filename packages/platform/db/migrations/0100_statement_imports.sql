-- 0100_statement_imports
--
-- public.statement_imports and public.statement_import_sources — one CSV
-- statement, from the moment a person says "I have a file" to the moment its
-- rows become their financial records (modules/statement-imports/MODULE.md;
-- ADR-0028's USER_FILE_UPLOAD rail). Both SUBJECT_OWNED, both classified
-- HIGHLY_SENSITIVE_FINANCIAL, both erased by CASCADE_DELETE.
--
-- THE ORDER OF EVENTS IS THE DESIGN, AND THIS FILE IS WHERE IT IS ENFORCED.
--
-- An import is a state machine and nothing else. Every question this table
-- answers is "where is this import, and what is it allowed to do next":
--
--   DRAFT ──► SOURCE_STORED ──► PARSING ──► REVIEW_REQUIRED ──► COMMITTING ──► COMMITTED
--     │            │              │               │                 │
--     └──► REJECTED│              └──► FAILED     └──► REJECTED      └──► FAILED
--                  └──► DUPLICATE
--   any non-terminal state ──► ERASED
--
-- The arrows are enforced by statement_imports_guard (SQLSTATE KAR51), not by
-- the application, because the invariant that matters most here — NO
-- CANONICAL TRANSACTION IS WRITTEN BEFORE THE SUBJECT HAS REVIEWED — is a
-- claim about ordering, and an ordering claim that lives only in a use case
-- is a claim about the code path somebody happened to take.
--
-- RETENTION DECIDES BEFORE THE FIRST DURABLE SOURCE BYTE EXISTS.
--
-- The retention decision for financial data has NOT been taken; it is a legal
-- decision nobody here may take. So this table records where the question
-- stands (retention_state) and the answer it received, and
-- statement_import_sources_guard refuses to insert a source row for an import
-- whose retention_state is not DECIDED (SQLSTATE KAR54).
--
-- That trigger is the whole point of splitting the source into its own table.
-- Had the ciphertext lived on statement_imports, "resolve retention, then
-- store the bytes" would be two UPDATEs on one row in an order only the
-- application knows, and the evidence for the ordering claim would be a test
-- of the application rather than of the database. As two tables it is a
-- structural fact: the row carrying a subject's statement CANNOT exist while
-- the retention question is open, for any writer, including a direct SQL
-- INSERT by karar_app, a fixture, or a backfill.
--
-- retention_state moves UNDECIDED -> DECIDED once and never back, and the
-- four decision columns are all-or-nothing and immutable once written
-- (KAR53). A withdrawn or rewritten retention decision would leave durable
-- financial records governed by a decision that is no longer recorded, which
-- is indistinguishable from records governed by no decision at all.
--
-- NO PLAINTEXT SOURCE BYTES ARE STORED IN POSTGRESQL, AND NO PROVIDER URI IS
-- STORED ANYWHERE.
--
-- statement_import_sources holds an OPAQUE object reference minted by
-- whatever store the deployment binds, plus the AEAD parameters and an
-- integrity checksum over the CIPHERTEXT. It holds no bytes of the statement.
-- object_ref is CHECKed to contain no scheme separator, because a provider
-- URI in this column is a provider detail leaking into a subject-owned table
-- that the domain and application layers must never learn: the day a store
-- moves, every historical row would carry the old provider's address.
--
-- TWO CHECKSUMS, TWO DIFFERENT QUESTIONS, AND ONLY ONE OF THEM IS KEYED.
--
--   integrity_checksum   SHA-256 over the CIPHERTEXT. Answers "are the bytes
--       I am about to commit the bytes I stored?", re-checked at commit. It
--       is a plain digest and that is safe: ciphertext is indistinguishable
--       from random, so a digest of it confirms nothing about the statement.
--
--   file_fingerprint     a KEYED, PER-SUBJECT, VERSIONED MAC over the
--       PLAINTEXT bytes. Answers "has this subject already imported this
--       exact file?". It must be keyed for the reason 0097 records at length:
--       an unkeyed digest of a document is a confirmation oracle — anyone
--       holding a copy of a statement could test whether a given person
--       uploaded it, without decrypting anything. Per-subject, so the same
--       file under two people produces unrelated values and the column cannot
--       become a cross-subject join key. Versioned, because the definition
--       will change and a redefinition must start a fresh namespace.
--
-- There is deliberately NO unique constraint over the file fingerprint. The
-- same file may legitimately be uploaded again — after a rejection, after an
-- erasure, or because the person is retrying — and duplicate-FILE detection
-- is a REVIEW outcome (state DUPLICATE) rather than a write refusal. A unique
-- index here would make "you already tried this" indistinguishable from a
-- storage failure, and would permanently forbid a legitimate retry.
--
-- MONEY. statement_imports carries exactly one monetary figure and it is
-- bigint minor units: the balance the SOURCE STATED, if it stated one.
-- Nothing here sums transactions into a balance — a reconciliation figure
-- this platform computed and then compared against itself proves nothing, and
-- reconciliation_status = 'NOT_AVAILABLE' is the honest answer when the file
-- carried no balance. No NUMERIC, no DOUBLE PRECISION, no FLOAT.
--
-- V1 TARGETS EXACTLY ONE ACCOUNT, and account_id is NOT NULL from DRAFT
-- onward. The person selects an existing account or explicitly creates one;
-- nothing infers an account from institution + type + currency, which is
-- exactly the combination a real person legitimately duplicates (ADR-0028). A
-- file that appears to describe several accounts is REVIEW_REQUIRED with a
-- reason code, never silently mixed into the one account chosen.
--
-- RLS decision — SUBJECT RECORDS: ENABLE and FORCE on both tables, one policy
-- each keyed on BOTH app.tenant_id AND app.user_id, USING and WITH CHECK
-- alike, GUCs bound transaction-locally by the platform's
-- withPrincipalContext (tenancy.md §2). NULLIF makes an unset GUC a NULL
-- predicate — no principal context, no rows. The user arm is load-bearing:
-- two members of one household tenant must not see each other's statements.
-- No allow-list entry for either table.
--
-- Data lifecycle (ADR-0026; canonical in
-- modules/statement-imports/MODULE.md):
--   public.statement_imports
--     Subject relationship: SUBJECT_OWNED.
--     Purpose: the lifecycle of one CSV statement import for one subject and
--       one of their accounts — where it stands, the versions that processed
--       it, the safe counts a review screen shows, and the balance the source
--       itself stated.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: UNRESOLVED — the financial-data retention decision is a
--       legal one and has not been taken, so no period is written here. The
--       row records the decision it received; durable SOURCE bytes are
--       refused until that decision is DECIDED, enforced by
--       statement_import_sources_guard and not merely declared. LOCAL and
--       TEST run on a clearly synthetic fixture with no legal effect.
--     Export treatment: included — counts, state, versions and the
--       source-stated balance are the subject's own facts.
--     Erasure strategy: CASCADE_DELETE.
--   public.statement_import_sources
--     Subject relationship: SUBJECT_OWNED.
--     Purpose: where the encrypted statement bytes live and how to verify
--       they are unchanged — an opaque object reference, the AEAD parameters,
--       an integrity checksum over the ciphertext, and the keyed per-subject
--       fingerprint that recognises the same file arriving twice.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: as above — unresolved, fails closed, enforced by trigger.
--     Export treatment: EXCLUDED. The object reference is a storage address
--       and the fingerprint is a keyed value with no meaning outside this
--       platform; neither is a fact about the subject that the subject does
--       not already hold, and both would put in a downloaded archive exactly
--       what this table exists to keep out of one. The subject's own
--       statement file is theirs and they have it.
--     Erasure strategy: CASCADE_DELETE — and the row's disappearance is only
--       half of it: erasing an import also deletes the stored object through
--       EncryptedSourceStorePort, because a dangling ciphertext nobody can
--       name is still a subject's statement sitting in a store.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TRIGGER, DROP FUNCTION, DROP
-- POLICY, DROP TABLE public.statement_import_sources, DROP TABLE
-- public.statement_imports — which destroys every record of which statement
-- produced which financial records, and with it the ability to explain any
-- imported transaction. Restore from backup.

CREATE TABLE public.statement_imports (
  id                          uuid        PRIMARY KEY,
  -- Cross-module references (raw UUIDs, no FK across module boundaries —
  -- data-model.md §2). The reference type says what the uuid points at
  -- without a reader opening another module's source, exactly as 0090 does.
  tenant_id                   uuid        NOT NULL,
  user_id                     uuid        NOT NULL,

  -- THE ONE ACCOUNT THIS IMPORT TARGETS. Chosen by the person, never
  -- inferred. NOT NULL from DRAFT, because an import with no target is an
  -- import whose destination gets decided later by whoever writes the commit.
  account_id                  uuid        NOT NULL,
  account_reference_type      text        NOT NULL
    CONSTRAINT statement_imports_account_reference_type_check
    CHECK (account_reference_type IN ('FINANCIAL_ACCOUNT')),

  -- The financial connection this file arrived through, when the person has
  -- one. Optional: a file can be imported before any connection exists.
  connection_id               uuid            NULL,
  connection_reference_type   text            NULL
    CONSTRAINT statement_imports_connection_reference_type_check
    CHECK (connection_reference_type IN ('FINANCIAL_CONNECTION')),
  CONSTRAINT statement_imports_connection_reference_pair
    CHECK ((connection_id IS NULL) = (connection_reference_type IS NULL)),

  -- WHERE THE IMPORT IS. The transitions between these values are enforced by
  -- trigger; the CHECK only bounds the vocabulary.
  state                       text        NOT NULL
    CONSTRAINT statement_imports_state_check
    CHECK (state IN (
      'DRAFT',
      'SOURCE_STORED',
      'PARSING',
      'REVIEW_REQUIRED',
      'COMMITTING',
      'COMMITTED',
      'REJECTED',
      'FAILED',
      'DUPLICATE',
      'ERASED')),
  state_changed_at            timestamptz NOT NULL,

  -- text/csv and nothing else this phase. A CHECK rather than a use-case
  -- rule, because "we only accept CSV" must also be true of a direct INSERT.
  media_type                  text        NOT NULL
    CONSTRAINT statement_imports_media_type_check
    CHECK (media_type = 'text/csv'),

  -- RETENTION. The question, and the answer it received. See the header for
  -- why the answer gates the SOURCE table rather than this one.
  retention_state             text        NOT NULL DEFAULT 'UNDECIDED'
    CONSTRAINT statement_imports_retention_state_check
    CHECK (retention_state IN ('UNDECIDED', 'DECIDED')),
  retention_decided_at        timestamptz     NULL,
  retention_period            text            NULL
    CONSTRAINT statement_imports_retention_period_check CHECK (retention_period <> ''),
  retention_basis             text            NULL
    CONSTRAINT statement_imports_retention_basis_check CHECK (retention_basis <> ''),
  retention_pack_version      text            NULL
    CONSTRAINT statement_imports_retention_pack_version_check
    CHECK (retention_pack_version <> ''),
  -- All four together or none. Half a recorded decision is not a decision,
  -- and a period with no basis is a number nobody can defend.
  CONSTRAINT statement_imports_retention_decision_complete
    CHECK ((retention_state = 'DECIDED') = (retention_decided_at IS NOT NULL)
       AND (retention_state = 'DECIDED') = (retention_period IS NOT NULL)
       AND (retention_state = 'DECIDED') = (retention_basis IS NOT NULL)
       AND (retention_state = 'DECIDED') = (retention_pack_version IS NOT NULL)),
  -- An import may not leave DRAFT with the retention question open. The
  -- source guard says the same thing about the bytes; this says it about the
  -- lifecycle, so an import cannot sit in PARSING pretending to be governed.
  CONSTRAINT statement_imports_undecided_stays_in_draft
    CHECK (retention_state = 'DECIDED'
           OR state IN ('DRAFT', 'REJECTED', 'FAILED', 'ERASED')),

  -- THE VERSIONS THAT PROCESSED THIS FILE. Null until the stage that mints
  -- them runs; NOT NULL is asserted by the state rules below rather than by
  -- the column, because a DRAFT import has genuinely not been parsed and
  -- writing a placeholder version would be a claim that it had.
  parser_version              text            NULL
    CONSTRAINT statement_imports_parser_version_check CHECK (parser_version <> ''),
  mapping_version             text            NULL
    CONSTRAINT statement_imports_mapping_version_check CHECK (mapping_version <> ''),
  normalization_version       text            NULL
    CONSTRAINT statement_imports_normalization_version_check
    CHECK (normalization_version <> ''),
  -- NOT `fingerprint_version`, and the prefix is load-bearing rather than
  -- decorative. public.transactions (0090) carries `fingerprint_version` for
  -- the dedup identity of a CANONICAL transaction, and that module asserts
  -- against the live catalogue that no other table wears the dedup identity's
  -- column names. `modules/financial-connections` hit the same collision and
  -- renamed its own column rather than relax that assertion (0097); the same
  -- answer applies here, and for a stronger reason: a staged row is a
  -- CANDIDATE awaiting review, not a canonical transaction, so it should not
  -- wear the canonical identity's names in the first place.
  staged_row_fingerprint_version text         NULL
    CONSTRAINT statement_imports_staged_row_fingerprint_version_check
    CHECK (staged_row_fingerprint_version <> ''),
  -- A reviewable import must be able to say how it was read. Without this a
  -- committed transaction's provenance could name versions nobody recorded.
  CONSTRAINT statement_imports_reviewable_states_carry_versions
    CHECK (state NOT IN ('REVIEW_REQUIRED', 'COMMITTING', 'COMMITTED')
           OR (parser_version IS NOT NULL
               AND mapping_version IS NOT NULL
               AND normalization_version IS NOT NULL
               AND staged_row_fingerprint_version IS NOT NULL)),

  -- SAFE COUNTS. Numbers, never values: a review screen says "3 rows could
  -- not be read", and the reasons live in statement_import_row_errors with no
  -- column that could hold the offending text.
  row_count                   integer     NOT NULL DEFAULT 0
    CONSTRAINT statement_imports_row_count_check CHECK (row_count >= 0),
  valid_row_count             integer     NOT NULL DEFAULT 0
    CONSTRAINT statement_imports_valid_row_count_check CHECK (valid_row_count >= 0),
  invalid_row_count           integer     NOT NULL DEFAULT 0
    CONSTRAINT statement_imports_invalid_row_count_check CHECK (invalid_row_count >= 0),
  exact_duplicate_count       integer     NOT NULL DEFAULT 0
    CONSTRAINT statement_imports_exact_duplicate_count_check
    CHECK (exact_duplicate_count >= 0),
  probable_duplicate_count    integer     NOT NULL DEFAULT 0
    CONSTRAINT statement_imports_probable_duplicate_count_check
    CHECK (probable_duplicate_count >= 0),
  committed_transaction_count integer     NOT NULL DEFAULT 0
    CONSTRAINT statement_imports_committed_transaction_count_check
    CHECK (committed_transaction_count >= 0),
  -- NO CANONICAL TRANSACTION BEFORE REVIEW, stated as a row invariant. An
  -- import that has not reached COMMITTING has committed nothing, and the
  -- CHECK says so for every writer rather than for the one that went through
  -- the use case.
  CONSTRAINT statement_imports_no_commits_before_review
    CHECK (state IN ('COMMITTING', 'COMMITTED') OR committed_transaction_count = 0),

  -- RECONCILIATION, as the SOURCE stated it or not at all.
  reconciliation_status       text        NOT NULL DEFAULT 'NOT_AVAILABLE'
    CONSTRAINT statement_imports_reconciliation_status_check
    CHECK (reconciliation_status IN ('NOT_AVAILABLE', 'MATCHED', 'MISMATCHED')),
  -- Exact minor units of the balance the FILE stated. Never a figure this
  -- platform derived by summing the rows it just parsed: comparing a total
  -- against itself is a tautology dressed as a control (MODULE.md).
  source_reported_balance_minor    bigint      NULL,
  source_reported_balance_kind     text        NULL
    CONSTRAINT statement_imports_source_balance_kind_check
    CHECK (source_reported_balance_kind IN ('OPENING', 'CLOSING', 'LEDGER', 'AVAILABLE')),
  source_reported_balance_currency char(3)     NULL
    CONSTRAINT statement_imports_source_balance_currency_check
    CHECK (source_reported_balance_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT statement_imports_source_balance_complete
    CHECK ((source_reported_balance_minor IS NULL) = (source_reported_balance_kind IS NULL)
       AND (source_reported_balance_minor IS NULL) = (source_reported_balance_currency IS NULL)),
  -- A reconciliation verdict is only possible when the source stated a
  -- balance. MATCHED or MISMATCHED with no source figure would be this
  -- platform reporting on a comparison it invented.
  CONSTRAINT statement_imports_reconciliation_needs_a_source_balance
    CHECK (reconciliation_status = 'NOT_AVAILABLE'
           OR source_reported_balance_minor IS NOT NULL),

  -- WHY, when the answer is no. A stable code from the module's closed
  -- vocabulary; never driver text, never a fragment of the file.
  refusal_code                text            NULL
    CONSTRAINT statement_imports_refusal_code_check CHECK (refusal_code <> ''),
  CONSTRAINT statement_imports_unsuccessful_states_carry_a_code
    CHECK (state NOT IN ('FAILED', 'DUPLICATE') OR refusal_code IS NOT NULL),
  CONSTRAINT statement_imports_successful_states_carry_no_code
    CHECK (state NOT IN ('COMMITTED', 'COMMITTING', 'REVIEW_REQUIRED')
           OR refusal_code IS NULL),

  committed_at                timestamptz     NULL,
  CONSTRAINT statement_imports_committed_at_matches_state
    CHECK ((state = 'COMMITTED') = (committed_at IS NOT NULL)),
  erased_at                   timestamptz     NULL,
  CONSTRAINT statement_imports_erased_at_matches_state
    CHECK ((state = 'ERASED') = (erased_at IS NOT NULL)),

  version                     integer     NOT NULL DEFAULT 1
    CONSTRAINT statement_imports_version_check CHECK (version >= 1),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL
);

COMMENT ON TABLE public.statement_imports IS
  'HIGHLY_SENSITIVE_FINANCIAL, SUBJECT_OWNED. One CSV statement import for '
  'one subject and ONE of their accounts, as a state machine: DRAFT -> '
  'SOURCE_STORED -> PARSING -> REVIEW_REQUIRED -> COMMITTING -> COMMITTED, '
  'plus REJECTED, FAILED, DUPLICATE and ERASED. Transitions are enforced by '
  'statement_imports_guard (KAR51), not by the application, because the '
  'invariant that matters — no canonical transaction is written before the '
  'subject has reviewed — is a claim about ordering. The retention decision '
  'is recorded here and gates the SOURCE table (KAR54), so no durable byte of '
  'a subject''s statement can exist while the retention question is open. The '
  'account is chosen by the person and never inferred from institution + type '
  '+ currency (ADR-0028). Counts are safe summaries; no column here can hold '
  'a value read out of the file. The only monetary figure is the balance the '
  'SOURCE stated — never one derived by summing the rows. RLS ENABLEd and '
  'FORCEd on BOTH principal GUCs. Lifecycle: 0100 header + '
  'modules/statement-imports/MODULE.md.';

COMMENT ON COLUMN public.statement_imports.retention_state IS
  'UNDECIDED until a retention decision has been resolved for this subject; '
  'DECIDED once one has, with all four decision columns written together. It '
  'moves in one direction only and the decision is immutable once recorded '
  '(KAR53): a withdrawn or rewritten decision would leave durable financial '
  'records governed by a decision that is no longer written down, which is '
  'indistinguishable from records governed by none.';

COMMENT ON COLUMN public.statement_imports.committed_transaction_count IS
  'How many canonical transactions this import produced. Zero in every state '
  'before COMMITTING, by CHECK — the review-before-commit rule stated as a '
  'row invariant so it holds for a direct INSERT as well as for the use case.';

COMMENT ON COLUMN public.statement_imports.source_reported_balance_minor IS
  'Exact minor units of the balance the FILE stated, or NULL when it stated '
  'none. NEVER a figure this platform produced by summing the rows it just '
  'parsed: reconciliation compares what the source said against what the '
  'source''s rows say, and a self-derived total compared against itself is a '
  'tautology. When the source states no balance the honest answer is '
  'reconciliation_status = NOT_AVAILABLE, and commit is not blocked by a '
  'comparison nobody can make.';

-- The two questions this table answers: "what are my imports?" and "what has
-- happened to this account's imports?".
CREATE INDEX statement_imports_owner_idx
  ON public.statement_imports (tenant_id, user_id, created_at DESC);
CREATE INDEX statement_imports_account_idx
  ON public.statement_imports (tenant_id, user_id, account_id, created_at DESC);
CREATE INDEX statement_imports_state_idx
  ON public.statement_imports (tenant_id, user_id, state);

ALTER TABLE public.statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_imports FORCE ROW LEVEL SECURITY;

CREATE POLICY statement_imports_subject ON public.statement_imports
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Guard: identity frozen, the state machine enforced, the retention decision
-- write-once, and the concurrency token advanced by exactly one.
--
-- Custom SQLSTATEs so callers distinguish the arms structurally ('KAR' is
-- outside every class the standard and PostgreSQL assign — 0090):
--   KAR50  import identity rewritten.
--   KAR51  illegal state transition.
--   KAR52  the optimistic-concurrency token did not advance by exactly one.
--   KAR53  the retention decision was withdrawn or rewritten.
CREATE FUNCTION public.statement_imports_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  legal boolean;
BEGIN
  -- WHOSE import this is, and WHICH account it targets, can never change.
  -- Re-pointing an import at another account would move every row it is
  -- about to commit into an account nobody chose, and it would do so with
  -- the import's whole history still attached, so it would not look like a
  -- change at all.
  IF NEW.id          IS DISTINCT FROM OLD.id
    OR NEW.tenant_id  IS DISTINCT FROM OLD.tenant_id
    OR NEW.user_id    IS DISTINCT FROM OLD.user_id
    OR NEW.account_id IS DISTINCT FROM OLD.account_id
    OR NEW.account_reference_type IS DISTINCT FROM OLD.account_reference_type
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.media_type IS DISTINCT FROM OLD.media_type
  THEN
    RAISE EXCEPTION 'statement_import % may not have its identity rewritten: tenant, user, target account, media type and creation instant are what say WHOSE statement this is and WHERE its rows are going (modules/statement-imports/MODULE.md)',
      OLD.id USING ERRCODE = 'KAR50';
  END IF;

  -- THE STATE MACHINE. Written as an explicit pair list rather than as a
  -- "not backwards" rule, because the illegal transitions that matter are not
  -- backwards ones: PARSING -> COMMITTED skips review entirely, and
  -- SOURCE_STORED -> COMMITTING commits a file nobody has read.
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    legal := (OLD.state, NEW.state) IN (
      ('DRAFT',           'SOURCE_STORED'),
      ('DRAFT',           'REJECTED'),
      ('DRAFT',           'FAILED'),
      ('DRAFT',           'ERASED'),
      ('SOURCE_STORED',   'PARSING'),
      ('SOURCE_STORED',   'DUPLICATE'),
      ('SOURCE_STORED',   'REJECTED'),
      ('SOURCE_STORED',   'FAILED'),
      ('SOURCE_STORED',   'ERASED'),
      -- PARSING -> PARSING is not a transition and never reaches here; a
      -- retried parse re-enters from SOURCE_STORED, which is what makes a
      -- retry idempotent rather than cumulative.
      ('PARSING',         'REVIEW_REQUIRED'),
      ('PARSING',         'DUPLICATE'),
      ('PARSING',         'FAILED'),
      ('PARSING',         'REJECTED'),
      ('PARSING',         'ERASED'),
      ('REVIEW_REQUIRED', 'COMMITTING'),
      ('REVIEW_REQUIRED', 'REJECTED'),
      ('REVIEW_REQUIRED', 'FAILED'),
      ('REVIEW_REQUIRED', 'ERASED'),
      ('COMMITTING',      'COMMITTED'),
      ('COMMITTING',      'FAILED'),
      -- A commit that failed leaves the import reviewable again rather than
      -- stuck: no subset was written, so the reviewed rows are still exactly
      -- what they were.
      ('COMMITTING',      'REVIEW_REQUIRED'),
      -- Terminal states go nowhere except to erasure. COMMITTED included:
      -- the financial records it produced are the subject's and survive, and
      -- what erasure removes is the staged statement behind them.
      ('COMMITTED',       'ERASED'),
      ('REJECTED',        'ERASED'),
      ('FAILED',          'ERASED'),
      ('DUPLICATE',       'ERASED')
    );
    IF NOT legal THEN
      RAISE EXCEPTION 'statement_import % may not move from % to %: the import lifecycle is DRAFT -> SOURCE_STORED -> PARSING -> REVIEW_REQUIRED -> COMMITTING -> COMMITTED, with REJECTED, FAILED, DUPLICATE and ERASED as the only other destinations. A transition that skips REVIEW_REQUIRED would write a person''s financial records from a file nobody read',
        OLD.id, OLD.state, NEW.state USING ERRCODE = 'KAR51';
    END IF;
    NEW.state_changed_at := now();
  END IF;

  -- The retention decision is write-once. UNDECIDED -> DECIDED, and every
  -- recorded value frozen from that moment.
  IF OLD.retention_state = 'DECIDED' THEN
    IF NEW.retention_state IS DISTINCT FROM 'DECIDED'
      OR NEW.retention_decided_at   IS DISTINCT FROM OLD.retention_decided_at
      OR NEW.retention_period       IS DISTINCT FROM OLD.retention_period
      OR NEW.retention_basis        IS DISTINCT FROM OLD.retention_basis
      OR NEW.retention_pack_version IS DISTINCT FROM OLD.retention_pack_version
    THEN
      RAISE EXCEPTION 'statement_import % already recorded a retention decision, and it may not be withdrawn or rewritten: durable records governed by a decision that is no longer written down are indistinguishable from records governed by none',
        OLD.id USING ERRCODE = 'KAR53';
    END IF;
  END IF;

  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'statement_import % updates must increment version by exactly one (got % after %) — the optimistic-concurrency token is not optional',
      OLD.id, NEW.version, OLD.version USING ERRCODE = 'KAR52';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER statement_imports_guard
  BEFORE UPDATE ON public.statement_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.statement_imports_guard();

-- DELETE is granted deliberately: CASCADE_DELETE is the declared erasure
-- strategy and a subject removing their own staged statement is a first-class
-- path, not an administrative one.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.statement_imports TO karar_app;

-- ---------------------------------------------------------------------------
-- public.statement_import_sources
-- ---------------------------------------------------------------------------

CREATE TABLE public.statement_import_sources (
  id                          uuid        PRIMARY KEY,
  tenant_id                   uuid        NOT NULL,
  user_id                     uuid        NOT NULL,

  -- In-module FK: statement_imports belongs to this module, so this is a real
  -- constraint. ON DELETE CASCADE is the erasure story for the row; the
  -- stored OBJECT is deleted through EncryptedSourceStorePort, because no
  -- database cascade reaches a byte the database does not hold.
  import_id                   uuid        NOT NULL
    CONSTRAINT statement_import_sources_import_fkey
    REFERENCES public.statement_imports (id) ON DELETE CASCADE,
  -- Exactly one source per import. A second one would make "which bytes did
  -- this import commit?" a question with two answers.
  CONSTRAINT statement_import_sources_one_per_import UNIQUE (import_id),

  media_type                  text        NOT NULL
    CONSTRAINT statement_import_sources_media_type_check
    CHECK (media_type = 'text/csv'),
  -- The declared ingestion ceiling for this path lives in
  -- packages/platform/src/ingestion/limits.ts (csvStatementImport, 10 MiB)
  -- and is enforced at runtime before a byte is stored. It is repeated here
  -- as an upper bound so a direct INSERT cannot record a size the parser
  -- would refuse; the runtime policy stays the single place the number is
  -- decided.
  byte_length                 bigint      NOT NULL
    CONSTRAINT statement_import_sources_byte_length_check
    CHECK (byte_length > 0 AND byte_length <= 10485760),

  -- WHERE the ciphertext lives, as an OPAQUE handle the store minted. Never a
  -- URI: a provider address in a subject-owned table is a provider detail the
  -- domain and application layers must never learn, and every historical row
  -- would carry the old provider's address the day a store moves.
  store_kind                  text        NOT NULL
    CONSTRAINT statement_import_sources_store_kind_check
    CHECK (store_kind IN ('LOCAL_ENCRYPTED_BUFFER', 'EXTERNAL_ENCRYPTED_OBJECT')),
  object_ref                  text        NOT NULL
    CONSTRAINT statement_import_sources_object_ref_check
    CHECK (object_ref <> ''
           AND octet_length(object_ref) <= 200
           AND object_ref NOT LIKE '%://%'
           AND object_ref !~ '\s'),

  -- AEAD parameters, per row (ADR-0017 provenance). The algorithm is stored
  -- rather than assumed globally: an algorithm migration must be able to read
  -- old objects, and "everything is AES-256-GCM" is true right up until it is
  -- not.
  encryption_algorithm        text        NOT NULL
    CONSTRAINT statement_import_sources_encryption_algorithm_check
    CHECK (encryption_algorithm <> ''),
  encryption_key_version      text        NOT NULL
    CONSTRAINT statement_import_sources_encryption_key_version_check
    CHECK (encryption_key_version <> ''),
  encryption_nonce            bytea       NOT NULL
    CONSTRAINT statement_import_sources_encryption_nonce_check
    CHECK (octet_length(encryption_nonce) = 12),
  encryption_auth_tag         bytea       NOT NULL
    CONSTRAINT statement_import_sources_encryption_auth_tag_check
    CHECK (octet_length(encryption_auth_tag) = 16),

  -- INTEGRITY, over the CIPHERTEXT. Re-checked before commit, so bytes that
  -- changed between storage and commit refuse rather than becoming somebody's
  -- financial records. A plain digest is correct here: ciphertext is
  -- indistinguishable from random, so digesting it confirms nothing about the
  -- statement.
  integrity_checksum_algorithm text       NOT NULL
    CONSTRAINT statement_import_sources_integrity_algorithm_check
    CHECK (integrity_checksum_algorithm IN ('SHA-256')),
  integrity_checksum          bytea       NOT NULL
    CONSTRAINT statement_import_sources_integrity_checksum_check
    CHECK (octet_length(integrity_checksum) = 32),

  -- SAME-FILE RECOGNITION, over the PLAINTEXT, and therefore KEYED — see the
  -- header. Opaque: equality only, and only against a value of the same
  -- version. Never exposed to a client and never logged.
  file_fingerprint            text        NOT NULL
    CONSTRAINT statement_import_sources_file_fingerprint_check
    CHECK (file_fingerprint <> ''),
  file_fingerprint_version    text        NOT NULL
    CONSTRAINT statement_import_sources_file_fingerprint_version_check
    CHECK (file_fingerprint_version <> ''),

  stored_at                   timestamptz NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.statement_import_sources IS
  'HIGHLY_SENSITIVE_FINANCIAL, SUBJECT_OWNED. Where one import''s encrypted '
  'statement bytes live and how to verify they are unchanged. NO PLAINTEXT '
  'STATEMENT BYTE IS STORED IN POSTGRESQL and no provider URI is stored '
  'anywhere: object_ref is an opaque handle the store minted, CHECKed to '
  'carry no scheme separator. A row here cannot exist while the parent '
  'import''s retention question is open — statement_import_sources_guard '
  'refuses the INSERT with KAR54 — which is what makes "retention decides '
  'before the first durable source byte" a structural fact rather than an '
  'application convention. Two checksums answer two questions: '
  'integrity_checksum is a plain SHA-256 over the CIPHERTEXT (safe, because '
  'ciphertext is random-looking) and is re-verified before commit; '
  'file_fingerprint is a KEYED, PER-SUBJECT, VERSIONED MAC over the plaintext '
  'that recognises the same file arriving twice without being a confirmation '
  'oracle over a document someone else already holds. RLS ENABLEd and FORCEd '
  'on BOTH principal GUCs. Lifecycle: 0100 header + '
  'modules/statement-imports/MODULE.md.';

COMMENT ON COLUMN public.statement_import_sources.object_ref IS
  'An OPAQUE handle minted by whatever encrypted store the deployment binds — '
  'never a URI, never a bucket path, never a filesystem path. The CHECK '
  'refuses a scheme separator and whitespace. The domain and application '
  'layers never see a provider address, so moving the store is a composition '
  'change rather than a rewrite of every historical row.';

COMMENT ON COLUMN public.statement_import_sources.file_fingerprint IS
  'The statement file''s identity for equality purposes: a KEYED MAC computed '
  'under a key derived per (tenant, user), over the plaintext bytes and '
  'nothing else. Never a plain digest of the file — anyone holding a copy of '
  'a statement could then test whether a given person uploaded it, without '
  'decrypting anything. Never platform-keyed — that would make the column a '
  'cross-subject join key saying "these two people imported the same file". '
  'Opaque: equality only, against a value of the same '
  'file_fingerprint_version. There is deliberately NO unique index over it: '
  'the same file may legitimately be uploaded again after a rejection or an '
  'erasure, so duplicate-file detection is a REVIEW outcome, not a write '
  'refusal.';

CREATE INDEX statement_import_sources_fingerprint_idx
  ON public.statement_import_sources
     (tenant_id, user_id, file_fingerprint_version, file_fingerprint);

ALTER TABLE public.statement_import_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_import_sources FORCE ROW LEVEL SECURITY;

CREATE POLICY statement_import_sources_subject ON public.statement_import_sources
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Guard: THE RETENTION GATE, plus source immutability.
--
-- SECURITY INVOKER (the default) so the parent import it reads is the
-- caller's own row under the caller's own RLS policy — the same scope the
-- retention decision was taken in.
--
--   KAR54  durable source bytes recorded for an import whose retention
--          question is still open, or for one that has no import row at all.
--   KAR55  a stored source rewritten. The bytes are what the import is about;
--          swapping them would relabel every staged row and every committed
--          transaction as being about a different file.
CREATE FUNCTION public.statement_import_sources_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_retention text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id                       IS DISTINCT FROM OLD.id
      OR NEW.tenant_id              IS DISTINCT FROM OLD.tenant_id
      OR NEW.user_id                IS DISTINCT FROM OLD.user_id
      OR NEW.import_id              IS DISTINCT FROM OLD.import_id
      OR NEW.object_ref             IS DISTINCT FROM OLD.object_ref
      OR NEW.byte_length            IS DISTINCT FROM OLD.byte_length
      OR NEW.integrity_checksum     IS DISTINCT FROM OLD.integrity_checksum
      OR NEW.encryption_nonce       IS DISTINCT FROM OLD.encryption_nonce
      OR NEW.encryption_auth_tag    IS DISTINCT FROM OLD.encryption_auth_tag
      OR NEW.encryption_key_version IS DISTINCT FROM OLD.encryption_key_version
      OR NEW.file_fingerprint       IS DISTINCT FROM OLD.file_fingerprint
      OR NEW.file_fingerprint_version IS DISTINCT FROM OLD.file_fingerprint_version
      OR NEW.created_at             IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'statement_import_source % is immutable: the stored bytes, their integrity checksum and their identity are what the import IS about, and replacing them would relabel every staged row and every committed transaction as being about a different file',
        OLD.id USING ERRCODE = 'KAR55';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT. THE GATE. A source row is the first durable trace of a subject's
  -- statement, and it may not exist until somebody has decided how long it
  -- may be kept.
  SELECT retention_state INTO parent_retention
    FROM public.statement_imports
   WHERE id = NEW.import_id;

  IF parent_retention IS NULL THEN
    RAISE EXCEPTION 'statement_import_source names import %, which is not visible to this principal — a source with no import to govern it is a subject''s statement with no retention decision attached to anything',
      NEW.import_id USING ERRCODE = 'KAR54';
  END IF;
  IF parent_retention <> 'DECIDED' THEN
    RAISE EXCEPTION 'statement_import % has not resolved retention (%), so no durable byte of its source may be written: how long a HIGHLY_SENSITIVE_FINANCIAL record may be kept is a legal decision, and storing the file first while waiting for it is precisely the outcome this gate exists to prevent',
      NEW.import_id, parent_retention USING ERRCODE = 'KAR54';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER statement_import_sources_guard
  BEFORE INSERT OR UPDATE ON public.statement_import_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.statement_import_sources_guard();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.statement_import_sources TO karar_app;
