/**
 * PermissiveForTestsPolicyService — a PolicyService that allows everything.
 *
 * FOR TESTS ONLY. It exists so this module's use cases and adversarial suites
 * can run before the authorization module lands, and so those suites prove a
 * fact the architecture depends on: even with Layer 1 wide open, RLS still
 * denies every cross-tenant access. It must never be wired into a
 * composition root — the real PolicyService is deny-by-default.
 */

import type {
  PolicyActor,
  PolicyDecision,
  PolicyService,
  TenancyPermission,
} from '../ports/policy-service.js';

export class PermissiveForTestsPolicyService implements PolicyService {
  authorize(): Promise<PolicyDecision> {
    return Promise.resolve({ allowed: true, reason: 'permissive-for-tests' });
  }
}

/** The matching deny-everything double, for exercising denial paths. */
export class DenyAllForTestsPolicyService implements PolicyService {
  authorize(actor: PolicyActor, permission: TenancyPermission): Promise<PolicyDecision> {
    void actor;
    return Promise.resolve({ allowed: false, reason: `denied-for-tests:${permission}` });
  }
}
