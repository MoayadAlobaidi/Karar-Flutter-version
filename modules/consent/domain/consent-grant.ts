/**
 * ConsentGrant — one acceptance act, as immutable evidence (ADR-0024).
 *
 * The grant is RESOLVED by the triple (operatingEntity, purpose,
 * jurisdiction) — resolution dimension, not identity: the row's identity is
 * the act itself (who, when, which exact version, what evidence). The
 * entity is PINNED at creation and never rewritten, because consent given
 * to Entity A is not automatically valid for Entity B; an assignment change
 * later affects future grants only.
 *
 * Lifecycle: ACTIVE -> WITHDRAWN (withdrawn_at set, row preserved) or
 * ACTIVE -> SUPERSEDED (a re-grant inserted a NEW row). Nothing else — the
 * schema trigger enforces the same two transitions.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type { JurisdictionRef, OperatingEntityRef, PurposeRef } from './refs.js';

export const CONSENT_GRANT_STATUSES = ['ACTIVE', 'WITHDRAWN', 'SUPERSEDED'] as const;
export type ConsentGrantStatus = (typeof CONSENT_GRANT_STATUSES)[number];

/** Why a grant's policy-pack version column holds what it holds (migration
 * 0086). PRE_POLICY_PACK belongs to rows written before PolicyPacks existed;
 * the schema's cutoff CHECK refuses it for anything created from Phase 3.5
 * on, so nothing in this module can produce it. */
export const POLICY_PACK_PIN_STATES = ['PINNED', 'PRE_POLICY_PACK'] as const;
export type PolicyPackPinState = (typeof POLICY_PACK_PIN_STATES)[number];

/** NOT_APPLICABLE is the honest case where the accepted purpose has no
 * elective option set to pin — data-model.md §5 scopes this dimension to
 * capabilities that HAVE elective options. */
export const SUBJECT_POLICY_SELECTION_PIN_STATES = [
  'PINNED',
  'NOT_APPLICABLE',
  'PRE_SUBJECT_POLICY_SELECTION',
] as const;
export type SubjectPolicySelectionPinState =
  (typeof SUBJECT_POLICY_SELECTION_PIN_STATES)[number];

/**
 * The resolved policy provenance a caller pins onto a new grant. This module
 * does not resolve policy — it records what the resolver already decided, so
 * the values arrive as input and the module never fabricates one.
 */
export interface ConsentPolicyPin {
  /** The PolicyPack version in force at acceptance. Required: a grant written
   * from Phase 3.5 on that pins no pack version is refused by the schema. */
  readonly policyPackVersion: string;
  /** The subject's elective selection version, or null where the purpose
   * declares no option set — recorded as NOT_APPLICABLE, never as a bare NULL. */
  readonly subjectPolicySelectionVersion: string | null;
}

export interface ConsentGrant {
  readonly id: string;
  readonly userId: UserId;
  readonly tenantId: TenantId;
  /** Pinned at creation (data-model.md §5); never rewritten. */
  readonly operatingEntityId: OperatingEntityRef;
  readonly jurisdictionRef: JurisdictionRef;
  readonly purposeRef: PurposeRef;
  /** Denormalised version string of the accepted document version. */
  readonly consentVersion: string;
  /** The exact pin: which version row was accepted. */
  readonly legalDocumentVersionId: string;
  readonly grantedAt: Date;
  readonly withdrawnAt: Date | null;
  readonly status: ConsentGrantStatus;
  /** Evidence of the acceptance act (request/session reference). */
  readonly evidenceReference: string;
  /** Pinned at creation (data-model.md §5), null only where the pin state
   * says why. Never rewritten — the schema's guard trigger refuses it. */
  readonly policyPackVersion: string | null;
  readonly policyPackPinState: PolicyPackPinState;
  readonly subjectPolicySelectionVersion: string | null;
  readonly subjectPolicySelectionPinState: SubjectPolicySelectionPinState;
}
