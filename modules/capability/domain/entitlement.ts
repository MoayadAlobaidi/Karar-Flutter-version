/**
 * TenantCapabilityEntitlement — the per-tenant grant dimension, restrict-only
 * by construction: an entitlement can SATISFY gate 5 and nothing else. No
 * entitlement row ever overrides the descriptor, environment, jurisdiction,
 * or availability gates (the resolver's MEET runs those first, and the
 * property harness proves the monotonicity).
 *
 * `sourceRef` is the PORT seam for where a grant came from: an opaque typed
 * reference ('operator:<ref>' today; a future subscription module becomes a
 * source by minting its own references). There is deliberately NO
 * subscription, plan, or pricing logic in this module — Phase 10 owns that.
 */

import type { TenantId } from '@karar/shared-kernel';

export const ENTITLEMENT_STATUSES = ['ACTIVE', 'REVOKED', 'EXPIRED'] as const;

export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export function isEntitlementStatus(value: string): value is EntitlementStatus {
  return (ENTITLEMENT_STATUSES as readonly string[]).includes(value);
}

export interface TenantCapabilityEntitlement {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly capabilityId: string;
  readonly status: EntitlementStatus;
  /** Opaque source reference — the seam a future subscription module fills. */
  readonly sourceRef: string;
  readonly reason: string;
  readonly actorRef: string;
  readonly effectiveFrom: Date;
  /** Null = open-ended; a past instant means the entitlement has lapsed. */
  readonly effectiveTo: Date | null;
  readonly version: number;
}

/**
 * Whether an entitlement satisfies gate 5 at `at`: status ACTIVE and the
 * effective window covers the instant. Everything else denies — REVOKED as
 * missing, a lapsed window or stored EXPIRED as expired.
 */
export function entitlementSatisfiesAt(
  entitlement: Pick<TenantCapabilityEntitlement, 'status' | 'effectiveFrom' | 'effectiveTo'>,
  at: Date,
): boolean {
  return (
    entitlement.status === 'ACTIVE' &&
    entitlement.effectiveFrom.getTime() <= at.getTime() &&
    (entitlement.effectiveTo === null || entitlement.effectiveTo.getTime() > at.getTime())
  );
}
