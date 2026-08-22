-- 0097_account_source_links
--
-- public.account_source_links — WHICH connection feeds WHICH account
-- (modules/financial-connections/MODULE.md; ADR-0028). SUBJECT_OWNED,
-- classified HIGHLY_SENSITIVE_FINANCIAL, erasure strategy CASCADE_DELETE.
--
-- THIS TABLE IS THE SEAM THE WHOLE REDESIGN EXISTS FOR. When the account
-- carried its own source (0088's removed source_kind plus
-- provider_connection_ref), a CSV-created account that later received API
-- data had to become a SECOND account, and the person's history split in two
-- with no way to discover it had happened. The relationship is many-to-many
-- in both directions and neither direction is optional:
--
--   one connection -> many accounts   one uploaded statement legitimately
--                                     covers a current account and the credit
--                                     card printed beneath it.
--   one account -> many connections   an account typed by hand, then fed by
--                                     CSV, then fed by an API is ONE account
--                                     with three source links, which is
--                                     exactly what stops it becoming three
--                                     accounts.
--
-- EXTERNAL IDENTITY IS PROTECTED, AND THAT IS THE HARD PART OF THIS TABLE.
--
-- A source link must recognise "the same account from this source next time"
-- without holding anything that identifies the account outside Karar. Three
-- separate mechanisms, because the obvious single answer is wrong in a
-- different way each time:
--
--   1. THE REFERENCE IS CIPHERTEXT. source_account_reference exists only as
--      ciphertext + nonce + auth tag, with the algorithm and key version per
--      row (ADR-0017) and tenant, user, table, row id and field bound as AEAD
--      associated data, so a ciphertext cannot be moved between rows, columns
--      or subjects. There is NO plaintext column. NO FULL ACCOUNT NUMBER,
--      IBAN, PAN OR WALLET PHONE NUMBER IS STORED: the domain refuses those
--      shapes before anything is encrypted (a PAN-length digit run, an ISO
--      13616 IBAN shape, an E.164 phone shape), because a length bound alone
--      cannot separate a 20-character opaque provider reference from a
--      20-character IBAN and pretending otherwise would be a guarantee that
--      does not hold. The bound below is the OTHER half of that argument: 96
--      bytes is enough for an opaque source-side identifier and far too
--      little for a statement line, so the column cannot quietly become
--      narrative storage.
--
--   2. EQUALITY IS A KEYED, PER-SUBJECT, VERSIONED FINGERPRINT, never a plain
--      hash and never the ciphertext. A plain sha256 of an account reference
--      is a confirmation oracle over a small, guessable input space — read
--      the column, guess a number, get a definitive yes — which hands back
--      precisely the behaviour the ciphertext exists to protect. A single
--      platform key would be worse in a different way: identical external
--      references belonging to two different people would produce identical
--      values, turning this column into a cross-subject join key inside a
--      shared table ("these two subjects hold the same external account"),
--      derivable without decrypting anything. The MAC key is therefore
--      derived per (tenant, user), and the derivation is asserted by test to
--      produce DIFFERENT values for the same external reference under two
--      different subjects. The version travels with the value and
--      participates in the unique constraint, so a redefinition starts a
--      fresh namespace instead of colliding with values computed under the
--      old rules.
--
--      Equality against the CIPHERTEXT is impossible by construction and that
--      is deliberate: AES-GCM uses a fresh nonce per encryption, so the same
--      reference encrypts differently every time. A deterministic ciphertext
--      would restore the oracle in the one place this table cannot afford it.
--
--   3. NEITHER VALUE LEAVES. The fingerprint is never exposed to a client and
--      never logged, and the decrypted reference is never returned by any
--      read path in this module — the view type the use cases return carries
--      neither field, asserted at runtime rather than by convention. The
--      ciphertext is kept anyway because equality is not the only question it
--      answers: a fingerprint-version bump has to be recomputable from the
--      original, and "which source account is this link about?" must remain
--      answerable to an operator under due process rather than being
--      permanently unanswerable to everyone including the subject.
--
-- THE UNIQUE CONSTRAINT, AND THE ONE IT IS DELIBERATELY NOT.
--
--   account_source_links_source_account_key
--     UNIQUE (tenant_id, user_id, connection_id, source_account_fingerprint_version,
--             source_account_fingerprint)
--
-- One source account, one link, per connection. That is what makes a repeated
-- import of the same statement update a link instead of creating a second
-- one, under concurrency and not merely usually: two concurrent writers race
-- for the same index entry and exactly one wins, with the loser receiving
-- 23505. tenant_id and user_id are implied by connection_id and are named
-- anyway — a unique index is enforced globally, RLS or no RLS, so stating the
-- subject makes the constraint subject-scoped structurally rather than
-- cryptographically.
--
-- What it is NOT, and must never become: UNIQUE over (institution,
-- account_type, currency), in any arrangement. That combination is precisely
-- what a real person legitimately duplicates — two current accounts at one
-- bank in one currency, two credit cards from one issuer — and a merge rule
-- built on it silently joins two accounts that were never the same one. This
-- table carries no institution, account-type or currency column at all, so
-- the constraint is not merely absent but unwritable, and a test asserts both
-- the absent columns and the exact set of unique indexes that exist.
--
-- ONE SOURCE ACCOUNT NEVER MAPS TO TWO CANONICAL ACCOUNTS, ACROSS EVERY
-- CONNECTION. The unique constraint above only reaches within one connection,
-- and the failure that matters spans connections: a CSV link pointing source
-- account X at account A while an API link points the same X at account B is
-- one person's history split in two, which is the exact defect ADR-0028
-- exists to prevent. account_source_links_guard therefore refuses any INSERT
-- or UPDATE that would leave one principal holding two non-declined links
-- with the same fingerprint and different account_ids. It runs SECURITY
-- INVOKER, so the rows that inform the answer are the caller's own — which is
-- also the exact scope the fingerprint is defined over.
--
-- LINKING RULES, ENFORCED AND NOT MERELY INTENDED.
--
--   match_basis = 'EXACT_EXTERNAL_REFERENCE'  the incoming external reference
--       fingerprints identically to one already linked for THIS principal.
--       That may link automatically: it is the same source account, and the
--       account it already resolves to is the answer.
--   match_basis = 'PROBABLE'                  anything less — a similar name,
--       a matching tail, a plausible currency and balance. It may NOT link
--       automatically. account_source_links_probable_requires_confirmation
--       refuses LINKED (and DORMANT, which is a linked source gone quiet) for
--       a PROBABLE match unless subject_confirmed_at is present, so the
--       person's decision is a stored fact rather than an assumption made on
--       their behalf. A wrong guess here merges two accounts or splits one
--       person's history, and neither is discoverable by the person it
--       happens to.
--
-- THE CONNECTION'S RAIL IS CARRIED AS A REFERENTIAL FACT, NOT A COPY.
-- connection_rail is bound to the connection by the composite foreign key
-- (connection_id, connection_rail) -> financial_connections (id, rail), whose
-- target is the UNIQUE (id, rail) added in 0096, and the rail is frozen there
-- by trigger. So the value cannot drift, and a rule that depends on it is
-- enforceable HERE rather than requiring a join the database cannot check.
-- The one such rule today: a DEVICE_SIGNAL source is SUPPLEMENTAL and never
-- AUTHORITATIVE (ADR-0028), refused by CHECK. It is unreachable today because
-- 0096 refuses a DEVICE_SIGNAL connection outright, and it is written anyway
-- so that widening that gate cannot silently make a device signal
-- authoritative about someone's money.
--
-- CAPABILITIES ARE OBSERVED, NEVER CLAIMED. balance_capability and
-- pending_transaction_capability default to NOT_OBSERVED and mean exactly
-- what they say: OBSERVED is written only after this platform has actually
-- received such data through this link, NOT_PROVIDED only when the source
-- itself said so. There is no VERIFIED, no AVAILABLE, and no value a
-- capability sheet or a vendor claim could justify — no issuer named anywhere
-- in this platform exposes an interface to Karar, and a capability column is
-- exactly where that fiction would first be written down.
--
-- COVERAGE IS CALENDAR DAYS (ADR-0027). history_coverage_start and
-- history_coverage_end are `date`, because a statement covers days and not
-- moments; storing them as instants would invent a midnight in some timezone
-- and shift the range by a day for readers at a different offset.
--
-- MONEY. This table stores no amount. It records where data came from, never
-- what the data said.
--
-- RLS decision — SUBJECT RECORDS: ENABLE and FORCE, one policy keyed on BOTH
-- app.tenant_id AND app.user_id, USING and WITH CHECK alike, GUCs bound
-- transaction-locally by the platform's withPrincipalContext from the
-- caller's own session and membership (tenancy.md §2). NULLIF makes an unset
-- GUC a NULL predicate — no principal context, no rows. The user arm is
-- load-bearing: two members of one household tenant must not see which
-- sources feed each other's accounts. No allow-list entry.
--
-- Data lifecycle (ADR-0026; canonical in
-- modules/financial-connections/MODULE.md):
--   public.account_source_links
--     Subject relationship: SUBJECT_OWNED — the subject's own accounts and
--       their own connections; nothing here is shared with anyone.
--     Purpose: which connection feeds which account, with the protected
--       external identity that lets the same source account be recognised
--       again, the basis on which it was linked, and what this platform has
--       actually observed the source provide.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: UNRESOLVED — the financial-data retention decision is a
--       legal one and has not been taken, so no period is written here.
--       Non-local durable creation fails closed until a PolicyPack decision
--       exists, enforced by FinancialConnectionRetentionDecisionPort in
--       ProposeAccountSourceLink and not merely declared; LOCAL and TEST run
--       on a clearly synthetic fixture with no legal effect.
--     Export treatment: included — the subject's export contains which
--       sources feed their accounts. The encrypted external reference and the
--       fingerprint are NOT exported: the first is another party's identifier
--       for the subject and the second is a keyed value with no meaning
--       outside this platform, and exporting either would put back on a
--       laptop exactly what the two columns exist to keep off one.
--     Erasure strategy: CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TRIGGER, DROP FUNCTION, DROP
-- POLICY, DROP TABLE public.account_source_links — which destroys every
-- record of which source fed which account and, with it, the only thing that
-- keeps a re-import from creating duplicate accounts. Restore from backup.

