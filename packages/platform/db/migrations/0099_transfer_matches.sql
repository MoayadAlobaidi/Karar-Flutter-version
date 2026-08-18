-- 0099_transfer_matches
--
-- public.transfer_matches — ONE MOVEMENT OF THE PERSON'S OWN MONEY, recorded
-- twice and related once (modules/transfer-matching/MODULE.md; ADR-0028).
-- SUBJECT_OWNED, classified HIGHLY_SENSITIVE_FINANCIAL, erasure strategy
-- CASCADE_DELETE.
--
-- WHAT THIS TABLE IS FOR.
--
-- A wallet top-up from a bank account is ONE movement that appears in the
-- data TWICE, once on each side. Left alone it reads as an expense and an
-- income, so "a month in which someone moved their own money looks like a
-- month in which they earned and spent it" (ADR-0028). The fix is a
-- RELATIONSHIP between the two transactions, not a rewrite of either: both
-- rows stay exactly as their sources reported them, and this table says they
-- are two sides of one thing.
--
-- A ROW HERE IS NOT AN INSIGHT, AND CANNOT BECOME ONE. There is no amount, no
-- net figure, no category, no score and no total anywhere in this table or in
-- the module that owns it. The only integer is `version`, the
-- optimistic-concurrency token, which counts writes and not money. That
-- absence is asserted rather than promised: the module's
-- __tests__/no-money-arithmetic.test.ts scans its own production source for
-- addition, subtraction, sums, reduces and aggregate calls over amounts —
-- the same scan style as
-- modules/financial-accounts/__tests__/balance-kind-not-inferred.test.ts —
-- and the schema test asserts an EXHAUSTIVE column list, so a
-- `net_amount_minor` column fails a test rather than shipping.
--
-- ONLY THE PERSON'S CONFIRMATION MAKES A MATCH AUTHORITATIVE.
--
-- A SUGGESTED match changes NOTHING. It is a question the product asks, and
-- nothing may read it as an answer. CONFIRMED requires a recorded subject
-- decision instant, and the DATABASE is what says so:
--
--   CONSTRAINT transfer_matches_confirmed_requires_subject_decision
--     CHECK (match_state <> 'CONFIRMED' OR subject_decided_at IS NOT NULL)
--
-- Not "the use case sets it", not "the type requires it" — the row does not
-- exist without it, including for a direct SQL UPDATE by karar_app, a
-- fixture, a backfill, or an import path written by someone who never read
-- this file. The converse is enforced too
-- (transfer_matches_decision_instant_matches_state): a SUGGESTED match must
-- NOT be carrying a decision instant, so a suggestion cannot be dressed up as
-- one by writing the column and leaving the state alone.
--
-- Why the asymmetry is not caution for its own sake: a wrong automatic
-- transfer match makes two real movements disappear from a person's record of
-- what they earned and spent. Nothing on any screen says a pairing happened,
-- so the person cannot see it, cannot question it, and cannot undo what they
-- never knew occurred.
--
-- CROSS-CURRENCY IS REFUSED BY THE SCHEMA, NOT BY A CODE PATH.
--
--   CONSTRAINT transfer_matches_same_currency_only
--     CHECK (outflow_currency_code = inflow_currency_code)
--
-- Both currency codes are stored — deliberately as TWO columns rather than
-- one shared column, because the rule is that two independent facts must
-- AGREE, and a single column would assert the agreement instead of checking
-- it. A currency code is a denomination and not an amount; no arithmetic is
-- possible over it and none is attempted.
--
-- ADR-0028: "cross-currency movements are not auto-matched without a
-- source-stated FX relationship". NO SUCH RELATIONSHIP EXISTS ANYWHERE IN
-- THIS PLATFORM — no source states one, no column holds one, and no rate
-- table is consulted — so cross-currency simply CANNOT be suggested, and the
-- constraint above is that sentence made unwritable rather than merely
-- intended. When a source-stated FX relationship one day exists, the remedy
-- is a forward migration adding the column that carries the SOURCE'S OWN
-- statement plus a widened CHECK that requires it. It is never a code path
-- that picks a rate: a rate chosen by this platform would turn "the person
-- moved their own money" into "the person moved their own money and lost
-- 0.4% of it, according to us".
--
-- THE TWO SIDES, AND WHAT THE COLUMNS FREEZE.
--
-- outflow_* is the side money LEFT; inflow_* is the side money ARRIVED. The
-- naming is the canonical sign convention read out loud
-- (modules/transactions/domain/sign-convention.ts: negative is money leaving
-- the account holder), and the use case checks the signs rather than trusting
-- the column names.
--
--   two DIFFERENT transactions   transfer_matches_two_distinct_transactions.
--       A transaction matched to itself is not a movement, it is a row
--       pointing at itself, and it would net a real expense to nothing.
--   two DIFFERENT accounts       transfer_matches_two_distinct_accounts. Two
--       equal-and-opposite entries on ONE account are a reversal, a refund or
--       a correction — not money moving between the person's own accounts.
--       Calling one a transfer would erase a genuine refund from the record.
--
-- The account ids are carried here even though the transactions already have
-- them, and the duplication is safe for a reason the schema can point at:
-- public.transactions freezes account_id by trigger (0090's
-- transactions_guard), so the value cannot drift from the row it was copied
-- from. A composite foreign key would express this without any copy — that is
-- how 0097 binds a link's rail to its connection — but no foreign key crosses
-- a module boundary (data-model.md §2), so a referential fact and a frozen
-- copy are the two options and the second is the one available. What the copy
-- buys is concrete: the different-accounts rule becomes a CHECK, and erasing
-- an account can reach the matches that touch it without first enumerating
-- every transaction on it.
--
-- ONE TRANSACTION, AT MOST ONE LIVE MATCH.
--
-- A transaction matched twice in a live state would have its movement
-- explained away twice. Enforced in two layers because neither alone is
-- enough:
--
--   * two PARTIAL UNIQUE INDEXES over the non-REJECTED rows, one per side.
--     These settle a concurrent race properly — two writers contend for the
--     same index entry and exactly one wins with 23505 — and they cover the
--     common case, the same transaction proposed twice on the same side.
--   * transfer_matches_guard (SQLSTATE KAR42) for the case no index can
--     express: the same transaction appearing as the OUTFLOW of one match and
--     the INFLOW of another. It runs SECURITY INVOKER, so the rows informing
--     the answer are the caller's own.
--
-- The residual is stated rather than hidden: two concurrent inserts that
-- cross sides can both pass the trigger's SELECT before either commits.
-- Closing that would need a serializable transaction or a lock the writer
-- takes deliberately, and neither is a schema constraint; the module's
-- repository is where the choice belongs and MODULE.md records it.
--
-- REJECTED rows are EXCLUDED from the live-state rules and are KEPT rather
-- than deleted, for the reason 0097 gives about a declined source link:
-- without the row, the same wrong suggestion returns on every import, and the
-- person is asked the same question forever. A rejection is a record of what
-- did NOT happen.
--
-- A FEE IS NOT PART OF THE TRANSFER.
--
-- A top-up of 100 with a 2 fee is THREE transactions and ONE match: the
-- outflow of 100, the inflow of 100, and a separate fee of 2 that stays an
-- ordinary expense and is matched to nothing. Nothing here has to special-case
-- that, and the reason is structural — the equal-and-opposite rule finds no
-- counterpart for the fee, and a match names exactly two transactions with no
-- room for a third. The module proves it with a test rather than asserting it,
-- because "the fee stays an expense" is the claim a later convenience
-- (matching on approximate amounts, or on a total) would quietly break.
--
-- A MATCH MAY NEVER SPAN TWO SUBJECTS OR TWO TENANTS, and the schema cannot
-- express one: there is ONE tenant_id and ONE user_id column on the row, both
-- sides are resolved through a port that reads transactions under the
-- CALLER'S OWN principal context (so another subject's transaction resolves
-- as absent, indistinguishably from a guessed id), and the RLS policy below
-- keys on both GUCs. The adversarial suite proves all three layers.
--
-- RLS decision — SUBJECT RECORDS: ENABLE and FORCE, one policy keyed on BOTH
-- app.tenant_id AND app.user_id, USING and WITH CHECK alike, GUCs bound
-- transaction-locally by the platform's withPrincipalContext from the
-- caller's own session and membership (tenancy.md §2). NULLIF makes an unset
-- GUC a NULL predicate — no principal context, no rows. The user arm is
-- load-bearing: two members of one household tenant must not see which of
-- each other's movements are transfers between their own accounts. No
-- allow-list entry.
--
-- Data lifecycle (ADR-0026; canonical in
-- modules/transfer-matching/MODULE.md):
--   public.transfer_matches
--     Subject relationship: SUBJECT_OWNED — a relationship between two of the
--       subject's own transactions; nothing here is shared with anyone.
--     Purpose: which two of the subject's transactions are one movement of
--       their own money, on what basis it was suggested, and whether the
--       subject confirmed it. Never an amount, never a total, never a
--       conclusion.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: UNRESOLVED — the financial-data retention decision is a
--       legal one and has not been taken, so no period is written here.
--       Non-local durable creation fails closed until a PolicyPack decision
--       exists, enforced by TransferMatchRetentionDecisionPort in
--       SuggestTransferMatch and not merely declared; LOCAL and TEST run on a
--       clearly synthetic fixture with no legal effect.
--     Export treatment: included — the subject's export contains which of
--       their movements are transfers between their own accounts, and whether
--       they confirmed each one.
--     Erasure strategy: CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TRIGGER, DROP FUNCTION, DROP
-- POLICY, DROP TABLE public.transfer_matches — which destroys every
-- confirmation a person gave, leaving their own transfers reading as income
-- and expense again. The transactions themselves are untouched. Restore from
-- backup.

