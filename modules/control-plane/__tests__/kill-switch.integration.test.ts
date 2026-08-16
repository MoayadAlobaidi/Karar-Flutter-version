import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';

import { Clock, UserId } from '@karar/shared-kernel';
import { PgError, PostgresPersistenceAdapter } from '@karar/platform/dist/db/index.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
// The REAL PolicyService — Layer 1 is not permissive in this suite.
import { PrismaRoleAssignmentRepository, RbacPolicyService } from '@karar/authorization';

import {
  OPERATOR_USER,
  PLAIN_USER,
  SteppingClock,
  appProfile,
  asApp,
  buildAuditTrail,
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  skipBanner,
  superuserMaintenanceProfile,
  withAdapter,
} from './fixtures.js';
import { KILL_SWITCH_IDS } from '../domain/kill-switch.js';
import { CheckKillSwitch } from '../application/use-cases/check-kill-switch.js';
import { OperateKillSwitch } from '../application/use-cases/operate-kill-switch.js';
import { PrismaKillSwitchStore } from '../infrastructure/persistence/prisma-kill-switch-store.js';
import { KillSwitchConflictError } from '../application/ports/kill-switch-store.js';
import { KillSwitchGuard } from '../presentation/http/kill-switch.guard.js';

// KILL SWITCHES against a live scratch database: the four seeded switches
// each block their operation via the port AND the guard, every change is
// versioned + ledgered + audited, expiry is honored, the store outage fails
// closed (closed pool), and the cannot-enable probes hit the database
// mechanisms themselves.

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'KILL-SWITCH INTEGRATION TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_killswitch`;

const clock = new SteppingClock(new Date(Date.now() + 60_000));
const guardContext = {
  switchToHttp: () => ({ getRequest: () => ({}) }),
} as unknown as ExecutionContext;

let handle: PrismaHandle;
let auditAdapter: PostgresPersistenceAdapter;
let store: PrismaKillSwitchStore;
let check: CheckKillSwitch;
let operate: OperateKillSwitch;

