-- 0086_legal_consequence_pack_pins
--
-- Completes the pinning block of data-model.md §5 on the two tables declared
-- to carry legal consequence — public.consent_grants (0065) and
-- public.data_protection_role_assignments (0062). Phase 3 pinned two of the
-- four dimensions (jurisdiction_ref, operating_entity_id) and DEFERRED the
-- other two behind architecture test 21's deferral gate, because PolicyPacks
-- and SubjectPolicySelection did not exist. Phase 3.5 built both
-- (packages/jurisdiction-policy, migrations 0075/0083), so the gate is due and
-- this migration resolves it in the schema of record.
--
-- WHAT IS PINNED, AND THE SHAPE THAT MAKES THE PIN HONEST
--
-- Each remaining dimension is a PAIR: a nullable value column and a NOT NULL
-- pin-state column that says, per row, why the value is what it is. The pair
-- is tied together by a CHECK, so "no version recorded" can never be silent —
-- the row must declare which case it is. This is the alternative to writing a
-- sentinel string into a *_version column: a sentinel is a value that reads
-- like a version, and no version was ever resolved for these rows.
--
--   policy_pack_version / policy_pack_pin_state
--     PINNED           the pack version in force when the record was made,
--                      supplied by the caller from the resolved policy.
--     PRE_POLICY_PACK  the record predates PolicyPack machinery entirely.
--                      Only lawful for rows created before the cutoff below;
--                      the cutoff CHECK makes it unusable for new rows, so it
--                      is a statement about history, not an escape hatch.
--
--   subject_policy_selection_version / subject_policy_selection_pin_state
--     PINNED           the subject's elective selection version in force.
--     NOT_APPLICABLE   the capability behind this record declares no elective
--                      option set, so no selection exists to pin. data-model
--                      §5 marks this dimension "where the capability has
--                      elective options"; a consent grant for a purpose with
--                      no option set is exactly that case, and the row says so
--                      rather than leaving a bare NULL to be interpreted.
--     PRE_SUBJECT_POLICY_SELECTION
--                      the record predates the mechanism. Same cutoff rule.
--
-- BACKFILL POSTURE (both tables are append-only evidence)
--
-- Existing rows are consent acts and stored legal decisions; nothing may be
-- rewritten and no version may be invented for them. So each state column is
-- added WITH a DEFAULT naming the honest historical case, which backfills
-- existing rows, and the DEFAULT is then DROPPED. After the drop, an INSERT
-- that omits the state fails on NOT NULL instead of silently inheriting
-- "PRE_*" — the writer must state the case every time. The cutoff CHECK
-- (created_at, against the Phase 3.5 branch date) then forbids the two PRE_*
-- states for anything created from this phase onward: new evidence pins or it
-- does not get written.
--
-- Residual, stated rather than hidden: created_at is a column the writing
-- transaction can set, so a caller that supplies a pre-cutoff created_at
-- could dodge the cutoff arm. The compensating controls are the same ones
-- that make these tables evidence at all — the guard triggers below now cover
-- the pin columns, the app role holds no DELETE, and the writing use cases
-- take the pin as a required input.
--
-- WHY data_protection_role_assignments GETS NO SELECTION VERSION COLUMN
--
-- A role assignment is a decision between legal persons about a relationship
-- (ADR-0024); no subject election bears on it, in any jurisdiction, under any
-- pack. Adding a version column there would create a slot that can only ever
-- hold NULL. Instead the table carries the state column alone, CHECK-bound to
-- the single value NOT_APPLICABLE: the non-applicability is declared in the
-- schema and enforced by the database, and giving the table a subject-elective
-- dimension later is a reviewed migration rather than an unnoticed NULL.
--
-- WHY NO SEPARATE resolution_strategy PIN
--
-- The resolution strategy for a capability is declared BY the pack
-- (PolicyPack.resolutionStrategies, packages/jurisdiction-policy/src/
-- policy-pack.ts) and packs are immutable code — a published version never
-- changes. Pinning the pack version therefore pins the strategy that applied,
-- transitively and without a second column that could drift out of agreement
-- with the first. data-model.md §5 names four dimensions; these are them.
--
-- Data lifecycle (ADR-0026): unchanged. No new table, and no new subject
-- data — the added columns are version strings and typed states about policy,
-- not about people. The 0062/0065 declarations (canonical in
-- modules/operating-entity/MODULE.md and modules/consent/MODULE.md, mirrored
-- in DATA_LIFECYCLE.md) continue to apply unchanged.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP CONSTRAINT for each
-- constraint added here, CREATE OR REPLACE of the two guard functions back to
-- their 0062/0065 bodies, then ALTER TABLE … DROP COLUMN for the four columns
-- — discarding the provenance of every record written since, which is why it
-- would need the same review as discarding any evidence.