CREATE TABLE public.account_source_links (
  id                          uuid        PRIMARY KEY,
  -- Cross-module references (raw UUIDs, no FK across module boundaries —
  -- data-model.md §2). account_reference_type says what account_id points at
  -- without a reader opening another module's source, exactly as 0090 does.
  tenant_id                   uuid        NOT NULL,
  user_id                     uuid        NOT NULL,
  account_id                  uuid        NOT NULL,
  account_reference_type      text        NOT NULL
    CONSTRAINT account_source_links_account_reference_type_check
    CHECK (account_reference_type IN ('FINANCIAL_ACCOUNT')),

  -- In-module FK: public.financial_connections (0096) is owned by this
  -- module, so this is a real constraint. Composite, against UNIQUE (id,
  -- rail), so connection_rail is a referential fact and not a copy that can
  -- drift. ON DELETE CASCADE is the erasure story: removing a connection
  -- removes the links it fed.
  connection_id               uuid        NOT NULL,
  connection_rail             text        NOT NULL,
  CONSTRAINT account_source_links_connection_fkey
    FOREIGN KEY (connection_id, connection_rail)
    REFERENCES public.financial_connections (id, rail)
    ON DELETE CASCADE,

  -- How much this source may be relied on for this account, relative to the
  -- others feeding it. Nothing in this module resolves the comparison — see
  -- source_priority.
  source_authority            text        NOT NULL
    CONSTRAINT account_source_links_source_authority_check
    CHECK (source_authority IN ('AUTHORITATIVE', 'SUPPLEMENTAL', 'UNVERIFIED')),
  -- A device signal is supplemental and never authoritative (ADR-0028).
  -- Unreachable today because 0096 refuses a DEVICE_SIGNAL connection at all;
  -- written so that widening that gate cannot make one authoritative by
  -- omission.
  CONSTRAINT account_source_links_device_signal_never_authoritative
    CHECK (connection_rail <> 'DEVICE_SIGNAL' OR source_authority <> 'AUTHORITATIVE'),

  -- Encryption context for this row's HSF field (ADR-0017 provenance).
  hsf_algorithm               text        NOT NULL
    CONSTRAINT account_source_links_hsf_algorithm_check CHECK (hsf_algorithm <> ''),
  hsf_key_version             text        NOT NULL
    CONSTRAINT account_source_links_hsf_key_version_check CHECK (hsf_key_version <> ''),

  -- THE OPAQUE EXTERNAL REFERENCE, ciphertext only. 96 bytes under a
  -- length-preserving cipher is 96 plaintext characters: room for a
  -- source-side opaque identifier, nowhere near room for a statement line.
  -- The rule that keeps an IBAN, PAN, account number or wallet phone number
  -- out is a DOMAIN rule applied before encryption, because no byte bound can
  -- tell a 20-character opaque reference from a 20-character IBAN.
  source_account_reference_ciphertext bytea NOT NULL
    CONSTRAINT account_source_links_source_reference_bound_check
    CHECK (octet_length(source_account_reference_ciphertext) <= 96),
  source_account_reference_nonce      bytea NOT NULL
    CONSTRAINT account_source_links_source_reference_nonce_check
    CHECK (octet_length(source_account_reference_nonce) = 12),
  source_account_reference_auth_tag   bytea NOT NULL
    CONSTRAINT account_source_links_source_reference_auth_tag_check
    CHECK (octet_length(source_account_reference_auth_tag) = 16),

  -- The keyed, per-subject, versioned equality value. Opaque: the only
  -- supported operation is equality against another value of the same
  -- version. Never exposed to a client and never logged.
  source_account_fingerprint  text        NOT NULL
    CONSTRAINT account_source_links_fingerprint_check
    CHECK (source_account_fingerprint <> ''),
  -- Named source_account_fingerprint_version rather than the shorter
  -- fingerprint_version, and the prefix is load-bearing rather than
  -- decorative. public.transactions (0090) carries a fingerprint_version of
  -- its own for a DIFFERENT fingerprint over DIFFERENT inputs, and that
  -- module asserts against the live catalogue that no other table carries the
  -- dedup identity's column names. Two unrelated fingerprints sharing one
  -- column name would break that assertion and, worse, would make any future
  -- audit query over "fingerprint_version" silently mix two vocabularies.
  source_account_fingerprint_version text  NOT NULL
    CONSTRAINT account_source_links_fingerprint_version_check
    CHECK (source_account_fingerprint_version <> ''),

  -- HOW this link came to point at this account, and WHERE it stands.
  match_basis                 text        NOT NULL
    CONSTRAINT account_source_links_match_basis_check
    CHECK (match_basis IN ('EXACT_EXTERNAL_REFERENCE', 'PROBABLE')),
  source_status               text        NOT NULL
    CONSTRAINT account_source_links_source_status_check
    CHECK (source_status IN ('PENDING_CONFIRMATION', 'LINKED', 'DECLINED', 'DORMANT')),
  -- The instant the SUBJECT confirmed a probable match. Never written by a
  -- rule, a heuristic or a default.
  subject_confirmed_at        timestamptz     NULL,
  -- A probable match is never linked without the person having said so.
  CONSTRAINT account_source_links_probable_requires_confirmation
    CHECK (source_status NOT IN ('LINKED', 'DORMANT')
           OR match_basis = 'EXACT_EXTERNAL_REFERENCE'
           OR subject_confirmed_at IS NOT NULL),
  -- And the converse: a link that is waiting for an answer, or was refused,
  -- must not be carrying one.
  CONSTRAINT account_source_links_unconfirmed_states_carry_no_confirmation
    CHECK (source_status NOT IN ('PENDING_CONFIRMATION', 'DECLINED')
           OR subject_confirmed_at IS NULL),

  -- Which source wins when several feed one account: LOWER is stronger.
  -- Stored here, applied nowhere in this module — precedence between two
  -- sources reporting different figures is a reconciliation decision with its
  -- own correctness problem, and this table records the input to it rather
  -- than pretending to have taken it.
  source_priority             integer     NOT NULL DEFAULT 100
    CONSTRAINT account_source_links_source_priority_check
    CHECK (source_priority BETWEEN 1 AND 1000),

  -- Observation, as instants this platform genuinely observed.
  first_observed_at           timestamptz NOT NULL,
  last_observed_at            timestamptz NOT NULL,
  last_successful_import_at   timestamptz     NULL,
  CONSTRAINT account_source_links_observation_order_check
    CHECK (last_observed_at >= first_observed_at),
  CONSTRAINT account_source_links_import_within_observation_check
    CHECK (last_successful_import_at IS NULL
           OR last_successful_import_at >= first_observed_at),

  -- Coverage, as CALENDAR DAYS (ADR-0027): a statement covers days, and an
  -- instant here would invent a midnight in a timezone nobody stated.
  -- All-or-nothing: half a range describes nothing.
  history_coverage_start      date            NULL,
  history_coverage_end        date            NULL,
  CONSTRAINT account_source_links_history_coverage_pair
    CHECK ((history_coverage_start IS NULL) = (history_coverage_end IS NULL)),
  CONSTRAINT account_source_links_history_coverage_order
    CHECK (history_coverage_start IS NULL
           OR history_coverage_start <= history_coverage_end),

  -- What this platform has OBSERVED the source provide. Never a claim.
  balance_capability          text        NOT NULL DEFAULT 'NOT_OBSERVED'
    CONSTRAINT account_source_links_balance_capability_check
    CHECK (balance_capability IN ('OBSERVED', 'NOT_OBSERVED', 'NOT_PROVIDED')),
  pending_transaction_capability text     NOT NULL DEFAULT 'NOT_OBSERVED'
    CONSTRAINT account_source_links_pending_capability_check
    CHECK (pending_transaction_capability IN ('OBSERVED', 'NOT_OBSERVED', 'NOT_PROVIDED')),

  version                     integer     NOT NULL DEFAULT 1
    CONSTRAINT account_source_links_version_check CHECK (version >= 1),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL,

  -- One source account, one link, per connection — see the header for what
  -- this constraint is and, more importantly, what it is not.
  CONSTRAINT account_source_links_source_account_key
    UNIQUE (tenant_id, user_id, connection_id, source_account_fingerprint_version,
            source_account_fingerprint)
);