describe.skipIf(unreachable !== null)('kill switches — restrict-only (live PostgreSQL)', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);
    auditAdapter = new PostgresPersistenceAdapter(appProfile(database));
    store = new PrismaKillSwitchStore(handle);
    check = new CheckKillSwitch(store, clock);
    const policy = new RbacPolicyService(new PrismaRoleAssignmentRepository(handle), clock);
    const { auditTrail } = buildAuditTrail(auditAdapter);
    operate = new OperateKillSwitch(store, policy, auditTrail, clock);
  }, 60_000);

  afterAll(async () => {
    await handle?.end();
    await auditAdapter?.end();
    await dropDatabase(database);
  });

  it('0053 seeded all four switches INACTIVE at version 1, each with its ledger opening row', async () => {
    await asApp(database, async (tx) => {
      const switches = await tx.query<{ id: string; state: string; version: number }>(
        'SELECT id, state, version FROM public.kill_switches ORDER BY id',
      );
      expect(switches.rows).toEqual(
        [...KILL_SWITCH_IDS].sort().map((id) => ({ id, state: 'INACTIVE', version: 1 })),
      );
      const ledger = await tx.query<{ switch_id: string; version: number }>(
        'SELECT switch_id, version FROM public.kill_switch_history ORDER BY switch_id',
      );
      expect(ledger.rows).toEqual(
        [...KILL_SWITCH_IDS].sort().map((id) => ({ switch_id: id, version: 1 })),
      );
    });
  });

  it('each of the four switches blocks its operation via the port AND the guard; deactivation unblocks', async () => {
    for (const switchId of KILL_SWITCH_IDS) {
      // Unrestricted ground state.
      expect((await check.assertOperationAllowed(switchId)).ok).toBe(true);

      const activated = await operate.execute(
        { switchId, action: 'ACTIVATE', reason: `incident drill for ${switchId}` },
        { userId: OPERATOR_USER },
      );
      expect({ switchId, ok: activated.ok }).toEqual({ switchId, ok: true });

      const denied = await check.assertOperationAllowed(switchId);
      expect(denied.ok).toBe(false);
      if (!denied.ok) {
        expect(denied.error.kind).toBe('operation_restricted');
        expect(denied.error.switchId).toBe(switchId);
      }

      // The guard mirrors the port: 503 OPERATION_RESTRICTED.
      const guard = new KillSwitchGuard(check, switchId);
      const failure = await guard.canActivate(guardContext).then(
        () => null,
        (error: unknown) => error as { status: number; getResponse(): unknown },
      );
      expect(failure?.status).toBe(503);
      expect(failure?.getResponse()).toMatchObject({ code: 'OPERATION_RESTRICTED', switchId });

      const deactivated = await operate.execute(
        { switchId, action: 'DEACTIVATE', reason: 'drill complete' },
        { userId: OPERATOR_USER },
      );
      expect(deactivated.ok).toBe(true);
      expect((await check.assertOperationAllowed(switchId)).ok).toBe(true);
      await expect(new KillSwitchGuard(check, switchId).canActivate(guardContext)).resolves.toBe(
        true,
      );
    }
  });

  it('every change incremented the version, appended the ledger, and audited with the operator', async () => {
    await asApp(database, async (tx) => {
      // Activate + deactivate per switch: version 3, ledger rows 1..3.
      const switches = await tx.query<{ id: string; version: number; state: string }>(
        'SELECT id, version, state FROM public.kill_switches ORDER BY id',
      );
      expect(switches.rows).toEqual(
        [...KILL_SWITCH_IDS].sort().map((id) => ({ id, version: 3, state: 'INACTIVE' })),
      );
      const ledger = await tx.query<{ switch_id: string; version: number; state: string }>(
        'SELECT switch_id, version, state FROM public.kill_switch_history ORDER BY switch_id, version',
      );
      expect(ledger.rowCount).toBe(KILL_SWITCH_IDS.length * 3);
      for (const switchId of KILL_SWITCH_IDS) {
        const rows = ledger.rows.filter((r) => r.switch_id === switchId);
        expect(rows.map((r) => [r.version, r.state])).toEqual([
          [1, 'INACTIVE'],
          [2, 'ACTIVE_RESTRICTION'],
          [3, 'INACTIVE'],
        ]);
      }
    });

    const audits = await withAdapter(database, 'app', (adapter) =>
      adapter.query<{ action: string; outcome: string; actor_ref: string; resource_id: string }>(
        `SELECT action, outcome, actor_ref, resource_id FROM audit.audit_events
         WHERE resource_type = 'kill_switch' ORDER BY recorded_at`,
      ),
    );
    expect(audits.rowCount).toBe(KILL_SWITCH_IDS.length * 2);
    for (const row of audits.rows) {
      expect(['controlplane.killswitch.activated', 'controlplane.killswitch.deactivated']).toContain(
        row.action,
      );
      expect(row.outcome).toBe('SUCCESS');
      expect(row.actor_ref).toBe(`user:${UserId.toString(OPERATOR_USER)}`);
    }
  });

  it('deny-by-default: a principal without OPERATOR cannot operate, the attempt is audited DENIED, state untouched', async () => {
    const refused = await operate.execute(
      { switchId: 'PASSWORD_LOGIN', action: 'ACTIVATE', reason: 'not mine to pull' },
      { userId: PLAIN_USER },
    );
    expect(!refused.ok && refused.error.kind === 'not_authorized').toBe(true);

    await asApp(database, async (tx) => {
      const row = await tx.query<{ state: string; version: number }>(
        `SELECT state, version FROM public.kill_switches WHERE id = 'PASSWORD_LOGIN'`,
      );
      expect(row.rows[0]).toEqual({ state: 'INACTIVE', version: 3 });
    });

    const denied = await withAdapter(database, 'app', (adapter) =>
      adapter.query(
        `SELECT 1 FROM audit.audit_events
         WHERE resource_type = 'kill_switch' AND outcome = 'DENIED' AND actor_ref = $1`,
        [`user:${UserId.toString(PLAIN_USER)}`],
      ),
    );
    expect(denied.rowCount).toBe(1);
  });

  it('expiry is honored by the read path: an expired restriction denies nothing', async () => {
    const activated = await operate.execute(
      {
        switchId: 'NEW_REGISTRATIONS',
        action: 'ACTIVATE',
        reason: 'short freeze',
        expiresAt: new Date(clock.now().getTime() + 10_000),
      },
      { userId: OPERATOR_USER },
    );
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    const expiresAt = activated.value.killSwitch.expiresAt as Date;

    // Before expiry: restricted (this suite's stepping clock is still early).
    const before = await check.assertOperationAllowed('NEW_REGISTRATIONS');
    expect(before.ok).toBe(false);

    // At/after expiry: unrestricted — proven with a read path whose clock
    // sits beyond the expiry instant. No sleeping, no flake.
    const lateCheck = new CheckKillSwitch(
      store,
      new Clock.Fixed(new Date(expiresAt.getTime() + 1)),
    );
    expect((await lateCheck.assertOperationAllowed('NEW_REGISTRATIONS')).ok).toBe(true);

    // Clean up for later probes.
    const deactivated = await operate.execute(
      { switchId: 'NEW_REGISTRATIONS', action: 'DEACTIVATE', reason: 'drill complete' },
      { userId: OPERATOR_USER },
    );
    expect(deactivated.ok).toBe(true);
  });

  it('a stale version conflicts instead of clobbering (optimistic concurrency, DB-enforced)', async () => {
    const current = await store.read('SESSION_REFRESH');
    expect(current).not.toBeNull();
    const stale = store.operate({
      id: 'SESSION_REFRESH',
      state: 'ACTIVE_RESTRICTION',
      reason: 'stale write',
      actor: 'user:tester',
      expectedVersion: (current?.version ?? 1) - 1,
      effectiveFrom: clock.now(),
      expiresAt: null,
    });
    await expect(stale).rejects.toBeInstanceOf(KillSwitchConflictError);
  });

  it('STORE UNAVAILABLE fails closed: a closed pool answers dependency_unavailable, and the guard 503s', async () => {
    const doomedHandle = buildHandle(database);
    await doomedHandle.end(); // the outage
    const downCheck = new CheckKillSwitch(new PrismaKillSwitchStore(doomedHandle), clock);

    const denied = await downCheck.assertOperationAllowed('PASSWORD_LOGIN');
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.kind).toBe('dependency_unavailable');
    }

    const guard = new KillSwitchGuard(downCheck, 'PASSWORD_LOGIN');
    const failure = await guard.canActivate(guardContext).then(
      () => null,
      (error: unknown) => error as { status: number; getResponse(): unknown },
    );
    expect(failure?.status).toBe(503);
    expect(failure?.getResponse()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });

  it('CANNOT-ENABLE, at the database: no fifth switch, no invented state, no app INSERT/DELETE, ledger immutable', async () => {
    // The registry is closed even for the table owner.
    await withAdapter(database, 'migrator', async (adapter) => {
      const fifth = await adapter
        .query(
          `INSERT INTO public.kill_switches (id, state, reason, actor) VALUES ('ALLOW_EVERYTHING', 'INACTIVE', 'x', 'x')`,
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect((fifth as PgError).sqlState).toBe('23514'); // check_violation

      const inventedState = await adapter
        .query(
          `UPDATE public.kill_switches SET state = 'ACTIVE_PERMISSION', reason = 'x', actor = 'x', version = version + 1 WHERE id = 'PASSWORD_LOGIN'`,
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect((inventedState as PgError).sqlState).toBe('23514');
    });

    // karar_app can neither add nor remove switches, nor write the ledger.
    for (const sql of [
      `INSERT INTO public.kill_switches (id, state, reason, actor) VALUES ('NEW_REGISTRATIONS', 'INACTIVE', 'x', 'x')`,
      `DELETE FROM public.kill_switches`,
      `INSERT INTO public.kill_switch_history (id, switch_id, state, scope, reason, actor, version, effective_from)
       VALUES ('99999999-0000-4000-8000-000000000020', 'PASSWORD_LOGIN', 'INACTIVE', 'GLOBAL', 'forged', 'x', 99, now())`,
      `UPDATE public.kill_switch_history SET reason = 'rewritten'`,
      `DELETE FROM public.kill_switch_history`,
    ]) {
      const failure = await withAdapter(database, 'app', (adapter) =>
        adapter.query(sql).then(
          () => null,
          (error: unknown) => error,
        ),
      );
      expect({ sql, error: (failure as PgError)?.sqlState }).toEqual({ sql, error: '42501' });
    }

    // The ledger is immutable even for the superuser (trigger, not grants).
    await withAdapter(database, 'superuser', async (adapter) => {
      const edit = await adapter.query(`UPDATE public.kill_switch_history SET reason = 'x'`).then(
        () => null,
        (error: unknown) => error,
      );
      expect(String((edit as PgError).message)).toContain('append-only');
      const del = await adapter.query(`DELETE FROM public.kill_switch_history`).then(
        () => null,
        (error: unknown) => error,
      );
      expect(String((del as PgError).message)).toContain('append-only');
    });

    // Version discipline holds even for the owner: skipping increments raises.
    await withAdapter(database, 'migrator', async (adapter) => {
      const skipped = await adapter
        .query(
          `UPDATE public.kill_switches SET state = 'INACTIVE', reason = 'x', actor = 'x', version = version + 5 WHERE id = 'PASSWORD_LOGIN'`,
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(String((skipped as PgError).message)).toContain('increment version by exactly one');
    });
  });

  it('the read API shape only returns allow or deny-with-reasons — nothing a caller could read as a grant', async () => {
    const allowed = await check.assertOperationAllowed('TENANT_INVITATIONS');
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      // The success arm is void: there is nothing in it to act on.
      expect(allowed.value).toBeUndefined();
    }
  });
});
