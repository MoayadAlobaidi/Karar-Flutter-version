/**
 * Expected-failure vocabulary for the consent use cases (`Result` arms the
 * caller must handle; defects throw). The consent-specific arms exist
 * because each is a distinct legal situation, not a generic 400.
 */

import type { ConsentStatusState } from '../domain/consent-status.js';

export interface StoreFailure {
  readonly kind: 'STORE_FAILURE';
  readonly message: string;
}

export interface NotFound {
  readonly kind: 'NOT_FOUND';
  readonly resource: string;
  readonly id: string;
}

/** State change persisted but its audit record did not — surfaced loudly. */
export interface AuditAppendFailed {
  readonly kind: 'AUDIT_APPEND_FAILED';
  readonly message: string;
}

/** The publication rule refused: no classification, no publication (ADR-0024). */
export interface UnclassifiedPublicationBlocked {
  readonly kind: 'UNCLASSIFIED_PUBLICATION_BLOCKED';
  readonly versionId: string;
  readonly message: string;
}

/** Published versions are immutable; classify/publish again means a new version. */
export interface VersionImmutable {
  readonly kind: 'VERSION_IMMUTABLE';
  readonly versionId: string;
  readonly message: string;
}

/** The recorded evaluation must equal the version's classification. */
export interface EvaluationMismatch {
  readonly kind: 'EVALUATION_MISMATCH';
  readonly versionId: string;
  readonly versionClassification: string | null;
  readonly evaluation: string;
  readonly message: string;
}

/** Acceptance refused: the version is not a published version. */
export interface VersionNotPublished {
  readonly kind: 'VERSION_NOT_PUBLISHED';
  readonly versionId: string;
  readonly message: string;
}

/** Acceptance refused: the document does not cover the purpose. */
export interface PurposeNotCovered {
  readonly kind: 'PURPOSE_NOT_COVERED';
  readonly documentId: string;
  readonly purposeRef: string;
  readonly message: string;
}

/** Acceptance refused: the document belongs to a different operating entity
 * than the one effective for this principal (consent to A is not consent to B). */
export interface DocumentNotApplicable {
  readonly kind: 'DOCUMENT_NOT_APPLICABLE';
  readonly documentId: string;
  readonly documentEntityId: string;
  readonly effectiveEntityId: string;
  readonly message: string;
}

/** No operating entity is bound for the principal — everything fails closed. */
export interface NoEffectiveEntity {
  readonly kind: 'NO_EFFECTIVE_ENTITY';
  readonly message: string;
}

/** Withdrawal refused: only an ACTIVE grant can be withdrawn. */
export interface GrantNotActive {
  readonly kind: 'GRANT_NOT_ACTIVE';
  readonly grantId: string;
  readonly status: string;
  readonly message: string;
}

/** Status query needs a jurisdiction to disambiguate multiple documents. */
export interface AmbiguousJurisdiction {
  readonly kind: 'AMBIGUOUS_JURISDICTION';
  readonly purposeRef: string;
  readonly jurisdictionRefs: ReadonlyArray<string>;
  readonly message: string;
}

/**
 * The platform holds no displayable content for the version a subject would
 * accept. A REAL answer, not a fault: the catalogue records what a version is
 * and where its bytes live, and this deployment cannot retrieve them — so the
 * client shows its own honest unavailable state rather than substitute prose.
 * `reason` distinguishes the three ways that happens; none of them is an
 * invitation to render anything.
 */
export interface DocumentContentUnavailable {
  readonly kind: 'DOCUMENT_CONTENT_UNAVAILABLE';
  readonly documentId: string;
  readonly reason: 'NO_EFFECTIVE_VERSION' | 'NOT_RETRIEVABLE' | 'LANGUAGE_NOT_STATED';
  readonly message: string;
}

/**
 * The retrieved bytes do not hash to what the published version pinned. The
 * content is REFUSED, never served with a warning: a consent grant pins a
 * version id, so showing text that is not that version's text would ask a
 * subject to accept one document while reading another.
 */
export interface DocumentContentIntegrityMismatch {
  readonly kind: 'DOCUMENT_CONTENT_INTEGRITY_MISMATCH';
  readonly documentId: string;
  readonly versionId: string;
  readonly message: string;
}

/** The fail-closed denial `assertConsentFor` returns for anything not ACTIVE. */
export interface ConsentRequired {
  readonly kind: 'CONSENT_REQUIRED';
  readonly state: ConsentStatusState;
  readonly purposeRef: string;
  readonly jurisdictionRef: string | null;
  readonly message: string;
}

/** Thrown (not returned) for defective input at a trusted call site. */
export class InvalidConsentInputError extends Error {
  override readonly name = 'InvalidConsentInputError';
}

export function requireNonEmpty(field: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidConsentInputError(`'${field}' requires a non-empty value`);
  }
  return value;
}

export function toStoreFailure(error: unknown): StoreFailure {
  return {
    kind: 'STORE_FAILURE',
    message: error instanceof Error ? error.message : String(error),
  };
}
