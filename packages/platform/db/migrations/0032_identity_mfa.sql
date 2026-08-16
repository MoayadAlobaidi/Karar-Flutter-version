-- 0032_identity_mfa
--
-- Multi-factor foundation (modules/identity/MODULE.md): TOTP enrolments with
-- the shared secret encrypted at rest through the platform EncryptionProvider
-- (key/version provenance recorded per ADR-0017 — `key_version` is the
-- `KeyVersionRef` that produced the ciphertext), and one-time recovery codes
-- stored as SHA-256 hashes of 128-bit random values. The plaintext TOTP
-- secret exists exactly twice: in the enrol response that displays the QR
-- code, and inside the verifier for the duration of one check. It is never
-- logged, never audited, never returned after confirmation.
--
-- RLS: owner-only, NO bootstrap arm. The MFA challenge during login runs
-- after password verification, when the account is known — the repository
-- scopes the transaction to that account before touching these tables.
--
-- Data lifecycle (ADR-0026, six fields; mirrored in modules/identity/MODULE.md
-- and packages/platform/db/DATA_LIFECYCLE.md):
--
--   public.mfa_enrolments
--     Subject relationship: SUBJECT_OWNED.
--     Purpose:              second-factor enrolment — encrypted TOTP secret,
--       key-version provenance, confirmation and disable state.
--     Classification:       SECRET — an authentication secret, encrypted at
--       rest and never rendered after confirmation.
--     Retention:            life of the enrolment; replaced in place on
--       re-enrolment.
--     Export treatment:     excluded — credential material; the export
--       coverage note names this omission.
--     Erasure strategy:     CASCADE_DELETE.
--
--   public.mfa_recovery_codes
--     Subject relationship: SUBJECT_OWNED.
--     Purpose:              one-time recovery — SHA-256 hashes of ten 128-bit
--       codes, individually consumable, attempt-limited.
--     Classification:       SECRET — hashes of live credentials.
--     Retention:            life of the code set; replaced wholesale on
--       regeneration or MFA disable.
--     Export treatment:     excluded — credential material; the export
--       coverage note names this omission.
--     Erasure strategy:     CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — single
-- transaction. Deliberate reversal would be DROP TABLE mfa_recovery_codes,
-- mfa_enrolments — silently downgrading every enrolled account to single
-- factor, which is why it would need a security review first.

CREATE TABLE public.mfa_enrolments (
  account_id        uuid        PRIMARY KEY
    REFERENCES public.identity_accounts (id) ON DELETE CASCADE,
  type              text        NOT NULL DEFAULT 'totp',
  secret_ciphertext bytea       NOT NULL,  -- EncryptionProvider envelope ciphertext
  key_version       text        NOT NULL,  -- KeyVersionRef provenance (ADR-0017)
  created_at        timestamptz NOT NULL DEFAULT now(),
  confirmed_at      timestamptz     NULL,  -- null = enrolled but not yet proven
  disabled_at       timestamptz     NULL,
  CONSTRAINT mfa_enrolments_type_check CHECK (type = 'totp')
);

GRANT SELECT, INSERT, UPDATE ON public.mfa_enrolments TO karar_app;

ALTER TABLE public.mfa_enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_enrolments FORCE ROW LEVEL SECURITY;

CREATE POLICY mfa_enrolments_owner_access ON public.mfa_enrolments
  FOR ALL TO karar_app
  USING (account_id = public.karar_current_user_id())
  WITH CHECK (account_id = public.karar_current_user_id());

CREATE TABLE public.mfa_recovery_codes (
  id         uuid        PRIMARY KEY,
  account_id uuid        NOT NULL
    REFERENCES public.identity_accounts (id) ON DELETE CASCADE,
  code_hash  text        NOT NULL,          -- SHA-256 hex of a 128-bit random code
  used_at    timestamptz     NULL,          -- one-time: set exactly once, atomically
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mfa_recovery_codes_unique UNIQUE (account_id, code_hash)
);

CREATE INDEX mfa_recovery_codes_account_idx
  ON public.mfa_recovery_codes (account_id);

-- DELETE is granted deliberately, against the default convention: MFA disable
-- and code regeneration REPLACE the set, and keeping dead credential hashes
-- forever would be retained secret material with no basis. Usage evidence
-- lives in authentication_security_events, not in these rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mfa_recovery_codes TO karar_app;

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_recovery_codes FORCE ROW LEVEL SECURITY;

CREATE POLICY mfa_recovery_codes_owner_access ON public.mfa_recovery_codes
  FOR ALL TO karar_app
  USING (account_id = public.karar_current_user_id())
  WITH CHECK (account_id = public.karar_current_user_id());
