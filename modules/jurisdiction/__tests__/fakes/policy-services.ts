/**
 * Layer-1 test doubles ONLY (never shipped, never wired): a permissive
 * PolicyService so integration tests can prove the layers UNDER
 * authorization (RLS, triggers, predicates) hold on their own, and a
 * deny-all one to prove use cases refuse when authorization does — which is
 * also this module's real Phase 3.5 posture, since its permissions are not
 * seeded yet and deny-by-default denies.
 */

import { Result } from '@karar/shared-kernel';

import type {
  AuthorizationDenied,
  PolicyPrincipal,
  PolicyService,
} from '../../application/ports/policy-service.js';

export class PermissiveForTestsPolicyService implements PolicyService {
  readonly granted: Array<{ principal: PolicyPrincipal; permission: string }> = [];

  authorize(
    principal: PolicyPrincipal,
    permission: string,
  ): Promise<Result<void, AuthorizationDenied>> {
    this.granted.push({ principal, permission });
    return Promise.resolve(Result.ok(undefined));
  }
}

export class DenyAllPolicyService implements PolicyService {
  readonly denied: Array<{ principal: PolicyPrincipal; permission: string }> = [];

  authorize(
    principal: PolicyPrincipal,
    permission: string,
  ): Promise<Result<void, AuthorizationDenied>> {
    this.denied.push({ principal, permission });
    return Promise.resolve(
      Result.err({
        kind: 'AUTHORIZATION_DENIED',
        permission,
        message: `permission '${permission}' is not granted (deny-by-default)`,
      }),
    );
  }
}
