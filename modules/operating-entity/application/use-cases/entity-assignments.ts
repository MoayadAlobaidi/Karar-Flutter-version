/**
 * Entity bindings: set the tenant default entity, set a user's contracting
 * entity, and resolve the effective entity for a principal. FORWARD-BINDING
 * ONLY (ADR-0024 §4): setting an assignment ends the open row and inserts a
 * successor; records that pinned their entity at creation — consent grants
 * pin operatingEntityId explicitly in this phase — keep the entity they
 * were created under, forever.
 */

import { Result, type TenantId, type UserId } from '@karar/shared-kernel';

import type { OperatingEntityId } from '../../domain/operating-entity.js';
import type {
  AssignmentScope,
  OperatingEntityAssignment,
} from '../../domain/entity-assignment.js';
import {
  toStoreFailure,
  type AuditAppendFailed,
  type NotFound,
  type StoreFailure,
} from '../errors.js';
import { EntityAuditTrail } from '../audit-trail.js';
import type { IdSource } from '../ports/id-source.js';
import type {
  EntityAssignmentRepository,
  OperatingEntityRepository,
} from '../ports/repositories.js';
import {
  ENTITY_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from '../ports/policy-service.js';

export type SetAssignmentError = AuthorizationDenied | NotFound | StoreFailure | AuditAppendFailed;

interface SetAssignmentParams {
  readonly principal: PolicyPrincipal;
  readonly scope: AssignmentScope;
  readonly tenantId: TenantId | null;
  readonly userId: UserId | null;
  readonly entityId: OperatingEntityId;
  readonly effectiveFrom: Date;
  readonly now: Date;
}

/**
 * Shared mechanics: authorize, verify the entity exists, end any open
 * assignment for the same scope + subject, insert the successor, audit.
 * Deliberately NOT retroactive: prior windows and pinned records stay put.
 */
abstract class SetAssignmentBase {
  constructor(
    protected readonly assignments: EntityAssignmentRepository,
    protected readonly entities: OperatingEntityRepository,
    protected readonly policy: PolicyService,
    protected readonly ids: IdSource,
    protected readonly audit: EntityAuditTrail,
  ) {}

  protected async set(
    params: SetAssignmentParams,
  ): Promise<Result<OperatingEntityAssignment, SetAssignmentError>> {
    const authorized = await this.policy.authorize(
      params.principal,
      ENTITY_PERMISSIONS.manageEntity,
    );
    if (!authorized.ok) {
      return authorized;
    }
    let entity;
    try {
      entity = await this.entities.findById(params.entityId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (entity === null) {
      return Result.err({ kind: 'NOT_FOUND', resource: 'operating_entity', id: params.entityId });
    }
    const subject = {
      ...(params.tenantId === null ? {} : { tenantId: params.tenantId }),
      ...(params.userId === null ? {} : { userId: params.userId }),
    };
    const assignment: OperatingEntityAssignment = Object.freeze({
      id: this.ids.nextId(),
      scope: params.scope,
      tenantId: params.tenantId,
      userId: params.userId,
      entityId: params.entityId,
      effectiveFrom: params.effectiveFrom,
      effectiveTo: null,
      createdBy: params.principal.principalRef,
      createdAt: params.now,
    });
    let endedIds: string[];
    try {
      const open = await this.assignments.findOpen(params.scope, subject);
      endedIds = open.map((o) => o.id);
      for (const openAssignment of open) {
        await this.assignments.end(openAssignment.id, params.effectiveFrom);
      }
      await this.assignments.insert(assignment);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: params.now,
      actorRef: params.principal.principalRef,
      tenantRef: params.tenantId,
      action: 'entity.assignment.set',
      resourceType: 'operating_entity_assignment',
      resourceId: assignment.id,
      beforeMetadata: { endedAssignments: endedIds.join(',') || null },
      afterMetadata: {
        scope: params.scope,
        entityId: params.entityId,
        userId: params.userId,
        effectiveFrom: params.effectiveFrom.toISOString(),
      },
    });
    return audited.ok ? Result.ok(assignment) : audited;
  }
}

export interface SetTenantDefaultEntityInput {
  readonly principal: PolicyPrincipal;
  readonly tenantId: TenantId;
  readonly entityId: OperatingEntityId;
  readonly effectiveFrom: Date;
  readonly now: Date;
}

export class SetTenantDefaultEntity extends SetAssignmentBase {
  async execute(
    input: SetTenantDefaultEntityInput,
  ): Promise<Result<OperatingEntityAssignment, SetAssignmentError>> {
    return this.set({
      principal: input.principal,
      scope: 'TENANT_DEFAULT',
      tenantId: input.tenantId,
      userId: null,
      entityId: input.entityId,
      effectiveFrom: input.effectiveFrom,
      now: input.now,
    });
  }
}

export interface SetUserContractingEntityInput {
  readonly principal: PolicyPrincipal;
  readonly userId: UserId;
  readonly tenantId: TenantId | null;
  readonly entityId: OperatingEntityId;
  readonly effectiveFrom: Date;
  readonly now: Date;
}

export class SetUserContractingEntity extends SetAssignmentBase {
  async execute(
    input: SetUserContractingEntityInput,
  ): Promise<Result<OperatingEntityAssignment, SetAssignmentError>> {
    return this.set({
      principal: input.principal,
      scope: 'USER_CONTRACTING',
      tenantId: input.tenantId,
      userId: input.userId,
      entityId: input.entityId,
      effectiveFrom: input.effectiveFrom,
      now: input.now,
    });
  }
}

export interface ResolveEffectiveOperatingEntityInput {
  readonly tenantId: TenantId;
  readonly userId: UserId | null;
  readonly at: Date;
}

export interface EffectiveOperatingEntity {
  readonly entityId: OperatingEntityId;
  /** Which binding produced the resolution. */
  readonly scope: AssignmentScope;
  readonly assignmentId: string;
}

/** No binding exists — an expected outcome the caller must handle. */
export interface NoEffectiveEntity {
  readonly kind: 'NO_EFFECTIVE_ENTITY';
  readonly message: string;
}

export type ResolveEffectiveEntityError = NoEffectiveEntity | StoreFailure;

/**
 * The forward resolution consumers use: the user's contracting entity if one
 * is bound, else the tenant's default entity. Unauthenticated-free and
 * unaudited by design — it is a read the consent module performs on every
 * status query. Returns an error, not a default, when nothing is bound:
 * an unresolvable entity fails closed downstream.
 */
export class ResolveEffectiveOperatingEntity {
  constructor(private readonly assignments: EntityAssignmentRepository) {}

  async execute(
    input: ResolveEffectiveOperatingEntityInput,
  ): Promise<Result<EffectiveOperatingEntity, ResolveEffectiveEntityError>> {
    try {
      if (input.userId !== null) {
        const contracting = await this.assignments.findActiveAt(
          'USER_CONTRACTING',
          { userId: input.userId },
          input.at,
        );
        const latest = newest(contracting);
        if (latest !== null) {
          return Result.ok({
            entityId: latest.entityId,
            scope: 'USER_CONTRACTING',
            assignmentId: latest.id,
          });
        }
      }
      const tenantDefault = await this.assignments.findActiveAt(
        'TENANT_DEFAULT',
        { tenantId: input.tenantId },
        input.at,
      );
      const latest = newest(tenantDefault);
      if (latest !== null) {
        return Result.ok({
          entityId: latest.entityId,
          scope: 'TENANT_DEFAULT',
          assignmentId: latest.id,
        });
      }
      return Result.err({
        kind: 'NO_EFFECTIVE_ENTITY',
        message: 'no operating entity is bound for this principal; consent and contracting fail closed',
      });
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
  }
}

function newest(
  assignments: ReadonlyArray<OperatingEntityAssignment>,
): OperatingEntityAssignment | null {
  let latest: OperatingEntityAssignment | null = null;
  for (const assignment of assignments) {
    if (latest === null || assignment.effectiveFrom.getTime() > latest.effectiveFrom.getTime()) {
      latest = assignment;
    }
  }
  return latest;
}
