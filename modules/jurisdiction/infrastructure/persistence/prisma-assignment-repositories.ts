/**
 * Assignment repositories over Prisma — every statement inside the
 * platform's `withPrincipalContext` transaction (packages/platform/src/db/
 * principal-context.ts). RLS on user_jurisdiction_assignments requires BOTH
 * principal GUCs and on tenant_jurisdiction_assignments the tenant GUC, so a
 * call without them returns and affects nothing — the policies fail closed.
 * The repositories still WHERE-filter — defence in depth that catches honest
 * mistakes early; RLS is the boundary.
 *
 * Ending an open assignment rides the exact UPDATE shape the schema guard
 * permits (set effective_to once); there is no delete method anywhere.
 */

import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { TenantId, UserId } from '@karar/shared-kernel';
import { jurisdictionId } from '@karar/jurisdiction-policy';

import type {
  AssignmentSource,
  TenantJurisdictionAssignment,
  UserJurisdictionAssignment,
  VerificationStatus,
} from '../../domain/assignment.js';
import type {
  TenantAssignmentPrincipal,
  TenantJurisdictionAssignmentRepository,
  UserAssignmentPrincipal,
  UserJurisdictionAssignmentRepository,
} from '../../application/ports/repositories.js';

export class PrismaUserJurisdictionAssignmentRepository
  implements UserJurisdictionAssignmentRepository
{
  constructor(private readonly handle: PrismaHandle) {}

  private run<T>(
    principal: UserAssignmentPrincipal,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      { tenantId: principal.tenantId, userId: principal.userId },
      fn,
    );
  }

  async insert(
    principal: UserAssignmentPrincipal,
    assignment: UserJurisdictionAssignment,
  ): Promise<void> {
    await this.run(principal, async (tx) => {
      await tx.userJurisdictionAssignment.create({
        data: {
          id: assignment.id,
          userId: assignment.userId,
          tenantId: assignment.tenantId,
          jurisdictionCode: assignment.jurisdictionCode,
          source: assignment.source,
          verificationStatus: assignment.verificationStatus,
          effectiveFrom: assignment.effectiveFrom,
          effectiveTo: assignment.effectiveTo,
          reason: assignment.reason,
          assignedBy: assignment.assignedBy,
          createdAt: assignment.createdAt,
        },
      });
    });
  }

  async endOpen(principal: UserAssignmentPrincipal, endsAt: Date): Promise<readonly string[]> {
    return this.run(principal, async (tx) => {
      const open = await tx.userJurisdictionAssignment.findMany({
        where: {
          userId: principal.userId,
          tenantId: principal.tenantId,
          effectiveTo: null,
        },
        select: { id: true },
      });
      const ids = open.map((row) => row.id);
      if (ids.length > 0) {
        await tx.userJurisdictionAssignment.updateMany({
          where: { id: { in: ids } },
          data: { effectiveTo: endsAt },
        });
      }
      return ids;
    });
  }

  async listForPrincipal(
    principal: UserAssignmentPrincipal,
  ): Promise<readonly UserJurisdictionAssignment[]> {
    return this.run(principal, async (tx) => {
      const rows = await tx.userJurisdictionAssignment.findMany({
        where: { userId: principal.userId, tenantId: principal.tenantId },
        orderBy: { effectiveFrom: 'asc' },
      });
      return rows.map(toUserAssignment);
    });
  }
}

export class PrismaTenantJurisdictionAssignmentRepository
  implements TenantJurisdictionAssignmentRepository
{
  constructor(private readonly handle: PrismaHandle) {}

  private run<T>(
    principal: TenantAssignmentPrincipal,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      { tenantId: principal.tenantId, userId: principal.userId },
      fn,
    );
  }

  async insert(
    principal: TenantAssignmentPrincipal,
    assignment: TenantJurisdictionAssignment,
  ): Promise<void> {
    await this.run(principal, async (tx) => {
      await tx.tenantJurisdictionAssignment.create({
        data: {
          id: assignment.id,
          tenantId: assignment.tenantId,
          jurisdictionCode: assignment.jurisdictionCode,
          source: assignment.source,
          verificationStatus: assignment.verificationStatus,
          effectiveFrom: assignment.effectiveFrom,
          effectiveTo: assignment.effectiveTo,
          reason: assignment.reason,
          assignedBy: assignment.assignedBy,
          createdAt: assignment.createdAt,
        },
      });
    });
  }

  async endOpen(principal: TenantAssignmentPrincipal, endsAt: Date): Promise<readonly string[]> {
    return this.run(principal, async (tx) => {
      const open = await tx.tenantJurisdictionAssignment.findMany({
        where: { tenantId: principal.tenantId, effectiveTo: null },
        select: { id: true },
      });
      const ids = open.map((row) => row.id);
      if (ids.length > 0) {
        await tx.tenantJurisdictionAssignment.updateMany({
          where: { id: { in: ids } },
          data: { effectiveTo: endsAt },
        });
      }
      return ids;
    });
  }

  async listForTenant(
    principal: TenantAssignmentPrincipal,
  ): Promise<readonly TenantJurisdictionAssignment[]> {
    return this.run(principal, async (tx) => {
      const rows = await tx.tenantJurisdictionAssignment.findMany({
        where: { tenantId: principal.tenantId },
        orderBy: { effectiveFrom: 'asc' },
      });
      return rows.map(toTenantAssignment);
    });
  }
}

function toUserAssignment(row: {
  id: string;
  userId: string;
  tenantId: string;
  jurisdictionCode: string;
  source: string;
  verificationStatus: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  reason: string;
  assignedBy: string;
  createdAt: Date;
}): UserJurisdictionAssignment {
  return {
    id: row.id,
    userId: row.userId as UserId,
    tenantId: row.tenantId as TenantId,
    jurisdictionCode: jurisdictionId(row.jurisdictionCode),
    source: row.source as AssignmentSource,
    verificationStatus: row.verificationStatus as VerificationStatus,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    reason: row.reason,
    assignedBy: row.assignedBy,
    createdAt: row.createdAt,
  };
}

function toTenantAssignment(row: {
  id: string;
  tenantId: string;
  jurisdictionCode: string;
  source: string;
  verificationStatus: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  reason: string;
  assignedBy: string;
  createdAt: Date;
}): TenantJurisdictionAssignment {
  return {
    id: row.id,
    tenantId: row.tenantId as TenantId,
    jurisdictionCode: jurisdictionId(row.jurisdictionCode),
    source: row.source as AssignmentSource,
    verificationStatus: row.verificationStatus as VerificationStatus,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    reason: row.reason,
    assignedBy: row.assignedBy,
    createdAt: row.createdAt,
  };
}
