/**
 * RoleAssignment — the domain read shape of one grant, and the scope rule
 * that decides where it applies. The rule is the module's central invariant,
 * so it lives in the domain, next to the catalogue:
 *
 *   - a PLATFORM-scoped assignment (tenantId null) applies in EVERY context
 *     — but only as a Layer-1 permission decision; it never widens RLS row
 *     visibility (a platform role never auto-bypasses the boundary);
 *   - a TENANT-scoped assignment applies ONLY when the actor's bound tenant
 *     matches. A tenant role never implies platform authority and never
 *     crosses tenants.
 */

import { TenantId, UserId } from '@karar/shared-kernel';

import type { RoleId } from './catalogue.js';

export const ASSIGNMENT_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export interface RoleAssignment {
  readonly id: string;
  readonly userId: UserId;
  readonly roleId: RoleId;
  /** null = platform-scoped. */
  readonly tenantId: TenantId | null;
  readonly status: AssignmentStatus;
  readonly grantedBy: UserId;
  readonly reason: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedBy: UserId | null;
  readonly createdAt: Date;
}

/** Is the assignment in force at `at`? (status + effective window) */
export function assignmentActiveAt(assignment: RoleAssignment, at: Date): boolean {
  return (
    assignment.status === 'ACTIVE' &&
    assignment.revokedAt === null &&
    assignment.effectiveFrom.getTime() <= at.getTime() &&
    (assignment.effectiveTo === null || assignment.effectiveTo.getTime() > at.getTime())
  );
}

/**
 * Does the assignment apply to a caller bound to `actorTenantId` (null =
 * no tenant binding)? Platform-scoped applies everywhere; tenant-scoped
 * applies only on an exact tenant match.
 */
export function assignmentAppliesTo(
  assignment: RoleAssignment,
  actorTenantId: TenantId | null,
): boolean {
  if (assignment.tenantId === null) {
    return true;
  }
  return (
    actorTenantId !== null &&
    TenantId.toString(assignment.tenantId) === TenantId.toString(actorTenantId)
  );
}
