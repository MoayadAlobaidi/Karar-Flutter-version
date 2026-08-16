/**
 * Permissive PolicyService fake — TESTS ONLY. Grants everything, so suites
 * exercise the consent module's own behaviour rather than the RBAC
 * workstream's. The real PolicyService is central and deny-by-default;
 * nothing outside __tests__ may reference this class.
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

export class DenyAllPolicyService implements PolicyService {
  async authorize(
    _principal: PolicyPrincipal,
    permission: string,
  ): Promise<Result<void, AuthorizationDenied>> {
    return Result.err({
      kind: 'AUTHORIZATION_DENIED',
      permission,
      message: 'denied by DenyAllPolicyService (test fake)',
    });
  }
}
