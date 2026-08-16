/**
 * KillSwitchPort — the PROVIDED interface identity and tenancy flows consume
 * (exported through public-api; the composition root or the phase lead wires
 * CheckKillSwitch in). Neither consumer declared a port of its own, so the
 * providing module publishes the contract:
 *
 *   assertOperationAllowed(switchId) →
 *     ok(void)                                — no restriction recorded;
 *     err(operation_restricted, reason)       — an ACTIVE, unexpired switch
 *                                               denies the operation;
 *     err(dependency_unavailable)             — the switch store cannot be
 *                                               read. FAIL CLOSED: an outage
 *                                               must not silently enable a
 *                                               guarded operation. Callers
 *                                               answer 503
 *                                               DEPENDENCY_UNAVAILABLE.
 *
 * The success arm is `void` on purpose — the port can carry a denial with
 * reasons, never a grant of anything (restrict-only invariant).
 */

import type { Result } from '@karar/shared-kernel';

import type { KillSwitchId } from '../domain/kill-switch.js';

export type OperationDenied =
  | {
      readonly kind: 'operation_restricted';
      readonly switchId: KillSwitchId;
      readonly reason: string;
      readonly message: string;
    }
  | {
      readonly kind: 'dependency_unavailable';
      readonly switchId: KillSwitchId;
      readonly message: string;
    };

export interface KillSwitchPort {
  assertOperationAllowed(switchId: KillSwitchId): Promise<Result<void, OperationDenied>>;
}
