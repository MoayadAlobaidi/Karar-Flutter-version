/**
 * Legal documents and their version lifecycle (ADR-0024). A document belongs
 * to the (entity, jurisdiction) PAIR — never a jurisdiction alone — and
 * covers named processing purposes. A version is the exact text a consent is
 * given to, verifiable by content hash.
 *
 * THE PUBLICATION RULE, as a pure domain fact: a version may be published
 * only when a named reviewer has classified it, with a recorded reason.
 * Classification has NO DEFAULT in either direction — defaulting is a legal
 * position taken by whoever wrote the branch — so `classification` is null
 * until the decision happens, and `versionMayPublish` refuses null. An
 * unclassified republication blocks (the inversion of legacy P12).
 */

import type { JurisdictionRef, OperatingEntityRef, PurposeRef } from './refs.js';

export const VERSION_CLASSIFICATIONS = [
  /** Re-acceptance required before the affected purpose may continue. */
  'MATERIAL_REACCEPTANCE_REQUIRED',
  /** Existing acceptances stand; subjects must be notified. */
  'NOTICE_REQUIRED',
  /** Editorial change; nothing is asked of anyone. */
  'NO_USER_ACTION_REQUIRED',
] as const;
export type VersionClassification = (typeof VERSION_CLASSIFICATIONS)[number];

export interface LegalDocument {
  readonly id: string;
  readonly entityId: OperatingEntityRef;
  readonly jurisdictionRef: JurisdictionRef;
  readonly purposeRefs: ReadonlyArray<PurposeRef>;
  readonly kind: string;
  readonly createdAt: Date;
}

export interface LegalDocumentVersion {
  readonly id: string;
  readonly documentId: string;
  readonly version: string;
  /** sha256 of the canonical document bytes. */
  readonly contentHash: string;
  readonly storageRef: string;
  /** null until a reviewer classifies — never defaulted. */
  readonly classification: VersionClassification | null;
  readonly author: string;
  readonly reviewer: string | null;
  readonly reason: string | null;
  readonly effectiveAt: Date | null;
  readonly publishedAt: Date | null;
  readonly priorVersionId: string | null;
  readonly createdAt: Date;
}

export function isPublished(
  version: Pick<LegalDocumentVersion, 'publishedAt'>,
): boolean {
  return version.publishedAt !== null;
}

export type PublishRefusal =
  | { readonly refusal: 'UNCLASSIFIED'; readonly message: string }
  | { readonly refusal: 'ALREADY_PUBLISHED'; readonly message: string };

/**
 * The publication gate: classified and not yet published, or a refusal
 * naming why. Pure — the use case and the schema CHECK both enforce it.
 */
export function versionMayPublish(
  version: Pick<LegalDocumentVersion, 'id' | 'classification' | 'publishedAt'>,
): PublishRefusal | null {
  if (version.publishedAt !== null) {
    return {
      refusal: 'ALREADY_PUBLISHED',
      message: `legal document version ${version.id} is already published and immutable`,
    };
  }
  if (version.classification === null) {
    return {
      refusal: 'UNCLASSIFIED',
      message: `legal document version ${version.id} has no re-consent classification; an unclassified publication blocks (ADR-0024, no default)`,
    };
  }
  return null;
}

export function documentCoversPurpose(
  document: Pick<LegalDocument, 'purposeRefs'>,
  purposeRef: PurposeRef,
): boolean {
  return document.purposeRefs.includes(purposeRef);
}
