/**
 * OperationGate — tenancy's OWN port for the control-plane kill switches
 * (dependency inversion: the consumer declares the contract it needs, the
 * composition root binds the control-plane's CheckKillSwitch, which satisfies
 * it structurally). Tenancy therefore guards its invitation routes without a
 * module dependency on the control-plane — the module graph stays acyclic.
 *
 * `TENANT_INVITATIONS` is this module's slice of the platform kill-switch
 * registry (control-plane owns the closed registry; the registry test pins
 * the id). Restrict-only semantics: the gate can deny, never grant.
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

/** The kill-switch id that guards this module's invitation routes. */
export type TenancyGuardedOperation = 'TENANT_INVITATIONS';

export interface OperationDenied {
  /** `dependency_unavailable` = the switch store could not be read (fail closed). */
  readonly kind: 'operation_restricted' | 'dependency_unavailable';
  readonly switchId: string;
  readonly message: string;
}

export interface OperationGate {
  assertOperationAllowed(
    operation: TenancyGuardedOperation,
  ): Promise<Result<void, OperationDenied>>;
}

/** DI token; TenancyApiModule binds the composition root's gate. */
export const TENANCY_OPERATION_GATE = 'karar.tenancy.operation-gate';

export class OperationGateGuard implements CanActivate {
  constructor(
    private readonly gate: OperationGate,
    private readonly operation: TenancyGuardedOperation,
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

/** Guard factory: `@UseGuards(RequireOperationAllowed('TENANT_INVITATIONS'))`. */
export function RequireOperationAllowed(operation: TenancyGuardedOperation): Type<CanActivate> {
  @Injectable()
  class ScopedOperationGateGuard extends OperationGateGuard {
    constructor(@Inject(TENANCY_OPERATION_GATE) gate: OperationGate) {
      super(gate, operation);
    }
  }
  return mixin(ScopedOperationGateGuard);
}