COMMENT ON TABLE public.account_source_links IS
  'HIGHLY_SENSITIVE_FINANCIAL, SUBJECT_OWNED. The many-to-many seam between '
  'connections (0096) and accounts (0088): one connection feeds many '
  'accounts, one account is fed by many connections, and that is what lets a '
  'CSV-created account later receive API data WITHOUT becoming a second '
  'account (ADR-0028). External identity is protected three ways: the source '
  'reference exists ONLY as ciphertext + nonce + auth tag (no full account '
  'number, IBAN, PAN or wallet phone number is stored — the domain refuses '
  'those shapes before encryption); equality uses a KEYED, PER-SUBJECT, '
  'VERSIONED fingerprint, so the same external reference under two subjects '
  'produces DIFFERENT values and the column cannot become a cross-subject '
  'join key; and neither the fingerprint nor the decrypted reference is ever '
  'returned to a client or logged. Uniqueness is (tenant, user, connection, '
  'fingerprint version, fingerprint) — deliberately NOT (institution, account '
  'type, currency), which is exactly what a real person duplicates; this '
  'table carries no such column, so that constraint is unwritable rather than '
  'merely absent. account_source_links_guard additionally refuses one '
  'principal holding two non-declined links with the same fingerprint and '
  'different accounts, so one source account never maps to two canonical '
  'accounts across connections. An EXACT external-reference match may link '
  'automatically; a PROBABLE match may not — LINKED and DORMANT are refused '
  'for a probable match with no subject_confirmed_at. Capabilities are '
  'OBSERVED or NOT_OBSERVED, never claimed. RLS ENABLEd and FORCEd on BOTH '
  'principal GUCs. Lifecycle: 0097 header + '
  'modules/financial-connections/MODULE.md.';