-- ---------------------------------------------------------------------------
-- public.consent_grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.consent_grants
  ADD COLUMN policy_pack_version text NULL,
  ADD COLUMN policy_pack_pin_state text NOT NULL DEFAULT 'PRE_POLICY_PACK',
  ADD COLUMN subject_policy_selection_version text NULL,
  ADD COLUMN subject_policy_selection_pin_state text NOT NULL
    DEFAULT 'PRE_SUBJECT_POLICY_SELECTION';

-- The defaults existed to backfill history, and only for that.
ALTER TABLE public.consent_grants
  ALTER COLUMN policy_pack_pin_state DROP DEFAULT,
  ALTER COLUMN subject_policy_selection_pin_state DROP DEFAULT;

ALTER TABLE public.consent_grants
  ADD CONSTRAINT consent_grants_policy_pack_pin_state_vocabulary
    CHECK (policy_pack_pin_state IN ('PINNED', 'PRE_POLICY_PACK')),
  ADD CONSTRAINT consent_grants_policy_pack_version_present
    CHECK ((policy_pack_pin_state = 'PINNED') = (policy_pack_version IS NOT NULL)),
  ADD CONSTRAINT consent_grants_policy_pack_version_nonempty
    CHECK (policy_pack_version IS NULL OR policy_pack_version <> ''),
  ADD CONSTRAINT consent_grants_subject_policy_selection_pin_state_vocabulary
    CHECK (subject_policy_selection_pin_state IN
      ('PINNED', 'NOT_APPLICABLE', 'PRE_SUBJECT_POLICY_SELECTION')),
  ADD CONSTRAINT consent_grants_subject_policy_selection_version_present
    CHECK ((subject_policy_selection_pin_state = 'PINNED')
           = (subject_policy_selection_version IS NOT NULL)),
  ADD CONSTRAINT consent_grants_subject_policy_selection_version_nonempty
    CHECK (subject_policy_selection_version IS NULL
           OR subject_policy_selection_version <> ''),
  -- The cutoff: the Phase 3.5 branch date. Rows created from here on cannot
  -- claim to predate machinery that exists.
  ADD CONSTRAINT consent_grants_pins_required_from_phase_3_5
    CHECK (created_at < TIMESTAMPTZ '2026-08-16 00:00:00+00'
           OR (policy_pack_pin_state = 'PINNED'
               AND subject_policy_selection_pin_state <> 'PRE_SUBJECT_POLICY_SELECTION'));

COMMENT ON COLUMN public.consent_grants.policy_pack_version IS
  'PolicyPack version in force when the acceptance was recorded, supplied by '
  'the caller from the resolved policy (data-model.md §5). NULL only where '
  'policy_pack_pin_state says why.';
COMMENT ON COLUMN public.consent_grants.subject_policy_selection_version IS
  'SubjectPolicySelection version in force, where the capability declares an '
  'elective option set. NULL only where subject_policy_selection_pin_state '
  'declares NOT_APPLICABLE or the pre-mechanism case.';

-- ---------------------------------------------------------------------------
-- public.data_protection_role_assignments
-- ---------------------------------------------------------------------------

ALTER TABLE public.data_protection_role_assignments
  ADD COLUMN policy_pack_version text NULL,
  ADD COLUMN policy_pack_pin_state text NOT NULL DEFAULT 'PRE_POLICY_PACK',
  ADD COLUMN subject_policy_selection_pin_state text NOT NULL
    DEFAULT 'NOT_APPLICABLE';

ALTER TABLE public.data_protection_role_assignments
  ALTER COLUMN policy_pack_pin_state DROP DEFAULT;

ALTER TABLE public.data_protection_role_assignments
  ADD CONSTRAINT data_protection_role_assignments_policy_pack_pin_state_vocabulary
    CHECK (policy_pack_pin_state IN ('PINNED', 'PRE_POLICY_PACK')),
  ADD CONSTRAINT data_protection_role_assignments_policy_pack_version_present
    CHECK ((policy_pack_pin_state = 'PINNED') = (policy_pack_version IS NOT NULL)),
  ADD CONSTRAINT data_protection_role_assignments_policy_pack_version_nonempty
    CHECK (policy_pack_version IS NULL OR policy_pack_version <> ''),
  -- Single-valued by design: a relationship-level legal decision carries no
  -- subject election. Changing this is a reviewed migration, not a NULL.
  ADD CONSTRAINT data_protection_role_assignments_subject_policy_selection_na
    CHECK (subject_policy_selection_pin_state = 'NOT_APPLICABLE'),
  ADD CONSTRAINT data_protection_role_assignments_pins_required_from_phase_3_5
    CHECK (created_at < TIMESTAMPTZ '2026-08-16 00:00:00+00'
           OR policy_pack_pin_state = 'PINNED');

