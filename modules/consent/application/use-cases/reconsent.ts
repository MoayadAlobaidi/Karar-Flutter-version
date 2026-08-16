/**
 * RecordReconsentEvaluation — the reviewed decision a republication requires
 * (ADR-0024), recorded per affected purpose as append-only evidence. The
 * recorded evaluation MUST equal the version's classification: the
 * classification is the decision, and an evaluation row that contradicts it
 * would be two legal positions about one change. Also here:
 * DeclareProcessingBasisReference, the typed (purpose, jurisdiction) basis
 * registry — references only, no jurisdictional conclusions invented;
 * resolution is Phase 3.5.
 */

import { Result } from '@karar/shared-kernel';

import { VERSION_CLASSIFICATIONS } from '../../domain/legal-document.js';
import type {
  ProcessingBasisReference,
  ReconsentEvaluation,
} from '../../domain/reconsent-evaluation.js';
import type { VersionClassification } from '../../domain/legal-document.js';
import { JurisdictionRef, PurposeRef } from '../../domain/refs.js';
import {
  InvalidConsentInputError,
  requireNonEmpty,
  toStoreFailure,
  type AuditAppendFailed,
  type EvaluationMismatch,
  type NotFound,
  type StoreFailure,
  type UnclassifiedPublicationBlocked,
} from '../errors.js';
import { ConsentAuditTrail } from '../audit-trail.js';
import type { IdSource } from '../ports/id-source.js';
import type { LegalDocumentRepository } from '../ports/legal-document-repository.js';
import type {
  ProcessingBasisRepository,
  ReconsentEvaluationRepository,
} from '../ports/reconsent-evaluation-repository.js';
import {
  CONSENT_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from '../ports/policy-service.js';

export interface RecordReconsentEvaluationInput {
  readonly principal: PolicyPrincipal;
  readonly legalDocumentVersionId: string;
  readonly purposeRef: string;
  readonly evaluation: VersionClassification;
  readonly affectedQueryNotes: string;
  readonly now: Date;
}

export type RecordReconsentEvaluationError =
  | AuthorizationDenied
  | NotFound
  | UnclassifiedPublicationBlocked
  | EvaluationMismatch
  | StoreFailure
  | AuditAppendFailed;

export class RecordReconsentEvaluation {
  constructor(
    private readonly evaluations: ReconsentEvaluationRepository,
    private readonly documents: LegalDocumentRepository,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: ConsentAuditTrail,
  ) {}

  async execute(
    input: RecordReconsentEvaluationInput,
  ): Promise<Result<ReconsentEvaluation, RecordReconsentEvaluationError>> {
    if (!VERSION_CLASSIFICATIONS.includes(input.evaluation)) {
      throw new InvalidConsentInputError(
        `evaluation must be one of ${VERSION_CLASSIFICATIONS.join(', ')}, got '${String(input.evaluation)}'`,
      );
    }
    const authorized = await this.policy.authorize(
      input.principal,
      CONSENT_PERMISSIONS.publishDocument,
    );
    if (!authorized.ok) {
      return authorized;
    }
    let version;
    try {
      version = await this.documents.findVersionById(input.legalDocumentVersionId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (version === null) {
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'legal_document_version',
        id: input.legalDocumentVersionId,
      });
    }
    if (version.classification === null) {
      return Result.err({
        kind: 'UNCLASSIFIED_PUBLICATION_BLOCKED',
        versionId: version.id,
        message: `version ${version.id} is unclassified; classify it before recording a re-consent evaluation (ADR-0024)`,
      });
    }
    if (version.classification !== input.evaluation) {
      return Result.err({
        kind: 'EVALUATION_MISMATCH',
        versionId: version.id,
        versionClassification: version.classification,
        evaluation: input.evaluation,
        message: `evaluation '${input.evaluation}' contradicts version ${version.id} classification '${version.classification}'`,
      });
    }
    const evaluation: ReconsentEvaluation = Object.freeze({
      id: this.ids.nextId(),
      legalDocumentVersionId: version.id,
      purposeRef: PurposeRef.of(input.purposeRef),
      evaluation: input.evaluation,
      evaluatedBy: input.principal.principalRef,
      evaluatedAt: input.now,
      affectedQueryNotes: requireNonEmpty('affectedQueryNotes', input.affectedQueryNotes),
    });
    try {
      await this.evaluations.insert(evaluation);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'consent.reconsent.evaluated',
      resourceType: 'reconsent_evaluation',
      resourceId: evaluation.id,
      afterMetadata: {
        legalDocumentVersionId: evaluation.legalDocumentVersionId,
        purposeRef: evaluation.purposeRef,
        evaluation: evaluation.evaluation,
      },
    });
    return audited.ok ? Result.ok(evaluation) : audited;
  }
}

export interface DeclareProcessingBasisReferenceInput {
  readonly principal: PolicyPrincipal;
  readonly purposeRef: string;
  readonly jurisdictionRef: string;
  readonly basisRef: string;
  readonly now: Date;
}

export type DeclareProcessingBasisReferenceError =
  | AuthorizationDenied
  | StoreFailure
  | AuditAppendFailed;

export class DeclareProcessingBasisReference {
  constructor(
    private readonly bases: ProcessingBasisRepository,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: ConsentAuditTrail,
  ) {}

  async execute(
    input: DeclareProcessingBasisReferenceInput,
  ): Promise<Result<ProcessingBasisReference, DeclareProcessingBasisReferenceError>> {
    const authorized = await this.policy.authorize(
      input.principal,
      CONSENT_PERMISSIONS.publishDocument,
    );
    if (!authorized.ok) {
      return authorized;
    }
    const reference: ProcessingBasisReference = Object.freeze({
      id: this.ids.nextId(),
      purposeRef: PurposeRef.of(input.purposeRef),
      jurisdictionRef: JurisdictionRef.of(input.jurisdictionRef),
      basisRef: requireNonEmpty('basisRef', input.basisRef),
    });
    try {
      await this.bases.declare({ ...reference, createdAt: input.now, updatedAt: input.now });
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'consent.processing_basis.declared',
      resourceType: 'processing_basis_reference',
      resourceId: reference.id,
      afterMetadata: {
        purposeRef: reference.purposeRef,
        jurisdictionRef: reference.jurisdictionRef,
        basisRef: reference.basisRef,
      },
    });
    return audited.ok ? Result.ok(reference) : audited;
  }
}