COMMENT ON COLUMN public.account_source_links.source_account_fingerprint IS
  'The source account''s identity for equality purposes: a KEYED MAC computed '
  'under a key derived per (tenant, user), over the normalised external '
  'reference and the reference scheme, and nothing else. Never a plain hash — '
  'that would be a confirmation oracle over a small guessable input space. '
  'Never platform-keyed — that would make the column a cross-subject join '
  'key. Never derived from the ciphertext, the nonce, the key material or the '
  'row id (a fresh nonce per encryption means a ciphertext-derived value '
  'would change identity on every write, and a row-id-derived one would make '
  'every row unique and the constraint useless). Opaque: equality only, and '
  'only against a value of the same source_account_fingerprint_version. Never exposed to a '
  'client and never logged.';

COMMENT ON COLUMN public.account_source_links.source_account_fingerprint_version IS
  'Which fingerprint definition produced source_account_fingerprint. It '
  'participates in the unique constraint, so a redefinition starts a fresh '
  'namespace rather than colliding with values computed under the old rules.';

COMMENT ON COLUMN public.account_source_links.match_basis IS
  'EXACT_EXTERNAL_REFERENCE — the incoming reference fingerprints identically '
  'to one already linked for this principal, so it is the same source account '
  'and may link automatically. PROBABLE — anything less, which may NOT link '
  'automatically: LINKED and DORMANT are refused unless subject_confirmed_at '
  'is present. Linking never merges on institution + type + currency, which '
  'is precisely the combination a real person legitimately duplicates '
  '(ADR-0028).';