CREATE TABLE public.transfer_matches (
  id                        uuid        PRIMARY KEY,
  -- ONE subject, both sides. Two subjects are not expressible: there is one
  -- pair of columns, and the port that resolves each transaction reads it
  -- under the caller's own principal context.
  tenant_id                 uuid        NOT NULL,
  user_id                   uuid        NOT NULL,

  -- THE SIDE MONEY LEFT. Cross-module references (raw UUIDs, no FK across a
  -- module boundary — data-model.md §2); the reference type says what the
  -- uuid points at without a reader opening another module's source.
  outflow_transaction_id    uuid        NOT NULL,
  outflow_transaction_reference_type text NOT NULL
    CONSTRAINT transfer_matches_outflow_reference_type_check
    CHECK (outflow_transaction_reference_type IN ('TRANSACTION')),
  -- The account that transaction belongs to, copied from a column
  -- public.transactions freezes by trigger, so it cannot drift. See the
  -- header for what the copy buys and why a foreign key is not available.
  outflow_account_id        uuid        NOT NULL,
  -- ISO 4217 alphabetic. A DENOMINATION, not an amount: nothing here is
  -- summed, converted, or compared for magnitude.
  outflow_currency_code     text        NOT NULL
    CONSTRAINT transfer_matches_outflow_currency_check
    CHECK (outflow_currency_code ~ '^[A-Z]{3}$'),

  -- THE SIDE MONEY ARRIVED.
  inflow_transaction_id     uuid        NOT NULL,
  inflow_transaction_reference_type text NOT NULL
    CONSTRAINT transfer_matches_inflow_reference_type_check
    CHECK (inflow_transaction_reference_type IN ('TRANSACTION')),
  inflow_account_id         uuid        NOT NULL,
  inflow_currency_code      text        NOT NULL
    CONSTRAINT transfer_matches_inflow_currency_check
    CHECK (inflow_currency_code ~ '^[A-Z]{3}$'),

  -- A transaction matched to itself is a row pointing at itself, and it would
  -- net a real expense to nothing.
  CONSTRAINT transfer_matches_two_distinct_transactions
    CHECK (outflow_transaction_id <> inflow_transaction_id),
  -- Two equal-and-opposite entries on ONE account are a reversal, a refund or
  -- a correction — not money moving between the person's own accounts.
  CONSTRAINT transfer_matches_two_distinct_accounts
    CHECK (outflow_account_id <> inflow_account_id),
  -- CROSS-CURRENCY CANNOT BE SUGGESTED. No source-stated FX relationship
  -- exists anywhere in this platform, and without one a cross-currency pair
  -- is a guess about a rate. See the header for what widening this would
  -- require.
  CONSTRAINT transfer_matches_same_currency_only
    CHECK (outflow_currency_code = inflow_currency_code),

  -- WHERE THIS MATCH STANDS. SUGGESTED changes nothing.
  match_state               text        NOT NULL
    CONSTRAINT transfer_matches_match_state_check
    CHECK (match_state IN ('SUGGESTED', 'CONFIRMED', 'REJECTED')),
  -- ON WHAT BASIS it was suggested. A closed vocabulary with one member
  -- today, so that a second basis is a reviewed migration and a visible
  -- widening rather than a new string appearing in production rows.
  suggestion_basis          text        NOT NULL
    CONSTRAINT transfer_matches_suggestion_basis_check
    CHECK (suggestion_basis IN ('EQUAL_AND_OPPOSITE_SAME_CURRENCY_WITHIN_WINDOW')),
  -- WHICH declared window produced it — a version label, never a bare number
  -- of hours. The module exports the window as a named constant with this
  -- label attached, so widening the window is a version bump and every row
  -- says which rule it was suggested under rather than being reinterpreted
  -- under whatever the constant says today.
  suggestion_window         text        NOT NULL
    CONSTRAINT transfer_matches_suggestion_window_check CHECK (suggestion_window <> ''),

  -- THE INSTANT THE SUBJECT DECIDED. Never written by a rule, a heuristic, a
  -- default, or a backfill.
  subject_decided_at        timestamptz     NULL,
  -- THE HEADLINE RULE: only the person's confirmation makes a match
  -- authoritative.
  CONSTRAINT transfer_matches_confirmed_requires_subject_decision
    CHECK (match_state <> 'CONFIRMED' OR subject_decided_at IS NOT NULL),
  -- And the completeness half, both directions at once: a suggestion carries
  -- no decision, and a decided state always carries its instant. Without it,
  -- writing the instant on a SUGGESTED row would pre-load a confirmation the
  -- person never gave.
  CONSTRAINT transfer_matches_decision_instant_matches_state
    CHECK ((match_state = 'SUGGESTED') = (subject_decided_at IS NULL)),

  -- When this platform first proposed the pairing. An observation, not a
  -- decision.
  first_suggested_at        timestamptz NOT NULL,

  -- The ONLY integer on this table. It counts writes, not money.
  version                   integer     NOT NULL DEFAULT 1
    CONSTRAINT transfer_matches_version_check CHECK (version >= 1),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL
);

