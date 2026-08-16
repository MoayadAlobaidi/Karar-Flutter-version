/**
 * Legal-document lifecycle: create the catalogue entry, draft a version,
 * classify it (an explicit, reviewed decision — NO DEFAULT), publish it
 * (refused while unclassified — the typed error the ADR demands), all
 * audited and gated on `consent.document.publish`.
 *
 * Publication order is classify -> publish. Attempting to publish an
 * unclassified version returns UNCLASSIFIED_PUBLICATION_BLOCKED; the schema
 * CHECK independently refuses the row shape, so a bypass of this use case
 * still cannot produce an unclassified effective version.
 */

import { Result } from '@karar/shared-kernel';

import {
  VERSION_CLASSIFICATIONS,
  versionMayPublish,
  type LegalDocument,
  type LegalDocumentVersion,
  type VersionClassification,
} from '../../domain/legal-document.js';
import { JurisdictionRef, OperatingEntityRef, PurposeRef } from '../../domain/refs.js';
import {
  InvalidConsentInputError,
  requireNonEmpty,
  toStoreFailure,
  type AuditAppendFailed,
  type NotFound,
  type StoreFailure,
  type UnclassifiedPublicationBlocked,
  type VersionImmutable,
} from '../errors.js';
import { ConsentAuditTrail } from '../audit-trail.js';
import type { IdSource } from '../ports/id-source.js';
import type { LegalDocumentRepository } from '../ports/legal-document-repository.js';
import {
  CONSENT_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from '../ports/policy-service.js';

export type LegalDocumentError = AuthorizationDenied | NotFound | StoreFailure | AuditAppendFailed;

export interface CreateLegalDocumentInput {
  readonly principal: PolicyPrincipal;
  readonly entityId: string;
  readonly jurisdictionRef: string;
  readonly purposeRefs: ReadonlyArray<string>;
  readonly kind: string;
  readonly now: Date;
}

export class CreateLegalDocument {
  constructor(
    private readonly documents: LegalDocumentRepository,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: ConsentAuditTrail,
  ) {}

  async execute(
    input: CreateLegalDocumentInput,
  ): Promise<Result<LegalDocument, LegalDocumentError>> {
    if (input.purposeRefs.length === 0) {
      throw new InvalidConsentInputError('a legal document must cover at least one purpose');
    }
    const authorized = await this.policy.authorize(
      input.principal,
      CONSENT_PERMISSIONS.publishDocument,
    );
    if (!authorized.ok) {
      return authorized;
    }
    const document: LegalDocument = Object.freeze({
      id: this.ids.nextId(),
      entityId: OperatingEntityRef.of(input.entityId),
      jurisdictionRef: JurisdictionRef.of(input.jurisdictionRef),
      purposeRefs: input.purposeRefs.map((p) => PurposeRef.of(p)),
      kind: requireNonEmpty('kind', input.kind),
      createdAt: input.now,
    });
    try {
      await this.documents.insertDocument(document);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'consent.document.created',
      resourceType: 'legal_document',
      resourceId: document.id,
      afterMetadata: {
        entityId: document.entityId,
        jurisdictionRef: document.jurisdictionRef,
        kind: document.kind,
        purposeRefs: document.purposeRefs.join(','),
      },
    });
    return audited.ok ? Result.ok(document) : audited;
  }
}

export interface DraftDocumentVersionInput {
  readonly principal: PolicyPrincipal;
  readonly documentId: string;
  readonly version: string;
  readonly contentHash: string;
  readonly storageRef: string;
  readonly author: string;
  readonly priorVersionId?: string | null;
  readonly now: Date;
}

export class DraftDocumentVersion {
  constructor(
    private readonly documents: LegalDocumentRepository,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: ConsentAuditTrail,
  ) {}