COMMENT ON COLUMN public.account_source_links.source_priority IS
  'Which source wins when several feed one account; LOWER is stronger. '
  'Recorded here and applied NOWHERE in this module — reconciling two sources '
  'that report different figures is a decision with its own correctness '
  'problem and its own name, and nothing here computes a winner, a balance, '
  'or a merged view.';

COMMENT ON COLUMN public.account_source_links.balance_capability IS
  'What this platform has OBSERVED this source provide, never what a source '
  'or a vendor sheet claims: OBSERVED only after such data has actually '
  'arrived through this link, NOT_PROVIDED only when the source itself said '
  'so, NOT_OBSERVED otherwise and by default. There is deliberately no '
  'VERIFIED or AVAILABLE value — no issuer named in this platform exposes an '
  'interface to Karar, and a capability column is where that fiction would '
  'first be written down (ADR-0028).';

-- The two questions this table answers: "which sources feed my account?" and
-- "which accounts does this connection feed?". Two indexes because the
-- leading columns differ.
CREATE INDEX account_source_links_account_idx
  ON public.account_source_links (tenant_id, user_id, account_id, source_priority);
CREATE INDEX account_source_links_connection_idx
  ON public.account_source_links (tenant_id, user_id, connection_id, created_at);
-- The cross-connection exact-match lookup: "has this principal already linked
-- this source account anywhere?". Without it the guard below and the
-- auto-link path both scan the subject's links.
CREATE INDEX account_source_links_fingerprint_idx
  ON public.account_source_links
     (tenant_id, user_id, source_account_fingerprint_version, source_account_fingerprint);

