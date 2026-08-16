-- 0031_identity_sessions
--
-- Server-side sessions and rotating refresh-token families
-- (modules/identity/MODULE.md; access-control.md §7). Every session is a row,
-- revocable server-side (legacy AUTHN-07), and never held in process memory
-- (legacy AUTHN-16). Refresh tokens are one-time: rotation marks the
-- presented token used and mints a successor linked through `superseded_by`,
-- so the full lineage of a family is reconstructible; presenting a used or
-- superseded token is theft evidence and revokes the family AND its session.
--
-- The one-time guarantee is atomic in SQL, not advisory in code: rotation is
-- `UPDATE refresh_tokens SET used_at = now() WHERE id = $1 AND used_at IS
-- NULL RETURNING id` — of two concurrent presentations of the same token,
-- exactly one sees a row (proven by the concurrency test in
-- modules/identity/__tests__).
--
-- RLS: same account-scoped stance as 0030. Sessions have NO bootstrap arm —
-- by the time a session row is touched the account is always established
-- (login sets the GUC after credential verification; the request guard sets
-- it from the verified token; refresh sets it after reading the family).
-- Token presentation itself (refresh) begins with nothing but an opaque
-- token, so refresh_tokens and refresh_token_families carry a bootstrap
-- SELECT arm, recorded in packages/platform/db/rls-allow-list.json.
--
-- Data lifecycle (ADR-0026, six fields; mirrored in modules/identity/MODULE.md
-- and packages/platform/db/DATA_LIFECYCLE.md):
--
--   public.sessions
--     Subject relationship: SUBJECT_OWNED — the subject's own sign-ins.
--     Purpose:              server-side session state — creation, last-seen,
--       absolute/idle expiry, revocation, minimized client metadata (HMAC IP
--       digest and a coarse user-agent summary, never raw values).
--     Classification:       CONFIDENTIAL.
--     Retention:            absolute session lifetime plus a short forensic
--       window over revoked/expired rows; purged by the later-phase retention
--       job on the interim policy-configuration placeholder of 90 days after
--       expiry (PolicyPack owns the number from Phase 3.5).
--     Export treatment:     excluded — security-operational metadata (digests
--       are intentionally meaningless outside the platform); the export
--       coverage note names this omission.
--     Erasure strategy:     CASCADE_DELETE.
--
--   public.refresh_token_families
--     Subject relationship: SUBJECT_OWNED.
--     Purpose:              rotation lineage — one family per session grant;
--       the unit revoked when reuse is detected.
--     Classification:       CONFIDENTIAL (identifiers and revocation state).
--     Retention:            with the owning session; same purge discipline.
--     Export treatment:     excluded — token plumbing; export coverage note
--       names this omission.
--     Erasure strategy:     CASCADE_DELETE.
--
--   public.refresh_tokens
--     Subject relationship: SUBJECT_OWNED.
--     Purpose:              refresh credential at rest — SHA-256 hash of a
--       32-byte random token, expiry, one-time use, successor linkage.
--     Classification:       SECRET — hashes of live credentials; never in
--       logs, events, or exports (docs/security/secrets.md §1).
--     Retention:            with the owning family; same purge discipline.
--     Export treatment:     excluded — credential material; export coverage
--       note names this omission.
--     Erasure strategy:     CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — single
-- transaction. Deliberate reversal would be DROP TABLE refresh_tokens,
-- refresh_token_families, sessions (in that order) — signing every principal
-- out everywhere, which is the drastic-but-safe direction.

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------

