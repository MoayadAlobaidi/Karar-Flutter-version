/**
 * The kill-switch registry and its evaluation rule — RESTRICT-ONLY, the
 * module's central invariant (access-control.md §3: OPERATOR is
 * restrict-only; capability-registry.md: configuration can only narrow).
 *
 * A switch can only DENY an operation. The evaluation's result type has
 * exactly two arms — unrestricted, or restricted-with-reason — and the
 * unrestricted arm carries NOTHING: no flag, no grant, no widened authority.
 * INACTIVE, an expired ACTIVE_RESTRICTION, and a missing registry row all
 * evaluate to unrestricted — the operation proceeds exactly as if the
 * mechanism did not exist. There is no code path here (or anywhere in this
 * module) by which a switch enables anything; that absence is test-asserted.
 *
 * The registry is CLOSED and compile-time (mirrored by the id CHECK in
 * migration 0053): a new switch is a reviewed migration plus a change here.
 */

export const KILL_SWITCH_IDS = [
  'NEW_REGISTRATIONS',
  'PASSWORD_LOGIN',
  'SESSION_REFRESH',
  'TENANT_INVITATIONS',
] as const;

export type KillSwitchId = (typeof KILL_SWITCH_IDS)[number];

export const KILL_SWITCH_STATES = ['ACTIVE_RESTRICTION', 'INACTIVE'] as const;
export type KillSwitchState = (typeof KILL_SWITCH_STATES)[number];

export interface KillSwitch {
  readonly id: KillSwitchId;
  readonly state: KillSwitchState;
  readonly scope: 'GLOBAL';
  readonly reason: string;
  readonly actor: string;
  readonly version: number;
  readonly effectiveFrom: Date;
  readonly expiresAt: Date | null;
  readonly updatedAt: Date;
}

export function isKillSwitchId(value: string): value is KillSwitchId {
  return (KILL_SWITCH_IDS as readonly string[]).includes(value);
}

/**
 * Allow/deny with deny-reasons — the ONLY shapes the read path can produce.
 * `restricted: false` deliberately carries no other field.
 */
export type KillSwitchEvaluation =
  | { readonly restricted: false }
  | {
      readonly restricted: true;
      readonly switchId: KillSwitchId;
      readonly reason: string;
    };

const UNRESTRICTED: KillSwitchEvaluation = Object.freeze({ restricted: false });

/**
 * Evaluate a switch (or its absence) at `at`. Missing row = no restriction
 * recorded = unrestricted (restrict-only ground state); expiry is honored
 * here, on the read path — an expired restriction denies nothing.
 */
export function evaluateKillSwitch(
  killSwitch: KillSwitch | null,
  at: Date,
): KillSwitchEvaluation {
  if (killSwitch === null || killSwitch.state === 'INACTIVE') {
    return UNRESTRICTED;
  }
  if (killSwitch.expiresAt !== null && killSwitch.expiresAt.getTime() <= at.getTime()) {
    return UNRESTRICTED;
  }
  return Object.freeze({
    restricted: true,
    switchId: killSwitch.id,
    reason: killSwitch.reason,
  });
}
