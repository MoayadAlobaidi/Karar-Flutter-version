-- 0096_financial_connections
--
-- public.financial_connections — HOW Karar receives financial data, per
-- subject (modules/financial-connections/MODULE.md; ADR-0028). SUBJECT_OWNED,
-- classified HIGHLY_SENSITIVE_FINANCIAL, erasure strategy CASCADE_DELETE.
--
-- A CONNECTION IS NOT AN ACCOUNT, AND THE WHOLE TABLE EXISTS BECAUSE THOSE
-- ARE DIFFERENT THINGS. An account is where a balance sits; a connection is
-- the route a fact travels to get here. One connection may later feed MANY
-- accounts — a single uploaded statement legitimately covers a current
-- account and the credit card printed beneath it — and one person may hold
-- SEVERAL connections to one institution, because two statements downloaded
-- from one bank in two different months are two arrivals of data and not one.
-- Neither of those is expressible if the source is a column on the account,
-- which is exactly what 0088 removed. Which connection feeds which account is
-- account_source_links (0097), and it is many-to-many on purpose.
--
-- THE RAIL VOCABULARY IS COMPLETE AND ALMOST ENTIRELY UNAVAILABLE.
--
-- Thirteen rails are NAMED here: MANUAL, USER_FILE_UPLOAD,
-- OPEN_FINANCE_API, DIRECT_BANK_OR_WALLET_API, LICENSED_AGGREGATOR_API,
-- HOST_TO_HOST_SFTP, ISO_20022_FILE, SWIFT_MT_FILE, OFX_QFX_FILE, QIF_FILE,
-- PDF_STATEMENT, SECURE_EMAIL_STATEMENT, DEVICE_SIGNAL. Naming them now costs
-- nothing and shapes the model correctly; a vocabulary invented later would
-- have to be retrofitted onto rows already written, and retrofitting a
-- vocabulary onto subject-owned financial data means rewriting other people's
-- records to fit a word we chose afterwards.
--
-- ONLY MANUAL AND USER_FILE_UPLOAD MAY BE WRITTEN, AND THE DATABASE IS WHAT
-- SAYS SO. financial_connections_rail_implemented_check refuses every other
-- rail outright — not "the application will not construct one", not "the use
-- case validates it": the row does not exist, including for a direct SQL
-- INSERT by karar_app, a fixture, a migration-time backfill, or a future
-- ingestion path written by someone who never read this file. An unimplemented
-- rail with a row in this table is the first half of a fabricated bank
-- connection, and the legacy's connect-a-bank screen is the record of what
-- the second half looks like.
--
-- The two CHECKs are deliberately separate and they are NOT redundant, even
-- though the narrower one currently implies the wider one:
--
--   financial_connections_rail_check              the VOCABULARY — every rail
--                                                 this model can name at all.
--   financial_connections_rail_implemented_check  the GATE — the rails a row
--                                                 may actually carry today.
--
-- Implementing a rail is a reviewed migration that widens the GATE and leaves
-- the vocabulary untouched. Folding them into one CHECK would make "we can
-- describe this rail" and "this rail works" the same edit, which is precisely
-- the conflation this table exists to prevent.
--
-- STATUS, AND WHY ACTIVE CANNOT LAND ON A RAIL NOBODY BUILT. status is the
-- connection's own state: ACTIVE, NOT_CONFIGURED, UNAVAILABLE, RETIRED, and
-- NOT_IMPLEMENTED. financial_connections_active_requires_implemented_rail
-- refuses ACTIVE for anything outside the implemented set, and it names that
-- set INDEPENDENTLY of the gate above. That independence is the point: when a
-- future migration widens the gate so a rail's rows may exist, "a row may
-- exist" and "a row may claim to be working" stay two decisions, and the
-- second one has to be taken on purpose.
--
-- NOT_IMPLEMENTED is MODELLED AND UNREACHABLE, exactly as
-- financial_accounts.origin_kind = 'EXTERNAL_PROVIDER' is (0088). A row may
-- only carry an implemented rail, and
-- financial_connections_not_implemented_status_matches_rail refuses
-- NOT_IMPLEMENTED for an implemented one — so no row in this table describes
-- an unimplemented rail, because there is no such row at all. The value
-- stays in the vocabulary so the concept has a name the day a gate widens.
--
-- NO STATUS MEANS CONNECTED, AND NONE MAY BE ADDED. There is no CONNECTED,
-- no SYNCED, no LINKED, no AUTHORIZED and no PAIRED value here, and a test
-- asserts the vocabulary never gains one. ACTIVE on a MANUAL connection means
-- the person may type entries; ACTIVE on a USER_FILE_UPLOAD connection means
-- they may upload a file. Neither is a live link to an institution, none
-- exists, and no surface may render either as one. The legacy's own audit
-- called its fabricated Synced badge the single most misleading surface in
-- the product; nothing in this schema can express that claim.
--
-- NO CREDENTIAL OF ANY KIND IS STORED, AND THE ABSENCE IS STRUCTURAL. There
-- is no username, password, mPIN, OTP, recovery code, security answer, cookie,
-- session token, access token, refresh token, client secret, certificate,
-- device binding, scraping state or synchronisation cursor column here, and
-- there is no free-text or JSON column one could be hidden inside. Every
-- column below is either an identifier, a value from a closed vocabulary, an
-- encryption parameter, a timestamp, or the one encrypted display label.
-- Because a CHECK cannot assert the absence of a column, the guarantee is
-- asserted the only way it can be: an integration test reads
-- information_schema.columns for this table and compares the column set
-- against an EXHAUSTIVE expected list, so any column added here — credential-
-- shaped or not — fails the test until someone changes that list deliberately.
--
-- WHY THE DISPLAY LABEL IS CIPHERTEXT. One person may hold several
-- connections to one institution, so a connection needs a name the person
-- gave it, and "Al Bayt salary statements" is a fact about a person's
-- financial life under the same classification as the account name it sits
-- beside (0088). It exists ONLY as ciphertext + nonce + auth tag, with the
-- algorithm and key version per row (ADR-0017), and the application binds
-- tenant, user, table, row id and field as associated data so a ciphertext
-- cannot be moved between rows, columns or subjects. There is no plaintext
-- column for it. 360 bytes is 120 characters at no more than three UTF-8
-- bytes per UTF-16 code unit — a label field cannot become a notes field.
--
-- THE INSTITUTION IS A RAW REFERENCE, NOT A FOREIGN KEY. public.institutions
-- belongs to modules/financial-accounts, and no FK crosses a module boundary
-- (data-model.md §2). institution_ref is therefore a bare uuid paired with
-- institution_reference_type, which declares what the uuid points at without a
-- reader having to open another module's source. Both or neither; a reference
-- with no stated kind is a uuid nobody can resolve. The pointer is optional
-- because a cash ledger the person keeps by hand names no institution at all.
--
-- IDENTITY IS THE ID ALONE, HERE TOO. There is no UNIQUE constraint over
-- (user, institution), (user, rail), or (user, institution, rail), and none
-- may be added: two connections to one institution on one rail is the
-- ordinary case, not a duplicate. The only UNIQUE below is (id, rail), which
-- restricts nothing — id is already the primary key — and exists solely to be
-- the target of 0097's composite foreign key, which is what lets a source
-- link reason about its connection's rail without trusting a copied value.
--
-- CONCURRENCY AND IMMUTABILITY. version is the optimistic-concurrency token;
-- the guard trigger below requires every UPDATE to increment it by exactly
-- one (the pattern of 0053, 0077 and 0088) and freezes identity AND rail. The
-- rail is frozen because a connection's rail is what the connection IS: a
-- MANUAL connection relabelled USER_FILE_UPLOAD would retroactively claim
-- that facts a person typed arrived in a file.
--
-- DELETE IS GRANTED, deliberately and for the same reason as 0088 and 0090:
-- the declared erasure strategy is CASCADE_DELETE, a subject may remove a
-- connection they no longer use, and deleting one takes its source links with
-- it through 0097's ON DELETE CASCADE. The RLS policy applies to DELETE, so
-- the grant reaches only the principal's own rows.
--
-- RLS decision — SUBJECT RECORDS: ENABLE and FORCE, one policy keyed on BOTH
-- app.tenant_id AND app.user_id, with matching USING and WITH CHECK arms. The
-- GUCs are transaction-local, bound by the platform's withPrincipalContext
-- from the caller's own session and membership and never from client input
-- (tenancy.md §2); NULLIF makes an unset GUC a NULL predicate, so no
-- principal context means no rows — fail closed. The user arm is load-bearing:
-- two members of one household tenant must not see each other's connections,
-- and a connection reveals which institutions a person deals with. No
-- allow-list entry: no staff surface returns one customer's connections.
--
-- Data lifecycle (ADR-0026; canonical in
-- modules/financial-connections/MODULE.md):
--   public.financial_connections
--     Subject relationship: SUBJECT_OWNED — the subject's own data routes.
--     Purpose: how Karar receives financial data for this subject — the rail,
--       its availability, and the institution it relates to. Never an account,
--       and never a credential.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: UNRESOLVED — the financial-data retention decision is a
--       legal one and has not been taken, so no period is written here.
--       Non-local durable creation fails closed until a PolicyPack decision
--       exists, enforced by FinancialConnectionRetentionDecisionPort in
--       CreateManualConnection and not merely declared; LOCAL and TEST run on
--       a clearly synthetic fixture with no legal effect.
--     Export treatment: included — the subject's export contains their own
--       connections.
--     Erasure strategy: CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP the trigger and function,
-- DROP POLICY, then DROP TABLE public.financial_connections — which through
-- 0097's cascade also destroys every record of which source fed which
-- account, leaving accounts whose history nobody can explain. That is a
-- restore-from-backup decision, not a migration.