COMMENT ON TABLE public.transfer_matches IS
  'HIGHLY_SENSITIVE_FINANCIAL, SUBJECT_OWNED. A RELATIONSHIP between two of '
  'one subject''s transactions that are two sides of ONE movement of their '
  'own money (ADR-0028) — a wallet top-up read once as an expense and once '
  'as an income. Neither transaction is rewritten. A SUGGESTED match changes '
  'NOTHING; CONFIRMED requires a recorded subject decision instant, enforced '
  'by transfer_matches_confirmed_requires_subject_decision and not merely by '
  'the use case. CROSS-CURRENCY CANNOT BE SUGGESTED: both currency codes are '
  'stored and transfer_matches_same_currency_only requires them to agree, '
  'because no source-stated FX relationship exists anywhere in this platform '
  'and a rate this platform chose would be a fabricated loss on a person''s '
  'own money. The two sides must be different transactions on different '
  'accounts, and a transaction may participate in at most ONE live '
  '(non-REJECTED) match — two partial unique indexes plus '
  'transfer_matches_guard (SQLSTATE KAR42) for the cross-side case. REJECTED '
  'rows are kept, not deleted: without them the same wrong suggestion '
  'returns on every import. THERE IS NO AMOUNT, NO TOTAL, NO NET AND NO '
  'CATEGORY COLUMN, and nothing in the owning module computes one. RLS '
  'ENABLEd and FORCEd on BOTH principal GUCs. Lifecycle: 0099 header + '
  'modules/transfer-matching/MODULE.md.';

