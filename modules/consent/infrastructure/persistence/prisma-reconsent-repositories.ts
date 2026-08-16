/**
 * ReconsentEvaluationRepository (append-only decision records) and
 * ProcessingBasisRepository (typed reference data) over Prisma. Both tables
 * are allow-listed platform-global records (rls-allow-list.json); the
 * evaluation table's append-only-ness is enforced in the schema by revoked
 * grants and trigger — this repository simply has no update or delete.
 */

import type { PrismaClient } from '@karar/platform/dist/db/prisma.js';

import type {
  ProcessingBasisReference,
  ReconsentEvaluation,
} from '../../domain/reconsent-evaluation.js';
import type { VersionClassification } from '../../domain/legal-document.js';
import type { JurisdictionRef, PurposeRef } from '../../domain/refs.js';
import type {
  ProcessingBasisRepository,
  ReconsentEvaluationRepository,
} from '../../application/ports/reconsent-evaluation-repository.js';

export class PrismaReconsentEvaluationRepository implements ReconsentEvaluationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(evaluation: ReconsentEvaluation): Promise<void> {
    await this.prisma.reconsentEvaluation.create({
      data: {
        id: evaluation.id,
        legalDocumentVersionId: evaluation.legalDocumentVersionId,
        purposeRef: evaluation.purposeRef,
        evaluation: evaluation.evaluation,
        evaluatedBy: evaluation.evaluatedBy,
        evaluatedAt: evaluation.evaluatedAt,
        affectedQueryNotes: evaluation.affectedQueryNotes,
      },
    });
  }

  async findByVersionAndPurpose(
    legalDocumentVersionId: string,
    purposeRef: PurposeRef,
  ): Promise<ReconsentEvaluation | null> {
    const row = await this.prisma.reconsentEvaluation.findUnique({
      where: {
        legalDocumentVersionId_purposeRef: { legalDocumentVersionId, purposeRef },
      },
    });
    return row === null ? null : toEvaluation(row);
  }

  async listByVersion(
    legalDocumentVersionId: string,
  ): Promise<ReadonlyArray<ReconsentEvaluation>> {
    const rows = await this.prisma.reconsentEvaluation.findMany({
      where: { legalDocumentVersionId },
      orderBy: { evaluatedAt: 'asc' },
    });
    return rows.map(toEvaluation);
  }
}

function toEvaluation(row: {
  id: string;
  legalDocumentVersionId: string;
  purposeRef: string;
  evaluation: string;
  evaluatedBy: string;
  evaluatedAt: Date;
  affectedQueryNotes: string;
}): ReconsentEvaluation {
  return {
    id: row.id,
    legalDocumentVersionId: row.legalDocumentVersionId,
    purposeRef: row.purposeRef as PurposeRef,
    evaluation: row.evaluation as VersionClassification,
    evaluatedBy: row.evaluatedBy,
    evaluatedAt: row.evaluatedAt,
    affectedQueryNotes: row.affectedQueryNotes,
  };
}

export class PrismaProcessingBasisRepository implements ProcessingBasisRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async declare(
    reference: ProcessingBasisReference & { readonly createdAt: Date; readonly updatedAt: Date },
  ): Promise<void> {
    await this.prisma.processingBasisReference.upsert({
      where: {
        purposeRef_jurisdictionRef: {
          purposeRef: reference.purposeRef,
          jurisdictionRef: reference.jurisdictionRef,
        },
      },
      create: {
        id: reference.id,
        purposeRef: reference.purposeRef,
        jurisdictionRef: reference.jurisdictionRef,
        basisRef: reference.basisRef,
        createdAt: reference.createdAt,
        updatedAt: reference.updatedAt,
      },
      update: {
        basisRef: reference.basisRef,
        updatedAt: reference.updatedAt,
      },
    });
  }

  async find(
    purposeRef: PurposeRef,
    jurisdictionRef: JurisdictionRef,
  ): Promise<ProcessingBasisReference | null> {
    const row = await this.prisma.processingBasisReference.findUnique({
      where: { purposeRef_jurisdictionRef: { purposeRef, jurisdictionRef } },
    });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      purposeRef: row.purposeRef as PurposeRef,
      jurisdictionRef: row.jurisdictionRef,
      basisRef: row.basisRef,
    };
  }
}
