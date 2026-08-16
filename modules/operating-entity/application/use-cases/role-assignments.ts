/**
 * DataProtectionRoleAssignment lifecycle: create, end (effective_to), and
 * the temporal resolution query — who acts in which role for (entity,
 * tenant, purpose, jurisdiction) at an instant (ADR-0024: per relationship,
 * never per entity). Rows are stored legal decisions; ending + inserting a
 * successor is the only correction path, mirrored by the schema's guard
 * trigger.
 */

import { Result, type TenantId } from '@karar/shared-kernel';

import type { OperatingEntityId } from '../../domain/operating-entity.js';
import {
  DATA_PROTECTION_ROLES,
  type DataProtectionRole,
  type DataProtectionRoleAssignment,
} from '../../domain/role-assignment.js';
import { JurisdictionRef, PurposeRef } from '../../domain/refs.js';
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
import type {
  OperatingEntityRepository,
  RoleAssignmentQuery,
  RoleAssignmentRepository,
} from '../ports/repositories.js';
import {
  ENTITY_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from '../ports/policy-service.js';

export type RoleAssignmentError = AuthorizationDenied | NotFound | StoreFailure | AuditAppendFailed;

export interface CreateRoleAssignmentInput {
  readonly principal: PolicyPrincipal;
  readonly operatingEntityId: OperatingEntityId;
  readonly tenantId: TenantId | null;
  readonly purposeRef: string;
  readonly jurisdictionRef: string;
  readonly role: DataProtectionRole;
  readonly effectiveFrom: Date;
  readonly contractReference?: string | null;
  readonly now: Date;
}

export class CreateRoleAssignment {
  constructor(
    private readonly assignments: RoleAssignmentRepository,
    private readonly entities: OperatingEntityRepository,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: EntityAuditTrail,
  ) {}

  async execute(
    input: CreateRoleAssignmentInput,
  ): Promise<Result<DataProtectionRoleAssignment, RoleAssignmentError>> {
    if (!DATA_PROTECTION_ROLES.includes(input.role)) {
      throw new InvalidOperatingEntityInputError(
        `role must be one of ${DATA_PROTECTION_ROLES.join(', ')}, got '${String(input.role)}'`,
      );
    }
    const authorized = await this.policy.authorize(input.principal, ENTITY_PERMISSIONS.manageEntity);
    if (!authorized.ok) {
      return authorized;
    }
    let entity;
    try {
      entity = await this.entities.findById(input.operatingEntityId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (entity === null) {
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'operating_entity',
        id: input.operatingEntityId,
      });
    }
    const assignment: DataProtectionRoleAssignment = Object.freeze({
      id: this.ids.nextId(),
      operatingEntityId: input.operatingEntityId,
      tenantId: input.tenantId,
      purposeRef: PurposeRef.of(input.purposeRef),
      jurisdictionRef: JurisdictionRef.of(input.jurisdictionRef),
      role: input.role,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
      contractReference: input.contractReference ?? null,
      createdBy: requireNonEmpty('principalRef', input.principal.principalRef),
      createdAt: input.now,
    });
    try {
      await this.assignments.insert(assignment);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'entity.role_assignment.created',
      resourceType: 'data_protection_role_assignment',
      resourceId: assignment.id,
      afterMetadata: {
        operatingEntityId: input.operatingEntityId,
        tenantId: input.tenantId,
        purposeRef: assignment.purposeRef,
        jurisdictionRef: assignment.jurisdictionRef,
        role: assignment.role,
      },
    });
    return audited.ok ? Result.ok(assignment) : audited;
  }
}

export interface EndRoleAssignmentInput {
  readonly principal: PolicyPrincipal;
  readonly assignmentId: string;
  readonly effectiveTo: Date;
  readonly reason: string;
  readonly now: Date;
}

export class EndRoleAssignment {
  constructor(
    private readonly assignments: RoleAssignmentRepository,
    private readonly policy: PolicyService,
    private readonly audit: EntityAuditTrail,
  ) {}

  async execute(input: EndRoleAssignmentInput): Promise<Result<void, RoleAssignmentError>> {
    requireNonEmpty('reason', input.reason);
    const authorized = await this.policy.authorize(input.principal, ENTITY_PERMISSIONS.manageEntity);
    if (!authorized.ok) {
      return authorized;
    }
    let before;
    try {
      before = await this.assignments.findById(input.assignmentId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (before === null) {
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'data_protection_role_assignment',
        id: input.assignmentId,
      });
    }
    try {
      await this.assignments.end(input.assignmentId, input.effectiveTo);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'entity.role_assignment.ended',
      resourceType: 'data_protection_role_assignment',
      resourceId: input.assignmentId,
      reason: input.reason,
      beforeMetadata: { role: before.role, effectiveTo: null },
      afterMetadata: { role: before.role, effectiveTo: input.effectiveTo.toISOString() },
    });
    return audited.ok ? Result.ok(undefined) : audited;
  }
}

export interface QueryRoleAssignmentsInput {
  readonly principal: PolicyPrincipal;
  readonly query: RoleAssignmentQuery;
}

export type QueryRoleAssignmentsError = AuthorizationDenied | StoreFailure;

/**
 * The temporal resolution query (ADR-0024): which role does this entity hold
 * for this tenant, purpose, and jurisdiction, at this instant. `activeAt`
 * bounds the effective window; omitting it returns full history.
 */
export class QueryRoleAssignments {
  constructor(
    private readonly assignments: RoleAssignmentRepository,
    private readonly policy: PolicyService,
  ) {}

  async execute(
    input: QueryRoleAssignmentsInput,
  ): Promise<Result<ReadonlyArray<DataProtectionRoleAssignment>, QueryRoleAssignmentsError>> {
    const authorized = await this.policy.authorize(input.principal, ENTITY_PERMISSIONS.manageEntity);
    if (!authorized.ok) {
      return authorized;
    }
    try {
      return Result.ok(await this.assignments.query(input.query));
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
  }
}