COMMENT ON COLUMN public.transfer_matches.subject_decided_at IS
  'The instant the SUBJECT decided — confirming the pairing or rejecting it. '
  'It is the ONLY thing that makes a match authoritative, and it is never '
  'written by a rule, a heuristic, a default or a backfill. A CHECK requires '
  'it for CONFIRMED and forbids it for SUGGESTED, so neither a state without '
  'a decision nor a decision without a state can exist.';

COMMENT ON COLUMN public.transfer_matches.outflow_currency_code IS
  'ISO 4217 alphabetic, for the side money LEFT. Stored as a separate column '
  'from the inflow''s so that transfer_matches_same_currency_only CHECKS '
  'that two independent facts agree rather than asserting the agreement with '
  'one shared column. A denomination, never an amount: nothing sums, '
  'converts, or compares magnitudes anywhere in this table or its module.';

COMMENT ON COLUMN public.transfer_matches.suggestion_window IS
  'Which DECLARED window produced this suggestion, as a version label rather '
  'than a bare number of hours. The owning module exports the window as a '
  'named constant carrying this label, so widening it is a version bump and '
  'every existing row keeps saying which rule it was suggested under, '
  'instead of being silently reinterpreted under whatever the constant says '
  'today.';

COMMENT ON COLUMN public.transfer_matches.match_state IS
  'SUGGESTED — a question this platform asked; it changes nothing and no '
  'reader may treat it as an answer. CONFIRMED — the person said yes, and '
  'subject_decided_at records when. REJECTED — the person said no; the row '
  'is KEPT so the same wrong suggestion does not return on every import, and '
  'is excluded from the live-state uniqueness rules so a later, different '
  'pairing remains possible.';

