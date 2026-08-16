import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';

import { Clock, Result, UserId } from '@karar/shared-kernel';

import { CheckKillSwitch } from '../application/use-cases/check-kill-switch.js';
import { OperateKillSwitch } from '../application/use-cases/operate-kill-switch.js';
import {
  KillSwitchConflictError,
  type KillSwitchOperation,
  type KillSwitchStore,
} from '../application/ports/kill-switch-store.js';
import type { PolicyService } from '../application/ports/policy-service.js';
import type { AuditTrail, AuditTrailEntry } from '../application/ports/audit-trail.js';
import type { KillSwitch, KillSwitchId } from '../domain/kill-switch.js';
import {
  KillSwitchGuard,
  RequireOperationAllowed,
} from '../presentation/http/kill-switch.guard.js';
import type { KillSwitchPort } from '../application/kill-switch-port.js';

const NOW = new Date('2026-08-16T12:00:00.000Z');
const OPERATOR = UserId.of('09e12a70-0000-4000-8000-00000000000e');

class InMemoryKillSwitchStore implements KillSwitchStore {
  switches = new Map<KillSwitchId, KillSwitch>();
  failReads = false;

  seed(id: KillSwitchId, overrides: Partial<KillSwitch> = {}): void {
    this.switches.set(id, {
      id,
      state: 'INACTIVE',
      scope: 'GLOBAL',
      reason: 'seeded ground state - no restriction',
      actor: 'migration:0053_kill_switches',
      version: 1,
      effectiveFrom: new Date(NOW.getTime() - 3_600_000),
      expiresAt: null,
      updatedAt: new Date(NOW.getTime() - 3_600_000),
      ...overrides,
    });
  }

  async read(id: KillSwitchId): Promise<KillSwitch | null> {
    if (this.failReads) {
      throw new Error('connection refused');
    }
    return this.switches.get(id) ?? null;
  }

  async operate(operation: KillSwitchOperation): Promise<KillSwitch> {
    const current = this.switches.get(operation.id);
    if (current === undefined || current.version !== operation.expectedVersion) {
      throw new KillSwitchConflictError('version mismatch');
    }
    const next: KillSwitch = {
      ...current,
      state: operation.state,
      reason: operation.reason,
      actor: operation.actor,
      version: operation.expectedVersion + 1,
      effectiveFrom: operation.effectiveFrom,
      expiresAt: operation.expiresAt,
      updatedAt: operation.effectiveFrom,
    };
    this.switches.set(operation.id, next);
    return next;
  }
}

class RecordingAuditTrail implements AuditTrail {
  entries: AuditTrailEntry[] = [];
  async record(entry: AuditTrailEntry) {
    this.entries.push(entry);
    return Result.ok<void>(undefined);
  }
}

function policyAnswering(allowed: boolean, reason: string): PolicyService {
  return { authorize: async () => ({ allowed, reason }) };
}

function build(policy: PolicyService = policyAnswering(true, 'granted:OPERATOR')) {
  const store = new InMemoryKillSwitchStore();
  for (const id of ['NEW_REGISTRATIONS', 'PASSWORD_LOGIN', 'SESSION_REFRESH', 'TENANT_INVITATIONS'] as const) {
    store.seed(id);
  }
  const audit = new RecordingAuditTrail();
  const clock = new Clock.Fixed(NOW);
  return {
    store,
    audit,
    check: new CheckKillSwitch(store, clock),
    operate: new OperateKillSwitch(store, policy, audit, clock),
  };
}

