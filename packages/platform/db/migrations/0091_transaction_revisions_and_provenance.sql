-- 0091_transaction_revisions_and_provenance
--
-- The two tables that make a stored financial fact explainable and keep a
-- user correction from silently erasing what a statement said.
--
-- WHY REVISIONS EXIST AT ALL
--
-- The failure they prevent: a statement says 45.00, a person edits it to
-- 54.00 because they remember it differently, and the row now claims the
-- institution said 54.00. Nothing remembers otherwise, so the bank's own
-- figure is gone and no reconciliation can ever detect the divergence. That
-- is a fabricated financial fact produced by an ordinary UI affordance.
--
-- So revision 1 of every transaction holds the values as first committed,
-- attributed to where they came from (SOURCE_IMPORT or MANUAL_ENTRY), and
-- every later change appends a row attributed to USER_INPUT carrying the
-- values after the change plus the list of fields that moved. "What did the
-- statement actually say" is then a read of the earliest revision. Nothing
-- ever edits a revision — a mistaken correction is corrected by another one.
--
-- WHY PROVENANCE IS PER REVISION AND NOT PER TRANSACTION
--
-- The origin of the values you are looking at stops being the origin of the
-- row the moment anyone edits anything. A per-transaction provenance record
-- would keep saying "row 47 of import X" about figures a person typed. So
-- each revision gets its own provenance: source kind, the import and the
-- exact row it came from (or neither, for manual input), who acted, which
-- account, and the four processing versions — parser, mapping, normalisation
-- and fingerprint — that together decide what a given source row turns into.
-- Change any of those and the same row can legitimately produce a different
-- transaction; without them recorded, "why does this row import differently
-- now?" has no answer.
--
-- All four version columns are NOT NULL, including for manual entry, where
-- they name the manual path's own trivial versions. A nullable version column
-- would let "we do not know" hide as "not applicable", and those are not the
-- same answer.
--
-- WHY THE SOURCE'S OWN DEBIT/CREDIT WORDING LIVES HERE
--
-- transactions.amount_minor is signed in ONE frame (account holder; money out
-- is negative). Statements are not: a bank's internal ledger treats a
-- customer's deposit account as a liability, so its "credit" is the
-- customer's money in, while retail statements usually flip to the customer's
-- frame — and different exports disagree, sometimes within one file.
-- source_direction records what the source literally said and
-- direction_mapping records how it was interpreted, so a later discovery that
-- one institution exports in the bank frame is a re-derivation from preserved
-- facts rather than an archaeological dig.
--
-- APPEND-ONLY, WITH ONE DELIBERATE EXCEPTION
--
-- karar_app holds SELECT + INSERT only, and a BEFORE UPDATE trigger raises
-- even for the table owner. There is deliberately NO delete guard and no
-- truncate guard, unlike the consent and policy ledgers: the declared erasure
-- strategy for these tables is CASCADE_DELETE (MODULE.md), so the rows MUST
-- die with their transaction when a subject deletes it. A guard that blocked
-- DELETE would block the cascade and leave provenance about a transaction
-- that no longer exists — residue of exactly the data the subject asked to be
-- rid of. Immutability here means "no row is ever rewritten", not "no row is
-- ever removed".
--
-- RLS: same shape as 0090 — ENABLE and FORCE, one policy requiring BOTH
-- principal GUCs on USING and WITH CHECK, NULLIF making an unset GUC fail
-- closed.
--
-- Data lifecycle (ADR-0026; canonical in modules/transactions/MODULE.md):
--   public.transaction_revisions
--     Subject relationship: SUBJECT_OWNED.
--     Purpose: append-only history keeping the imported value attributable
--       after a user correction, so a correction never silently overwrites
--       the source fact.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: unresolved, as 0090 — fails closed outside LOCAL/TEST.
--     Export treatment: included with the transaction.
--     Erasure strategy: CASCADE_DELETE.
--
--   public.transaction_provenance
--     Subject relationship: SUBJECT_DERIVED.
--     Purpose: the traceable origin of every stored financial fact — source
--       kind, import and row reference, parser, mapping, normalisation and
--       fingerprint versions.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: unresolved, as 0090.
--     Export treatment: included — a subject may see where their own data
--       came from.
--     Erasure strategy: CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TRIGGER/FUNCTION pairs, DROP
-- POLICY, DROP TABLE public.transaction_provenance, public.transaction_
-- revisions — after which no stored figure could be traced to a statement row
-- and no corrected figure could be told from an imported one. That is the
-- product's central honesty claim, so unwinding it needs the review that
-- claim deserves.

