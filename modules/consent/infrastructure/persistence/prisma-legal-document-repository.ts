/**
 * LegalDocumentRepository over Prisma. These are the allow-listed
 * platform-global catalogue tables (rls-allow-list.json): no principal GUCs
 * apply; write paths are gated by the use cases' PolicyService check, and
 * the schema's CHECK constraints and immutability trigger remain the final
 * word on the publication rule.
 */

import type { PrismaClient } from '@karar/platform/dist/db/prisma.js';

import type {
  LegalDocument,
  LegalDocumentVersion,
  VersionClassification,
} from '../../domain/legal-document.js';
import type { JurisdictionRef, OperatingEntityRef, PurposeRef } from '../../domain/refs.js';
import type { LegalDocumentRepository } from '../../application/ports/legal-document-repository.js';

export class PrismaLegalDocumentRepository implements LegalDocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insertDocument(document: LegalDocument): Promise<void> {
    await this.prisma.legalDocument.create({
      data: {
        id: document.id,
        entityId: document.entityId,
        jurisdictionRef: document.jurisdictionRef,
        purposeRefs: [...document.purposeRefs],
        kind: document.kind,
        createdAt: document.createdAt,
      },
    });
  }

  async findDocumentById(id: string): Promise<LegalDocument | null> {
    const row = await this.prisma.legalDocument.findUnique({ where: { id } });
    return row === null ? null : toDocument(row);
  }

  async listDocuments(
    entityId: OperatingEntityRef,
    jurisdictionRef?: JurisdictionRef,
  ): Promise<ReadonlyArray<LegalDocument>> {
    const rows = await this.prisma.legalDocument.findMany({
      where: {
        entityId,
        ...(jurisdictionRef === undefined ? {} : { jurisdictionRef }),
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDocument);
  }

  async findDocumentsCoveringPurpose(
    entityId: OperatingEntityRef,
    purposeRef: PurposeRef,
    jurisdictionRef?: JurisdictionRef,
  ): Promise<ReadonlyArray<LegalDocument>> {
    const rows = await this.prisma.legalDocument.findMany({
      where: {
        entityId,
        purposeRefs: { has: purposeRef },
        ...(jurisdictionRef === undefined ? {} : { jurisdictionRef }),
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDocument);
  }

  async insertVersion(version: LegalDocumentVersion): Promise<void> {
    await this.prisma.legalDocumentVersion.create({
      data: {
        id: version.id,
        documentId: version.documentId,
        version: version.version,
        contentHash: version.contentHash,
        storageRef: version.storageRef,
        classification: version.classification,
        author: version.author,
        reviewer: version.reviewer,
        reason: version.reason,
        effectiveAt: version.effectiveAt,
        publishedAt: version.publishedAt,
        priorVersionId: version.priorVersionId,
        createdAt: version.createdAt,
      },
    });
  }

  async findVersionById(id: string): Promise<LegalDocumentVersion | null> {
    const row = await this.prisma.legalDocumentVersion.findUnique({ where: { id } });
    return row === null ? null : toVersion(row);
  }

  async classifyVersion(
    id: string,
    classification: VersionClassification,
    reviewer: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.legalDocumentVersion.update({
      where: { id },
      data: { classification, reviewer, reason },
    });
  }

  async publishVersion(id: string, effectiveAt: Date, publishedAt: Date): Promise<void> {
    await this.prisma.legalDocumentVersion.update({
      where: { id },
      data: { effectiveAt, publishedAt },
    });
  }

  async currentEffectiveVersion(
    documentId: string,
    at: Date,
  ): Promise<LegalDocumentVersion | null> {
    const row = await this.prisma.legalDocumentVersion.findFirst({
      where: {
        documentId,
        publishedAt: { not: null },
        effectiveAt: { lte: at },
      },
      orderBy: [{ effectiveAt: 'desc' }, { publishedAt: 'desc' }],
    });
    return row === null ? null : toVersion(row);
  }
}

function toDocument(row: {
  id: string;
  entityId: string;
  jurisdictionRef: string;
  purposeRefs: string[];
  kind: string;
  createdAt: Date;
}): LegalDocument {
  return {
    id: row.id,
    entityId: row.entityId as OperatingEntityRef,
    jurisdictionRef: row.jurisdictionRef as JurisdictionRef,
    purposeRefs: row.purposeRefs.map((purpose) => purpose as PurposeRef),
    kind: row.kind,
    createdAt: row.createdAt,
  };
}

function toVersion(row: {
  id: string;
  documentId: string;
  version: string;
  contentHash: string;
  storageRef: string;
  classification: string | null;
  author: string;
  reviewer: string | null;
  reason: string | null;
  effectiveAt: Date | null;
  publishedAt: Date | null;
  priorVersionId: string | null;
  createdAt: Date;
}): LegalDocumentVersion {
  return {
    id: row.id,
    documentId: row.documentId,
    version: row.version,
    contentHash: row.contentHash,
    storageRef: row.storageRef,
    classification: row.classification as VersionClassification | null,
    author: row.author,
    reviewer: row.reviewer,
    reason: row.reason,
    effectiveAt: row.effectiveAt,
    publishedAt: row.publishedAt,
    priorVersionId: row.priorVersionId,
    createdAt: row.createdAt,
  };
}
