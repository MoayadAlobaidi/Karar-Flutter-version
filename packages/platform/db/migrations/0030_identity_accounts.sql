-- 0030_identity_accounts
--
-- Identity foundation (modules/identity/MODULE.md; docs/security/access-control.md
-- §1/§7): accounts, password credentials, e-mail verification codes, and
-- password-reset requests. `identity_accounts.id` IS the platform `UserId` —
-- the same UUID the shared kernel brands, the same value every other module
-- stores as an owner reference, and the same value the `app.user_id`
-- transaction GUC carries. That linkage is a contract with the users and
-- tenancy workstreams: there is no second "user id" anywhere.
--
-- RLS stance for identity tables (this file and 0031-0033): identity data is
-- keyed by ACCOUNT, not tenant — tenant RLS belongs to the tenancy
-- workstream. Every identity table is ENABLEd and FORCEd, and policies are
-- written against `public.karar_current_user_id()` (the `app.user_id` GUC set
-- per transaction by repositories, never from client input). Authentication
-- flows begin BEFORE a principal exists — you cannot know who is logging in
-- without reading the row that identifies them — so the tables of this file
-- carry an explicit "bootstrap arm": the policy admits a transaction with NO
-- user context. The teeth are real even so: any transaction that HAS a user
-- context is confined to its own rows. Every bootstrap arm is recorded in
-- packages/platform/db/rls-allow-list.json with reason and review phase.
--
-- Data lifecycle (ADR-0026, six fields; mirrored in modules/identity/MODULE.md
-- and packages/platform/db/DATA_LIFECYCLE.md):
--
--   public.identity_accounts
--     Subject relationship: SUBJECT_OWNED — the row IS the subject's account.
--     Purpose:              authentication identity — who a principal is;
--       e-mail, verification state, account status, MFA requirement.
--     Classification:       CONFIDENTIAL (e-mail address is personal data).
--     Retention:            life of the account; from the PolicyPack per
--       jurisdiction when packs arrive (Phase 3.5) for post-closure grace.
--     Export treatment:     included — the subject's own account record.
--     Erasure strategy:     CASCADE_DELETE — deleting the account row cascades
--       to every credential, session, and code below.
--
--   public.password_credentials
--     Subject relationship: SUBJECT_OWNED.
--     Purpose:              password authentication — argon2id hash and the
--       parameter version that produced it (upgrade-on-login).
--     Classification:       SECRET — credential material; never in logs,
--       events, exports, or error messages (docs/security/secrets.md §1).
--     Retention:            life of the credential; replaced in place.
--     Export treatment:     excluded — credential material is not subject
--       content; the export coverage note names this omission.
--     Erasure strategy:     CASCADE_DELETE.
--
--   public.email_verifications
--     Subject relationship: SUBJECT_DERIVED — short-lived proof artefacts
--       about the account's e-mail, not subject content.
--     Purpose:              e-mail ownership proof — HMAC-hashed one-time
--       codes, attempt-capped, 30-minute expiry.
--     Classification:       CONFIDENTIAL (hashed one-time codes; the raw code
--       never persists anywhere).
--     Retention:            short operational window — rows are dead once
--       consumed or expired; purged by the later-phase retention job on the
--       interim policy-configuration placeholder of 30 days (PolicyPack owns
--       the number from Phase 3.5).
--     Export treatment:     excluded — verification plumbing, not subject
--       content; export coverage note names this omission.
--     Erasure strategy:     CASCADE_DELETE.
--
--   public.password_reset_requests
--     Subject relationship: SUBJECT_DERIVED.
--     Purpose:              password recovery — HMAC-hashed one-time reset
--       tokens, attempt-capped, 30-minute expiry, requester IP digest for
--       abuse investigation.
--     Classification:       CONFIDENTIAL (hashed tokens and an HMAC IP
--       digest; neither reverses to the raw value).
--     Retention:            same short operational window and placeholder
--       discipline as email_verifications.
--     Export treatment:     excluded — recovery plumbing; export coverage
--       note names this omission.
--     Erasure strategy:     CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — single
-- transaction. Deliberate reversal would be DROP TABLE
-- password_reset_requests, email_verifications, password_credentials,
-- identity_accounts (in that order) and DROP FUNCTION
-- public.karar_current_user_id() — destroying every account and credential,
-- which is why it would need the same review as destroying the user base.