-- ONE TRANSACTION, AT MOST ONE LIVE MATCH — the half an index can express.
-- Partial on the non-REJECTED rows: a rejection is history, and excluding it
-- is what lets a person reject one pairing and later accept another. These
-- settle a concurrent race properly; the cross-side case is the trigger's.
CREATE UNIQUE INDEX transfer_matches_live_outflow_key
  ON public.transfer_matches (tenant_id, user_id, outflow_transaction_id)
  WHERE match_state <> 'REJECTED';
CREATE UNIQUE INDEX transfer_matches_live_inflow_key
  ON public.transfer_matches (tenant_id, user_id, inflow_transaction_id)
  WHERE match_state <> 'REJECTED';

-- "Which of my movements are transfers?", answered by state.
CREATE INDEX transfer_matches_owner_idx
  ON public.transfer_matches (tenant_id, user_id, match_state, created_at);
-- The erasure reach: "which matches touch this account?", per side. Without
-- these, erasing an account would scan every match the subject holds.
CREATE INDEX transfer_matches_outflow_account_idx
  ON public.transfer_matches (tenant_id, user_id, outflow_account_id);
CREATE INDEX transfer_matches_inflow_account_idx
  ON public.transfer_matches (tenant_id, user_id, inflow_account_id);

ALTER TABLE public.transfer_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_matches FORCE ROW LEVEL SECURITY;

