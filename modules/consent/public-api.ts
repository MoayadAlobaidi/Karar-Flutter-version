/**
 * The consent module's only legal import surface (architecture test 3).
 *
 * Exported: the domain vocabulary and pure status resolution, the ports
 * this module declares (the RBAC workstream implements PolicyService;
 * the composition root implements the wiring), the use cases, and the
 * NestJS presentation module for the §49 endpoints.
 *
 * Deliberately absent: the Prisma repositories, the principal-context
 * helper, and the id source (infrastructure is wired by the composition
 * root); and ANY use case that records acceptance for somebody else — no
 * admin-accepts-for-customer path exists in this module, by design
 * (MODULE.md, permissions deliberately absent).
 */

export {
  VERSION_CLASSIFICATIONS,
  documentCoversPurpose,
  isPublished,
  versionMayPublish,
  type LegalDocument,
  type LegalDocumentVersion,
  type PublishRefusal,
  type VersionClassification,
} from './domain/legal-document.js';
export {
  CONSENT_GRANT_STATUSES,
  POLICY_PACK_PIN_STATES,
  SUBJECT_POLICY_SELECTION_PIN_STATES,
  type ConsentGrant,
  type ConsentGrantStatus,
  type ConsentPolicyPin,
  type PolicyPackPinState,
  type SubjectPolicySelectionPinState,
} from './domain/consent-grant.js';
export {
  resolveConsentStatus,
  statusPermitsProcessing,
  type ConsentStatusState,
  type ConsentStatusView,
  type ResolveConsentStatusInput,
} from './domain/consent-status.js';
export type {
  ProcessingBasisReference,
  ReconsentEvaluation,
} from './domain/reconsent-evaluation.js';
export {
  InvalidReferenceError,
  JurisdictionRef,
  OperatingEntityRef,
  PurposeRef,
} from './domain/refs.js';

export {
  CONSENT_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from './application/ports/policy-service.js';
export type { IdSource } from './application/ports/id-source.js';
export type { ContentDigest } from './application/ports/content-digest.js';
export type { LegalDocumentRepository } from './application/ports/legal-document-repository.js';
export {
  LEGAL_DOCUMENT_CONTENT_FORMATS,
  type LegalDocumentContent,
  type LegalDocumentContentFormat,
  type LegalDocumentContentSource,
} from './application/ports/legal-document-content-source.js';
export type {
  ConsentGrantRepository,
  ConsentPrincipal,
} from './application/ports/consent-grant-repository.js';
export type {
  ConsentPolicyPinRequest,
  ConsentPolicyPinSource,
} from './application/ports/policy-pin-source.js';
export type {
  ProcessingBasisRepository,
  ReconsentEvaluationRepository,
} from './application/ports/reconsent-evaluation-repository.js';
export type {
  EffectiveEntityResolution,
  OperatingEntityDirectory,
} from './application/ports/operating-entity-directory.js';
export {
  InvalidConsentInputError,
  type AmbiguousJurisdiction,
  type AuditAppendFailed,
  type ConsentRequired,
  type DocumentContentIntegrityMismatch,
  type DocumentContentUnavailable,
  type DocumentNotApplicable,
  type EvaluationMismatch,
  type GrantNotActive,
  type NoEffectiveEntity,
  type NotFound,
  type PurposeNotCovered,
  type StoreFailure,
  type UnclassifiedPublicationBlocked,
  type VersionImmutable,
  type VersionNotPublished,
} from './application/errors.js';
export { ConsentAuditTrail, type AuditEntry } from './application/audit-trail.js';

export {
  ClassifyDocumentVersion,
  CreateLegalDocument,
  DraftDocumentVersion,
  PublishDocumentVersion,
  type ClassifyDocumentVersionError,
  type ClassifyDocumentVersionInput,
  type CreateLegalDocumentInput,
  type DraftDocumentVersionInput,
  type LegalDocumentError,
  type PublishDocumentVersionError,
  type PublishDocumentVersionInput,
} from './application/use-cases/legal-documents.js';
export {
  DeclareProcessingBasisReference,
  RecordReconsentEvaluation,
  type DeclareProcessingBasisReferenceError,
  type DeclareProcessingBasisReferenceInput,
  type RecordReconsentEvaluationError,
  type RecordReconsentEvaluationInput,
} from './application/use-cases/reconsent.js';
export {
  AssertConsentFor,
  GetOwnConsentStatus,
  ListApplicableDocuments,
  RecordOwnAcceptance,
  WithdrawOwnConsent,
  type ApplicableDocument,
  type AssertConsentForError,
  type AssertConsentForInput,
  type GetOwnConsentStatusError,
  type GetOwnConsentStatusInput,
  type ListApplicableDocumentsError,
  type ListApplicableDocumentsInput,
  type OwnConsentStatus,
  type RecordOwnAcceptanceError,
  type RecordOwnAcceptanceInput,
  type WithdrawOwnConsentError,
  type WithdrawOwnConsentInput,
} from './application/use-cases/consent.js';

export {
  GetLegalDocumentContent,
  type GetLegalDocumentContentError,
  type GetLegalDocumentContentInput,
  type LegalDocumentContentView,
} from './application/use-cases/legal-document-content.js';

export {
  ConsentApiModule,
} from './presentation/consent-api.module.js';
export { ConsentDocumentContentApiModule } from './presentation/document-content-api.module.js';
export {
  CONSENT_ENDPOINT_USE_CASES,
  ConsentController,
  type ConsentEndpointUseCases,
  type RecordAcceptanceBody,
  type WithdrawConsentBody,
} from './presentation/consent.controller.js';
export {
  CONSENT_DOCUMENT_CONTENT_USE_CASES,
  ConsentDocumentContentController,
  type ConsentDocumentContentUseCases,
} from './presentation/document-content.controller.js';
export { requirePrincipal, type RequestPrincipal } from './presentation/principal.js';