COMMENT ON COLUMN public.data_protection_role_assignments.policy_pack_version IS
  'PolicyPack version in force when the role decision was recorded, supplied '
  'by the caller from the resolved policy (data-model.md §5).';
COMMENT ON COLUMN public.data_protection_role_assignments.subject_policy_selection_pin_state IS
  'Always NOT_APPLICABLE, CHECK-enforced: a decision between legal persons '
  'about a relationship carries no subject election to pin.';

-- ---------------------------------------------------------------------------
-- The pins are pins: the guard triggers now refuse to let them move
-- ---------------------------------------------------------------------------
-- Both functions are replaced wholesale (their 0062/0065 bodies plus the new
-- columns in the immutable-content lists). A pin that a later UPDATE could
-- rewrite would record provenance without preserving it.

CREATE OR REPLACE FUNCTION public.consent_grants_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'consent_grants rows are consent evidence: DELETE is not permitted, even for the table owner (ADR-0024)'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id                        IS DISTINCT FROM OLD.id
    OR NEW.user_id                   IS DISTINCT FROM OLD.user_id
    OR NEW.tenant_id                 IS DISTINCT FROM OLD.tenant_id
    OR NEW.operating_entity_id       IS DISTINCT FROM OLD.operating_entity_id
    OR NEW.jurisdiction_ref          IS DISTINCT FROM OLD.jurisdiction_ref
    OR NEW.purpose_ref               IS DISTINCT FROM OLD.purpose_ref
    OR NEW.consent_version           IS DISTINCT FROM OLD.consent_version
    OR NEW.legal_document_version_id IS DISTINCT FROM OLD.legal_document_version_id
    OR NEW.granted_at                IS DISTINCT FROM OLD.granted_at
    OR NEW.evidence_reference        IS DISTINCT FROM OLD.evidence_reference
    OR NEW.created_at                IS DISTINCT FROM OLD.created_at
    OR NEW.policy_pack_version       IS DISTINCT FROM OLD.policy_pack_version
    OR NEW.policy_pack_pin_state     IS DISTINCT FROM OLD.policy_pack_pin_state
    OR NEW.subject_policy_selection_version
                                     IS DISTINCT FROM OLD.subject_policy_selection_version
    OR NEW.subject_policy_selection_pin_state
                                     IS DISTINCT FROM OLD.subject_policy_selection_pin_state
  THEN
    RAISE EXCEPTION 'consent_grant % content is immutable; re-consent is a new row (ADR-0024)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.status = 'ACTIVE' AND NEW.status = 'WITHDRAWN'
    AND OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'ACTIVE' AND NEW.status = 'SUPERSEDED'
    AND NEW.withdrawn_at IS NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'consent_grant % permits only ACTIVE->WITHDRAWN (with withdrawn_at) and ACTIVE->SUPERSEDED; got % -> % (ADR-0024)',
    OLD.id, OLD.status, NEW.status USING ERRCODE = 'raise_exception';
END;
$$;

CREATE OR REPLACE FUNCTION public.data_protection_role_assignments_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'data_protection_role_assignments rows are legal decisions: % is not permitted, even for the table owner (ADR-0024)',
      TG_OP USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'data_protection_role_assignment % is ended and immutable; record a successor assignment instead (ADR-0024)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id                  IS DISTINCT FROM OLD.id
    OR NEW.operating_entity_id IS DISTINCT FROM OLD.operating_entity_id
    OR NEW.tenant_id           IS DISTINCT FROM OLD.tenant_id
    OR NEW.purpose_ref         IS DISTINCT FROM OLD.purpose_ref
    OR NEW.jurisdiction_ref    IS DISTINCT FROM OLD.jurisdiction_ref
    OR NEW.role                IS DISTINCT FROM OLD.role
    OR NEW.effective_from      IS DISTINCT FROM OLD.effective_from
    OR NEW.contract_reference  IS DISTINCT FROM OLD.contract_reference
    OR NEW.created_by          IS DISTINCT FROM OLD.created_by
    OR NEW.created_at          IS DISTINCT FROM OLD.created_at
    OR NEW.policy_pack_version IS DISTINCT FROM OLD.policy_pack_version
    OR NEW.policy_pack_pin_state IS DISTINCT FROM OLD.policy_pack_pin_state
    OR NEW.subject_policy_selection_pin_state
                               IS DISTINCT FROM OLD.subject_policy_selection_pin_state
  THEN
    RAISE EXCEPTION 'data_protection_role_assignment % may only be ended (effective_to), never edited; record a successor assignment (ADR-0024)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.effective_to IS NULL THEN
    RAISE EXCEPTION 'ending data_protection_role_assignment % requires a non-null effective_to',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;
