import { describe, expect, it } from 'vitest';

import {
  KILL_SWITCH_IDS,
  KILL_SWITCH_STATES,
  evaluateKillSwitch,
  isKillSwitchId,
  type KillSwitch,
  type KillSwitchEvaluation,
} from '../domain/kill-switch.js';

// The restrict-only invariant, pinned: evaluation has TWO shapes — allow
// (carrying nothing) or deny-with-reason — and every non-restricting state
// (INACTIVE, missing, expired) is indistinguishable from the mechanism not
// existing.

const NOW = new Date('2026-08-16T12:00:00.000Z');

function killSwitch(overrides: Partial<KillSwitch> = {}): KillSwitch {
  return {
    id: 'PASSWORD_LOGIN',
    state: 'INACTIVE',
    scope: 'GLOBAL',
    reason: 'seeded ground state - no restriction',
    actor: 'migration:0053_kill_switches',
    version: 1,
    effectiveFrom: new Date(NOW.getTime() - 3_600_000),
    expiresAt: null,
    updatedAt: new Date(NOW.getTime() - 3_600_000),
    ...overrides,
  };
}

describe('the registry', () => {
  it('holds exactly the four Phase 3 switches', () => {
    expect([...KILL_SWITCH_IDS].sort()).toEqual([
      'NEW_REGISTRATIONS',
      'PASSWORD_LOGIN',
      'SESSION_REFRESH',
      'TENANT_INVITATIONS',
    ]);
    expect(KILL_SWITCH_STATES).toEqual(['ACTIVE_RESTRICTION', 'INACTIVE']);
  });

  it('isKillSwitchId is the closed check', () => {
    for (const id of KILL_SWITCH_IDS) {
      expect(isKillSwitchId(id)).toBe(true);
    }
    expect(isKillSwitchId('MFA_ENROLMENT')).toBe(false);
    expect(isKillSwitchId('*')).toBe(false);
    expect(isKillSwitchId('')).toBe(false);
  });
});

describe('evaluateKillSwitch — restrict-only', () => {
  it('INACTIVE, missing row, and expired restriction all evaluate unrestricted', () => {
    expect(evaluateKillSwitch(killSwitch({ state: 'INACTIVE' }), NOW)).toEqual({
      restricted: false,
    });
    expect(evaluateKillSwitch(null, NOW)).toEqual({ restricted: false });
    expect(
      evaluateKillSwitch(
        killSwitch({
          state: 'ACTIVE_RESTRICTION',
          expiresAt: new Date(NOW.getTime() - 1),
        }),
        NOW,
      ),
    ).toEqual({ restricted: false });
    // Boundary: expiry AT the evaluation instant no longer restricts.
    expect(
      evaluateKillSwitch(
        killSwitch({ state: 'ACTIVE_RESTRICTION', expiresAt: NOW }),
        NOW,
      ),
    ).toEqual({ restricted: false });
  });

  it('an active, unexpired restriction denies with the operator reason', () => {
    const active = killSwitch({
      state: 'ACTIVE_RESTRICTION',
      reason: 'credential stuffing incident',
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    expect(evaluateKillSwitch(active, NOW)).toEqual({
      restricted: true,
      switchId: 'PASSWORD_LOGIN',
      reason: 'credential stuffing incident',
    });
    // No expiry at all restricts indefinitely (until deactivated).
    expect(
      evaluateKillSwitch(killSwitch({ state: 'ACTIVE_RESTRICTION', expiresAt: null }), NOW)
        .restricted,
    ).toBe(true);
  });

  it('CANNOT-ENABLE: the unrestricted arm carries NOTHING — no field a caller could read as a grant', () => {
    const evaluations: KillSwitchEvaluation[] = [
      evaluateKillSwitch(null, NOW),
      evaluateKillSwitch(killSwitch({ state: 'INACTIVE' }), NOW),
      evaluateKillSwitch(
        killSwitch({ state: 'ACTIVE_RESTRICTION', expiresAt: new Date(NOW.getTime() - 1) }),
        NOW,
      ),
    ];
    for (const evaluation of evaluations) {
      expect(evaluation.restricted).toBe(false);
      // The allow arm is shape-frozen: exactly one key, no authority payload.
      expect(Object.keys(evaluation)).toEqual(['restricted']);
      expect(Object.isFrozen(evaluation)).toBe(true);
    }
    // And the deny arm carries only identification + reason.
    const denied = evaluateKillSwitch(
      killSwitch({ state: 'ACTIVE_RESTRICTION' }),
      NOW,
    );
    expect(Object.keys(denied).sort()).toEqual(['reason', 'restricted', 'switchId']);
  });
});
