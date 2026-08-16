/**
 * Permissive PolicyService fake — TESTS ONLY. Grants everything, so suites
 * exercise the module's own behaviour rather than the RBAC workstream's.
 * The real PolicyService is central, deny-by-default, and proven in its own
 * module; nothing outside __tests__ may reference this class.
 */

import { Result } from '@karar/shared-kernel';

import type {
  AuthorizationDenied,
  PolicyPrincipal,
  PolicyService,
} from '../../application/ports/policy-service.js';

export class AllowAllPolicyService implements PolicyService {
  readonly granted: Array<{ principal: PolicyPrincipal; permission: string }> = [];

  async authorize(
    principal: PolicyPrincipal,
    permission: string,
  ): Promise<Result<void, AuthorizationDenied>> {
    this.granted.push({ principal, permission });
    return Result.ok(undefined);
  }
}

/** Denies everything — for asserting the authorization gate is actually consulted. */
export class DenyAllPolicyService implements PolicyService {
  async authorize(
    _principal: PolicyPrincipal,
    permission: string,
  ): Promise<Result<void, AuthorizationDenied>> {
    return Result.err({
      kind: 'AUTHORIZATION_DENIED',
      permission,
      message: `denied by DenyAllPolicyService (test fake)`,
    });
  }
}
