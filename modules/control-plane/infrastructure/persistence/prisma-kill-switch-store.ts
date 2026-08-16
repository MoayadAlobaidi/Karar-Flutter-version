/**
 * PrismaKillSwitchStore — the KillSwitchStore port over the platform Prisma
 * handle. kill_switches is a deliberately GLOBAL table (rls-allow-list.json):
 * reads happen PRE-AUTH, so no principal context wraps them — there is no
 * principal yet to bind, and no GUC is set (nothing to leak across the pool).
 *
 * `operate` runs both statements in one interactive transaction: the
 * optimistic UPDATE (WHERE version = expected; the 0053 trigger enforces the
 * +1 increment and appends the history row in the same transaction) and the
 * read-back of the new state.
 */

import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  KillSwitchConflictError,
  KillSwitchRegistryError,
  type KillSwitchOperation,
  type KillSwitchStore,
} from '../../application/ports/kill-switch-store.js';
import {
  isKillSwitchId,
  KILL_SWITCH_STATES,
  type KillSwitch,
  type KillSwitchState,
} from '../../domain/kill-switch.js';

export class ControlPlaneStoreError extends Error {
  override readonly name = 'ControlPlaneStoreError';
}

interface KillSwitchRow {
  id: string;
  state: string;
  scope: string;
  reason: string;
  actor: string;
  version: number;
  effectiveFrom: Date;
  expiresAt: Date | null;
  updatedAt: Date;
}

function toKillSwitch(row: KillSwitchRow): KillSwitch {
  if (!isKillSwitchId(row.id)) {
    throw new ControlPlaneStoreError(`kill_switches.id holds unregistered value '${row.id}'`);
  }
  if (!(KILL_SWITCH_STATES as readonly string[]).includes(row.state)) {
    throw new ControlPlaneStoreError(`kill_switches.state holds unknown value '${row.state}'`);
  }
  if (row.scope !== 'GLOBAL') {
    throw new ControlPlaneStoreError(`kill_switches.scope holds unknown value '${row.scope}'`);
  }
  return Object.freeze({
    id: row.id,
    state: row.state as KillSwitchState,
    scope: 'GLOBAL' as const,
    reason: row.reason,
    actor: row.actor,
    version: row.version,
    effectiveFrom: row.effectiveFrom,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaKillSwitchStore implements KillSwitchStore {
  constructor(private readonly handle: PrismaHandle) {}

  async read(id: string): Promise<KillSwitch | null> {
    const row = await this.handle.client.killSwitch.findUnique({ where: { id } });
    return row === null ? null : toKillSwitch(row);
  }

  async operate(operation: KillSwitchOperation): Promise<KillSwitch> {
    return this.handle.client.$transaction(async (tx) => {
      const updated = await tx.killSwitch.updateMany({
        where: { id: operation.id, version: operation.expectedVersion },
        data: {
          state: operation.state,
          reason: operation.reason,
          actor: operation.actor,
          version: operation.expectedVersion + 1,
          effectiveFrom: operation.effectiveFrom,
          expiresAt: operation.expiresAt,
        },
      });
      if (updated.count === 0) {
        const exists = await tx.killSwitch.findUnique({ where: { id: operation.id } });
        if (exists === null) {
          throw new KillSwitchRegistryError(
            `kill switch '${operation.id}' has no row — 0053 seeds every registered switch`,
          );
        }
        throw new KillSwitchConflictError(
          `kill switch '${operation.id}' is at version ${exists.version}, not ${operation.expectedVersion}`,
        );
      }
      const row = await tx.killSwitch.findUnique({ where: { id: operation.id } });
      if (row === null) {
        throw new ControlPlaneStoreError(`kill switch '${operation.id}' vanished mid-transaction`);
      }
      return toKillSwitch(row);
    });
  }
}