describe('CheckKillSwitch (the read path / KillSwitchPort)', () => {
  it('allows when INACTIVE, when the row is missing, and when the restriction expired', async () => {
    const { store, check } = build();
    expect((await check.assertOperationAllowed('PASSWORD_LOGIN')).ok).toBe(true);

    store.switches.delete('PASSWORD_LOGIN');
    expect((await check.assertOperationAllowed('PASSWORD_LOGIN')).ok).toBe(true);

    store.seed('SESSION_REFRESH', {
      state: 'ACTIVE_RESTRICTION',
      expiresAt: new Date(NOW.getTime() - 1),
    });
    expect((await check.assertOperationAllowed('SESSION_REFRESH')).ok).toBe(true);
  });

  it('denies with the operator reason while a restriction is active', async () => {
    const { store, check } = build();
    store.seed('NEW_REGISTRATIONS', {
      state: 'ACTIVE_RESTRICTION',
      reason: 'fraud wave',
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    const denied = await check.assertOperationAllowed('NEW_REGISTRATIONS');
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.kind).toBe('operation_restricted');
      expect(denied.error.switchId).toBe('NEW_REGISTRATIONS');
      expect(denied.error.message).toContain('fraud wave');
    }
  });

  it('FAILS CLOSED when the store cannot be read — an outage never silently enables', async () => {
    const { store, check } = build();
    store.failReads = true;
    const denied = await check.assertOperationAllowed('PASSWORD_LOGIN');
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.kind).toBe('dependency_unavailable');
    }
  });
});

describe('OperateKillSwitch', () => {
  it('activates with reason and expiry, increments version, audits with the actor', async () => {
    const { store, audit, operate } = build();
    const activated = await operate.execute(
      {
        switchId: 'PASSWORD_LOGIN',
        action: 'ACTIVATE',
        reason: 'credential stuffing',
        expiresAt: new Date(NOW.getTime() + 3_600_000),
      },
      { userId: OPERATOR },
    );
    expect(activated.ok).toBe(true);
    if (activated.ok) {
      expect(activated.value.killSwitch.state).toBe('ACTIVE_RESTRICTION');
      expect(activated.value.killSwitch.version).toBe(2);
      expect(activated.value.killSwitch.actor).toBe(`user:${UserId.toString(OPERATOR)}`);
    }
    expect(store.switches.get('PASSWORD_LOGIN')?.state).toBe('ACTIVE_RESTRICTION');
    const entry = audit.entries.at(-1);
    expect(entry?.action).toBe('controlplane.killswitch.activated');
    expect(entry?.outcome).toBe('SUCCESS');
    expect(entry?.reason).toBe('credential stuffing');
  });

  it('deactivation clears expiry and audits; version keeps climbing', async () => {
    const { store, audit, operate } = build();
    await operate.execute(
      { switchId: 'TENANT_INVITATIONS', action: 'ACTIVATE', reason: 'incident' },
      { userId: OPERATOR },
    );
    const deactivated = await operate.execute(
      { switchId: 'TENANT_INVITATIONS', action: 'DEACTIVATE', reason: 'incident resolved' },
      { userId: OPERATOR },
    );
    expect(deactivated.ok).toBe(true);
    if (deactivated.ok) {
      expect(deactivated.value.killSwitch.state).toBe('INACTIVE');
      expect(deactivated.value.killSwitch.expiresAt).toBeNull();
      expect(deactivated.value.killSwitch.version).toBe(3);
    }
    expect(store.switches.get('TENANT_INVITATIONS')?.state).toBe('INACTIVE');
    expect(audit.entries.at(-1)?.action).toBe('controlplane.killswitch.deactivated');
  });

  it('deny-by-default: without controlplane.killswitch.operate the operation is refused and audited DENIED', async () => {
    const { store, audit, operate } = build(policyAnswering(false, 'permission_not_held'));
    const refused = await operate.execute(
      { switchId: 'PASSWORD_LOGIN', action: 'ACTIVATE', reason: 'nope' },
      { userId: OPERATOR },
    );
    expect(!refused.ok && refused.error.kind === 'not_authorized').toBe(true);
    expect(store.switches.get('PASSWORD_LOGIN')?.state).toBe('INACTIVE'); // untouched
    expect(audit.entries.at(-1)?.outcome).toBe('DENIED');
  });

  it('validates its input: unknown switch, missing reason, past expiry, expiry on deactivate, bad actor', async () => {
    const { operate } = build();
    const unknown = await operate.execute(
      { switchId: 'EVERYTHING', action: 'ACTIVATE', reason: 'x' },
      { userId: OPERATOR },
    );
    expect(!unknown.ok && unknown.error.kind === 'invalid_operation_input').toBe(true);

    const unreasoned = await operate.execute(
      { switchId: 'PASSWORD_LOGIN', action: 'ACTIVATE', reason: '   ' },
      { userId: OPERATOR },
    );
    expect(!unreasoned.ok && unreasoned.error.kind === 'invalid_operation_input').toBe(true);

    const pastExpiry = await operate.execute(
      {
        switchId: 'PASSWORD_LOGIN',
        action: 'ACTIVATE',
        reason: 'x',
        expiresAt: new Date(NOW.getTime() - 1),
      },
      { userId: OPERATOR },
    );
    expect(!pastExpiry.ok && pastExpiry.error.kind === 'invalid_operation_input').toBe(true);

    const expiryOnDeactivate = await operate.execute(
      {
        switchId: 'PASSWORD_LOGIN',
        action: 'DEACTIVATE',
        reason: 'x',
        expiresAt: new Date(NOW.getTime() + 1_000),
      },
      { userId: OPERATOR },
    );
    expect(!expiryOnDeactivate.ok && expiryOnDeactivate.error.kind === 'invalid_operation_input').toBe(
      true,
    );

    const anonymous = await operate.execute(
      { switchId: 'PASSWORD_LOGIN', action: 'ACTIVATE', reason: 'x' },
      { userId: 'nobody' as never },
    );
    expect(!anonymous.ok && anonymous.error.kind === 'invalid_actor').toBe(true);
  });

  it('a concurrent change surfaces as version_conflict (optimistic concurrency)', async () => {
    const { store, operate } = build();
    const original = store.operate.bind(store);
    store.operate = async (operation) => {
      // Another operator slips in between read and write.
      await original({
        ...operation,
        reason: 'raced you',
        actor: 'user:someone-else',
      });
      return original(operation);
    };
    const conflicted = await operate.execute(
      { switchId: 'SESSION_REFRESH', action: 'ACTIVATE', reason: 'mine' },
      { userId: OPERATOR },
    );
    expect(!conflicted.ok && conflicted.error.kind === 'version_conflict').toBe(true);
  });
});