CREATE TABLE public.transaction_revisions (
  id                     uuid        PRIMARY KEY,
  transaction_id         uuid        NOT NULL
    REFERENCES public.transactions (id) ON DELETE CASCADE,
  tenant_id              uuid        NOT NULL,
  user_id                uuid        NOT NULL,
  -- 1 is the value as first committed; increments by exactly one thereafter,
  -- matching transactions.version.
  revision_number        integer     NOT NULL CHECK (revision_number >= 1),
  attribution            text        NOT NULL
    CHECK (attribution IN ('SOURCE_IMPORT', 'MANUAL_ENTRY', 'USER_INPUT')),
  -- Revision 1 is by definition the original; a correction masquerading as
  -- one would defeat the entire mechanism, so the schema forbids it.
  CONSTRAINT transaction_revisions_original_is_not_user_input
    CHECK ((revision_number = 1) = (attribution IN ('SOURCE_IMPORT', 'MANUAL_ENTRY'))),
  actor_ref              uuid        NOT NULL,

  -- The values AS OF this revision — a complete snapshot, not a patch, so
  -- reading one row answers "what did it say then" without replaying a chain.
  amount_minor           bigint      NOT NULL,
  currency_code          char(3)     NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  -- Calendar days, matching 0090 (ADR-0027). A revision snapshot of a date
  -- has to be the same KIND of value as the column it snapshots, or the
  -- history would answer "what did the statement say" in a different frame
  -- from the row it is history for.
  booking_date           date        NOT NULL,
  value_date             date            NULL,
  -- The source-supplied instant and the zone the source stated for it, as
  -- they stood at this revision. Carried so the snapshot is COMPLETE — a
  -- revision is a full picture, not a patch — and because that completeness
  -- is itself the evidence: these two are not correctable, so every revision
  -- of one transaction repeats the same values, and a history where they ever
  -- differ is a history where somebody rewrote when the source said a
  -- movement happened.
  event_occurred_at      timestamptz     NULL,
  source_timezone        text            NULL CHECK (source_timezone <> ''),
  -- As in 0090: a zone with no instant qualifies nothing.
  CONSTRAINT transaction_revisions_source_timezone_needs_instant
    CHECK (source_timezone IS NULL OR event_occurred_at IS NOT NULL),
  status                 text        NOT NULL CHECK (status IN ('POSTED', 'VOIDED')),

  -- Same encryption discipline as 0090: ciphertext, nonce, tag, with the
  -- algorithm and key version per row. A revision holds narrative too, so it
  -- gets the same protection rather than a weaker one.
  hsf_algorithm          text        NOT NULL CHECK (hsf_algorithm <> ''),
  hsf_key_version        text        NOT NULL CHECK (hsf_key_version <> ''),
  description_ciphertext bytea       NOT NULL,
  description_nonce      bytea       NOT NULL CHECK (octet_length(description_nonce) = 12),
  description_auth_tag   bytea       NOT NULL CHECK (octet_length(description_auth_tag) = 16),
  merchant_ciphertext    bytea           NULL,
  merchant_nonce         bytea           NULL CHECK (octet_length(merchant_nonce) = 12),
  merchant_auth_tag      bytea           NULL CHECK (octet_length(merchant_auth_tag) = 16),
  CONSTRAINT transaction_revisions_merchant_triple
    CHECK (
      (merchant_ciphertext IS NULL AND merchant_nonce IS NULL AND merchant_auth_tag IS NULL)
      OR (merchant_ciphertext IS NOT NULL AND merchant_nonce IS NOT NULL AND merchant_auth_tag IS NOT NULL)
    ),
  note_ciphertext        bytea           NULL,
  note_nonce             bytea           NULL CHECK (octet_length(note_nonce) = 12),
  note_auth_tag          bytea           NULL CHECK (octet_length(note_auth_tag) = 16),
  CONSTRAINT transaction_revisions_note_triple
    CHECK (
      (note_ciphertext IS NULL AND note_nonce IS NULL AND note_auth_tag IS NULL)
      OR (note_ciphertext IS NOT NULL AND note_nonce IS NOT NULL AND note_auth_tag IS NOT NULL)
    ),

  -- Which fields differ from the previous revision, in a fixed order. Empty
  -- on revision 1. A correction that changed nothing is refused upstream, so
  -- a non-first revision always names at least one field.
  changed_fields         text[]      NOT NULL DEFAULT '{}',
  CONSTRAINT transaction_revisions_changed_fields_present
    CHECK ((revision_number = 1) OR array_length(changed_fields, 1) >= 1),

  recorded_at            timestamptz NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),

  -- One revision per version per transaction: a forked history would make
  -- "what did the statement say" ambiguous.
  CONSTRAINT transaction_revisions_sequence UNIQUE (transaction_id, revision_number)
);

