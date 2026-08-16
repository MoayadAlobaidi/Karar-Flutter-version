/**
 * Prisma repositories for the operating-entity ports, over the platform's
 * sanctioned Prisma client (createPrismaClient — @prisma/adapter-pg on the
 * profile-built pg Pool, connected as karar_app). Prisma types stay inside
 * infrastructure/persistence (architecture test 4); the ports and domain
 * see plain objects.
 *
 * These tables are platform-global legal records on the RLS allow-list
 * (rls-allow-list.json): no principal GUCs are required here, and write
 * authorization is the use cases' PolicyService gate. The schema's guard
 * triggers (end-only updates, terminal immutability, no DELETE) remain the
 * final word — a repository defect surfaces as a raised trigger, never as
 * silently rewritten history.
 */

import type { PrismaClient } from '@karar/platform/dist/db/prisma.js';
import type { TenantId, UserId } from '@karar/shared-kernel';

import type {
  EntityJurisdictionPermission,
  OperatingEntity,
  OperatingEntityId,
  OperatingEntityStatus,
} from '../../domain/operating-entity.js';
import type { EntityLicence, EntityLicenceStatus } from '../../domain/entity-licence.js';
import type {
  DataProtectionRoleAssignment,
  PolicyPackPinState,
} from '../../domain/role-assignment.js';
import type {
  AssignmentScope,
  OperatingEntityAssignment,
} from '../../domain/entity-assignment.js';
import type { EntityMigration, EntityMigrationStatus } from '../../domain/entity-migration.js';
import type { JurisdictionRef, PurposeRef } from '../../domain/refs.js';
import type {
  EntityAssignmentRepository,
  EntityLicenceRepository,
  EntityMigrationRepository,
  OperatingEntityRepository,
  RoleAssignmentQuery,
  RoleAssignmentRepository,
} from '../../application/ports/repositories.js';

