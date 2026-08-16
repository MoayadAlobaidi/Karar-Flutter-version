/**
 * OperationGate — identity's OWN port for the control-plane kill switches
 * (dependency inversion: the consumer declares the contract it needs, the
 * composition root binds the control-plane's CheckKillSwitch, which satisfies
 * it structurally). Identity therefore guards its routes without depending on
 * the control-plane module — the module dependency graph stays acyclic and
 * identity keeps depending on no other module.
 *
 * The operation names are this module's slice of the platform kill-switch
 * registry (control-plane owns the closed registry; the registry test pins
 * these ids). Restrict-only semantics: the gate can deny an operation, never
 * grant anything.
 */

import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  mixin,
  type CanActivate,
  type Type,
} from '@nestjs/common';
import type { Result } from '@karar/shared-kernel';

/** The kill-switch ids that guard this module's routes. */
export type IdentityGuardedOperation = 'NEW_REGISTRATIONS' | 'PASSWORD_LOGIN' | 'SESSION_REFRESH';

export interface OperationDenied {
  /** `dependency_unavailable` = the switch store could not be read (fail closed). */
  readonly kind: 'operation_restricted' | 'dependency_unavailable';
  readonly switchId: string;
  readonly message: string;
}

export interface OperationGate {
  assertOperationAllowed(
    operation: IdentityGuardedOperation,
  ): Promise<Result<void, OperationDenied>>;
}

/** DI token; IdentityApiModule binds the composition root's gate. */
export const IDENTITY_OPERATION_GATE = 'karar.identity.operation-gate';

export class OperationGateGuard implements CanActivate {
  constructor(
    private readonly gate: OperationGate,
    private readonly operation: IdentityGuardedOperation,
  ) {}

  async canActivate(): Promise<boolean> {
    // The decision depends on switch state alone, never the request.
    const allowed = await this.gate.assertOperationAllowed(this.operation);
    if (!allowed.ok) {
      throw new ServiceUnavailableException({
        code:
          allowed.error.kind === 'dependency_unavailable'
            ? 'DEPENDENCY_UNAVAILABLE'
            : 'OPERATION_RESTRICTED',
        switchId: allowed.error.switchId,
        message: allowed.error.message,
      });
    }
    return true;
  }
}

/** Guard factory: `@UseGuards(RequireOperationAllowed('PASSWORD_LOGIN'))`. */
export function RequireOperationAllowed(operation: IdentityGuardedOperation): Type<CanActivate> {
  @Injectable()
  class ScopedOperationGateGuard extends OperationGateGuard {
    constructor(@Inject(IDENTITY_OPERATION_GATE) gate: OperationGate) {
      super(gate, operation);
    }
  }
  return mixin(ScopedOperationGateGuard);
}