CREATE TABLE public.sessions (
  id                  uuid        PRIMARY KEY,
  account_id          uuid        NOT NULL
    REFERENCES public.identity_accounts (id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  absolute_expires_at timestamptz NOT NULL,
  idle_expires_at     timestamptz     NULL,  -- null = idle expiry disabled (default)
  revoked_at          timestamptz     NULL,
  revoked_reason      text            NULL,
  ip_digest           text            NULL,  -- HMAC digest, never a raw address
  user_agent_summary  text            NULL,  -- family/os only, never the raw UA
  tenant_binding      uuid            NULL   -- optional tenant scope; tenancy owns semantics
);

CREATE INDEX sessions_account_idx
  ON public.sessions (account_id, created_at DESC);
-- The hot path: "is this session alive" and "list my active sessions".
CREATE INDEX sessions_account_active_idx
  ON public.sessions (account_id)
  WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.sessions TO karar_app;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY;

-- Owner-only, no bootstrap arm: every session operation happens inside an
-- account-scoped transaction. "List own sessions" is exactly this policy.
CREATE POLICY sessions_owner_access ON public.sessions
  FOR ALL TO karar_app
  USING (account_id = public.karar_current_user_id())
  WITH CHECK (account_id = public.karar_current_user_id());

-- ---------------------------------------------------------------------------
-- refresh_token_families
-- ---------------------------------------------------------------------------

CREATE TABLE public.refresh_token_families (
  id             uuid        PRIMARY KEY,
  session_id     uuid        NOT NULL
    REFERENCES public.sessions (id) ON DELETE CASCADE,
  account_id     uuid        NOT NULL
    REFERENCES public.identity_accounts (id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz     NULL,
  revoked_reason text            NULL
);

CREATE INDEX refresh_token_families_session_idx
  ON public.refresh_token_families (session_id);
CREATE INDEX refresh_token_families_account_idx
  ON public.refresh_token_families (account_id);

GRANT SELECT, INSERT, UPDATE ON public.refresh_token_families TO karar_app;

ALTER TABLE public.refresh_token_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refresh_token_families FORCE ROW LEVEL SECURITY;

-- Bootstrap SELECT arm (rls-allow-list.json): refresh presents an opaque
-- token before any principal exists; the family row is what names the
-- account the transaction then scopes itself to.
CREATE POLICY refresh_token_families_select ON public.refresh_token_families
  FOR SELECT TO karar_app
  USING (public.karar_current_user_id() IS NULL
         OR account_id = public.karar_current_user_id());

CREATE POLICY refresh_token_families_insert ON public.refresh_token_families
  FOR INSERT TO karar_app
  WITH CHECK (account_id = public.karar_current_user_id());

CREATE POLICY refresh_token_families_update ON public.refresh_token_families
  FOR UPDATE TO karar_app
  USING (account_id = public.karar_current_user_id())
  WITH CHECK (account_id = public.karar_current_user_id());

-- ---------------------------------------------------------------------------
-- refresh_tokens
-- ---------------------------------------------------------------------------

CREATE TABLE public.refresh_tokens (
  id            uuid        PRIMARY KEY,
  family_id     uuid        NOT NULL
    REFERENCES public.refresh_token_families (id) ON DELETE CASCADE,
  token_hash    text        NOT NULL,      -- SHA-256 hex of the 32-byte token
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz     NULL,      -- one-time: set exactly once, atomically
  superseded_by uuid            NULL
    REFERENCES public.refresh_tokens (id), -- successor minted by rotation (lineage)
  CONSTRAINT refresh_tokens_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX refresh_tokens_family_idx
  ON public.refresh_tokens (family_id);

GRANT SELECT, INSERT, UPDATE ON public.refresh_tokens TO karar_app;

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refresh_tokens FORCE ROW LEVEL SECURITY;

-- Bootstrap SELECT arm for token presentation (rls-allow-list.json); the
-- owner arm scopes through the family, and the family's own policy applies
-- inside the subquery as well.
CREATE POLICY refresh_tokens_select ON public.refresh_tokens
  FOR SELECT TO karar_app
  USING (public.karar_current_user_id() IS NULL
         OR EXISTS (SELECT 1
                      FROM public.refresh_token_families f
                     WHERE f.id = family_id
                       AND f.account_id = public.karar_current_user_id()));

CREATE POLICY refresh_tokens_insert ON public.refresh_tokens
  FOR INSERT TO karar_app
  WITH CHECK (EXISTS (SELECT 1
                        FROM public.refresh_token_families f
                       WHERE f.id = family_id
                         AND f.account_id = public.karar_current_user_id()));

CREATE POLICY refresh_tokens_update ON public.refresh_tokens
  FOR UPDATE TO karar_app
  USING (EXISTS (SELECT 1
                   FROM public.refresh_token_families f
                  WHERE f.id = family_id
                    AND f.account_id = public.karar_current_user_id()))
  WITH CHECK (EXISTS (SELECT 1
                        FROM public.refresh_token_families f
                       WHERE f.id = family_id
                         AND f.account_id = public.karar_current_user_id()));