export class PrismaOperatingEntityRepository implements OperatingEntityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(entity: OperatingEntity): Promise<void> {
    await this.prisma.operatingEntity.create({
      data: {
        id: entity.id,
        legalName: entity.legalName,
        registrationNumber: entity.registrationNumber,
        registeredJurisdictionRef: entity.registeredJurisdictionRef,
        contractingCapacity: entity.contractingCapacity,
        dataProtectionContact: entity.dataProtectionContact,
        status: entity.status,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      },
    });
  }

  async findById(id: OperatingEntityId): Promise<OperatingEntity | null> {
    const row = await this.prisma.operatingEntity.findUnique({ where: { id } });
    if (row === null) {
      return null;
    }
    return {
      id: row.id as OperatingEntityId,
      legalName: row.legalName,
      registrationNumber: row.registrationNumber,
      registeredJurisdictionRef: row.registeredJurisdictionRef as JurisdictionRef,
      contractingCapacity: row.contractingCapacity,
      dataProtectionContact: row.dataProtectionContact,
      status: row.status as OperatingEntityStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async updateStatus(id: OperatingEntityId, status: OperatingEntityStatus, at: Date): Promise<void> {
    await this.prisma.operatingEntity.update({
      where: { id },
      data: { status, updatedAt: at },
    });
  }

  async insertJurisdictionPermission(
    permission: EntityJurisdictionPermission & {
      readonly createdAt: Date;
      readonly updatedAt: Date;
    },
  ): Promise<void> {
    await this.prisma.entityJurisdictionPermission.create({
      data: {
        id: permission.id,
        entityId: permission.entityId,
        jurisdictionRef: permission.jurisdictionRef,
        permittedFrom: permission.permittedFrom,
        permittedTo: permission.permittedTo,
        basisReference: permission.basisReference,
        createdAt: permission.createdAt,
        updatedAt: permission.updatedAt,
      },
    });
  }

  async listJurisdictionPermissions(
    entityId: OperatingEntityId,
  ): Promise<ReadonlyArray<EntityJurisdictionPermission>> {
    const rows = await this.prisma.entityJurisdictionPermission.findMany({
      where: { entityId },
      orderBy: { permittedFrom: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      entityId: row.entityId as OperatingEntityId,
      jurisdictionRef: row.jurisdictionRef as JurisdictionRef,
      permittedFrom: row.permittedFrom,
      permittedTo: row.permittedTo,
      basisReference: row.basisReference,
    }));
  }

  async endJurisdictionPermission(permissionId: string, permittedTo: Date): Promise<void> {
    await this.prisma.entityJurisdictionPermission.update({
      where: { id: permissionId },
      data: { permittedTo, updatedAt: permittedTo },
    });
  }
}

export class PrismaEntityLicenceRepository implements EntityLicenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(
    licence: EntityLicence & { readonly createdAt: Date; readonly updatedAt: Date },
  ): Promise<void> {
    await this.prisma.entityLicence.create({
      data: {
        id: licence.id,
        entityId: licence.entityId,
        licenceTypeRef: licence.licenceTypeRef,
        status: licence.status,
        sourceProvenance: licence.sourceProvenance,
        effectiveDate: licence.effectiveDate,
        expiryDate: licence.expiryDate,
        reviewOwner: licence.reviewOwner,
        evidenceReference: licence.evidenceReference,
        createdAt: licence.createdAt,
        updatedAt: licence.updatedAt,
      },
    });
  }

  async findById(id: string): Promise<EntityLicence | null> {
    const row = await this.prisma.entityLicence.findUnique({ where: { id } });
    return row === null ? null : toLicence(row);
  }

  async updateStatus(
    id: string,
    status: EntityLicenceStatus,
    evidenceReference: string | null,
    at: Date,
  ): Promise<void> {
    await this.prisma.entityLicence.update({
      where: { id },
      data: { status, evidenceReference, updatedAt: at },
    });
  }

  async listByEntity(entityId: OperatingEntityId): Promise<ReadonlyArray<EntityLicence>> {
    const rows = await this.prisma.entityLicence.findMany({
      where: { entityId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toLicence);
  }
}

function toLicence(row: {
  id: string;
  entityId: string;
  licenceTypeRef: string;
  status: string;
  sourceProvenance: string;
  effectiveDate: Date | null;
  expiryDate: Date | null;
  reviewOwner: string;
  evidenceReference: string | null;
}): EntityLicence {
  return {
    id: row.id,
    entityId: row.entityId as OperatingEntityId,
    licenceTypeRef: row.licenceTypeRef,
    status: row.status as EntityLicenceStatus,
    sourceProvenance: row.sourceProvenance,
    effectiveDate: row.effectiveDate,
    expiryDate: row.expiryDate,
    reviewOwner: row.reviewOwner,
    evidenceReference: row.evidenceReference,
  };
}

export class PrismaRoleAssignmentRepository implements RoleAssignmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(assignment: DataProtectionRoleAssignment): Promise<void> {
    await this.prisma.dataProtectionRoleAssignment.create({
      data: {
        id: assignment.id,
        operatingEntityId: assignment.operatingEntityId,
        tenantId: assignment.tenantId,
        purposeRef: assignment.purposeRef,
        jurisdictionRef: assignment.jurisdictionRef,
        role: assignment.role,
        effectiveFrom: assignment.effectiveFrom,
        effectiveTo: assignment.effectiveTo,
        contractReference: assignment.contractReference,
        createdBy: assignment.createdBy,
        createdAt: assignment.createdAt,
        policyPackVersion: assignment.policyPackVersion,
        policyPackPinState: assignment.policyPackPinState,
      },
    });
  }

  async findById(id: string): Promise<DataProtectionRoleAssignment | null> {
    const row = await this.prisma.dataProtectionRoleAssignment.findUnique({ where: { id } });
    return row === null ? null : toRoleAssignment(row);
  }

  async end(id: string, effectiveTo: Date): Promise<void> {
    await this.prisma.dataProtectionRoleAssignment.update({
      where: { id },
      data: { effectiveTo },
    });
  }

  async query(
    query: RoleAssignmentQuery,
  ): Promise<ReadonlyArray<DataProtectionRoleAssignment>> {
    const rows = await this.prisma.dataProtectionRoleAssignment.findMany({
      where: {
        ...(query.operatingEntityId !== undefined
          ? { operatingEntityId: query.operatingEntityId }
          : {}),
        ...(query.tenantId !== undefined ? { tenantId: query.tenantId } : {}),
        ...(query.purposeRef !== undefined ? { purposeRef: query.purposeRef } : {}),
        ...(query.jurisdictionRef !== undefined ? { jurisdictionRef: query.jurisdictionRef } : {}),
        ...(query.activeAt !== undefined
          ? {
              effectiveFrom: { lte: query.activeAt },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: query.activeAt } }],
            }
          : {}),
      },
      orderBy: { effectiveFrom: 'asc' },
    });
    return rows.map(toRoleAssignment);
  }
}

function toRoleAssignment(row: {
  id: string;
  operatingEntityId: string;
  tenantId: string | null;
  purposeRef: string;
  jurisdictionRef: string;
  role: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  contractReference: string | null;
  createdBy: string;
  createdAt: Date;
  policyPackVersion: string | null;
  policyPackPinState: string;
}): DataProtectionRoleAssignment {
  return {
    id: row.id,
    operatingEntityId: row.operatingEntityId as OperatingEntityId,
    tenantId: row.tenantId as TenantId | null,
    purposeRef: row.purposeRef as PurposeRef,
    jurisdictionRef: row.jurisdictionRef as JurisdictionRef,
    role: row.role as DataProtectionRoleAssignment['role'],
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    contractReference: row.contractReference,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    policyPackVersion: row.policyPackVersion,
    policyPackPinState: row.policyPackPinState as PolicyPackPinState,
  };
}