COMMENT ON TABLE public.transaction_revisions IS
  'SUBJECT_OWNED append-only revision history (HIGHLY_SENSITIVE_FINANCIAL). '
  'Revision 1 holds the values as first committed, attributed to the source; '
  'every correction appends a USER_INPUT row, so an imported figure stays '
  'attributable after any edit. Immutable by trigger (no rewrite) but '
  'deliberately deletable by cascade (CASCADE_DELETE erasure). RLS ENABLEd '
  'and FORCEd on BOTH principal GUCs.';

COMMENT ON COLUMN public.transaction_revisions.booking_date IS
  'The booking CALENDAR DAY as of this revision (ADR-0027) — the same kind of '
  'value as transactions.booking_date, so the history and the row it explains '
  'never speak in different frames.';
COMMENT ON COLUMN public.transaction_revisions.value_date IS
  'The value calendar day as of this revision, where the source stated one. '
  'Never inferred from booking_date.';
COMMENT ON COLUMN public.transaction_revisions.event_occurred_at IS
  'The source-supplied INSTANT as of this revision, or null where the source '
  'stated none. Not correctable, so it is identical across every revision of '
  'one transaction — a history where it differs is a history where somebody '
  'rewrote when the source said the movement happened.';
COMMENT ON COLUMN public.transaction_revisions.source_timezone IS
  'The IANA zone the source stated for event_occurred_at, as of this '
  'revision. Never guessed, and only present alongside that instant.';

CREATE INDEX transaction_revisions_history_idx
  ON public.transaction_revisions (tenant_id, user_id, transaction_id, revision_number);

ALTER TABLE public.transaction_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_revisions FORCE ROW LEVEL SECURITY;

CREATE POLICY transaction_revisions_subject ON public.transaction_revisions
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- No UPDATE grant and no DELETE grant: append-only by grants first
-- (data-model.md §10). The cascade from transactions does not need the
-- privilege — referential actions run in the table owner's context.
GRANT SELECT, INSERT ON public.transaction_revisions TO karar_app;

-- Immutability by trigger as well as by grant, so the rule holds against the
-- table owner too. UPDATE only: DELETE must remain possible for the cascade.
CREATE FUNCTION public.transaction_revisions_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'transaction_revisions rows are append-only history: UPDATE is not permitted, even for the table owner. A mistaken correction is corrected by another correction, never by rewriting what was recorded (modules/transactions/MODULE.md)'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER transaction_revisions_immutable
  BEFORE UPDATE ON public.transaction_revisions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.transaction_revisions_immutable();

