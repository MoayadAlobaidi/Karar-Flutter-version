/**
 * PolicyService — the authorization PORT this module requires (declared
 * inward, architecture test 5). Operating a kill switch is platform-operator
 * work gated on `controlplane.killswitch.operate`; the REAL implementation
 * is the authorization module's RbacPolicyService (deny-by-default, roles
 * re-derived per request), wired by the composition root. This module treats
 * anything but an explicit allow as denial.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

export const CONTROL_PLANE_PERMISSIONS = {
  operateKillSwitch: 'controlplane.killswitch.operate',
} as const;

export interface PolicyActor {
  readonly userId: UserId;
  /** Absent = platform context — the normal shape for an operator. */
  readonly tenantId?: TenantId;
  readonly sessionId?: string;
  readonly requestId?: string;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  /** Machine-readable reason — surfaced on denial responses, never invented here. */
  readonly reason: string;
}

export interface PolicyService {
  authorize(
    actor: PolicyActor,
    permission: string,
    resource?: Readonly<Record<string, string>>,
  ): Promise<PolicyDecision>;
}