export class PrismaEntityAssignmentRepository implements EntityAssignmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(assignment: OperatingEntityAssignment): Promise<void> {
    await this.prisma.operatingEntityAssignment.create({
      data: {
        id: assignment.id,
        scope: assignment.scope,
        tenantId: assignment.tenantId,
        userId: assignment.userId,
        entityId: assignment.entityId,
        effectiveFrom: assignment.effectiveFrom,
        effectiveTo: assignment.effectiveTo,
        createdBy: assignment.createdBy,
        createdAt: assignment.createdAt,
      },
    });
  }

  async end(id: string, effectiveTo: Date): Promise<void> {
    await this.prisma.operatingEntityAssignment.update({
      where: { id },
      data: { effectiveTo },
    });
  }

  async findOpen(
    scope: AssignmentScope,
    subject: { readonly tenantId?: TenantId; readonly userId?: UserId },
  ): Promise<ReadonlyArray<OperatingEntityAssignment>> {
    const rows = await this.prisma.operatingEntityAssignment.findMany({
      where: {
        scope,
        effectiveTo: null,
        ...(subject.tenantId !== undefined ? { tenantId: subject.tenantId } : {}),
        ...(subject.userId !== undefined ? { userId: subject.userId } : {}),
      },
    });
    return rows.map(toEntityAssignment);
  }

  async findActiveAt(
    scope: AssignmentScope,
    subject: { readonly tenantId?: TenantId; readonly userId?: UserId },
    at: Date,
  ): Promise<ReadonlyArray<OperatingEntityAssignment>> {
    const rows = await this.prisma.operatingEntityAssignment.findMany({
      where: {
        scope,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
        ...(subject.tenantId !== undefined ? { tenantId: subject.tenantId } : {}),
        ...(subject.userId !== undefined ? { userId: subject.userId } : {}),
      },
    });
    return rows.map(toEntityAssignment);
  }
}

function toEntityAssignment(row: {
  id: string;
  scope: string;
  tenantId: string | null;
  userId: string | null;
  entityId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdBy: string;
  createdAt: Date;
}): OperatingEntityAssignment {
  return {
    id: row.id,
    scope: row.scope as AssignmentScope,
    tenantId: row.tenantId as TenantId | null,
    userId: row.userId as UserId | null,
    entityId: row.entityId as OperatingEntityId,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export class PrismaEntityMigrationRepository implements EntityMigrationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(migration: EntityMigration): Promise<void> {
    await this.prisma.entityMigration.create({
      data: {
        id: migration.id,
        scope: migration.scope,
        subjectRef: migration.subjectRef,
        fromEntity: migration.fromEntity,
        toEntity: migration.toEntity,
        status: migration.status,
        reason: migration.reason,
        reconsentEvaluationId: migration.reconsentEvaluationId,
        proposedBy: migration.proposedBy,
        proposedAt: migration.proposedAt,
        completedAt: migration.completedAt,
      },
    });
  }

  async findById(id: string): Promise<EntityMigration | null> {
    const row = await this.prisma.entityMigration.findUnique({ where: { id } });
    return row === null ? null : toMigration(row);
  }

  async advance(
    id: string,
    to: EntityMigrationStatus,
    fields: { readonly reconsentEvaluationId?: string; readonly completedAt?: Date },
  ): Promise<void> {
    await this.prisma.entityMigration.update({
      where: { id },
      data: {
        status: to,
        ...(fields.reconsentEvaluationId !== undefined
          ? { reconsentEvaluationId: fields.reconsentEvaluationId }
          : {}),
        ...(fields.completedAt !== undefined ? { completedAt: fields.completedAt } : {}),
      },
    });
  }

  async listBySubject(subjectRef: string): Promise<ReadonlyArray<EntityMigration>> {
    const rows = await this.prisma.entityMigration.findMany({
      where: { subjectRef },
      orderBy: { proposedAt: 'asc' },
    });
    return rows.map(toMigration);
  }
}

function toMigration(row: {
  id: string;
  scope: string;
  subjectRef: string;
  fromEntity: string;
  toEntity: string;
  status: string;
  reason: string;
  reconsentEvaluationId: string | null;
  proposedBy: string;
  proposedAt: Date;
  completedAt: Date | null;
}): EntityMigration {
  return {
    id: row.id,
    scope: row.scope as AssignmentScope,
    subjectRef: row.subjectRef,
    fromEntity: row.fromEntity as OperatingEntityId,
    toEntity: row.toEntity as OperatingEntityId,
    status: row.status as EntityMigrationStatus,
    reason: row.reason,
    reconsentEvaluationId: row.reconsentEvaluationId,
    proposedBy: row.proposedBy,
    proposedAt: row.proposedAt,
    completedAt: row.completedAt,
  };
}