CREATE POLICY transfer_matches_subject ON public.transfer_matches
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Guard: WHICH two transactions a match is about frozen after insert, the
-- state transitions restricted to the ones a person can actually make, one
-- live match per transaction across both sides, and the concurrency token
-- advanced by exactly one.
--
-- SECURITY INVOKER (the default) so the cross-side lookup runs under the
-- caller's own RLS policy: the only rows that may inform the answer are the
-- principal's own. Custom SQLSTATEs so callers distinguish the arms
-- structurally ('KAR' is outside every class the standard and PostgreSQL
-- assign — 0090). KAR01, KAR02, KAR10, KAR11, KAR20-KAR23 and KAR30-KAR31
-- are taken by other modules; this module owns KAR40-KAR43:
--   KAR40  match identity rewritten (subject, either side, or either
--          currency).
--   KAR41  the optimistic-concurrency token did not advance by exactly one.
--   KAR42  one of these transactions already participates in a live match.
--   KAR43  a state transition nobody can make.
CREATE FUNCTION public.transfer_matches_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conflicting_match uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- WHICH two transactions this match is about can never change. Rewriting
    -- either side relabels the row as being about a different movement while
    -- keeping the person's confirmation attached to it — which is how a
    -- decision somebody made about one pair silently becomes a decision about
    -- another. The currencies are frozen for the same reason: they are the
    -- evidence the same-currency rule was satisfied when the person answered.
    IF NEW.id         IS DISTINCT FROM OLD.id
      OR NEW.tenant_id  IS DISTINCT FROM OLD.tenant_id
      OR NEW.user_id    IS DISTINCT FROM OLD.user_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.outflow_transaction_id IS DISTINCT FROM OLD.outflow_transaction_id
      OR NEW.outflow_transaction_reference_type
           IS DISTINCT FROM OLD.outflow_transaction_reference_type
      OR NEW.outflow_account_id     IS DISTINCT FROM OLD.outflow_account_id
      OR NEW.outflow_currency_code  IS DISTINCT FROM OLD.outflow_currency_code
      OR NEW.inflow_transaction_id  IS DISTINCT FROM OLD.inflow_transaction_id
      OR NEW.inflow_transaction_reference_type
           IS DISTINCT FROM OLD.inflow_transaction_reference_type
      OR NEW.inflow_account_id      IS DISTINCT FROM OLD.inflow_account_id
      OR NEW.inflow_currency_code   IS DISTINCT FROM OLD.inflow_currency_code
    THEN
      RAISE EXCEPTION 'transfer_match % may not have its identity rewritten: the subject, both transaction references, both accounts and both currencies are what say WHICH movement this match is about, and the confirmation attached to it was given about THAT movement (modules/transfer-matching/MODULE.md)',
        OLD.id USING ERRCODE = 'KAR40';
    END IF;

    -- The transitions a person can actually make: answer a question, or
    -- change their mind about an answer they gave. A REJECTED match is never
    -- reopened — without the row the same wrong suggestion returns on every
    -- import, and re-suggesting it is exactly what keeping the row prevents.
    -- Nothing returns to SUGGESTED either: a decision that has been taken
    -- cannot become an unanswered question again.
    IF NEW.match_state IS DISTINCT FROM OLD.match_state THEN
      IF NOT (
        (OLD.match_state = 'SUGGESTED' AND NEW.match_state IN ('CONFIRMED', 'REJECTED'))
        OR (OLD.match_state = 'CONFIRMED' AND NEW.match_state = 'REJECTED')
      ) THEN
        RAISE EXCEPTION 'transfer_match % may not move from % to %: a suggestion may be confirmed or rejected and a confirmation may be withdrawn, but a rejection is a record of what did NOT happen and is never reopened, and no decided match becomes an unanswered question again',
          OLD.id, OLD.match_state, NEW.match_state USING ERRCODE = 'KAR43';
      END IF;
    END IF;

    IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
      RAISE EXCEPTION 'transfer_match % updates must increment version by exactly one (got % after %) — the optimistic-concurrency token is not optional',
        OLD.id, NEW.version, OLD.version USING ERRCODE = 'KAR41';
    END IF;

    NEW.updated_at := now();
  END IF;

  -- ONE TRANSACTION, AT MOST ONE LIVE MATCH — including the case no index can
  -- express, where the same transaction is the OUTFLOW of one match and the
  -- INFLOW of another. The two partial unique indexes cover the same-side
  -- case and settle races; this arm covers the crossing. REJECTED rows are
  -- excluded on both sides: a refusal is history, and a person may reject one
  -- pairing and later accept a different one involving the same transaction.
  IF NEW.match_state <> 'REJECTED' THEN
    SELECT existing.id
      INTO conflicting_match
      FROM public.transfer_matches AS existing
     WHERE existing.tenant_id = NEW.tenant_id
       AND existing.user_id   = NEW.user_id
       AND existing.match_state <> 'REJECTED'
       AND existing.id <> NEW.id
       AND (
         existing.outflow_transaction_id IN (NEW.outflow_transaction_id, NEW.inflow_transaction_id)
         OR existing.inflow_transaction_id IN (NEW.outflow_transaction_id, NEW.inflow_transaction_id)
       )
     LIMIT 1;

    IF conflicting_match IS NOT NULL THEN
      RAISE EXCEPTION 'one of these transactions already belongs to live transfer match %, so it may not belong to another: a transaction matched twice would have its movement explained away twice, and the person would see one real movement disappear from what they earned and spent (ADR-0028)',
        conflicting_match USING ERRCODE = 'KAR42';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER transfer_matches_guard
  BEFORE INSERT OR UPDATE ON public.transfer_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.transfer_matches_guard();

-- DELETE is granted for the same reason as 0088, 0090, 0096, 0097 and 0098:
-- the declared erasure strategy is CASCADE_DELETE, and erasing a transaction
-- or an account must be able to take the matches that name it. Leaving them
-- would leave a relationship pointing at a movement that no longer exists.
-- The RLS policy applies to DELETE, so the grant reaches only the principal's
-- own rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_matches TO karar_app;