-- The single expression policies bind to: the account id of the current
-- transaction's principal, or NULL when no principal has been established
-- (the authentication bootstrap window). Repositories set the GUC with
-- `SET LOCAL` / set_config(..., true) so it cannot leak across pooled
-- connections. STABLE, and empty-string-safe: an unset GUC reads as ''.
CREATE FUNCTION public.karar_current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

COMMENT ON FUNCTION public.karar_current_user_id() IS
  'app.user_id transaction GUC as uuid, NULL when unset — the identity RLS anchor. The value is identity_accounts.id, which IS the platform UserId.';

-- ---------------------------------------------------------------------------
-- identity_accounts
-- ---------------------------------------------------------------------------

CREATE TABLE public.identity_accounts (
  id                uuid        PRIMARY KEY,               -- the platform UserId
  email             text        NOT NULL,
  email_verified_at timestamptz     NULL,
  status            text        NOT NULL DEFAULT 'active',
  disabled_reason   text            NULL,
  -- Admin policy hook (access-control.md §7: admin sessions require MFA);
  -- representable now, enforced by the RBAC workstream's policy checks.
  mfa_required      boolean     NOT NULL DEFAULT false,
  -- Bumped on password change/reset, global revocation, and disable; access
  -- tokens carry it as `tv` and the session guard rejects a stale value.
  token_version     integer     NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_accounts_status_check
    CHECK (status IN ('active', 'disabled')),
  -- The application normalizes (trim + lowercase) before writing; the check
  -- makes a bypassed normalization a hard error instead of a duplicate row.
  CONSTRAINT identity_accounts_email_normalized_check
    CHECK (email = btrim(lower(email))),
  CONSTRAINT identity_accounts_token_version_check
    CHECK (token_version >= 1)
);

-- Case-insensitive uniqueness without citext: one account per address.
CREATE UNIQUE INDEX identity_accounts_email_unique
  ON public.identity_accounts (lower(email));

GRANT SELECT, INSERT, UPDATE ON public.identity_accounts TO karar_app;

ALTER TABLE public.identity_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_accounts FORCE ROW LEVEL SECURITY;

-- Owner arm: an authenticated transaction reads its own account and nothing
-- else. Kept as its own policy so the bootstrap arm below can be narrowed in
-- a later phase without touching the user-context semantics.
CREATE POLICY identity_accounts_owner_select ON public.identity_accounts
  FOR SELECT TO karar_app
  USING (id = public.karar_current_user_id());

-- Bootstrap arm (rls-allow-list.json): login, verification, and reset must
-- find the account by e-mail before any principal exists.
CREATE POLICY identity_accounts_bootstrap_select ON public.identity_accounts
  FOR SELECT TO karar_app
  USING (public.karar_current_user_id() IS NULL);

-- Registration is pre-auth by nature; an authenticated context never inserts
-- accounts.
CREATE POLICY identity_accounts_bootstrap_insert ON public.identity_accounts
  FOR INSERT TO karar_app
  WITH CHECK (public.karar_current_user_id() IS NULL);

-- Updates: e-mail verification and password reset run pre-auth (bootstrap
-- arm); token-version bumps, disable/enable, and MFA-requirement changes run
-- inside an account-scoped transaction (owner arm — privileged use cases set
-- the GUC to the TARGET account after their own authorization check).
CREATE POLICY identity_accounts_update ON public.identity_accounts
  FOR UPDATE TO karar_app
  USING (public.karar_current_user_id() IS NULL
         OR id = public.karar_current_user_id())
  WITH CHECK (public.karar_current_user_id() IS NULL
              OR id = public.karar_current_user_id());

