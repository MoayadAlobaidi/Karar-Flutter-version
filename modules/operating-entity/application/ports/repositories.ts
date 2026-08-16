/**
 * Persistence ports for the operating-entity aggregates (declared inward,
 * architecture test 5). Implementations are Prisma repositories in
 * infrastructure/persistence; store failures propagate as exceptions and the
 * use cases convert them to `Result.err(StoreFailure)` so callers handle
 * them visibly.
 *
 * The guard rules the schema enforces by trigger (end-only updates,
 * terminal-migration immutability) are mirrored in the use cases; the ports
 * expose only the operations those rules permit — there is no `delete`
 * anywhere, deliberately.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type {
  EntityJurisdictionPermission,
  OperatingEntity,
  OperatingEntityId,
} from '../../domain/operating-entity.js';
import type { EntityLicence, EntityLicenceStatus } from '../../domain/entity-licence.js';
import type { DataProtectionRoleAssignment } from '../../domain/role-assignment.js';
import type {
  AssignmentScope,
  OperatingEntityAssignment,
} from '../../domain/entity-assignment.js';
import type { EntityMigration, EntityMigrationStatus } from '../../domain/entity-migration.js';
import type { JurisdictionRef, PurposeRef } from '../../domain/refs.js';

export interface OperatingEntityRepository {
  insert(entity: OperatingEntity): Promise<void>;
  findById(id: OperatingEntityId): Promise<OperatingEntity | null>;
  updateStatus(id: OperatingEntityId, status: OperatingEntity['status'], at: Date): Promise<void>;
  insertJurisdictionPermission(
    permission: EntityJurisdictionPermission & { readonly createdAt: Date; readonly updatedAt: Date },
  ): Promise<void>;
  listJurisdictionPermissions(
    entityId: OperatingEntityId,
  ): Promise<ReadonlyArray<EntityJurisdictionPermission>>;
  endJurisdictionPermission(permissionId: string, permittedTo: Date): Promise<void>;
}

export interface EntityLicenceRepository {
  insert(
    licence: EntityLicence & { readonly createdAt: Date; readonly updatedAt: Date },
  ): Promise<void>;
  findById(id: string): Promise<EntityLicence | null>;
  updateStatus(
    id: string,
    status: EntityLicenceStatus,
    evidenceReference: string | null,
    at: Date,
  ): Promise<void>;
  listByEntity(entityId: OperatingEntityId): Promise<ReadonlyArray<EntityLicence>>;
}

export interface RoleAssignmentQuery {
  readonly operatingEntityId?: OperatingEntityId;
  readonly tenantId?: TenantId | null;
  readonly purposeRef?: PurposeRef;
  readonly jurisdictionRef?: JurisdictionRef;
  /** Only assignments whose effective window covers this instant. */
  readonly activeAt?: Date;
}

export interface RoleAssignmentRepository {
  insert(assignment: DataProtectionRoleAssignment): Promise<void>;
  findById(id: string): Promise<DataProtectionRoleAssignment | null>;
  /** The only permitted update: setting effective_to on an open assignment. */
  end(id: string, effectiveTo: Date): Promise<void>;
  query(query: RoleAssignmentQuery): Promise<ReadonlyArray<DataProtectionRoleAssignment>>;
}

export interface EntityAssignmentRepository {
  insert(assignment: OperatingEntityAssignment): Promise<void>;
  /** The only permitted update: setting effective_to on an open assignment. */
  end(id: string, effectiveTo: Date): Promise<void>;
  /** Open (effective_to IS NULL) assignments for the scope + subject. */
  findOpen(
    scope: AssignmentScope,
    subject: { readonly tenantId?: TenantId; readonly userId?: UserId },
  ): Promise<ReadonlyArray<OperatingEntityAssignment>>;
  /** Assignments whose window covers `at`, for entity resolution. */
  findActiveAt(
    scope: AssignmentScope,
    subject: { readonly tenantId?: TenantId; readonly userId?: UserId },
    at: Date,
  ): Promise<ReadonlyArray<OperatingEntityAssignment>>;
}

export interface EntityMigrationRepository {
  insert(migration: EntityMigration): Promise<void>;
  findById(id: string): Promise<EntityMigration | null>;
  /** Advance status; links the evaluation / completion instant when given. */
  advance(
    id: string,
    to: EntityMigrationStatus,
    fields: {
      readonly reconsentEvaluationId?: string;
      readonly completedAt?: Date;
    },
  ): Promise<void>;
  listBySubject(subjectRef: string): Promise<ReadonlyArray<EntityMigration>>;
}