CREATE TABLE public.financial_connections (
  id                          uuid        PRIMARY KEY,
  -- Cross-module references (raw UUIDs, no FK across module boundaries —
  -- data-model.md §2): tenant_id -> tenancy.tenants, user_id -> identity
  -- accounts (identity_accounts.id IS the platform UserId).
  tenant_id                   uuid        NOT NULL,
  user_id                     uuid        NOT NULL,

  -- The reviewed catalogue entry this connection relates to, as a RAW
  -- reference: public.institutions (0087) belongs to another module, so this
  -- is a uuid plus a locally-declared reference type, never a foreign key.
  -- Optional: a hand-kept cash ledger names no institution.
  institution_ref             uuid            NULL,
  institution_reference_type  text            NULL
    CONSTRAINT financial_connections_institution_reference_type_check
    CHECK (institution_reference_type IN ('INSTITUTION_CATALOGUE_ENTRY')),
  CONSTRAINT financial_connections_institution_reference_pair
    CHECK ((institution_ref IS NULL) = (institution_reference_type IS NULL)),

  -- THE VOCABULARY. Every rail this model can name. Widened only by a
  -- reviewed design change, never to make a row insertable.
  rail                        text        NOT NULL
    CONSTRAINT financial_connections_rail_check
    CHECK (rail IN (
      'MANUAL',
      'USER_FILE_UPLOAD',
      'OPEN_FINANCE_API',
      'DIRECT_BANK_OR_WALLET_API',
      'LICENSED_AGGREGATOR_API',
      'HOST_TO_HOST_SFTP',
      'ISO_20022_FILE',
      'SWIFT_MT_FILE',
      'OFX_QFX_FILE',
      'QIF_FILE',
      'PDF_STATEMENT',
      'SECURE_EMAIL_STATEMENT',
      'DEVICE_SIGNAL')),

  -- The connection's own state. No value means connected, synced, linked or
  -- authorized, and none may be added (see the header).
  status                      text        NOT NULL
    CONSTRAINT financial_connections_status_check
    CHECK (status IN ('ACTIVE', 'NOT_CONFIGURED', 'UNAVAILABLE', 'RETIRED', 'NOT_IMPLEMENTED')),

  -- Encryption context for this row's HSF field (ADR-0017 provenance). One
  -- algorithm and one key version per ROW, as in 0088.
  hsf_algorithm               text        NOT NULL
    CONSTRAINT financial_connections_hsf_algorithm_check CHECK (hsf_algorithm <> ''),
  hsf_key_version             text        NOT NULL
    CONSTRAINT financial_connections_hsf_key_version_check CHECK (hsf_key_version <> ''),

  -- REQUIRED: several connections to one institution are ordinary, so a
  -- connection the person cannot tell apart in a list is not usable. Exists
  -- only as ciphertext; 360 bytes is the domain's 120-character bound
  -- expressed in the unit an encrypted column can still measure.
  display_label_ciphertext    bytea       NOT NULL
    CONSTRAINT financial_connections_display_label_bound_check
    CHECK (octet_length(display_label_ciphertext) <= 360),
  display_label_nonce         bytea       NOT NULL
    CONSTRAINT financial_connections_display_label_nonce_check
    CHECK (octet_length(display_label_nonce) = 12),
  display_label_auth_tag      bytea       NOT NULL
    CONSTRAINT financial_connections_display_label_auth_tag_check
    CHECK (octet_length(display_label_auth_tag) = 16),

  version                     integer     NOT NULL DEFAULT 1
    CONSTRAINT financial_connections_version_check CHECK (version >= 1),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL,

  -- THE GATE. Only the two implemented rails may be written at all. An
  -- unimplemented rail is unrepresentable, not merely unvalidated.
  CONSTRAINT financial_connections_rail_implemented_check
    CHECK (rail IN ('MANUAL', 'USER_FILE_UPLOAD')),
  -- ACTIVE names the implemented set independently of the gate, so widening
  -- one does not silently widen the other.
  CONSTRAINT financial_connections_active_requires_implemented_rail
    CHECK (status <> 'ACTIVE' OR rail IN ('MANUAL', 'USER_FILE_UPLOAD')),
  -- NOT_IMPLEMENTED describes a rail nobody built; claiming it for a rail
  -- that works would be the same lie in the other direction.
  CONSTRAINT financial_connections_not_implemented_status_matches_rail
    CHECK (status <> 'NOT_IMPLEMENTED' OR rail NOT IN ('MANUAL', 'USER_FILE_UPLOAD')),

  -- Sole purpose: the target of 0097's composite FK, which is what lets a
  -- source link carry its connection's rail as a referential fact rather than
  -- as a copy that can drift. Adds no restriction — id is the primary key.
  CONSTRAINT financial_connections_id_rail_key UNIQUE (id, rail)
);

