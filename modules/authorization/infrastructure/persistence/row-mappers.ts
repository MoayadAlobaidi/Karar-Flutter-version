/**
 * Row → domain mapping for role_assignments. Prisma rows stay in
 * infrastructure; an unknown role id or status in the store is a defect (the
 * catalogue and the DB seed are test-asserted equal) and throws.
 */

import { TenantId, UserId } from '@karar/shared-kernel';

import { isRoleId } from '../../domain/catalogue.js';
import {
  ASSIGNMENT_STATUSES,
  type AssignmentStatus,
  type RoleAssignment,
} from '../../domain/role-assignment.js';

export class AuthorizationStoreError extends Error {
  override readonly name = 'AuthorizationStoreError';
}

interface AssignmentRow {
  id: string;
  userId: string;
  roleId: string;
  tenantId: string | null;
  status: string;
  grantedBy: string;
  reason: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  createdAt: Date;
}

export function toRoleAssignment(row: AssignmentRow): RoleAssignment {
  if (!isRoleId(row.roleId)) {
    throw new AuthorizationStoreError(
      `role_assignments.role_id holds '${row.roleId}', which is not a catalogue role`,
    );
  }
  if (!(ASSIGNMENT_STATUSES as readonly string[]).includes(row.status)) {
    throw new AuthorizationStoreError(`role_assignments.status holds unknown value '${row.status}'`);
  }
  return Object.freeze({
    id: row.id,
    userId: UserId.of(row.userId),
    roleId: row.roleId,
    tenantId: row.tenantId === null ? null : TenantId.of(row.tenantId),
    status: row.status as AssignmentStatus,
    grantedBy: UserId.of(row.grantedBy),
    reason: row.reason,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    revokedAt: row.revokedAt,
    revokedBy: row.revokedBy === null ? null : UserId.of(row.revokedBy),
    createdAt: row.createdAt,
  });
}
