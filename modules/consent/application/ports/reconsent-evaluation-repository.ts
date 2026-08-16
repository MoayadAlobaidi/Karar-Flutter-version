/**
 * Persistence ports for re-consent evaluations (append-only decision
 * records) and processing-basis references (typed reference data). Neither
 * exposes update-in-place of an evaluation or any delete — evaluations are
 * evidence.
 */

import type {
  ProcessingBasisReference,
  ReconsentEvaluation,
} from '../../domain/reconsent-evaluation.js';
import type { JurisdictionRef, PurposeRef } from '../../domain/refs.js';

export interface ReconsentEvaluationRepository {
  insert(evaluation: ReconsentEvaluation): Promise<void>;
  findByVersionAndPurpose(
    legalDocumentVersionId: string,
    purposeRef: PurposeRef,
  ): Promise<ReconsentEvaluation | null>;
  listByVersion(legalDocumentVersionId: string): Promise<ReadonlyArray<ReconsentEvaluation>>;
}

export interface ProcessingBasisRepository {
  /** Insert or update the declared basis for (purpose, jurisdiction). */
  declare(
    reference: ProcessingBasisReference & { readonly createdAt: Date; readonly updatedAt: Date },
  ): Promise<void>;
  find(
    purposeRef: PurposeRef,
    jurisdictionRef: JurisdictionRef,
  ): Promise<ProcessingBasisReference | null>;
}
