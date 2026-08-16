/**
 * Entity register CRUD-lite: create, read, change status. Platform-operator
 * work, authorized through the PolicyService port on `entity.entity.manage`
 * (MODULE.md) — HTTP for this surface is deliberately deferred to the
 * control-plane phase (ADR-0021; decision recorded in MODULE.md).
 */

import { Result } from '@karar/shared-kernel';

import {
  OPERATING_ENTITY_STATUSES,
  type OperatingEntity,
  type OperatingEntityId,
  type OperatingEntityStatus,
} from '../../domain/operating-entity.js';
import { JurisdictionRef } from '../../domain/refs.js';
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
import type { OperatingEntityRepository } from '../ports/repositories.js';
import {
  ENTITY_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from '../ports/policy-service.js';

export interface CreateOperatingEntityInput {
  readonly principal: PolicyPrincipal;
  readonly legalName: string;
  readonly registrationNumber: string;
  readonly registeredJurisdictionRef: string;
  readonly contractingCapacity: boolean;
  readonly dataProtectionContact: string;
  readonly now: Date;
}

export type CreateOperatingEntityError = AuthorizationDenied | StoreFailure | AuditAppendFailed;

export class CreateOperatingEntity {
  constructor(
    private readonly entities: OperatingEntityRepository,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: EntityAuditTrail,
  ) {}

  async execute(
    input: CreateOperatingEntityInput,
  ): Promise<Result<OperatingEntity, CreateOperatingEntityError>> {
    const authorized = await this.policy.authorize(input.principal, ENTITY_PERMISSIONS.manageEntity);
    if (!authorized.ok) {
      return authorized;
    }
    const entity: OperatingEntity = Object.freeze({
      id: this.ids.nextId() as OperatingEntityId,
      legalName: requireNonEmpty('legalName', input.legalName),
      registrationNumber: requireNonEmpty('registrationNumber', input.registrationNumber),
      registeredJurisdictionRef: JurisdictionRef.of(input.registeredJurisdictionRef),
      contractingCapacity: input.contractingCapacity,
      dataProtectionContact: requireNonEmpty('dataProtectionContact', input.dataProtectionContact),
      status: 'ACTIVE' as const,
      createdAt: input.now,
      updatedAt: input.now,
    });
    try {
      await this.entities.insert(entity);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'entity.entity.created',
      resourceType: 'operating_entity',
      resourceId: entity.id,
      afterMetadata: { legalName: entity.legalName, status: entity.status },
    });
    return audited.ok ? Result.ok(entity) : audited;
  }
}

export interface GetOperatingEntityInput {
  readonly principal: PolicyPrincipal;
  readonly entityId: OperatingEntityId;
}

export type GetOperatingEntityError = AuthorizationDenied | NotFound | StoreFailure;

export class GetOperatingEntity {
  constructor(
    private readonly entities: OperatingEntityRepository,
    private readonly policy: PolicyService,
  ) {}

  async execute(
    input: GetOperatingEntityInput,
  ): Promise<Result<OperatingEntity, GetOperatingEntityError>> {
    const authorized = await this.policy.authorize(input.principal, ENTITY_PERMISSIONS.manageEntity);
    if (!authorized.ok) {
      return authorized;
    }
    try {
      const entity = await this.entities.findById(input.entityId);
      if (entity === null) {
        return Result.err({ kind: 'NOT_FOUND', resource: 'operating_entity', id: input.entityId });
      }
      return Result.ok(entity);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
  }
}

export interface UpdateOperatingEntityStatusInput {
  readonly principal: PolicyPrincipal;
  readonly entityId: OperatingEntityId;
  readonly status: OperatingEntityStatus;
  readonly reason: string;
  readonly now: Date;
}

export type UpdateOperatingEntityStatusError =
  | AuthorizationDenied
  | NotFound
  | StoreFailure
  | AuditAppendFailed;

export class UpdateOperatingEntityStatus {
  constructor(
    private readonly entities: OperatingEntityRepository,
    private readonly policy: PolicyService,
    private readonly audit: EntityAuditTrail,
  ) {}

  async execute(
    input: UpdateOperatingEntityStatusInput,
  ): Promise<Result<OperatingEntity, UpdateOperatingEntityStatusError>> {
    if (!OPERATING_ENTITY_STATUSES.includes(input.status)) {
      throw new InvalidOperatingEntityInputError(
        `status must be one of ${OPERATING_ENTITY_STATUSES.join(', ')}, got '${String(input.status)}'`,
      );
    }
    requireNonEmpty('reason', input.reason);
    const authorized = await this.policy.authorize(input.principal, ENTITY_PERMISSIONS.manageEntity);
    if (!authorized.ok) {
      return authorized;
    }
    let before: OperatingEntity | null;
    try {
      before = await this.entities.findById(input.entityId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (before === null) {
      return Result.err({ kind: 'NOT_FOUND', resource: 'operating_entity', id: input.entityId });
    }
    try {
      await this.entities.updateStatus(input.entityId, input.status, input.now);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'entity.entity.status_changed',
      resourceType: 'operating_entity',
      resourceId: input.entityId,
      reason: input.reason,
      beforeMetadata: { status: before.status },
      afterMetadata: { status: input.status },
    });
    return audited.ok
      ? Result.ok({ ...before, status: input.status, updatedAt: input.now })
      : audited;
  }
}
