/**
 * The subject-facing consent flows (§49): record OWN acceptance, withdraw
 * OWN consent, read OWN status, list applicable documents — plus the
 * fail-closed `AssertConsentFor` helper other modules call before
 * consent-based processing.
 *
 * OWN means own: every flow takes the authenticated principal, the grant
 * repository runs under that principal's RLS context, and there is
 * deliberately NO admin-accepts-for-customer path in this module — absent
 * by design, recorded in MODULE.md (permissions deliberately absent).
 *
 * Acceptance pins the operating entity FROM THE DOCUMENT being accepted
 * (which must be the entity effective for the principal), the exact version
 * id, and the jurisdiction — the (entity, purpose, jurisdiction) triple is
 * how consent is later RESOLVED (ADR-0024). Withdrawal preserves the row;
 * re-granting inserts a new one.
 */

import { Result } from '@karar/shared-kernel';

import type { ConsentGrant, ConsentPolicyPin } from '../../domain/consent-grant.js';
import {
  documentCoversPurpose,
  type LegalDocument,
  type LegalDocumentVersion,
} from '../../domain/legal-document.js';
import {
  resolveConsentStatus,
  statusPermitsProcessing,
  type ConsentStatusView,
} from '../../domain/consent-status.js';
import { JurisdictionRef, PurposeRef } from '../../domain/refs.js';
import {
  requireNonEmpty,
  toStoreFailure,
  type AmbiguousJurisdiction,
  type AuditAppendFailed,
  type ConsentRequired,
  type DocumentNotApplicable,
  type GrantNotActive,
  type NoEffectiveEntity,
  type NotFound,
  type PurposeNotCovered,
  type StoreFailure,
  type VersionNotPublished,
} from '../errors.js';
import { ConsentAuditTrail } from '../audit-trail.js';
import type { IdSource } from '../ports/id-source.js';
import type {
  ConsentGrantRepository,
  ConsentPrincipal,
} from '../ports/consent-grant-repository.js';
import type { LegalDocumentRepository } from '../ports/legal-document-repository.js';
import type { OperatingEntityDirectory } from '../ports/operating-entity-directory.js';

export interface RecordOwnAcceptanceInput {
  readonly principal: ConsentPrincipal;
  readonly legalDocumentVersionId: string;
  readonly purposeRef: string;
  /** Evidence of the acceptance act (request/session reference). */
  readonly evidenceReference: string;
  /**
   * The resolved policy provenance to pin (data-model.md §5). Supplied by the
   * caller from the EffectivePolicy it already resolved: this module reads no
   * pack and runs no resolver, so a pin it was not given is a pin it will not
   * invent — and the schema refuses an unpinned grant outright.
   */
  readonly policyPin: ConsentPolicyPin;
  readonly now: Date;
}

export type RecordOwnAcceptanceError =
  | NotFound
  | VersionNotPublished
  | PurposeNotCovered
  | DocumentNotApplicable
  | NoEffectiveEntity
  | StoreFailure
  | AuditAppendFailed;

export class RecordOwnAcceptance {
  constructor(
    private readonly grants: ConsentGrantRepository,
    private readonly documents: LegalDocumentRepository,
    private readonly directory: OperatingEntityDirectory,
    private readonly ids: IdSource,
    private readonly audit: ConsentAuditTrail,
  ) {}