describe('KillSwitchGuard / RequireOperationAllowed', () => {
  const context = { switchToHttp: () => ({ getRequest: () => ({}) }) } as unknown as ExecutionContext;

  function portAnswering(result: Awaited<ReturnType<KillSwitchPort['assertOperationAllowed']>>): KillSwitchPort {
    return { assertOperationAllowed: async () => result };
  }

  it('passes while unrestricted', async () => {
    const guard = new KillSwitchGuard(portAnswering(Result.ok(undefined)), 'PASSWORD_LOGIN');
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('answers 503 OPERATION_RESTRICTED while restricted', async () => {
    const guard = new KillSwitchGuard(
      portAnswering(
        Result.err({
          kind: 'operation_restricted',
          switchId: 'PASSWORD_LOGIN',
          reason: 'incident',
          message: 'operation temporarily restricted',
        }),
      ),
      'PASSWORD_LOGIN',
    );
    const failure = await guard.canActivate(context).then(
      () => null,
      (error: unknown) => error as { status: number; getResponse(): unknown },
    );
    expect(failure?.status).toBe(503);
    expect(failure?.getResponse()).toMatchObject({ code: 'OPERATION_RESTRICTED' });
  });

  it('answers 503 DEPENDENCY_UNAVAILABLE when the store is down — fail closed at the edge too', async () => {
    const guard = new KillSwitchGuard(
      portAnswering(
        Result.err({
          kind: 'dependency_unavailable',
          switchId: 'NEW_REGISTRATIONS',
          message: 'kill-switch state unreadable',
        }),
      ),
      'NEW_REGISTRATIONS',
    );
    const failure = await guard.canActivate(context).then(
      () => null,
      (error: unknown) => error as { status: number; getResponse(): unknown },
    );
    expect(failure?.status).toBe(503);
    expect(failure?.getResponse()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });

  it('RequireOperationAllowed(...) mints DI guards that extend KillSwitchGuard', () => {
    const Minted = RequireOperationAllowed('SESSION_REFRESH');
    expect(Object.getPrototypeOf(Minted)).toBe(KillSwitchGuard);
  });
});