  async execute(
    input: DraftDocumentVersionInput,
  ): Promise<Result<LegalDocumentVersion, LegalDocumentError>> {
    const authorized = await this.policy.authorize(
      input.principal,
      CONSENT_PERMISSIONS.publishDocument,
    );
    if (!authorized.ok) {
      return authorized;
    }
    let document;
    try {
      document = await this.documents.findDocumentById(input.documentId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (document === null) {
      return Result.err({ kind: 'NOT_FOUND', resource: 'legal_document', id: input.documentId });
    }
    const version: LegalDocumentVersion = Object.freeze({
      id: this.ids.nextId(),
      documentId: input.documentId,
      version: requireNonEmpty('version', input.version),
      contentHash: requireNonEmpty('contentHash', input.contentHash),
      storageRef: requireNonEmpty('storageRef', input.storageRef),
      classification: null, // no default, ever (ADR-0024)
      author: requireNonEmpty('author', input.author),
      reviewer: null,
      reason: null,
      effectiveAt: null,
      publishedAt: null,
      priorVersionId: input.priorVersionId ?? null,
      createdAt: input.now,
    });
    try {
      await this.documents.insertVersion(version);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'consent.document_version.drafted',
      resourceType: 'legal_document_version',
      resourceId: version.id,
      afterMetadata: {
        documentId: version.documentId,
        version: version.version,
        contentHash: version.contentHash,
      },
    });
    return audited.ok ? Result.ok(version) : audited;
  }
}

export interface ClassifyDocumentVersionInput {
  readonly principal: PolicyPrincipal;
  readonly versionId: string;
  readonly classification: VersionClassification;
  readonly reviewer: string;
  readonly reason: string;
  readonly now: Date;
}

export type ClassifyDocumentVersionError = LegalDocumentError | VersionImmutable;

export class ClassifyDocumentVersion {
  constructor(
    private readonly documents: LegalDocumentRepository,
    private readonly policy: PolicyService,
    private readonly audit: ConsentAuditTrail,
  ) {}

  async execute(
    input: ClassifyDocumentVersionInput,
  ): Promise<Result<void, ClassifyDocumentVersionError>> {
    if (!VERSION_CLASSIFICATIONS.includes(input.classification)) {
      throw new InvalidConsentInputError(
        `classification must be one of ${VERSION_CLASSIFICATIONS.join(', ')}, got '${String(input.classification)}' — there is no default (ADR-0024)`,
      );
    }
    requireNonEmpty('reviewer', input.reviewer);
    requireNonEmpty('reason', input.reason);
    const authorized = await this.policy.authorize(
      input.principal,
      CONSENT_PERMISSIONS.publishDocument,
    );
    if (!authorized.ok) {
      return authorized;
    }
    let version;
    try {
      version = await this.documents.findVersionById(input.versionId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (version === null) {
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'legal_document_version',
        id: input.versionId,
      });
    }
    if (version.publishedAt !== null) {
      return Result.err({
        kind: 'VERSION_IMMUTABLE',
        versionId: version.id,
        message: `version ${version.id} is published and immutable; draft a successor version`,
      });
    }
    try {
      await this.documents.classifyVersion(
        input.versionId,
        input.classification,
        input.reviewer,
        input.reason,
      );
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'consent.document_version.classified',
      resourceType: 'legal_document_version',
      resourceId: input.versionId,
      reason: input.reason,
      beforeMetadata: { classification: version.classification },
      afterMetadata: { classification: input.classification, reviewer: input.reviewer },
    });
    return audited.ok ? Result.ok(undefined) : audited;
  }
}

export interface PublishDocumentVersionInput {
  readonly principal: PolicyPrincipal;
  readonly versionId: string;
  /** When the version takes effect; defaults to the publication instant. */
  readonly effectiveAt?: Date;
  readonly now: Date;
}

export type PublishDocumentVersionError =
  | LegalDocumentError
  | UnclassifiedPublicationBlocked
  | VersionImmutable;

export class PublishDocumentVersion {
  constructor(
    private readonly documents: LegalDocumentRepository,
    private readonly policy: PolicyService,
    private readonly audit: ConsentAuditTrail,
  ) {}

  async execute(
    input: PublishDocumentVersionInput,
  ): Promise<Result<LegalDocumentVersion, PublishDocumentVersionError>> {
    const authorized = await this.policy.authorize(
      input.principal,
      CONSENT_PERMISSIONS.publishDocument,
    );
    if (!authorized.ok) {
      return authorized;
    }
    let version;
    try {
      version = await this.documents.findVersionById(input.versionId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (version === null) {
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'legal_document_version',
        id: input.versionId,
      });
    }
    const refusal = versionMayPublish(version);
    if (refusal !== null) {
      return refusal.refusal === 'UNCLASSIFIED'
        ? Result.err({
            kind: 'UNCLASSIFIED_PUBLICATION_BLOCKED',
            versionId: version.id,
            message: refusal.message,
          })
        : Result.err({
            kind: 'VERSION_IMMUTABLE',
            versionId: version.id,
            message: refusal.message,
          });
    }
    const effectiveAt = input.effectiveAt ?? input.now;
    try {
      await this.documents.publishVersion(input.versionId, effectiveAt, input.now);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'consent.document_version.published',
      resourceType: 'legal_document_version',
      resourceId: input.versionId,
      beforeMetadata: { publishedAt: null },
      afterMetadata: {
        classification: version.classification,
        effectiveAt: effectiveAt.toISOString(),
        publishedAt: input.now.toISOString(),
      },
    });
    return audited.ok
      ? Result.ok({ ...version, effectiveAt, publishedAt: input.now })
      : audited;
  }
}