COMMENT ON TABLE public.financial_connections IS
  'HIGHLY_SENSITIVE_FINANCIAL, SUBJECT_OWNED. HOW Karar receives financial '
  'data for one subject — never an account, and never a credential '
  '(ADR-0028). One connection may feed many accounts and one subject may hold '
  'several connections to one institution; which connection feeds which '
  'account is public.account_source_links (0097). Thirteen rails are named; '
  'only MANUAL and USER_FILE_UPLOAD may be written, refused by '
  'financial_connections_rail_implemented_check at the DATABASE, so an '
  'unimplemented rail cannot be inserted even by direct SQL. The vocabulary '
  'CHECK and the implemented-rail CHECK are separate on purpose: implementing '
  'a rail widens the gate, never the vocabulary. ACTIVE is refused for any '
  'unimplemented rail by a CHECK that names the implemented set '
  'independently, and NOT_IMPLEMENTED is modelled and unreachable because no '
  'row may carry an unimplemented rail at all. NO status value means '
  'connected, synced, linked or authorized and none may be added — ACTIVE on '
  'a MANUAL connection means the person may type entries, and no live link to '
  'any institution exists anywhere in this platform. NO CREDENTIAL COLUMN '
  'EXISTS: no username, password, mPIN, OTP, recovery code, cookie, session '
  'or access token, scraping state or sync cursor, and no free-text or JSON '
  'column one could hide inside — asserted by an exhaustive column-set test, '
  'because a CHECK cannot assert an absence. The display label exists ONLY as '
  'ciphertext + nonce + auth tag with the algorithm and key version per row. '
  'Identity is the id alone: no UNIQUE over user + institution, user + rail, '
  'or user + institution + rail, and none may be added. RLS ENABLEd and '
  'FORCEd on BOTH principal GUCs. Lifecycle: 0096 header + '
  'modules/financial-connections/MODULE.md.';

