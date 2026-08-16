/**
 * TenantCapabilityEntitlementRepository — persistence port for the
 * tenant-scoped entitlement rows (migration 0077, RLS ENABLEd + FORCEd).
 * Every operation runs under a principal context carrying the TARGET
 * tenant's id (the platform's withPrincipalContext binds the GUCs; an
 * unbound session sees and affects nothing — fail closed). Reads produce
 * the domain's `EntitlementFacts` snapshot: one read per resolution, whose
 * row version is the §44 pin.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type { EntitlementStatus, TenantCapabilityEntitlement } from '../../domain/entitlement.js';
import type { EntitlementFacts } from '../../domain/resolution.js';

/** The principal context entitlement statements run under. */
export interface EntitlementPrincipal {
  readonly tenantId: TenantId;
  readonly userId: UserId;
}

export interface TenantCapabilityEntitlementRepository {
  factsFor(principal: EntitlementPrincipal, capabilityId: string): Promise<EntitlementFacts>;

  findByCapability(
    principal: EntitlementPrincipal,
    capabilityId: string,
  ): Promise<TenantCapabilityEntitlement | null>;

  insert(
    principal: EntitlementPrincipal,
    entitlement: TenantCapabilityEntitlement,
    at: Date,
  ): Promise<void>;

  /**
   * Optimistic transition of the current row: succeeds only when the stored
   * version still equals `expectedVersion` (the DB guard additionally
   * enforces +1 increments and appends the history ledger).
   */
  transition(
    principal: EntitlementPrincipal,
    id: string,
    expectedVersion: number,
    change: {
      readonly status: EntitlementStatus;
      readonly sourceRef: string;
      readonly reason: string;
      readonly actorRef: string;
      readonly effectiveFrom: Date;
      readonly effectiveTo: Date | null;
    },
    at: Date,
  ): Promise<'UPDATED' | 'VERSION_CONFLICT'>;
}
