/**
 * KillSwitchGuard + RequireOperationAllowed(switchId) — the controller-side
 * consumer of the KillSwitchPort. `@UseGuards(RequireOperationAllowed(
 * 'PASSWORD_LOGIN'))` on a route denies with 503 while the switch holds an
 * active, unexpired restriction — and ALSO with 503 DEPENDENCY_UNAVAILABLE
 * when the switch store cannot be read (fail closed; an outage must not
 * silently enable the guarded operation).
 *
 * HTTP is not the only caller: flows invoked from workers or tools call the
 * exported KillSwitchPort (`assertOperationAllowed`) directly in their use
 * case — the guard is transport convenience over the same port.
 */

import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  mixin,
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';

import type { KillSwitchId } from '../../domain/kill-switch.js';
import type { KillSwitchPort } from '../../application/kill-switch-port.js';

/** DI token; the composition root binds CheckKillSwitch. */
export const KILL_SWITCH_PORT = 'karar.control-plane.kill-switch-port';

export class KillSwitchGuard implements CanActivate {
  constructor(
    private readonly killSwitches: KillSwitchPort,
    private readonly switchId: KillSwitchId,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    void context; // the decision depends on switch state alone, never the request
    const allowed = await this.killSwitches.assertOperationAllowed(this.switchId);
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

/**
 * Guard factory: `@UseGuards(RequireOperationAllowed('NEW_REGISTRATIONS'))`.
 * The parameter type is the closed KillSwitchId union — guarding a route on
 * an unregistered switch is a compile error, not a silent no-op.
 */
export function RequireOperationAllowed(switchId: KillSwitchId): Type<CanActivate> {
  @Injectable()
  class ScopedKillSwitchGuard extends KillSwitchGuard {
    constructor(@Inject(KILL_SWITCH_PORT) killSwitches: KillSwitchPort) {
      super(killSwitches, switchId);
    }
  }
  return mixin(ScopedKillSwitchGuard);
}
