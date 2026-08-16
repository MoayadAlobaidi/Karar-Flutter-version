/**
 * PolicyService — the authorization PORT this module requires (declared
 * inward, architecture test 5). Assignment and activation mutations are
 * operator/system work this phase: there is NO subject-facing HTTP surface
 * here (the client reads its jurisdiction context through the bootstrap
 * endpoint another workstream owns), so every mutating use case authorizes
 * through this port.
 *
 * The permissions below are deliberately NOT seeded in the RBAC catalogue in
 * Phase 3.5 (no operator surface exists to exercise them). Deny-by-default
 * means their absence DENIES: against the real PolicyService every one of
 * these use cases currently refuses, which is the honest state — the same
 * precedent as identity's unseeded disable/enable permissions. Seeding
 * arrives with the operator surface. The REAL implementation is the RBAC
 * workstream's central PolicyService; this module ships the port and test
 * fakes only (__tests__/fakes).
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

/** Permissions this module consumes (declared in MODULE.md; unseeded in 3.5). */
export const JURISDICTION_PERMISSIONS = {
  manageAssignment: 'jurisdiction.assignment.manage',
  activatePack: 'jurisdiction.pack.activate',
} as const;

export interface PolicyService {
  authorize(
    principal: PolicyPrincipal,
    permission: string,
  ): Promise<Result<void, AuthorizationDenied>>;
}