  async execute(
    input: RecordOwnAcceptanceInput,
  ): Promise<Result<ConsentGrant, RecordOwnAcceptanceError>> {
    const purposeRef = PurposeRef.of(input.purposeRef);
    requireNonEmpty('evidenceReference', input.evidenceReference);
    const policyPackVersion = requireNonEmpty(
      'policyPin.policyPackVersion',
      input.policyPin.policyPackVersion,
    );
    const selectionVersion =
      input.policyPin.subjectPolicySelectionVersion === null
        ? null
        : requireNonEmpty(
            'policyPin.subjectPolicySelectionVersion',
            input.policyPin.subjectPolicySelectionVersion,
          );

    let version: LegalDocumentVersion | null;
    let document: LegalDocument | null;
    try {
      version = await this.documents.findVersionById(input.legalDocumentVersionId);
      document =
        version === null ? null : await this.documents.findDocumentById(version.documentId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (version === null || document === null) {
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'legal_document_version',
        id: input.legalDocumentVersionId,
      });
    }
    if (version.publishedAt === null) {
      return Result.err({
        kind: 'VERSION_NOT_PUBLISHED',
        versionId: version.id,
        message: `version ${version.id} is not published; only published versions can be accepted`,
      });
    }
    if (!documentCoversPurpose(document, purposeRef)) {
      return Result.err({
        kind: 'PURPOSE_NOT_COVERED',
        documentId: document.id,
        purposeRef,
        message: `document ${document.id} does not cover purpose '${purposeRef}'`,
      });
    }
    const resolved = await this.directory.resolveEffectiveEntity(
      input.principal.tenantId,
      input.principal.userId,
      input.now,
    );
    if (!resolved.ok) {
      return resolved;
    }
    if (resolved.value.entityId !== document.entityId) {
      // Consent to Entity A is not consent to Entity B: accepting another
      // entity's document would mint a grant no resolution would ever match.
      return Result.err({
        kind: 'DOCUMENT_NOT_APPLICABLE',
        documentId: document.id,
        documentEntityId: document.entityId,
        effectiveEntityId: resolved.value.entityId,
        message: `document ${document.id} belongs to entity ${document.entityId}, but entity ${resolved.value.entityId} is effective for this principal`,
      });
    }
    const grant: ConsentGrant = Object.freeze({
      id: this.ids.nextId(),
      userId: input.principal.userId,
      tenantId: input.principal.tenantId,
      operatingEntityId: document.entityId, // pinned at creation, forever
      jurisdictionRef: document.jurisdictionRef,
      purposeRef,
      consentVersion: version.version,
      legalDocumentVersionId: version.id,
      grantedAt: input.now,
      withdrawnAt: null,
      status: 'ACTIVE' as const,
      evidenceReference: input.evidenceReference,
      // Pinned at creation, forever. An absent selection is recorded as the
      // declared NOT_APPLICABLE case, not as an unexplained NULL.
      policyPackVersion,
      policyPackPinState: 'PINNED' as const,
      subjectPolicySelectionVersion: selectionVersion,
      subjectPolicySelectionPinState:
        selectionVersion === null ? ('NOT_APPLICABLE' as const) : ('PINNED' as const),
    });
    let supersededIds: ReadonlyArray<string>;
    try {
      ({ supersededIds } = await this.grants.recordAcceptance(input.principal, grant));
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.userId,
      tenantRef: input.principal.tenantId,
      action: 'consent.grant.recorded',
      resourceType: 'consent_grant',
      resourceId: grant.id,
      beforeMetadata: { supersededGrantIds: supersededIds.join(',') || null },
      afterMetadata: {
        operatingEntityId: grant.operatingEntityId,
        purposeRef: grant.purposeRef,
        jurisdictionRef: grant.jurisdictionRef,
        consentVersion: grant.consentVersion,
        legalDocumentVersionId: grant.legalDocumentVersionId,
        policyPackVersion: grant.policyPackVersion,
        subjectPolicySelectionVersion: grant.subjectPolicySelectionVersion,
        subjectPolicySelectionPinState: grant.subjectPolicySelectionPinState,
      },
    });
    return audited.ok ? Result.ok(grant) : audited;
  }
}

export interface WithdrawOwnConsentInput {
  readonly principal: ConsentPrincipal;
  readonly grantId: string;
  readonly now: Date;
}

export type WithdrawOwnConsentError = NotFound | GrantNotActive | StoreFailure | AuditAppendFailed;

export class WithdrawOwnConsent {
  constructor(
    private readonly grants: ConsentGrantRepository,
    private readonly audit: ConsentAuditTrail,
  ) {}

