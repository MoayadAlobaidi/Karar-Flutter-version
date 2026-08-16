/**
 * PolicyService — the authorization PORT this module requires (declared
 * inward, architecture test 5). Every entity-register mutation is
 * platform-operator work gated on the permissions MODULE.md declares; the
 * REAL implementation is the RBAC workstream's central PolicyService, wired
 * by the composition root. This module ships only the port and a permissive
 * test fake (`__tests__/fakes/allow-all-policy-service.ts`) — deny-by-default
 * behaviour is the real service's contract, proven in its own module.
 */

import type { Result } from '@karar/shared-kernel';

/** The acting principal as the authorization layer needs it: opaque refs. */
export interface PolicyPrincipal {
  /** Opaque reference to the acting principal (platform UserId or staff ref). */
  readonly principalRef: string;
  /** Opaque tenant reference; null for platform-level actors. */
  readonly tenantRef: string | null;
}

/** An authorization refusal — an expected outcome, carried as a value. */
export interface AuthorizationDenied {
  readonly kind: 'AUTHORIZATION_DENIED';
  readonly permission: string;
  readonly message: string;
}

/** Permissions this module consumes (declared in MODULE.md). */
export const ENTITY_PERMISSIONS = {
  manageEntity: 'entity.entity.manage',
  approveMigration: 'entity.migration.approve',
} as const;

export interface PolicyService {
  /**
   * Grant or refuse `permission` to `principal`. Refusal is an expected
   * outcome (`Result.err`), never an exception: callers must visibly handle
   * the denied arm.
   */
  authorize(
    principal: PolicyPrincipal,
    permission: string,
  ): Promise<Result<void, AuthorizationDenied>>;
}
