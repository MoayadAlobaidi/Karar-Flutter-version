/**
 * PolicyService — the authorization PORT the consent module requires
 * (declared inward, architecture test 5). Document lifecycle mutations are
 * platform-operator work (`consent.document.publish`); subject-facing flows
 * — accept, withdraw, read own status — are authorized by principal
 * identity alone, never by permission, and there is deliberately NO
 * admin-accepts-for-customer permission to check (MODULE.md, permissions
 * deliberately absent). The REAL implementation is the RBAC workstream's
 * central PolicyService; this module ships the port and a permissive test
 * fake only.
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

/** Permissions this module consumes (declared in MODULE.md). */
export const CONSENT_PERMISSIONS = {
  publishDocument: 'consent.document.publish',
  readStatus: 'consent.status.read',
} as const;

export interface PolicyService {
  authorize(
    principal: PolicyPrincipal,
    permission: string,
  ): Promise<Result<void, AuthorizationDenied>>;
}