ALTER TABLE public.account_source_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_source_links FORCE ROW LEVEL SECURITY;

CREATE POLICY account_source_links_subject ON public.account_source_links
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Guard: source identity frozen, the canonical account frozen once the link
-- is settled, one source account per principal, and the concurrency token
-- advanced by exactly one.
--
-- SECURITY INVOKER (the default) so the cross-connection lookup runs under
-- the caller's own RLS policy: the only rows that may inform the answer are
-- the principal's own, which is exactly the scope the fingerprint is defined
-- over. Custom SQLSTATEs so callers distinguish the arms structurally
-- ('KAR' is outside every class the standard and PostgreSQL assign — 0090):
--   KAR20  source identity rewritten.
--   KAR21  a settled link re-pointed at a different account.
--   KAR22  the optimistic-concurrency token did not advance by exactly one.
--   KAR23  one source account would map to two canonical accounts.
CREATE FUNCTION public.account_source_links_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conflicting_account uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- WHICH source account this link is about can never change: the
    -- fingerprint and its version ARE the source identity, and the connection
    -- is where that identity is scoped. Rewriting any of them relabels the
    -- row as being about a different source account while keeping its
    -- history, which is the same defect as creating a duplicate, by a
    -- different verb.
    IF NEW.id         IS DISTINCT FROM OLD.id
      OR NEW.tenant_id  IS DISTINCT FROM OLD.tenant_id
      OR NEW.user_id    IS DISTINCT FROM OLD.user_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.connection_id   IS DISTINCT FROM OLD.connection_id
      OR NEW.connection_rail IS DISTINCT FROM OLD.connection_rail
      OR NEW.source_account_fingerprint
           IS DISTINCT FROM OLD.source_account_fingerprint
      OR NEW.source_account_fingerprint_version
           IS DISTINCT FROM OLD.source_account_fingerprint_version
    THEN
      RAISE EXCEPTION 'account_source_link % may not have its source identity rewritten: tenant, user, connection, rail, fingerprint and fingerprint version are what say WHICH source account this link is about (modules/financial-connections/MODULE.md)',
        OLD.id USING ERRCODE = 'KAR20';
    END IF;

    -- A proposal may still be re-pointed: a probable match awaiting an answer
    -- and a match the person declined are both candidates, not decisions. A
    -- LINKED or DORMANT link is a decision, and moving it to another account
    -- would silently move every fact that arrived through it.
    IF NEW.account_id IS DISTINCT FROM OLD.account_id
      AND OLD.source_status NOT IN ('PENDING_CONFIRMATION', 'DECLINED')
    THEN
      RAISE EXCEPTION 'account_source_link % is %, so the account it points at is settled and immutable; re-pointing it would move every fact that arrived through this source to another account without anyone deciding so',
        OLD.id, OLD.source_status USING ERRCODE = 'KAR21';
    END IF;

    IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
      RAISE EXCEPTION 'account_source_link % updates must increment version by exactly one (got % after %) — the optimistic-concurrency token is not optional',
        OLD.id, NEW.version, OLD.version USING ERRCODE = 'KAR22';
    END IF;

    NEW.updated_at := now();
  END IF;

  -- ONE SOURCE ACCOUNT, ONE CANONICAL ACCOUNT — across every connection this
  -- principal holds. The unique constraint reaches only within one
  -- connection; this is the arm that catches the case the redesign exists
  -- for. DECLINED rows are excluded because a refusal is a record of what did
  -- NOT happen, and a person may decline a match against one account and
  -- later accept one against another.
  IF NEW.source_status <> 'DECLINED' THEN
    SELECT existing.account_id
      INTO conflicting_account
      FROM public.account_source_links AS existing
     WHERE existing.tenant_id  = NEW.tenant_id
       AND existing.user_id    = NEW.user_id
       AND existing.source_account_fingerprint = NEW.source_account_fingerprint
       AND existing.source_account_fingerprint_version
             = NEW.source_account_fingerprint_version
       AND existing.source_status <> 'DECLINED'
       AND existing.id            <> NEW.id
       AND existing.account_id    <> NEW.account_id
     LIMIT 1;

    IF conflicting_account IS NOT NULL THEN
      RAISE EXCEPTION 'this source account is already linked to account % for this subject, so it may not also be linked to account %: one source account maps to at most one canonical account, and two would split one person''s history in two with nothing to tell them it happened (ADR-0028)',
        conflicting_account, NEW.account_id USING ERRCODE = 'KAR23';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER account_source_links_guard
  BEFORE INSERT OR UPDATE ON public.account_source_links
  FOR EACH ROW
  EXECUTE FUNCTION public.account_source_links_guard();

-- DELETE is granted for the same reason as 0088, 0090 and 0096: the declared
-- erasure strategy is CASCADE_DELETE, and erasing an account must be able to
-- take its source links with it. The RLS policy applies to DELETE, so the
-- grant reaches only the principal's own rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_source_links TO karar_app;
