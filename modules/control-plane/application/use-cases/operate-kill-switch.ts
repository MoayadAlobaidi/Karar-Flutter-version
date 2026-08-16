/**
 * OperateKillSwitch — activate or deactivate a restrict-only switch. Phase 3
 * exposes NO HTTP surface for this (the control-plane UI is Phase 8); the
 * callers are runbooks/tests through this use case, so the rules hold no
 * matter which entrance is used:
 *
 *   - gated on `controlplane.killswitch.operate` via the PolicyService port
 *     (deny-by-default; denials audited with DENIED outcome);
 *   - reason and actor are REQUIRED — an anonymous or unexplained
 *     restriction is not operable;
 *   - version increments by exactly one per change (optimistic concurrency;
 *     DB-trigger-enforced), the history ledger row is appended by the store
 *     trigger in the same transaction, and the change is audited;
 *   - expires_at is honored BY THE READ PATH (CheckKillSwitch): an
 *     activation may carry an expiry so a forgotten switch fails open into
 *     the unrestricted ground state instead of restricting forever;
 *   - deactivation clears expiry (the schema forbids expiry on INACTIVE).
 *
 * Restrict-only: both verbs move between "restriction recorded" and "no
 * restriction recorded". Nothing here (or anywhere) turns a switch into a
 * grant of anything.
 */

import { Result, UserId, type Clock } from '@karar/shared-kernel';

import {
  isKillSwitchId,
  type KillSwitch,
  type KillSwitchId,
  type KillSwitchState,
} from '../../domain/kill-switch.js';
import type { OperateKillSwitchError } from '../errors.js';
import type { AuditTrail, AuditTrailFailure } from '../ports/audit-trail.js';
import {
  KillSwitchConflictError,
  KillSwitchRegistryError,
  type KillSwitchStore,
} from '../ports/kill-switch-store.js';
import { CONTROL_PLANE_PERMISSIONS, type PolicyActor, type PolicyService } from '../ports/policy-service.js';

export interface OperateKillSwitchInput {
  readonly switchId: string;
  readonly action: 'ACTIVATE' | 'DEACTIVATE';
  readonly reason: string;
  /** Optional expiry for ACTIVATE; must lie in the future. */
  readonly expiresAt?: Date | null;
}

export interface KillSwitchOperated {
  readonly killSwitch: KillSwitch;
  readonly auditFailure: AuditTrailFailure | null;
}

export class OperateKillSwitch {
  constructor(
    private readonly store: KillSwitchStore,
    private readonly policy: PolicyService,
    private readonly auditTrail: AuditTrail,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: OperateKillSwitchInput,
    actor: PolicyActor,
  ): Promise<Result<KillSwitchOperated, OperateKillSwitchError>> {
    if (
      actor === null ||
      actor === undefined ||
      typeof actor.userId !== 'string' ||
      !UserId.parse(actor.userId).ok
    ) {
      return Result.err({
        kind: 'invalid_actor',
        message:
          'operating a kill switch requires an authenticated principal — denied (fail closed)',
      });
    }
    if (!isKillSwitchId(input.switchId)) {
      return Result.err({
        kind: 'invalid_operation_input',
        message: `'${String(input.switchId)}' is not a registered kill switch`,
      });
    }
    const switchId: KillSwitchId = input.switchId;
    if (input.action !== 'ACTIVATE' && input.action !== 'DEACTIVATE') {
      return Result.err({
        kind: 'invalid_operation_input',
        message: "action must be 'ACTIVATE' or 'DEACTIVATE'",
      });
    }
    if (typeof input.reason !== 'string' || input.reason.trim() === '') {
      return Result.err({
        kind: 'invalid_operation_input',
        message: 'operating a kill switch requires a non-empty reason',
      });
    }
    const occurredAt = this.clock.now();
    let expiresAt: Date | null = null;
    if (input.expiresAt !== undefined && input.expiresAt !== null) {
      if (input.action !== 'ACTIVATE') {
        return Result.err({
          kind: 'invalid_operation_input',
          message: 'expiry belongs to an activation; deactivation clears it',
        });
      }
      if (!(input.expiresAt instanceof Date) || input.expiresAt.getTime() <= occurredAt.getTime()) {
        return Result.err({
          kind: 'invalid_operation_input',
          message: 'expiresAt must be a future instant',
        });
      }
      expiresAt = input.expiresAt;
    }

    try {
      const decision = await this.policy.authorize(
        actor,
        CONTROL_PLANE_PERMISSIONS.operateKillSwitch,
        { switchId },
      );
      if (!decision.allowed) {
        await this.recordAudit(actor, 'DENIED', switchId, {
          reason: decision.reason,
          action: input.action,
        });
        return Result.err({
          kind: 'not_authorized',
          permission: CONTROL_PLANE_PERMISSIONS.operateKillSwitch,
          reason: decision.reason,
          message: `'${CONTROL_PLANE_PERMISSIONS.operateKillSwitch}' denied: ${decision.reason}`,
        });
      }

      const current = await this.store.read(switchId);
      if (current === null) {
        // 0053 seeds every registered switch; a missing row is a store
        // defect, and operating on guesswork is not an option.
        return Result.err({
          kind: 'store_failure',
          message: `kill switch '${switchId}' has no seeded row — the store is in a defective state`,
        });
      }

      const state: KillSwitchState =
        input.action === 'ACTIVATE' ? 'ACTIVE_RESTRICTION' : 'INACTIVE';
      const operated = await this.store.operate({
        id: switchId,
        state,
        reason: input.reason.trim(),
        actor: `user:${UserId.toString(actor.userId)}`,
        expectedVersion: current.version,
        effectiveFrom: occurredAt,
        expiresAt: input.action === 'ACTIVATE' ? expiresAt : null,
      });

      const audit = await this.recordAudit(actor, 'SUCCESS', switchId, {
        reason: input.reason.trim(),
        action: input.action,
        version: operated.version,
        expiresAt: operated.expiresAt,
      });

      return Result.ok({ killSwitch: operated, auditFailure: audit });
    } catch (error) {
      if (error instanceof KillSwitchConflictError) {
        return Result.err({
          kind: 'version_conflict',
          message: `kill switch '${switchId}' changed concurrently — re-read and retry`,
        });
      }
      if (error instanceof KillSwitchRegistryError) {
        return Result.err({ kind: 'store_failure', message: error.message });
      }
      return Result.err({
        kind: 'store_failure',
        message: `kill-switch operation failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async recordAudit(
    actor: PolicyActor,
    outcome: 'SUCCESS' | 'DENIED',
    switchId: KillSwitchId,
    details: { reason: string; action: string; version?: number; expiresAt?: Date | null },
  ): Promise<AuditTrailFailure | null> {
    const written = await this.auditTrail.record({
      occurredAt: this.clock.now(),
      actorRef: `user:${UserId.toString(actor.userId)}`,
      tenantRef: null,
      action:
        outcome === 'SUCCESS'
          ? details.action === 'ACTIVATE'
            ? 'controlplane.killswitch.activated'
            : 'controlplane.killswitch.deactivated'
          : 'controlplane.killswitch.operate',
      resourceType: 'kill_switch',
      resourceId: switchId,
      reason: details.reason,
      requestId: actor.requestId ?? null,
      afterMetadata: {
        operation: details.action,
        ...(details.version !== undefined ? { version: String(details.version) } : {}),
        ...(details.expiresAt !== undefined && details.expiresAt !== null
          ? { expires_at: details.expiresAt.toISOString() }
          : {}),
      },
      outcome,
    });
    return written.ok ? null : written.error;
  }
}