COMMENT ON COLUMN public.financial_connections.rail IS
  'HOW data arrives. Thirteen rails are named by '
  'financial_connections_rail_check; only MANUAL and USER_FILE_UPLOAD may be '
  'written, by financial_connections_rail_implemented_check. Immutable by '
  'trigger — a MANUAL connection relabelled USER_FILE_UPLOAD would claim that '
  'facts a person typed arrived in a file. Naming a rail is not implementing '
  'one, and no rail here implies that any provider exposes an interface to '
  'Karar: none does, and none is integrated (ADR-0028).';

COMMENT ON COLUMN public.financial_connections.status IS
  'The connection''s own state: ACTIVE, NOT_CONFIGURED, UNAVAILABLE, RETIRED, '
  'or the modelled-and-unreachable NOT_IMPLEMENTED. NO value means connected, '
  'synced, linked or authorized, and none may be added: ACTIVE on a MANUAL or '
  'USER_FILE_UPLOAD connection means the person may type or upload, never '
  'that an institution is talking to this platform. ACTIVE on an '
  'unimplemented rail is refused by CHECK.';

COMMENT ON COLUMN public.financial_connections.institution_ref IS
  'The reviewed catalogue entry (public.institutions, 0087) this connection '
  'relates to, as a RAW uuid — no FK crosses a module boundary '
  '(data-model.md §2) — paired with institution_reference_type. Optional: a '
  'hand-kept cash ledger names no institution. Naming an institution here '
  'asserts nothing about that institution''s capabilities and never that it '
  'is reachable.';

