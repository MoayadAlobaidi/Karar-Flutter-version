-- 0033_identity_security_events
--
-- Authentication security events (modules/identity/MODULE.md): the append-only
-- record of authentication-relevant occurrences — failed and locked logins,
-- refresh-token reuse, password resets, MFA changes, session revocations.
-- Same discipline as audit.audit_events (migration 0010, data-model.md §10):
-- append-only by BOTH revoked grants (karar_app: INSERT and SELECT only) AND
-- an immutability trigger that raises even for the table owner.
--
-- This table is also the LOCKOUT LEDGER. The failed-attempt counter is not a
-- mutable column — it is a COUNT over these append-only rows per
-- (account, ip_digest) window. That construction satisfies legacy AUTHN-11
-- structurally: engaging the lock writes an event and erases nothing, so the
-- counter cannot reset when the lock applies, and history survives the lock
-- window. Attempts while locked record `login_locked`, not `login_failed`,
-- so a lock cannot extend itself.
--
-- account_id is an OPAQUE reference (no foreign key), like audit's actor_ref:
-- security history must survive the erasure of the account it concerns
-- (RETAIN_WITH_BASIS below), after which the reference resolves to nothing.
--
-- Data lifecycle (ADR-0026, six fields; mirrored in modules/identity/MODULE.md
-- and packages/platform/db/DATA_LIFECYCLE.md):
--
--   public.authentication_security_events
--     Subject relationship: SUBJECT_DERIVED — rows describe authentication
--       occurrences; the account reference is derived, the row is not the
--       subject's content.
--     Purpose:              security investigation and lockout derivation —
--       who failed to authenticate, from which (digested) address, when, and
--       which security-relevant transitions occurred.
--     Classification:       CONFIDENTIAL (event names, opaque references,
--       HMAC digests, guarded scalar metadata — never credentials or codes).
--     Retention:            from the PolicyPack per jurisdiction (Phase 3.5);
--       until then the local development placeholder is 13 months, held in
--       policy configuration, never a code constant.
--     Export treatment:     excluded — integrity record about the account,
--       not subject content; the export coverage note names this omission.
--     Erasure strategy:     RETAIN_WITH_BASIS — security obligations survive
--       account closure for the retention period; the account reference is
--       opaque and resolves to nothing once the subject is erased.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — single
-- transaction. Deliberate reversal would be DROP TRIGGER
-- authentication_security_events_immutable ON
-- public.authentication_security_events; DROP FUNCTION
-- public.authentication_security_events_immutable(); DROP TABLE
-- public.authentication_security_events; — destroying recorded security
-- history, needing the same review as destroying any evidence record.

CREATE TABLE public.authentication_security_events (
  id          uuid        PRIMARY KEY,
  account_id  uuid            NULL,          -- opaque reference; null when no account resolved
  event_type  text        NOT NULL,          -- e.g. 'login_failed', 'refresh_reuse_detected'
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ip_digest   text            NULL,          -- HMAC digest, never a raw address
  metadata    jsonb           NULL           -- guarded scalar facts only, never secrets
);

-- Lockout derivation: COUNT per (account, type, window) and per (account,
-- type, ip, window); plus a time-ordered scan for review.
CREATE INDEX authentication_security_events_account_idx
  ON public.authentication_security_events (account_id, event_type, occurred_at DESC);
CREATE INDEX authentication_security_events_occurred_idx
  ON public.authentication_security_events (occurred_at);

-- Append-only mechanism one: grants (INSERT and SELECT only — README.md).
GRANT SELECT, INSERT ON public.authentication_security_events TO karar_app;

-- Append-only mechanism two: the immutability trigger, raising even for the
-- owner, FOR EACH STATEMENT so a zero-row UPDATE raises instead of
-- succeeding vacuously (same construction as audit.audit_events).
CREATE FUNCTION public.authentication_security_events_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'public.authentication_security_events is append-only: % is not permitted, even for the table owner',
    TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER authentication_security_events_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.authentication_security_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.authentication_security_events_immutable();

-- RLS as a third, account-scoping layer: an authenticated transaction sees
-- (and writes about) its own account only; the pre-auth bootstrap arm exists
-- because failed logins are recorded before any principal is established
-- (rls-allow-list.json). FORCE also strips UPDATE/DELETE from the owner at
-- the policy layer — there is deliberately no policy for either command.
ALTER TABLE public.authentication_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authentication_security_events FORCE ROW LEVEL SECURITY;

CREATE POLICY authentication_security_events_select ON public.authentication_security_events
  FOR SELECT TO karar_app
  USING (public.karar_current_user_id() IS NULL
         OR account_id = public.karar_current_user_id());

CREATE POLICY authentication_security_events_insert ON public.authentication_security_events
  FOR INSERT TO karar_app
  WITH CHECK (public.karar_current_user_id() IS NULL
              OR account_id IS NULL
              OR account_id = public.karar_current_user_id());
