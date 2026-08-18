-- 0093_transaction_category_assignments
--
-- Which category applies to a transaction, by which source, with a
-- supersession chain.
--
-- WHY A CHAIN AND NOT A COLUMN ON transactions
--
-- A category_code column on the transaction would answer "what is it?" and
-- nothing else. The questions that matter in practice are "why is it marked
-- TRANSPORT?" and "did something overwrite what I chose?", and a column
-- cannot answer either — the previous value is simply gone. So assignment
-- appends a row and marks the previous ACTIVE one SUPERSEDED, pointing at its
-- successor. The history is the answer.
--
-- MANUAL OVERRIDE BEATS RULE, AND THE SCHEMA HELPS ENFORCE IT
--
-- The failure this prevents is the one every rules engine eventually
-- produces: a user corrects a category, a re-classification runs, and the
-- correction disappears with no trace and no notification — after which the
-- user has no reason to trust any category on any screen. The precedence rule
-- lives in the domain (a RULE assignment against a transaction any person has
-- ever categorised is REFUSED with a typed outcome, never skipped quietly),
-- and the schema makes the chain that rule reads unambiguous:
-- transaction_category_assignments_one_active is a PARTIAL UNIQUE INDEX on
-- (transaction_id) WHERE status = 'ACTIVE'. Two concurrent assignments cannot
-- both leave an ACTIVE row behind; the loser gets 23505 and retries against
-- the chain it can now see. Without it, a race produces two active categories
-- — a state no read can explain and no user can correct.
--
-- rule_version is NOT NULL exactly when the source is RULE, by CHECK. A rule
-- result that cannot name the reviewed version that produced it cannot be
-- re-derived, which makes it indistinguishable from a guess; and a USER
-- assignment carrying a rule version would make the chain lie about who
-- decided. There is deliberately no score, weight or confidence column, here
-- or anywhere in this module (MODULE.md: deterministic only; no AI, no LLM).
--
-- The FK to financial_categories is what keeps an assignment referencing a
-- code that exists. Retirement of a code is a status on the catalogue row,
-- never a deletion, so old assignments stay resolvable.
--
-- RLS: same shape as 0090 and 0091 — ENABLE and FORCE, one policy requiring
-- BOTH principal GUCs on USING and WITH CHECK, NULLIF making an unset GUC
-- fail closed. UPDATE is granted here (unlike the revision and provenance
-- ledgers) because supersession IS an update of the superseded row's status;
-- the row's decision content — which category, by whom, from which rule
-- version — is frozen by trigger, so an "update" can only ever close a row,
-- never rewrite what it decided.
--
-- Data lifecycle (ADR-0026; canonical in modules/transactions/MODULE.md):
--   public.transaction_category_assignments
--     Subject relationship: SUBJECT_DERIVED.
--     Purpose: which category applies, by which source (user or deterministic
--       rule), with supersession history.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: unresolved, as 0090 — fails closed outside LOCAL/TEST.
--     Export treatment: included.
--     Erasure strategy: CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP POLICY, DROP TRIGGER/
-- FUNCTION pair, DROP TABLE public.transaction_category_assignments —
-- discarding every subject's categorisation decisions and the evidence of
-- which of them were theirs rather than a rule's.

