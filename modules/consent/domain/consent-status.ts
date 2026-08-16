/**
 * Consent status resolution — the classification matrix as one pure
 * function (ADR-0024; jurisdiction-policy.md §10):
 *
 *   no grant                                   -> NO_GRANT       (fail closed)
 *   latest grant withdrawn                     -> WITHDRAWN      (fail closed)
 *   active grant, current version accepted     -> ACTIVE
 *   newer effective version, MATERIAL          -> RECONSENT_REQUIRED (fail closed)
 *   newer effective version, NOTICE            -> ACTIVE + noticeRequired
 *   newer effective version, NO_USER_ACTION    -> ACTIVE
 *   newer effective version, unclassified      -> RECONSENT_REQUIRED
 *
 * The last row is defensive: the schema forbids an effective unclassified
 * version, but if one ever appeared the resolution fails closed rather than
 * inheriting a stale acceptance.
 */

import type { ConsentGrant } from './consent-grant.js';
import type { LegalDocumentVersion } from './legal-document.js';

export type ConsentStatusState = 'ACTIVE' | 'WITHDRAWN' | 'RECONSENT_REQUIRED' | 'NO_GRANT';

export interface ConsentStatusView {
  readonly state: ConsentStatusState;
  /** True when a NOTICE_REQUIRED republication postdates the acceptance. */
  readonly noticeRequired: boolean;
  readonly grantId: string | null;
  readonly grantedVersion: string | null;
  readonly effectiveVersionId: string | null;
  readonly effectiveVersion: string | null;
}

export interface ResolveConsentStatusInput {
  /** Latest non-superseded grant for the (entity, purpose, jurisdiction) triple. */
  readonly grant: Pick<
    ConsentGrant,
    'id' | 'status' | 'consentVersion' | 'legalDocumentVersionId'
  > | null;
  /** effective_at of the version the grant pinned (null when unknown). */
  readonly grantedVersionEffectiveAt: Date | null;
  /** The document's current effective published version (null when none). */
  readonly effectiveVersion: Pick<
    LegalDocumentVersion,
    'id' | 'version' | 'classification' | 'effectiveAt'
  > | null;
}

export function resolveConsentStatus(input: ResolveConsentStatusInput): ConsentStatusView {
  const effective = input.effectiveVersion;
  const base = {
    noticeRequired: false,
    grantId: input.grant?.id ?? null,
    grantedVersion: input.grant?.consentVersion ?? null,
    effectiveVersionId: effective?.id ?? null,
    effectiveVersion: effective?.version ?? null,
  };

  if (input.grant === null) {
    return { ...base, state: 'NO_GRANT' };
  }
  if (input.grant.status === 'WITHDRAWN') {
    return { ...base, state: 'WITHDRAWN' };
  }
  if (input.grant.status !== 'ACTIVE') {
    // A SUPERSEDED grant should never be the resolution row; fail closed.
    return { ...base, state: 'NO_GRANT' };
  }
  if (effective === null || effective.id === input.grant.legalDocumentVersionId) {
    return { ...base, state: 'ACTIVE' };
  }
  const effectiveIsNewer =
    input.grantedVersionEffectiveAt === null ||
    effective.effectiveAt === null ||
    effective.effectiveAt.getTime() > input.grantedVersionEffectiveAt.getTime();
  if (!effectiveIsNewer) {
    return { ...base, state: 'ACTIVE' };
  }
  switch (effective.classification) {
    case 'NOTICE_REQUIRED':
      return { ...base, state: 'ACTIVE', noticeRequired: true };
    case 'NO_USER_ACTION_REQUIRED':
      return { ...base, state: 'ACTIVE' };
    case 'MATERIAL_REACCEPTANCE_REQUIRED':
    default:
      return { ...base, state: 'RECONSENT_REQUIRED' };
  }
}

/** ACTIVE (with or without a pending notice) is the only state that permits processing. */
export function statusPermitsProcessing(state: ConsentStatusState): boolean {
  return state === 'ACTIVE';
}
