/**
 * ReconsentEvaluation — the reviewed decision a republication legally
 * requires (ADR-0024): per affected purpose, is the change material,
 * notice-only, or no-action? NEVER a default. `affectedQueryNotes` records
 * how the affected-subject set was determined, which is what makes
 * re-consent "a query rather than an archaeology project". Rows are
 * append-only evidence; the recorded evaluation must match the version's
 * classification (the use case refuses a mismatch).
 */

import type { VersionClassification } from './legal-document.js';
import type { PurposeRef } from './refs.js';

export interface ReconsentEvaluation {
  readonly id: string;
  readonly legalDocumentVersionId: string;
  readonly purposeRef: PurposeRef;
  readonly evaluation: VersionClassification;
  readonly evaluatedBy: string;
  readonly evaluatedAt: Date;
  readonly affectedQueryNotes: string;
}

export interface ProcessingBasisReference {
  readonly id: string;
  readonly purposeRef: PurposeRef;
  readonly jurisdictionRef: string;
  /**
   * Typed reference to the declared basis (e.g. 'basis:consent'). Asserts
   * nothing about any jurisdiction's law; resolution is Phase 3.5, and an
   * absent declaration fails closed (ADR-0024).
   */
  readonly basisRef: string;
}