-- The owner listing: every read this module serves is "my connections",
-- inside one tenant, oldest first.
CREATE INDEX financial_connections_owner_idx
  ON public.financial_connections (tenant_id, user_id, created_at);

-- Supports "which connections relate to this catalogue entry?" without a
-- sequential scan of subject data.
CREATE INDEX financial_connections_institution_idx
  ON public.financial_connections (institution_ref);

ALTER TABLE public.financial_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_connections FORCE ROW LEVEL SECURITY;

-- Subject records: visible and writable only inside a transaction carrying
-- BOTH principal GUCs. Unset GUCs fail closed via NULLIF. The user arm is
-- load-bearing — two members of one tenant are two different subjects here.
CREATE POLICY financial_connections_subject ON public.financial_connections
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Guard: identity and RAIL immutable, version must increment by exactly one
-- per UPDATE, updated_at maintained here so no caller can forge it.
--
-- Custom SQLSTATEs so a caller can tell the arms apart structurally rather
-- than by reading message text. 'KAR' is outside every class the standard and
-- PostgreSQL assign (0090 records the same reasoning):
--   KAR10  identity or rail rewritten.
--   KAR11  the optimistic-concurrency token did not advance by exactly one.
CREATE FUNCTION public.financial_connections_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id  IS DISTINCT FROM OLD.tenant_id
    OR NEW.user_id    IS DISTINCT FROM OLD.user_id
    OR NEW.rail       IS DISTINCT FROM OLD.rail
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'financial_connection % identity and rail are immutable (id, tenant_id, user_id, rail, created_at): a different owner is a different connection, and a different rail would retroactively change how facts already recorded are said to have arrived (ADR-0028)',
      OLD.id USING ERRCODE = 'KAR10';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'financial_connection % updates must increment version by exactly one (got % after %) — the optimistic-concurrency token is not optional',
      OLD.id, NEW.version, OLD.version USING ERRCODE = 'KAR11';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER financial_connections_guard
  BEFORE UPDATE ON public.financial_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.financial_connections_guard();

-- DELETE is granted deliberately (see the header): CASCADE_DELETE is the
-- declared erasure strategy, and a subject removing a connection they no
-- longer use is a first-class path rather than an administrative one.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_connections TO karar_app;
