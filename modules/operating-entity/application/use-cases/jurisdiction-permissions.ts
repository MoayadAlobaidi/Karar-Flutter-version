/**
 * Jurisdiction permission windows for an entity: where it may lawfully
 * contract/operate, per a recorded basis reference (ADR-0024). Windows are
 * granted and ENDED — never edited, never deleted (the schema's guard
 * discipline is end-only for legal records).
 */

import { Result } from '@karar/shared-kernel';

import type {
  EntityJurisdictionPermission,
  OperatingEntityId,
} from '../../domain/operating-entity.js';
import { JurisdictionRef } from '../../domain/refs.js';
import {
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

export interface GrantJurisdictionPermissionInput {
  readonly principal: PolicyPrincipal;
  readonly entityId: OperatingEntityId;
  readonly jurisdictionRef: string;
  readonly permittedFrom: Date;
  readonly basisReference: string;
  readonly now: Date;
}

export type JurisdictionPermissionError =
  | AuthorizationDenied
  | NotFound
  | StoreFailure
  | AuditAppendFailed;

export class GrantJurisdictionPermission {
  constructor(
    private readonly entities: OperatingEntityRepository,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: EntityAuditTrail,
  ) {}

  async execute(
    input: GrantJurisdictionPermissionInput,
  ): Promise<Result<EntityJurisdictionPermission, JurisdictionPermissionError>> {
    const authorized = await this.policy.authorize(input.principal, ENTITY_PERMISSIONS.manageEntity);
    if (!authorized.ok) {
      return authorized;
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
    const permission: EntityJurisdictionPermission = Object.freeze({
      id: this.ids.nextId(),
      entityId: input.entityId,
      jurisdictionRef: JurisdictionRef.of(input.jurisdictionRef),
      permittedFrom: input.permittedFrom,
      permittedTo: null,
      basisReference: requireNonEmpty('basisReference', input.basisReference),
    });
    try {
      await this.entities.insertJurisdictionPermission({
        ...permission,
        createdAt: input.now,
        updatedAt: input.now,
      });
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'entity.jurisdiction_permission.granted',
      resourceType: 'entity_jurisdiction_permission',
      resourceId: permission.id,
      afterMetadata: {
        entityId: input.entityId,
        jurisdictionRef: permission.jurisdictionRef,
        basisReference: permission.basisReference,
      },
    });
    return audited.ok ? Result.ok(permission) : audited;
  }
}

export interface EndJurisdictionPermissionInput {
  readonly principal: PolicyPrincipal;
  readonly permissionId: string;
  readonly permittedTo: Date;
  readonly reason: string;
  readonly now: Date;
}

export class EndJurisdictionPermission {
  constructor(
    private readonly entities: OperatingEntityRepository,
    private readonly policy: PolicyService,
    private readonly audit: EntityAuditTrail,
  ) {}

  async execute(
    input: EndJurisdictionPermissionInput,
  ): Promise<Result<void, JurisdictionPermissionError>> {
    requireNonEmpty('reason', input.reason);
    const authorized = await this.policy.authorize(input.principal, ENTITY_PERMISSIONS.manageEntity);
    if (!authorized.ok) {
      return authorized;
    }
    try {
      await this.entities.endJurisdictionPermission(input.permissionId, input.permittedTo);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'entity.jurisdiction_permission.ended',
      resourceType: 'entity_jurisdiction_permission',
      resourceId: input.permissionId,
      reason: input.reason,
      afterMetadata: { permittedTo: input.permittedTo.toISOString() },
    });
    return audited.ok ? Result.ok(undefined) : audited;
  }
}
