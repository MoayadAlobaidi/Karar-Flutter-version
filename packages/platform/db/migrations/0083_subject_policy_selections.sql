-- 0083_subject_policy_selections
--
-- SubjectPolicySelection — the fourth policy dimension (ADR-0015;
-- jurisdiction-policy.md §7): the COMMON platform mechanism that records
-- WHICH pack-permitted profile option a subject elected for a capability,
-- with versioning, pinning, and provenance. It knows nothing about any
-- capability's option CONTENT — the option set itself (e.g. a future
-- ZakatMethodologyProfile, Phase 9) is declared and owned by the
-- capability's bounded context, and NO content column exists here by
-- design. profile_ref is an opaque reference into the owning capability's
-- context; profile_snapshot_hash is a hash reference to a content snapshot
-- the owning capability may keep — hash only, never content.
--
-- Rows are IMMUTABLE HISTORICAL RECORDS, modelled on consent_grants (0065):
-- a selection's identity is the election act itself (who, when, which
-- option reference, under which jurisdiction/pack/profile versions).
-- Re-election inserts a NEW row and marks the prior ACTIVE row SUPERSEDED;
-- nothing is edited, nothing is deleted. Every row pins jurisdiction_ref,
-- policy_pack_version, and profile_version at creation (provenance —
-- jurisdiction-policy.md §7 rule 2), so every historical resolution stays
-- explainable under the elected conventions that produced it. Restrict-only:
-- the recording use case validates the elected option against the
-- jurisdiction's PolicyPack option set through the SubjectOptionSource port
-- — a selection can only NARROW among pack-permitted options, never expand
-- them, and a capability that declares no subject policy accepts no
-- selection at all.
--
-- Temporal semantics: effective_from/effective_to bound the election window;
-- reads resolve the selection effective AT an instant from the dated columns
-- and never trust a stale status marker (an ACTIVE row whose effective_to
-- has passed is expired on read — fail closed). The stored status is a
-- lifecycle marker with exactly three lawful transitions, by trigger:
-- ACTIVE -> SUPERSEDED (re-election inserted a new row), ACTIVE -> WITHDRAWN
-- (sets withdrawn_at, preserves the row), and ACTIVE -> EXPIRED (a later
-- lifecycle job may materialize what the read path already derives; no
-- Phase 3.5 code path writes it).
--
-- RLS decision: SUBJECT RECORDS — RLS ENABLED and FORCEd, policy keyed on
-- BOTH app.tenant_id AND app.user_id (transaction-local GUCs bound by the
-- platform's withPrincipalContext, never from client input — tenancy.md §2).
-- NULLIF makes an unset GUC a NULL predicate: no principal context, no rows
-- — fail closed. No allow-list entry: the only readers in Phase 3.5 are the
-- subject (self) and the test suites; no staff surface exists, and any
-- future privileged read path must arrive with its own audited,
-- purpose-limited surface (modules/subject-policy/MODULE.md §Permissions).
--
-- Pinning note (architecture test 21): this table IS the SubjectPolicy-
-- Selection machinery the test-21 deferrals on consent_grants and
-- data_protection_role_assignments await; extending LEGAL_CONSEQUENCE_TABLES
-- and resolving those deferrals belongs to the Phase 3.5 security
-- workstream, not this migration.
--
-- Data lifecycle (ADR-0026; canonical in modules/subject-policy/MODULE.md,
-- mirrored in DATA_LIFECYCLE.md):
--   public.subject_policy_selections
--     Subject relationship: SUBJECT_OWNED — the subject's own elections.
--     Purpose: record which pack-permitted profile option the subject
--       elected per capability, with pinned jurisdiction/pack/profile
--       versions, so historical resolutions replay under the conventions
--       that produced them.
--     Classification: CONFIDENTIAL — an elected methodology can reveal
--       religious affiliation or risk posture (jurisdiction-policy.md §7
--       rule 5); purpose-limited, never marketing/analytics/AI input.
--     Retention: from PolicyPack per jurisdiction (Phase 3.5+); interim
--       policy-configuration placeholder: life of the account plus 13
--       months after supersession/withdrawal, never a code constant.
--     Export treatment: included — a subject's export contains their own
--       election history with its pinned versions.
--     Erasure strategy: RETAIN_WITH_BASIS — the election is the provenance
--       that explains computations already performed under it; user_id is
--       an opaque reference that resolves to nothing once the subject's
--       identity is erased.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP POLICY, DROP TRIGGER/
-- FUNCTION pairs, DROP TABLE public.subject_policy_selections — destroying
-- the provenance of every resolution that pinned a selection, which is why
-- it would need the same review as destroying consent evidence.

CREATE TABLE public.subject_policy_selections (
  id                    uuid        PRIMARY KEY,
  -- Cross-module references (raw values, no FK across module boundaries —
  -- data-model.md §2): user_id -> identity accounts (platform UserId),
  -- tenant_id -> tenancy.tenants, capability_id -> the compile-time
  -- capability registry (@karar/capability-registry), profile_ref -> the
  -- owning capability's bounded context. The closed capability-id set lives
  -- in reviewed code, not in a second SQL vocabulary; the recording use
  -- case validates against the production union.
  user_id               uuid        NOT NULL,
  tenant_id             uuid        NOT NULL,
  capability_id         text        NOT NULL CHECK (capability_id <> ''),
  profile_ref           text        NOT NULL CHECK (profile_ref <> ''),
  profile_version       text        NOT NULL CHECK (profile_version <> ''),
  jurisdiction_ref      text        NOT NULL CHECK (jurisdiction_ref <> ''),
  policy_pack_version   text        NOT NULL CHECK (policy_pack_version <> ''),
  effective_from        timestamptz NOT NULL,
  effective_to          timestamptz     NULL,
  status                text        NOT NULL
    CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'EXPIRED', 'WITHDRAWN')),
  -- Provenance of the election act (jurisdiction-policy.md §7 rule 3):
  -- selection_source names the path ('subject-election' is the only Phase
  -- 3.5 writer — no admin-elects-for-customer path exists, by design);
  -- recorded_by is the acting principal (the subject themselves).
  selection_source      text        NOT NULL CHECK (selection_source <> ''),
  recorded_by           uuid        NOT NULL,
  -- Hash reference to the owning capability's content snapshot at election
  -- time — hash only, NEVER content (privacy rule; content is
  -- capability-owned).
  profile_snapshot_hash text            NULL CHECK (profile_snapshot_hash <> ''),
  withdrawn_at          timestamptz     NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'WITHDRAWN') = (withdrawn_at IS NOT NULL)),
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= effective_from),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

