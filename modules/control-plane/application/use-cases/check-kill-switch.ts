/**
 * CheckKillSwitch — the read path, and the KillSwitchPort implementation.
 * Evaluation is domain logic (evaluateKillSwitch: missing/INACTIVE/expired
 * all unrestricted — restrict-only); THIS class owns the store-unavailable
 * policy, stated explicitly:
 *
 *   A switch store outage FAILS CLOSED for switch-guarded operations. The
 *   guard exists because an operator may need to stop registrations or
 *   logins DURING an incident; "the store is down" is indistinguishable from
 *   "the restriction I cannot read is active", so the operation is denied
 *   with `dependency_unavailable` (surfaced as 503 DEPENDENCY_UNAVAILABLE)
 *   rather than silently enabled. Tested against a closed pool.
 */

import { Result, type Clock } from '@karar/shared-kernel';

import { evaluateKillSwitch, type KillSwitchId } from '../../domain/kill-switch.js';
import type { KillSwitchPort, OperationDenied } from '../kill-switch-port.js';
import type { KillSwitchStore } from '../ports/kill-switch-store.js';

export class CheckKillSwitch implements KillSwitchPort {
  constructor(
    private readonly store: KillSwitchStore,
    private readonly clock: Clock,
  ) {}

  async assertOperationAllowed(switchId: KillSwitchId): Promise<Result<void, OperationDenied>> {
    let current;
    try {
      current = await this.store.read(switchId);
    } catch {
      // The caught store error is deliberately NOT included: this message
      // reaches HTTP clients through the operation guards, and driver errors
      // carry hosts and connection detail. Store health is diagnosed through
      // readiness, not through this denial.
      return Result.err({
        kind: 'dependency_unavailable',
        switchId,
        message:
          `kill-switch state for '${switchId}' is unreadable — failing closed ` +
          `(an outage must not silently enable a guarded operation)`,
      });
    }

    const evaluation = evaluateKillSwitch(current, this.clock.now());
    if (evaluation.restricted) {
      return Result.err({
        kind: 'operation_restricted',
        switchId,
        reason: evaluation.reason,
        message: `operation temporarily restricted by kill switch '${switchId}': ${evaluation.reason}`,
      });
    }
    return Result.ok(undefined);
  }
}
