/**
 * KillSwitchStore — this module's port onto the kill_switches table
 * (migration 0053). Reads happen PRE-AUTH (the switches gate registration
 * and login), so `read` runs with no principal context; the table is
 * deliberately global (rls-allow-list.json). A store failure PROPAGATES —
 * the read use case turns it into the fail-closed dependency_unavailable
 * denial; the store itself never guesses.
 */

import type { KillSwitch, KillSwitchId, KillSwitchState } from '../../domain/kill-switch.js';

export interface KillSwitchOperation {
  readonly id: KillSwitchId;
  readonly state: KillSwitchState;
  readonly reason: string;
  readonly actor: string;
  /** Optimistic concurrency: the UPDATE applies only at this version. */
  readonly expectedVersion: number;
  readonly effectiveFrom: Date;
  /** Only meaningful with ACTIVE_RESTRICTION; null clears. */
  readonly expiresAt: Date | null;
}

/** The switch changed under the operator's feet — an expected conflict. */
export class KillSwitchConflictError extends Error {
  override readonly name = 'KillSwitchConflictError';
}

/** A registered switch's row is missing — a store defect (0053 seeds all four). */
export class KillSwitchRegistryError extends Error {
  override readonly name = 'KillSwitchRegistryError';
}

export interface KillSwitchStore {
  /** The current row, or null when none exists (evaluates unrestricted). */
  read(id: KillSwitchId): Promise<KillSwitch | null>;

  /**
   * Apply the state change at `expectedVersion` (version increments by one;
   * the history append is trigger-enforced in the same transaction). Throws
   * KillSwitchConflictError on a version race, KillSwitchRegistryError when
   * the seeded row is missing.
   */
  operate(operation: KillSwitchOperation): Promise<KillSwitch>;
}
