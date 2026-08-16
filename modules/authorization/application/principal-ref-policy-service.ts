/**
 * PrincipalRefPolicyService — the same real PolicyService behind the
 * Result-shaped port the operating-entity and consent modules declared
 * inward: `authorize(principal {principalRef, tenantRef|null}, permission) →
 * Result<void, AuthorizationDenied>`. One authorization engine, two port
 * shapes — this facade parses the opaque refs, delegates to the core, and
 * carries refusal as a value (never an exception).
 *
 * Fail closed on shape: a principalRef that is not a platform UserId, or a
 * tenantRef that is not a TenantId, is DENIED — an unparseable principal is
 * not a principal. (Staff refs become parseable when the control plane mints
 * them; until then every acting principal IS an identity account id.)
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

import type { PolicyActor } from './actor.js';
import type { PolicyService } from './policy-service.js';

/** The consumers' port shapes, restated structurally (ports are declared inward, in each consumer). */
export interface PolicyPrincipalRef {
  readonly principalRef: string;
  readonly tenantRef: string | null;
}

export interface AuthorizationDenied {
  readonly kind: 'AUTHORIZATION_DENIED';
  readonly permission: string;
  readonly message: string;
}

export class PrincipalRefPolicyService {
  constructor(private readonly policy: PolicyService) {}

  async authorize(
    principal: PolicyPrincipalRef,
    permission: string,
  ): Promise<Result<void, AuthorizationDenied>> {
    const denied = (message: string): Result<void, AuthorizationDenied> =>
      Result.err({ kind: 'AUTHORIZATION_DENIED', permission, message });

    const userId = UserId.parse(principal?.principalRef ?? '');
    if (!userId.ok) {
      return denied('authorization denied: unrecognizable principal reference (fail closed)');
    }
    let actor: PolicyActor = { userId: userId.value };
    if (principal.tenantRef !== null && principal.tenantRef !== undefined) {
      const tenantId = TenantId.parse(principal.tenantRef);
      if (!tenantId.ok) {
        return denied('authorization denied: unrecognizable tenant reference (fail closed)');
      }
      actor = { userId: userId.value, tenantId: tenantId.value };
    }

    const decision = await this.policy.authorize(actor, permission);
    if (!decision.allowed) {
      return denied(`authorization denied: ${decision.reason}`);
    }
    return Result.ok(undefined);
  }
}