CREATE TABLE public.transaction_provenance (
  id                     uuid        PRIMARY KEY,
  transaction_id         uuid        NOT NULL
    REFERENCES public.transactions (id) ON DELETE CASCADE,
  tenant_id              uuid        NOT NULL,
  user_id                uuid        NOT NULL,
  -- The revision whose VALUES this record explains.
  revision_number        integer     NOT NULL CHECK (revision_number >= 1),

  source_kind            text        NOT NULL CHECK (source_kind IN ('MANUAL', 'CSV')),
  -- Opaque references into the ingestion context; no FK crosses the module
  -- boundary (data-model.md §2). A CSV fact MUST name both, a manual fact
  -- must name neither — a CSV provenance that cannot point at the line it
  -- came from explains nothing, and a manual entry carrying an import
  -- reference claims an origin it does not have.
  import_ref             text            NULL CHECK (import_ref <> ''),
  row_ref                text            NULL CHECK (row_ref <> ''),
  CONSTRAINT transaction_provenance_origin_matches_source_kind
    CHECK (
      (source_kind = 'CSV' AND import_ref IS NOT NULL AND row_ref IS NOT NULL)
      OR (source_kind = 'MANUAL' AND import_ref IS NULL AND row_ref IS NULL)
    ),

  actor_ref              uuid        NOT NULL,
  account_id             uuid        NOT NULL,
  account_reference_type text        NOT NULL
    CHECK (account_reference_type IN ('FINANCIAL_ACCOUNT')),

  -- The four deterministic-processing versions. All NOT NULL, always.
  parser_version         text        NOT NULL CHECK (parser_version <> ''),
  mapping_version        text        NOT NULL CHECK (mapping_version <> ''),
  normalization_version  text        NOT NULL CHECK (normalization_version <> ''),
  fingerprint_version    text        NOT NULL CHECK (fingerprint_version <> ''),

  -- What the source itself said, and how it was interpreted (see header).
  source_direction       text        NOT NULL
    CHECK (source_direction IN ('DEBIT', 'CREDIT', 'NOT_STATED')),
  direction_mapping      text        NOT NULL
    CHECK (direction_mapping IN (
      'MANUAL_ENTRY', 'SOURCE_DIRECTION_WORD',
      'SOURCE_SIGNED_AMOUNT', 'SOURCE_SIGNED_AMOUNT_INVERTED'
    )),

  -- Snapshot of how a category was attached at commit time. NONE is honest
  -- and common. There is no probability, score or confidence column here or
  -- anywhere in this module: categorisation is deterministic (MODULE.md).
  category_assignment_source text    NOT NULL
    CHECK (category_assignment_source IN ('NONE', 'USER', 'RULE')),

  created_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT transaction_provenance_per_revision
    UNIQUE (transaction_id, revision_number)
);

COMMENT ON TABLE public.transaction_provenance IS
  'SUBJECT_DERIVED origin of every stored financial fact '
  '(HIGHLY_SENSITIVE_FINANCIAL), one row per revision. A CSV fact names its '
  'import and its exact source row; a manual fact names neither, and the '
  'schema refuses the other combinations. The four processing versions are '
  'NOT NULL even for manual entry — a nullable version lets "we do not know" '
  'hide as "not applicable". source_direction/direction_mapping preserve what '
  'the source called the movement, so the single stored sign never loses it. '
  'RLS ENABLEd and FORCEd on BOTH principal GUCs.';

CREATE INDEX transaction_provenance_lookup_idx
  ON public.transaction_provenance (tenant_id, user_id, transaction_id, revision_number);

ALTER TABLE public.transaction_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_provenance FORCE ROW LEVEL SECURITY;

CREATE POLICY transaction_provenance_subject ON public.transaction_provenance
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

GRANT SELECT, INSERT ON public.transaction_provenance TO karar_app;

CREATE FUNCTION public.transaction_provenance_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'transaction_provenance rows are append-only origin records: UPDATE is not permitted, even for the table owner. Where a value came from is not something later processing may revise (modules/transactions/MODULE.md)'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER transaction_provenance_immutable
  BEFORE UPDATE ON public.transaction_provenance
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.transaction_provenance_immutable();