-- ---------------------------------------------------------------------------
-- password_credentials
-- ---------------------------------------------------------------------------

CREATE TABLE public.password_credentials (
  account_id     uuid        PRIMARY KEY
    REFERENCES public.identity_accounts (id) ON DELETE CASCADE,
  password_hash  text        NOT NULL,      -- argon2id PHC string; SECRET-handled
  params_version integer     NOT NULL,      -- which argon2 parameter set produced it
  updated_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.password_credentials TO karar_app;

ALTER TABLE public.password_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_credentials FORCE ROW LEVEL SECURITY;

-- Login verifies the hash before a principal exists (bootstrap arm,
-- rls-allow-list.json); change-password runs owner-scoped.
CREATE POLICY password_credentials_access ON public.password_credentials
  FOR ALL TO karar_app
  USING (public.karar_current_user_id() IS NULL
         OR account_id = public.karar_current_user_id())
  WITH CHECK (public.karar_current_user_id() IS NULL
              OR account_id = public.karar_current_user_id());

-- ---------------------------------------------------------------------------
-- email_verifications
-- ---------------------------------------------------------------------------

CREATE TABLE public.email_verifications (
  id           uuid        PRIMARY KEY,
  account_id   uuid        NOT NULL
    REFERENCES public.identity_accounts (id) ON DELETE CASCADE,
  code_hash    text        NOT NULL,        -- HMAC-SHA256(code, verification pepper)
  expires_at   timestamptz NOT NULL,
  attempts     integer     NOT NULL DEFAULT 0,
  max_attempts integer     NOT NULL DEFAULT 5,
  consumed_at  timestamptz     NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_verifications_attempts_check
    CHECK (attempts >= 0 AND max_attempts > 0)
);

CREATE INDEX email_verifications_account_idx
  ON public.email_verifications (account_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.email_verifications TO karar_app;

ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verifications FORCE ROW LEVEL SECURITY;

-- The whole flow (issue at registration, consume at verify) runs before
-- authentication; no user-context read path exists (rls-allow-list.json).
CREATE POLICY email_verifications_access ON public.email_verifications
  FOR ALL TO karar_app
  USING (public.karar_current_user_id() IS NULL
         OR account_id = public.karar_current_user_id())
  WITH CHECK (public.karar_current_user_id() IS NULL
              OR account_id = public.karar_current_user_id());

-- ---------------------------------------------------------------------------
-- password_reset_requests
-- ---------------------------------------------------------------------------

CREATE TABLE public.password_reset_requests (
  id                  uuid        PRIMARY KEY,
  account_id          uuid        NOT NULL
    REFERENCES public.identity_accounts (id) ON DELETE CASCADE,
  code_hash           text        NOT NULL,  -- HMAC-SHA256(token, verification pepper)
  expires_at          timestamptz NOT NULL,
  attempts            integer     NOT NULL DEFAULT 0,
  max_attempts        integer     NOT NULL DEFAULT 5,
  consumed_at         timestamptz     NULL,
  requested_ip_digest text            NULL,  -- HMAC digest, never a raw address
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_requests_attempts_check
    CHECK (attempts >= 0 AND max_attempts > 0)
);

-- Reset presents the token alone (no e-mail), so the lookup is by hash.
CREATE UNIQUE INDEX password_reset_requests_code_hash_unique
  ON public.password_reset_requests (code_hash);
CREATE INDEX password_reset_requests_account_idx
  ON public.password_reset_requests (account_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.password_reset_requests TO karar_app;

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_requests FORCE ROW LEVEL SECURITY;

-- Same pre-auth reasoning as email_verifications (rls-allow-list.json).
CREATE POLICY password_reset_requests_access ON public.password_reset_requests
  FOR ALL TO karar_app
  USING (public.karar_current_user_id() IS NULL
         OR account_id = public.karar_current_user_id())
  WITH CHECK (public.karar_current_user_id() IS NULL
              OR account_id = public.karar_current_user_id());
