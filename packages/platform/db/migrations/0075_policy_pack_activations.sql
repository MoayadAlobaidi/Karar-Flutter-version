-- 0075_policy_pack_activations
--
-- The pack activation LEDGER (docs/architecture/jurisdiction-policy.md §2):
-- which PolicyPack version is OPERATIVE for a jurisdiction in an
-- environment, as append-only events. METADATA ONLY, deliberately — a row
-- names a version; the pack CONTENT is code (reviewed, versioned, deployed)
-- and never enters the database, so no database write can alter what a pack
-- says, only which reviewed version is in effect.
--
-- Each row is one event: ACTIVATED or RETIRED, with the pack's lifecycle at
-- that moment, the environment, the instant, the actor, and the reason. The
-- active version for (jurisdiction, environment) is DERIVED: the latest
-- event, active only if it is an ACTIVATED event. History is the point —
-- every past resolution must remain explainable by the ledger, so the table
-- is append-only by BOTH mechanisms (data-model.md §10): karar_app holds
-- SELECT+INSERT only, and the immutability trigger raises on UPDATE/DELETE/
-- TRUNCATE even for the table owner, FOR EACH STATEMENT so a zero-row
-- UPDATE raises too.
--
-- The activation USE CASE (modules/jurisdiction) enforces the lifecycle
-- predicate before any row is written: DRAFT and unapproved packs cannot
-- activate outside local environments (canActivate, jurisdiction-policy
-- package), authorization runs through the PolicyService port
-- (jurisdiction.pack.activate), and every activation and retirement is
-- audited. The ledger records what happened; the predicate decides what may.
--
-- RLS decision — ALLOW-LISTED (rls-allow-list.json): platform-global
-- configuration about jurisdictions and deployments; no tenant or subject
-- column exists, and policy resolution for ANY principal must read the
-- active version. Compensating controls as above: append-only grants,
-- owner-proof trigger, use-case-gated writes.
--
-- Data lifecycle (ADR-0026; canonical in modules/jurisdiction/MODULE.md,
-- mirrored in DATA_LIFECYCLE.md):
--   public.policy_pack_activations
--     Subject relationship: NON_PERSONAL — version strings, environment
--       labels, an actor reference recorded in an official capacity.
--     Purpose: append-only record of which pack version was operative per
--       (jurisdiction, environment), from when, decided by whom, and why.
--     Classification: INTERNAL.
--     Retention: RETAIN_WITH_BASIS — activation history explains every past
--       policy resolution; PolicyPack owns any bound (Phase 3.5).
--     Export treatment: n/a — no subject owns an activation event.
--     Erasure strategy: RETAIN_WITH_BASIS.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TRIGGER/FUNCTION pair and
-- DROP TABLE public.policy_pack_activations — destroying the record of
-- which policy governed which period, which is why it would need the same
-- review as destroying any accountability ledger.

CREATE TABLE public.policy_pack_activations (
  id                         uuid        PRIMARY KEY,
  jurisdiction_code          text        NOT NULL REFERENCES public.jurisdictions (code),
  -- The version STRING of a code-resident pack. Never the pack content.
  pack_version               text        NOT NULL CHECK (pack_version <> ''),
  pack_lifecycle_at_activation text      NOT NULL
    CHECK (pack_lifecycle_at_activation IN ('DRAFT', 'PENDING_LEGAL_REVIEW', 'APPROVED', 'RETIRED')),
  environment                text        NOT NULL
    CHECK (environment IN ('local', 'dev', 'staging', 'production')),
  action                     text        NOT NULL CHECK (action IN ('ACTIVATED', 'RETIRED')),
  occurred_at                timestamptz NOT NULL,
  actor                      text        NOT NULL CHECK (actor <> ''),
  reason                     text        NOT NULL CHECK (reason <> ''),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  -- One event per (jurisdiction, environment, instant): the ledger orders
  -- totally, so "the latest event" is well-defined.
  CONSTRAINT policy_pack_activations_instant_key
    UNIQUE (jurisdiction_code, environment, occurred_at)
);

COMMENT ON TABLE public.policy_pack_activations IS
  'Append-only pack activation ledger (jurisdiction-policy.md §2): which '
  'code-resident pack VERSION is operative per (jurisdiction, environment). '
  'Metadata only — pack content is code and never stored. Active = latest '
  'event is ACTIVATED. Append-only by grants AND trigger, even for the owner.';

CREATE INDEX policy_pack_activations_lookup_idx
  ON public.policy_pack_activations (jurisdiction_code, environment, occurred_at);

-- Append-only, both mechanisms (data-model.md §10): grants below are
-- SELECT+INSERT only, and the trigger raises even for the table owner.
CREATE FUNCTION public.policy_pack_activations_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'policy_pack_activations is an append-only ledger: % is not permitted, even for the table owner',
    TG_OP USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER policy_pack_activations_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.policy_pack_activations
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.policy_pack_activations_immutable();

GRANT SELECT, INSERT ON public.policy_pack_activations TO karar_app;
