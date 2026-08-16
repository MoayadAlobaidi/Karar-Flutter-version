-- 0034_identity_grants_policies_cleanup
--
-- Closes the identity range (0030-0033) with belt-and-braces hygiene: no
-- identity table is reachable through PUBLIC, DELETE stays revoked wherever
-- the convention demands it, and every table carries a COMMENT naming its
-- classification and the GUC contract — so a psql session, a backup listing,
-- or a future reviewer sees the handling rule next to the object itself.
--
-- Nothing here changes behaviour on a correctly-bootstrapped database; each
-- statement makes an implicit guarantee explicit. The REVOKEs are effective
-- documentation: if a future bootstrap script or provider template ever
-- introduced a PUBLIC or default grant, this migration's state is what
-- `db:verify` drift-checking would defend.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — single
-- transaction. Deliberate reversal is meaningless here: these are revokes of
-- privileges nothing should hold and comments on existing objects; there is
-- no state to restore.

-- No identity table is reachable through PUBLIC — DML flows through
-- karar_app's per-table grants alone (README.md grant convention).
REVOKE ALL ON public.identity_accounts               FROM PUBLIC;
REVOKE ALL ON public.password_credentials            FROM PUBLIC;
REVOKE ALL ON public.email_verifications             FROM PUBLIC;
REVOKE ALL ON public.password_reset_requests         FROM PUBLIC;
REVOKE ALL ON public.sessions                        FROM PUBLIC;
REVOKE ALL ON public.refresh_token_families          FROM PUBLIC;
REVOKE ALL ON public.refresh_tokens                  FROM PUBLIC;
REVOKE ALL ON public.mfa_enrolments                  FROM PUBLIC;
REVOKE ALL ON public.mfa_recovery_codes              FROM PUBLIC;
REVOKE ALL ON public.authentication_security_events  FROM PUBLIC;

-- karar_app must never DELETE identity history or credentials (revocation
-- and replacement are UPDATEs; the single deliberate exception is
-- mfa_recovery_codes, justified in 0032). Explicit REVOKEs pin the state.
REVOKE DELETE ON public.identity_accounts              FROM karar_app;
REVOKE DELETE ON public.password_credentials           FROM karar_app;
REVOKE DELETE ON public.email_verifications            FROM karar_app;
REVOKE DELETE ON public.password_reset_requests        FROM karar_app;
REVOKE DELETE ON public.sessions                       FROM karar_app;
REVOKE DELETE ON public.refresh_token_families         FROM karar_app;
REVOKE DELETE ON public.refresh_tokens                 FROM karar_app;
REVOKE DELETE ON public.mfa_enrolments                 FROM karar_app;
REVOKE UPDATE, DELETE ON public.authentication_security_events FROM karar_app;

-- Classification and contract, visible at the object (data lifecycle headers
-- live in migrations 0030-0033 and packages/platform/db/DATA_LIFECYCLE.md).
COMMENT ON TABLE public.identity_accounts IS
  'CONFIDENTIAL. id IS the platform UserId and the value of the app.user_id RLS GUC. Lifecycle: 0030 header + DATA_LIFECYCLE.md.';
COMMENT ON TABLE public.password_credentials IS
  'SECRET. argon2id hashes with parameter versioning; never logged, never exported. Lifecycle: 0030 header + DATA_LIFECYCLE.md.';
COMMENT ON TABLE public.email_verifications IS
  'CONFIDENTIAL. HMAC-hashed one-time e-mail verification codes, attempt-capped. Lifecycle: 0030 header + DATA_LIFECYCLE.md.';
COMMENT ON TABLE public.password_reset_requests IS
  'CONFIDENTIAL. HMAC-hashed one-time reset tokens, attempt-capped, requester IP digest only. Lifecycle: 0030 header + DATA_LIFECYCLE.md.';
COMMENT ON TABLE public.sessions IS
  'CONFIDENTIAL. Server-side sessions, revocable, owner-scoped by RLS via app.user_id; metadata minimized to digests/summaries. Lifecycle: 0031 header + DATA_LIFECYCLE.md.';
COMMENT ON TABLE public.refresh_token_families IS
  'CONFIDENTIAL. Rotation lineage; the revocation unit for refresh-token reuse. Lifecycle: 0031 header + DATA_LIFECYCLE.md.';
COMMENT ON TABLE public.refresh_tokens IS
  'SECRET. SHA-256 hashes of one-time refresh tokens; rotation is atomic on used_at. Lifecycle: 0031 header + DATA_LIFECYCLE.md.';
COMMENT ON TABLE public.mfa_enrolments IS
  'SECRET. TOTP secret ciphertext with key-version provenance (ADR-0017); plaintext never persists. Lifecycle: 0032 header + DATA_LIFECYCLE.md.';
COMMENT ON TABLE public.mfa_recovery_codes IS
  'SECRET. SHA-256 hashes of one-time 128-bit recovery codes. Lifecycle: 0032 header + DATA_LIFECYCLE.md.';
COMMENT ON TABLE public.authentication_security_events IS
  'CONFIDENTIAL. Append-only authentication security record and lockout ledger; grants + trigger + RLS enforce immutability. Lifecycle: 0033 header + DATA_LIFECYCLE.md.';
