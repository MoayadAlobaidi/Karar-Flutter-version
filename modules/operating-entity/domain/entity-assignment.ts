/**
 * OperatingEntityAssignment — the FORWARD binding between an entity and a
 * tenant (TENANT_DEFAULT) or user (USER_CONTRACTING), as effective-dated
 * history (ADR-0024 §4). Changing an assignment affects records created
 * after the change; every legally-consequential record pins its entity at
 * creation and keeps it forever, so an assignment change never rewrites
 * what already happened — that is the EntityMigration workflow's whole
 * reason to exist.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type { OperatingEntityId } from './operating-entity.js';

export const ASSIGNMENT_SCOPES = ['TENANT_DEFAULT', 'USER_CONTRACTING'] as const;
export type AssignmentScope = (typeof ASSIGNMENT_SCOPES)[number];

export interface OperatingEntityAssignment {
  readonly id: string;
  readonly scope: AssignmentScope;
  /** Required for TENANT_DEFAULT; optional context for USER_CONTRACTING. */
  readonly tenantId: TenantId | null;
  /** Required for USER_CONTRACTING; null for TENANT_DEFAULT. */
  readonly userId: UserId | null;
  readonly entityId: OperatingEntityId;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/** Whether the assignment's effective window covers instant `at`. */
export function assignmentActiveAt(
  assignment: Pick<OperatingEntityAssignment, 'effectiveFrom' | 'effectiveTo'>,
  at: Date,
): boolean {
  return (
    assignment.effectiveFrom.getTime() <= at.getTime() &&
    (assignment.effectiveTo === null || assignment.effectiveTo.getTime() > at.getTime())
  );
}
