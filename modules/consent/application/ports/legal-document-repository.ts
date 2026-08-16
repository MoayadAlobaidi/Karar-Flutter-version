/**
 * Persistence port for the legal document catalogue and version lifecycle.
 * The schema enforces the publication rule by CHECK and post-publication
 * immutability by trigger; the port exposes only the lawful operations —
 * classify a draft, publish a classified draft — and no delete.
 */

import type { LegalDocument, LegalDocumentVersion, VersionClassification } from '../../domain/legal-document.js';
import type { JurisdictionRef, OperatingEntityRef, PurposeRef } from '../../domain/refs.js';

export interface LegalDocumentRepository {
  insertDocument(document: LegalDocument): Promise<void>;
  findDocumentById(id: string): Promise<LegalDocument | null>;
  listDocuments(
    entityId: OperatingEntityRef,
    jurisdictionRef?: JurisdictionRef,
  ): Promise<ReadonlyArray<LegalDocument>>;
  /** Documents for the entity whose purpose_refs contain `purposeRef`. */
  findDocumentsCoveringPurpose(
    entityId: OperatingEntityRef,
    purposeRef: PurposeRef,
    jurisdictionRef?: JurisdictionRef,
  ): Promise<ReadonlyArray<LegalDocument>>;

  insertVersion(version: LegalDocumentVersion): Promise<void>;
  findVersionById(id: string): Promise<LegalDocumentVersion | null>;
  classifyVersion(
    id: string,
    classification: VersionClassification,
    reviewer: string,
    reason: string,
  ): Promise<void>;
  publishVersion(id: string, effectiveAt: Date, publishedAt: Date): Promise<void>;
  /** Published version with the greatest effective_at <= `at`, if any. */
  currentEffectiveVersion(documentId: string, at: Date): Promise<LegalDocumentVersion | null>;
}
