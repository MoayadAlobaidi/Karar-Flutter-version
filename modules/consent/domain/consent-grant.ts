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
}