  async execute(
    input: WithdrawOwnConsentInput,
  ): Promise<Result<ConsentGrant, WithdrawOwnConsentError>> {
    let grant;
    try {
      // RLS scopes the lookup to the principal's own rows: another subject's
      // grant id resolves to NOT_FOUND, indistinguishable from absence.
      grant = await this.grants.findById(input.principal, input.grantId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (grant === null) {
      return Result.err({ kind: 'NOT_FOUND', resource: 'consent_grant', id: input.grantId });
    }
    if (grant.status !== 'ACTIVE') {
      return Result.err({
        kind: 'GRANT_NOT_ACTIVE',
        grantId: grant.id,
        status: grant.status,
        message: `grant ${grant.id} is ${grant.status}; only an ACTIVE grant can be withdrawn (re-granting creates a new row)`,
      });
    }
    try {
      await this.grants.withdraw(input.principal, input.grantId, input.now);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.userId,
      tenantRef: input.principal.tenantId,
      action: 'consent.grant.withdrawn',
      resourceType: 'consent_grant',
      resourceId: grant.id,
      beforeMetadata: { status: 'ACTIVE' },
      afterMetadata: {
        status: 'WITHDRAWN',
        withdrawnAt: input.now.toISOString(),
        purposeRef: grant.purposeRef,
      },
    });
    return audited.ok
      ? Result.ok({ ...grant, status: 'WITHDRAWN' as const, withdrawnAt: input.now })
      : audited;
  }
}

export interface GetOwnConsentStatusInput {
  readonly principal: ConsentPrincipal;
  readonly purposeRef: string;
  /** Required only when documents for several jurisdictions cover the purpose. */
  readonly jurisdictionRef?: string;
  readonly now: Date;
}

export interface OwnConsentStatus extends ConsentStatusView {
  readonly purposeRef: string;
  readonly jurisdictionRef: string | null;
  readonly operatingEntityId: string;
  readonly documentId: string | null;
}

export type GetOwnConsentStatusError =
  | NoEffectiveEntity
  | AmbiguousJurisdiction
  | StoreFailure;

export class GetOwnConsentStatus {
  constructor(
    private readonly grants: ConsentGrantRepository,
    private readonly documents: LegalDocumentRepository,
    private readonly directory: OperatingEntityDirectory,
  ) {}

