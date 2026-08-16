/**
 * Licence record management with an honest vocabulary (ADR-0024): a licence
 * row NEVER implies a legal fact. The application layer repeats the schema's
 * honesty rule — EVIDENCED requires an evidence reference — so the defect
 * surfaces at the call site before the database refuses it.
 */

import { Result } from '@karar/shared-kernel';

import type { OperatingEntityId } from '../../domain/operating-entity.js';
import {
  ENTITY_LICENCE_STATUSES,
  licenceStatusRequiresEvidence,
  type EntityLicence,
  type EntityLicenceStatus,
} from '../../domain/entity-licence.js';
import {
  InvalidOperatingEntityInputError,
  requireNonEmpty,
  toStoreFailure,
  type AuditAppendFailed,
  type NotFound,
  type StoreFailure,
} from '../errors.js';
import { EntityAuditTrail } from '../audit-trail.js';
import type { IdSource } from '../ports/id-source.js';
import type { EntityLicenceRepository, OperatingEntityRepository } from '../ports/repositories.js';
import {
  ENTITY_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from '../ports/policy-service.js';

/** An expected refusal: the status asserts evidence the record does not hold. */
export interface EvidenceRequired {
  readonly kind: 'EVIDENCE_REQUIRED';
  readonly status: EntityLicenceStatus;
  readonly message: string;
}

export type LicenceRecordError =
  | AuthorizationDenied
  | NotFound
  | EvidenceRequired
  | StoreFailure
  | AuditAppendFailed;

function assertKnownStatus(status: EntityLicenceStatus): void {
  if (!ENTITY_LICENCE_STATUSES.includes(status)) {
    throw new InvalidOperatingEntityInputError(
      `licence status must be one of ${ENTITY_LICENCE_STATUSES.join(', ')}, got '${String(status)}'`,
    );
  }
}

function evidenceRefusal(status: EntityLicenceStatus): Result.Err<EvidenceRequired> {
  return Result.err({
    kind: 'EVIDENCE_REQUIRED',
    status,
    message: `licence status '${status}' asserts evidence on file; record the evidence reference or use CLAIMED_UNVERIFIED`,
  });
}

export interface RecordEntityLicenceInput {
  readonly principal: PolicyPrincipal;
  readonly entityId: OperatingEntityId;
  readonly licenceTypeRef: string;
  readonly status: EntityLicenceStatus;
  readonly sourceProvenance: string;
  readonly reviewOwner: string;
  readonly effectiveDate?: Date | null;
  readonly expiryDate?: Date | null;
  readonly evidenceReference?: string | null;
  readonly now: Date;
}

export class RecordEntityLicence {
  constructor(
    private readonly licences: EntityLicenceRepository,
    private readonly entities: OperatingEntityRepository,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: EntityAuditTrail,
  ) {}

  async execute(
    input: RecordEntityLicenceInput,
  ): Promise<Result<EntityLicence, LicenceRecordError>> {
    assertKnownStatus(input.status);
    const authorized = await this.policy.authorize(input.principal, ENTITY_PERMISSIONS.manageEntity);
    if (!authorized.ok) {
      return authorized;
    }
    const evidenceReference = input.evidenceReference ?? null;
    if (licenceStatusRequiresEvidence(input.status) && evidenceReference === null) {
      return evidenceRefusal(input.status);
    }
    let entity;
    try {
      entity = await this.entities.findById(input.entityId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (entity === null) {
      return Result.err({ kind: 'NOT_FOUND', resource: 'operating_entity', id: input.entityId });
    }
    const licence: EntityLicence = Object.freeze({
      id: this.ids.nextId(),
      entityId: input.entityId,
      licenceTypeRef: requireNonEmpty('licenceTypeRef', input.licenceTypeRef),
      status: input.status,
      sourceProvenance: requireNonEmpty('sourceProvenance', input.sourceProvenance),
      effectiveDate: input.effectiveDate ?? null,
      expiryDate: input.expiryDate ?? null,
      reviewOwner: requireNonEmpty('reviewOwner', input.reviewOwner),
      evidenceReference,
    });
    try {
      await this.licences.insert({ ...licence, createdAt: input.now, updatedAt: input.now });
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'entity.licence.recorded',
      resourceType: 'entity_licence',
      resourceId: licence.id,
      afterMetadata: {
        entityId: input.entityId,
        licenceTypeRef: licence.licenceTypeRef,
        status: licence.status,
        sourceProvenance: licence.sourceProvenance,
      },
    });
    return audited.ok ? Result.ok(licence) : audited;
  }
}

export interface UpdateEntityLicenceStatusInput {
  readonly principal: PolicyPrincipal;
  readonly licenceId: string;
  readonly status: EntityLicenceStatus;
  readonly evidenceReference?: string | null;
  readonly reason: string;
  readonly now: Date;
}

export class UpdateEntityLicenceStatus {
  constructor(
    private readonly licences: EntityLicenceRepository,
    private readonly policy: PolicyService,
    private readonly audit: EntityAuditTrail,
  ) {}

  async execute(
    input: UpdateEntityLicenceStatusInput,
  ): Promise<Result<void, LicenceRecordError>> {
    assertKnownStatus(input.status);
    requireNonEmpty('reason', input.reason);
    const authorized = await this.policy.authorize(input.principal, ENTITY_PERMISSIONS.manageEntity);
    if (!authorized.ok) {
      return authorized;
    }
    let before;
    try {
      before = await this.licences.findById(input.licenceId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (before === null) {
      return Result.err({ kind: 'NOT_FOUND', resource: 'entity_licence', id: input.licenceId });
    }
    const evidenceReference = input.evidenceReference ?? before.evidenceReference;
    if (licenceStatusRequiresEvidence(input.status) && evidenceReference === null) {
      return evidenceRefusal(input.status);
    }
    try {
      await this.licences.updateStatus(input.licenceId, input.status, evidenceReference, input.now);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'entity.licence.status_changed',
      resourceType: 'entity_licence',
      resourceId: input.licenceId,
      reason: input.reason,
      beforeMetadata: { status: before.status },
      afterMetadata: { status: input.status },
    });
    return audited.ok ? Result.ok(undefined) : audited;
  }
}
