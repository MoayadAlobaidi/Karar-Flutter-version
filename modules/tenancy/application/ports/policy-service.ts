/**
 * PolicyService — Layer 1 of the four (tenancy.md §2): "may this actor
 * perform this operation?". THE PORT IS DECLARED HERE, IN THE CONSUMER;
 * the authorization module implements it (deny-by-default, central
 * PolicyService, roles re-derived per request) and the composition root
 * wires it in. This module treats anything but an explicit allow as denial
 * and NEVER authorizes off `role_hint` — that column is informational.
 *
 * Layer 1 answers permission; it does not answer "whose data is this?" —
 * rows are bounded by RLS underneath regardless of what this port returns.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

export const TENANCY_PERMISSIONS = [
  'tenancy.member.read',
  'tenancy.invitation.create',
  'tenancy.invitation.revoke',
] as const;

export type TenancyPermission = (typeof TENANCY_PERMISSIONS)[number];

export interface PolicyActor {
  readonly tenantId: TenantId;
  readonly userId: UserId;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  /** Machine-readable reason — surfaced on denial responses, never invented here. */
  readonly reason: string;
}

export interface PolicyService {
  authorize(
    actor: PolicyActor,
    permission: TenancyPermission,
    resource?: Readonly<Record<string, string>>,
  ): Promise<PolicyDecision>;
}