  async execute(
    input: GetOwnConsentStatusInput,
  ): Promise<Result<OwnConsentStatus, GetOwnConsentStatusError>> {
    const purposeRef = PurposeRef.of(input.purposeRef);
    const resolved = await this.directory.resolveEffectiveEntity(
      input.principal.tenantId,
      input.principal.userId,
      input.now,
    );
    if (!resolved.ok) {
      return resolved;
    }
    const entityId = resolved.value.entityId;
    // Neutral local name: an optional-scope presence check is a lookup filter,
    // not a jurisdiction behaviour branch (architecture test 12).
    const scopeRef = input.jurisdictionRef;
    let candidates;
    try {
      candidates = await this.documents.findDocumentsCoveringPurpose(
        entityId,
        purposeRef,
        scopeRef === undefined ? undefined : JurisdictionRef.of(scopeRef),
      );
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (candidates.length > 1) {
      return Result.err({
        kind: 'AMBIGUOUS_JURISDICTION',
        purposeRef,
        jurisdictionRefs: candidates.map((d) => d.jurisdictionRef),
        message: `purpose '${purposeRef}' is covered by more than one document; name a jurisdiction to disambiguate — resolution refuses to guess (fails closed)`,
      });
    }
    const document = candidates[0] ?? null;
    if (document === null) {
      // No published disclosure exists for this purpose: fail closed
      // (MODULE.md — the inversion of legacy AI-5, which fails open).
      return Result.ok({
        state: 'NO_GRANT',
        noticeRequired: false,
        grantId: null,
        grantedVersion: null,
        effectiveVersionId: null,
        effectiveVersion: null,
        purposeRef,
        jurisdictionRef: input.jurisdictionRef ?? null,
        operatingEntityId: entityId,
        documentId: null,
      });
    }
    try {
      const effectiveVersion = await this.documents.currentEffectiveVersion(
        document.id,
        input.now,
      );
      const grant = await this.grants.latestResolutionGrant(
        input.principal,
        entityId,
        purposeRef,
        document.jurisdictionRef,
      );
      const grantedVersion =
        grant === null ? null : await this.documents.findVersionById(grant.legalDocumentVersionId);
      const view = resolveConsentStatus({
        grant,
        grantedVersionEffectiveAt: grantedVersion?.effectiveAt ?? null,
        effectiveVersion,
      });
      return Result.ok({
        ...view,
        purposeRef,
        jurisdictionRef: document.jurisdictionRef,
        operatingEntityId: entityId,
        documentId: document.id,
      });
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
  }
}

export interface ListApplicableDocumentsInput {
  readonly principal: ConsentPrincipal;
  readonly jurisdictionRef?: string;
  readonly now: Date;
}

export interface ApplicableDocument {
  readonly document: LegalDocument;
  /** The version a subject would accept now; null while nothing is in force. */
  readonly effectiveVersion: LegalDocumentVersion | null;
}

export type ListApplicableDocumentsError = NoEffectiveEntity | StoreFailure;

export class ListApplicableDocuments {
  constructor(
    private readonly documents: LegalDocumentRepository,
    private readonly directory: OperatingEntityDirectory,
  ) {}

  async execute(
    input: ListApplicableDocumentsInput,
  ): Promise<Result<ReadonlyArray<ApplicableDocument>, ListApplicableDocumentsError>> {
    const resolved = await this.directory.resolveEffectiveEntity(
      input.principal.tenantId,
      input.principal.userId,
      input.now,
    );
    if (!resolved.ok) {
      return resolved;
    }
    // Neutral local name: presence check only (architecture test 12).
    const scopeRef = input.jurisdictionRef;
    try {
      const documents = await this.documents.listDocuments(
        resolved.value.entityId,
        scopeRef === undefined ? undefined : JurisdictionRef.of(scopeRef),
      );
      const applicable: ApplicableDocument[] = [];
      for (const document of documents) {
        const effectiveVersion = await this.documents.currentEffectiveVersion(
          document.id,
          input.now,
        );
        applicable.push({ document, effectiveVersion });
      }
      return Result.ok(applicable);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
  }
}

export interface AssertConsentForInput {
  readonly principal: ConsentPrincipal;
  readonly purposeRef: string;
  readonly jurisdictionRef?: string;
  readonly now: Date;
}

export type AssertConsentForError = ConsentRequired | GetOwnConsentStatusError;

/**
 * The fail-closed gate other modules call before consent-based processing:
 * anything but an ACTIVE grant — no grant, withdrawn, outstanding material
 * re-consent, no published document, unresolvable entity — is a typed
 * denial. Consent is one basis among several (ADR-0024); which purposes are
 * consent-based is the PolicyPack's declaration, resolved in Phase 3.5 —
 * this helper asserts the consent dimension it owns.
 */
export class AssertConsentFor {
  constructor(private readonly status: GetOwnConsentStatus) {}

  async execute(input: AssertConsentForInput): Promise<Result<void, AssertConsentForError>> {
    const status = await this.status.execute(input);
    if (!status.ok) {
      return status;
    }
    if (!statusPermitsProcessing(status.value.state)) {
      return Result.err({
        kind: 'CONSENT_REQUIRED',
        state: status.value.state,
        purposeRef: input.purposeRef,
        jurisdictionRef: status.value.jurisdictionRef,
        message: `consent for purpose '${input.purposeRef}' is ${status.value.state}; processing is not permitted (fails closed)`,
      });
    }
    return Result.ok(undefined);
  }
}

/** Re-exported so consumers of these flows name the same principal shape and
 * the same policy-pin input. */
export type { ConsentPolicyPin, ConsentPrincipal };
