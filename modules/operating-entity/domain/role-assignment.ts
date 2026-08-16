/**
 * DataProtectionRoleAssignment — the data-protection role PER RELATIONSHIP,
 * never per entity (ADR-0024). The same entity is CONTROLLER for its own
 * customers and PROCESSOR for a partner bank's; one role column on the
 * entity cannot say both, so the role lives on the relationship:
 * (entity, tenant, purpose, jurisdiction) with an effective window.
 *
 * A row is a STORED LEGAL DECISION, not a software conclusion: someone
 * decided, against a contract, that this entity acts in this role for this
 * relationship. The software records and resolves the decision; it never
 * derives one. Corrections end the row and insert a successor.
 */

import type { TenantId } from '@karar/shared-kernel';

import type { OperatingEntityId } from './operating-entity.js';
import type { JurisdictionRef, PurposeRef } from './refs.js';

export const DATA_PROTECTION_ROLES = ['CONTROLLER', 'JOINT_CONTROLLER', 'PROCESSOR'] as const;
export type DataProtectionRole = (typeof DATA_PROTECTION_ROLES)[number];

export interface DataProtectionRoleAssignment {
  readonly id: string;
  readonly operatingEntityId: OperatingEntityId;
  /** NULL = the entity's own direct-consumer relationship. */
  readonly tenantId: TenantId | null;
  readonly purposeRef: PurposeRef;
  readonly jurisdictionRef: JurisdictionRef;
  readonly role: DataProtectionRole;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  /** The DPA or white-label agreement this decision rests on; null only for
   * an entity's own direct relationship. */
  readonly contractReference: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/** Whether the assignment's effective window covers instant `at`. */
export function roleAssignmentActiveAt(
  assignment: Pick<DataProtectionRoleAssignment, 'effectiveFrom' | 'effectiveTo'>,
  at: Date,
): boolean {
  return (
    assignment.effectiveFrom.getTime() <= at.getTime() &&
    (assignment.effectiveTo === null || assignment.effectiveTo.getTime() > at.getTime())
  );
}