CREATE TABLE public.transaction_category_assignments (
  id                uuid        PRIMARY KEY,
  transaction_id    uuid        NOT NULL
    REFERENCES public.transactions (id) ON DELETE CASCADE,
  tenant_id         uuid        NOT NULL,
  user_id           uuid        NOT NULL,
  category_code     text        NOT NULL
    REFERENCES public.financial_categories (code),
  assignment_source text        NOT NULL CHECK (assignment_source IN ('USER', 'RULE')),
  -- Present exactly when a rule decided; absent exactly when a person did.
  rule_version      text            NULL CHECK (rule_version <> ''),
  CONSTRAINT transaction_category_assignments_rule_version_matches_source
    CHECK ((assignment_source = 'RULE') = (rule_version IS NOT NULL)),
  assigned_by       uuid        NOT NULL,
  assigned_at       timestamptz NOT NULL,
  status            text        NOT NULL CHECK (status IN ('ACTIVE', 'SUPERSEDED')),
  -- The assignment that replaced this one.
  --
  -- DEFERRABLE INITIALLY DEFERRED, and that is load-bearing rather than
  -- decorative. Supersession must close the old row and open the new one with
  -- no instant in between where a reader sees two ACTIVE rows or none, so the
  -- two statements run in one transaction — and the UPDATE that names the
  -- successor necessarily runs BEFORE the successor is inserted. With an
  -- immediate constraint that ordering is impossible: closing first violates
  -- the foreign key, and inserting first violates the one-ACTIVE index (a
  -- partial unique index cannot itself be deferred). Deferring the foreign key
  -- to COMMIT makes the pair atomic without weakening either guarantee: at
  -- commit the successor exists, and at no point were two rows ACTIVE.
  superseded_by_id  uuid            NULL
    REFERENCES public.transaction_category_assignments (id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  superseded_at     timestamptz     NULL,
  CONSTRAINT transaction_category_assignments_supersession_pair
    CHECK ((status = 'SUPERSEDED') = (superseded_at IS NOT NULL)),
  CONSTRAINT transaction_category_assignments_active_has_no_successor
    CHECK (status = 'SUPERSEDED' OR superseded_by_id IS NULL),
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.transaction_category_assignments IS
  'SUBJECT_DERIVED categorisation chain (HIGHLY_SENSITIVE_FINANCIAL). '
  'Assignment appends and supersedes rather than updating in place, so "why '
  'is this TRANSPORT?" and "did something overwrite my choice?" are both '
  'answerable. A partial unique index guarantees exactly one ACTIVE row per '
  'transaction under concurrency. rule_version is required exactly when a '
  'rule decided. No score, weight or confidence column exists — '
  'categorisation is deterministic. RLS ENABLEd and FORCEd on BOTH principal '
  'GUCs.';

-- Exactly one ACTIVE assignment per transaction, enforced by the database
-- rather than by an application-side read-then-write that races.
CREATE UNIQUE INDEX transaction_category_assignments_one_active
  ON public.transaction_category_assignments (transaction_id)
  WHERE status = 'ACTIVE';

CREATE INDEX transaction_category_assignments_chain_idx
  ON public.transaction_category_assignments
    (tenant_id, user_id, transaction_id, assigned_at, id);

ALTER TABLE public.transaction_category_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_category_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY transaction_category_assignments_subject
  ON public.transaction_category_assignments
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- SELECT, INSERT, UPDATE: supersession closes a row. No DELETE grant —
-- removal happens only through the cascade when the transaction itself is
-- deleted, which is the declared CASCADE_DELETE erasure.
GRANT SELECT, INSERT, UPDATE ON public.transaction_category_assignments TO karar_app;

-- The decision content is frozen; only the supersession transition may move.
-- ACTIVE -> SUPERSEDED, once, setting both superseded_at and superseded_by_id.
-- Nothing may resurrect a superseded row, and nothing may rewrite which
-- category was chosen, by whom, or under which rule version.
CREATE FUNCTION public.transaction_category_assignments_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id                IS DISTINCT FROM OLD.id
    OR NEW.transaction_id    IS DISTINCT FROM OLD.transaction_id
    OR NEW.tenant_id         IS DISTINCT FROM OLD.tenant_id
    OR NEW.user_id           IS DISTINCT FROM OLD.user_id
    OR NEW.category_code     IS DISTINCT FROM OLD.category_code
    OR NEW.assignment_source IS DISTINCT FROM OLD.assignment_source
    OR NEW.rule_version      IS DISTINCT FROM OLD.rule_version
    OR NEW.assigned_by       IS DISTINCT FROM OLD.assigned_by
    OR NEW.assigned_at       IS DISTINCT FROM OLD.assigned_at
    OR NEW.created_at        IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'transaction_category_assignment % records a decision: which category, by whom, under which rule version, and when. None of that may be rewritten — a different decision is a new assignment that supersedes this one (modules/transactions/MODULE.md)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.status = 'ACTIVE' AND NEW.status = 'SUPERSEDED'
    AND NEW.superseded_at IS NOT NULL AND NEW.superseded_by_id IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'transaction_category_assignment % permits only ACTIVE -> SUPERSEDED with both superseded_at and superseded_by_id set; got % -> %',
    OLD.id, OLD.status, NEW.status USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER transaction_category_assignments_guard
  BEFORE UPDATE ON public.transaction_category_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.transaction_category_assignments_guard();
