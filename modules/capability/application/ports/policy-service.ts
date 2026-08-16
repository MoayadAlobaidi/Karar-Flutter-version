/**
 * PolicyService — the authorization PORT this module requires (declared
 * inward, architecture test 5). Availability and entitlement mutations are
 * platform-operator work; the permissions below are DECLARED here and in
 * MODULE.md but deliberately UNSEEDED this phase — no role carries them, no
 * operator surface exists, and an unseeded permission DENIES (deny by
 * default). The RBAC workstream's central PolicyService is the real
 * implementation; this module ships the port and a permissive test fake
 * only.
 */

import type { Result } from '@karar/shared-kernel';

export interface PolicyPrincipal {
  readonly principalRef: string;
  readonly tenantRef: string | null;
}

export interface AuthorizationDenied {
  readonly kind: 'AUTHORIZATION_DENIED';
  readonly permission: string;
  readonly message: string;
}

/** Permissions this module consumes (declared-but-unseeded; MODULE.md). */
export const CAPABILITY_PERMISSIONS = {
  manageAvailability: 'capability.availability.manage',
  manageEntitlement: 'capability.entitlement.manage',
} as const;

export interface PolicyService {
  authorize(
    principal: PolicyPrincipal,
    permission: string,
  ): Promise<Result<void, AuthorizationDenied>>;
}
