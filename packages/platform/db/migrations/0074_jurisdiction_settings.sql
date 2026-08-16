-- 0074_jurisdiction_settings
--
-- RESTRICT-ONLY runtime settings per jurisdiction (docs/architecture/
-- jurisdiction-policy.md §2): the audited database half of the typed/
-- configured split. The single most important invariant of that split is
-- structural in this table's SHAPE: every column can only NARROW what the
-- code PolicyPack permits — a disable list and a suspension flag. There is
-- no column that could name an enablement, so no row, however written, can
-- expand a pack: an operator can turn a capability OFF now; turning one ON
-- where the pack has not cleared it requires reviewed, deployed code. The
-- resolver enforces the same rule again (settings merge is subtractive) and
-- the restrict-only property tests prove it.
--
-- An ABSENT row restricts nothing — absence is the common case and never a
-- default decision.
--
-- RLS decision — ALLOW-LISTED (rls-allow-list.json): platform-global
-- operational configuration keyed by jurisdiction; no tenant or subject
-- column exists, and policy resolution for ANY principal in a jurisdiction
-- must read the same row. Compensating controls: karar_app is SELECT-ONLY
-- this phase — no operator surface exists yet (Phase 8 control plane), so
-- writes are migration-only until then; version is CHECK-bound positive so
-- the future write path has its optimistic-concurrency column from day one.
--
-- Data lifecycle (ADR-0026; canonical in modules/jurisdiction/MODULE.md,
-- mirrored in DATA_LIFECYCLE.md):
--   public.jurisdiction_settings
--     Subject relationship: NON_PERSONAL — jurisdiction codes, capability id
--       strings, flags, an operator reference recorded in an official
--       capacity; no subject linkage exists.
--     Purpose: restrict-only operational narrowing of the code PolicyPack
--       (disable a capability now, suspend AI processing now).
--     Classification: INTERNAL.
--     Retention: current operational state lives with the platform;
--       PolicyPack owns any bound (Phase 3.5).
--     Export treatment: n/a — no subject owns an operational settings row.
--     Erasure strategy: NON_PERSONAL_BY_DESIGN.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE
-- public.jurisdiction_settings — removing only restrictions, never grants,
-- which is the restrict-only design working as intended.

CREATE TABLE public.jurisdiction_settings (
  jurisdiction_code       text        PRIMARY KEY REFERENCES public.jurisdictions (code),
  -- Capability ids to REMOVE from the pack's cleared ceiling. Ids the pack
  -- never cleared restrict nothing (and can enable nothing).
  disabled_capability_ids text[]      NOT NULL DEFAULT '{}',
  ai_processing_suspended boolean     NOT NULL DEFAULT false,
  -- Optimistic-concurrency and provenance counter for the Phase 8 write path.
  version                 integer     NOT NULL CHECK (version >= 1),
  reason                  text        NOT NULL CHECK (reason <> ''),
  updated_by              text        NOT NULL CHECK (updated_by <> ''),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL
);

COMMENT ON TABLE public.jurisdiction_settings IS
  'Restrict-only runtime settings per jurisdiction (jurisdiction-policy.md '
  '§2): every column narrows the code PolicyPack, none can expand it — the '
  'shape is the control. Absent row = no restriction. karar_app SELECT-only '
  'until the Phase 8 operator surface.';

-- Read-only for the application this phase; the operator write path arrives
-- with the control plane (Phase 8) behind its own authorization.
GRANT SELECT ON public.jurisdiction_settings TO karar_app;