COMMENT ON TABLE public.subject_policy_selections IS
  'Subject-elected policy options per capability (jurisdiction-policy.md '
  '§7): immutable election records pinning jurisdiction, PolicyPack version, '
  'and profile version at creation. References only — option CONTENT lives '
  'in the owning capability''s bounded context, never here. Transitions by '
  'trigger: ACTIVE->SUPERSEDED, ACTIVE->WITHDRAWN, ACTIVE->EXPIRED only; '
  're-election is a NEW row. RLS FORCEd on tenant+user principal GUCs. '
  'Single-ACTIVE-per-(user, tenant, capability) is enforced by the recording '
  'use case inside the principal-context transaction, not by a partial index '
  '(kept out of the schema so the Prisma mapping stays exact for the drift '
  'gate).';

CREATE INDEX subject_policy_selections_resolution_idx
  ON public.subject_policy_selections
    (user_id, tenant_id, capability_id, effective_from, created_at);

ALTER TABLE public.subject_policy_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_policy_selections FORCE ROW LEVEL SECURITY;

-- Subject records: visible and writable only inside a transaction that
-- carries BOTH principal GUCs, bound from the caller's own record — never
-- from client input (tenancy.md §2). Unset GUCs fail closed via NULLIF.
CREATE POLICY subject_policy_selections_subject ON public.subject_policy_selections
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Immutable election records: the three lawful transitions and nothing else,
-- raising even for the table owner (data-model.md §10).
CREATE FUNCTION public.subject_policy_selections_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'subject_policy_selections rows are election provenance: DELETE is not permitted, even for the table owner (jurisdiction-policy.md §7)'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id                    IS DISTINCT FROM OLD.id
    OR NEW.user_id               IS DISTINCT FROM OLD.user_id
    OR NEW.tenant_id             IS DISTINCT FROM OLD.tenant_id
    OR NEW.capability_id         IS DISTINCT FROM OLD.capability_id
    OR NEW.profile_ref           IS DISTINCT FROM OLD.profile_ref
    OR NEW.profile_version       IS DISTINCT FROM OLD.profile_version
    OR NEW.jurisdiction_ref      IS DISTINCT FROM OLD.jurisdiction_ref
    OR NEW.policy_pack_version   IS DISTINCT FROM OLD.policy_pack_version
    OR NEW.effective_from        IS DISTINCT FROM OLD.effective_from
    OR NEW.effective_to          IS DISTINCT FROM OLD.effective_to
    OR NEW.selection_source      IS DISTINCT FROM OLD.selection_source
    OR NEW.recorded_by           IS DISTINCT FROM OLD.recorded_by
    OR NEW.profile_snapshot_hash IS DISTINCT FROM OLD.profile_snapshot_hash
    OR NEW.created_at            IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'subject_policy_selection % content is immutable; re-election is a new row (jurisdiction-policy.md §7)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.status = 'ACTIVE' AND NEW.status = 'WITHDRAWN'
    AND OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'ACTIVE' AND NEW.status IN ('SUPERSEDED', 'EXPIRED')
    AND NEW.withdrawn_at IS NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'subject_policy_selection % permits only ACTIVE->SUPERSEDED, ACTIVE->WITHDRAWN (with withdrawn_at), and ACTIVE->EXPIRED; got % -> % (jurisdiction-policy.md §7)',
    OLD.id, OLD.status, NEW.status USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER subject_policy_selections_guard
  BEFORE UPDATE OR DELETE ON public.subject_policy_selections
  FOR EACH ROW
  EXECUTE FUNCTION public.subject_policy_selections_guard();

CREATE FUNCTION public.subject_policy_selections_no_truncate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'subject_policy_selections rows are election provenance: TRUNCATE is not permitted, even for the table owner (jurisdiction-policy.md §7)'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER subject_policy_selections_no_truncate
  BEFORE TRUNCATE ON public.subject_policy_selections
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.subject_policy_selections_no_truncate();

-- Minimal DML (README.md): no DELETE — supersession, withdrawal, and expiry
-- are transitions on preserved rows, never removals.
GRANT SELECT, INSERT, UPDATE ON public.subject_policy_selections TO karar_app;
