import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';
import { PgError, PostgresPersistenceAdapter } from '@karar/platform/dist/db/index.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  ADMIN_USER,
  BOOTSTRAP_ASSIGNMENT_ID,
  TARGET_USER,
  TENANT_A,
  TENANT_B,
  USER_A1,
  USER_B1,
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
  BIND_GUCS,
  SteppingClock,
} from './fixtures.js';
import {
  PERMISSION_CATALOGUE,
  ROLE_CATALOGUE,
  ROLE_PERMISSION_GRANTS,
} from '../domain/catalogue.js';
import { RbacPolicyService } from '../application/policy-service.js';
import { AssignRole } from '../application/use-cases/assign-role.js';
import { RevokeRole } from '../application/use-cases/revoke-role.js';
import { PrismaRoleAssignmentRepository } from '../infrastructure/persistence/prisma-role-assignment-repository.js';

// ADVERSARIAL RBAC INTEGRATION on a scratch database: DB seed == code
// catalogue, catalogue immutability for the app role, FK closure, the full
// grant/authorize/revoke loop with immediate revocation, scope discipline
// against live RLS (non-empty first — legacy AZ2), the 0052 policy arms, and
// immutable-after-revoke. Layer 1 here is the REAL service — nothing is
// permissive.

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'AUTHORIZATION INTEGRATION TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_authorization`;

const clock = new SteppingClock(new Date(Date.now() + 60_000));
let handle: PrismaHandle;
let auditAdapter: PostgresPersistenceAdapter;
let repository: PrismaRoleAssignmentRepository;
let policy: RbacPolicyService;
let assignRole: AssignRole;
let revokeRole: RevokeRole;

describe.skipIf(unreachable !== null)('authorization — deny-by-default RBAC (live PostgreSQL)', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);
    auditAdapter = new PostgresPersistenceAdapter(appProfile(database));
    repository = new PrismaRoleAssignmentRepository(handle);
    policy = new RbacPolicyService(repository, clock);
    const { auditTrail } = buildAuditTrail(auditAdapter);
    assignRole = new AssignRole(repository, policy, auditTrail, clock);
    revokeRole = new RevokeRole(repository, policy, auditTrail, clock);
  }, 60_000);

  afterAll(async () => {
    await handle?.end();
    await auditAdapter?.end();
    await dropDatabase(database);
  });

  it('DB seed == code catalogue: permissions, roles, and the mapping match exactly', async () => {
    await withAdapter(database, 'app', async (adapter) => {
      const permissions = await adapter.query<{ id: string; capability: string }>(
        'SELECT id, capability FROM public.permissions ORDER BY id',
      );
      expect(permissions.rows.map((r) => r.id)).toEqual(
        PERMISSION_CATALOGUE.map((p) => p.name).sort(),
      );
      for (const row of permissions.rows) {
        expect(row.capability).toBe(row.id.split('.')[0]);
      }

      const roles = await adapter.query<{ id: string; scope: string }>(
        'SELECT id, scope FROM public.roles ORDER BY id',
      );
      expect(roles.rows.map((r) => [r.id, r.scope])).toEqual(
        [...ROLE_CATALOGUE]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((r) => [r.id, r.scope]),
      );

      const mapping = await adapter.query<{ role_id: string; permission_id: string }>(
        'SELECT role_id, permission_id FROM public.role_permissions ORDER BY role_id, permission_id',
      );
      const expected = Object.entries(ROLE_PERMISSION_GRANTS)
        .flatMap(([role, grants]) => grants.map((g) => [role, g] as const))
        .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
      expect(mapping.rows.map((r) => [r.role_id, r.permission_id])).toEqual(
        expected.map((pair) => [...pair]),
      );
    });
  });

  it('the catalogue is read-only for karar_app (42501 on INSERT/UPDATE/DELETE, all three tables)', async () => {
    for (const sql of [
      `INSERT INTO public.permissions (id, capability, description) VALUES ('evil.thing.do', 'evil', 'x')`,
      `UPDATE public.permissions SET description = 'tampered'`,
      `DELETE FROM public.permissions`,
      `INSERT INTO public.roles (id, description, scope) VALUES ('SUPER_ADMIN', 'x', 'PLATFORM')`,
      `UPDATE public.roles SET scope = 'BOTH'`,
      `DELETE FROM public.roles`,
      `INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('SUPPORT', 'users.status.update')`,
      `UPDATE public.role_permissions SET permission_id = 'users.status.update'`,
      `DELETE FROM public.role_permissions`,
    ]) {
      const failure = await withAdapter(database, 'app', (adapter) =>
        adapter.query(sql).then(
          () => null,
          (error: unknown) => error,
        ),
      );
      expect({ sql, error: (failure as PgError)?.sqlState }).toEqual({ sql, error: '42501' });
    }
  });

  it('an absent permission cannot be granted (FK), and an absent role cannot be assigned — even by the owner', async () => {
    await withAdapter(database, 'migrator', async (adapter) => {
      const badPermission = await adapter
        .query(
          `INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('SUPPORT', 'amanat.content.read')`,
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect((badPermission as PgError).sqlState).toBe('23503');

      // The owner is inside RLS (FORCE) with no principal bound, so the
      // policy refuses before the FK can even speak — itself worth pinning.
      const ownerBlocked = await adapter
        .query(
          `INSERT INTO public.role_assignments (id, user_id, role_id, tenant_id, granted_by, reason, effective_from)
           VALUES ('99999999-0000-4000-8000-000000000010', $1, 'SUPER_ADMIN', NULL, $1, 'x', now())`,
          [UserId.toString(TARGET_USER)],
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect((ownerBlocked as PgError).sqlState).toBe('42501');
    });

    // RLS-bypassing superuser still cannot assign a role outside the
    // catalogue: the FK is the last line.
    await withAdapter(database, 'superuser', async (adapter) => {
      const badRole = await adapter
        .query(
          `INSERT INTO public.role_assignments (id, user_id, role_id, tenant_id, granted_by, reason, effective_from)
           VALUES ('99999999-0000-4000-8000-000000000010', $1, 'SUPER_ADMIN', NULL, $1, 'x', now())`,
          [UserId.toString(TARGET_USER)],
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect((badRole as PgError).sqlState).toBe('23503');
    });
  });

  it('grant → authorize → revoke → authorize: platform SUPPORT, immediately revocable, both audited', async () => {
    const granted = await assignRole.execute(
      { userId: UserId.toString(TARGET_USER), roleId: 'SUPPORT', reason: 'support onboarding' },
      { userId: ADMIN_USER },
    );
    expect(granted.ok).toBe(true);
    if (!granted.ok) return;
    expect(granted.value.auditFailure).toBeNull();

    // Platform-scoped: works with and without a tenant context.
    expect((await policy.authorize({ userId: TARGET_USER }, 'users.profile.read')).allowed).toBe(true);
    expect(
      (await policy.authorize({ userId: TARGET_USER, tenantId: TENANT_B }, 'users.profile.read'))
        .allowed,
    ).toBe(true);
    // …and only for what SUPPORT actually holds.
    expect((await policy.authorize({ userId: TARGET_USER }, 'users.status.update')).allowed).toBe(false);

    const revoked = await revokeRole.execute(
      { userId: UserId.toString(TARGET_USER), roleId: 'SUPPORT', reason: 'offboarding' },
      { userId: ADMIN_USER },
    );
    expect(revoked.ok).toBe(true);

    // Immediate: same process, same service instance, no cache to wait out.
    expect((await policy.authorize({ userId: TARGET_USER }, 'users.profile.read')).allowed).toBe(false);

    const auditRows = await withAdapter(database, 'app', (adapter) =>
      adapter.query<{ action: string; outcome: string; actor_ref: string }>(
        `SELECT action, outcome, actor_ref FROM audit.audit_events
         WHERE action IN ('authorization.role.granted', 'authorization.role.revoked')
         ORDER BY recorded_at`,
      ),
    );
    expect(auditRows.rows.map((r) => [r.action, r.outcome])).toEqual([
      ['authorization.role.granted', 'SUCCESS'],
      ['authorization.role.revoked', 'SUCCESS'],
    ]);
    for (const row of auditRows.rows) {
      expect(row.actor_ref).toBe(`user:${UserId.toString(ADMIN_USER)}`);
    }
  });

  it('re-granting after revocation works — the ACTIVE-only unique index frees revoked history', async () => {
    const again = await assignRole.execute(
      { userId: UserId.toString(TARGET_USER), roleId: 'SUPPORT', reason: 'rehired' },
      { userId: ADMIN_USER },
    );
    expect(again.ok).toBe(true);

    const duplicate = await assignRole.execute(
      { userId: UserId.toString(TARGET_USER), roleId: 'SUPPORT', reason: 'duplicate' },
      { userId: ADMIN_USER },
    );
    expect(!duplicate.ok && duplicate.error.kind === 'already_assigned').toBe(true);
  });

  it('tenant role: works in its tenant, denied in the other tenant and platform-wide; never implies platform permissions', async () => {
    const granted = await assignRole.execute(
      {
        userId: UserId.toString(USER_A1),
        roleId: 'TENANT_ADMIN',
        tenantId: TenantId.toString(TENANT_A),
        reason: 'founding admin',
      },
      { userId: ADMIN_USER },
    );
    expect(granted.ok).toBe(true);

    // Non-empty first: the role authorizes in its own tenant.
    expect(
      (await policy.authorize({ userId: USER_A1, tenantId: TENANT_A }, 'tenancy.member.read'))
        .allowed,
    ).toBe(true);

    // Assignment for tenant A denies in tenant B context…
    expect(
      (await policy.authorize({ userId: USER_A1, tenantId: TENANT_B }, 'tenancy.member.read'))
        .allowed,
    ).toBe(false);
    // …and with no tenant context at all.
    expect((await policy.authorize({ userId: USER_A1 }, 'tenancy.member.read')).allowed).toBe(false);

    // A tenant role NEVER implies a platform permission.
    for (const permission of [
      'authorization.role.assign',
      'users.status.update',
      'entity.entity.manage',
      'controlplane.killswitch.operate',
    ]) {
      const decision = await policy.authorize(
        { userId: USER_A1, tenantId: TENANT_A },
        permission,
      );
      expect({ permission, allowed: decision.allowed }).toEqual({ permission, allowed: false });
    }
  });

  it('deny-by-default at the store: unknown permission, unassigned principal, wildcard', async () => {
    expect((await policy.authorize({ userId: USER_B1 }, 'users.profile.read')).allowed).toBe(false);
    expect((await policy.authorize({ userId: ADMIN_USER }, 'amanat.content.read')).allowed).toBe(false);
    expect((await policy.authorize({ userId: ADMIN_USER }, '*')).allowed).toBe(false);
  });

  it('a platform role authorizes across tenant contexts — but RLS still isolates tenancy rows (non-empty first)', async () => {
    // Layer 1: PLATFORM_ADMIN works in any tenant context.
    expect(
      (await policy.authorize({ userId: ADMIN_USER, tenantId: TENANT_B }, 'entity.entity.manage'))
        .allowed,
    ).toBe(true);

    // Layer 3: the SAME principal bound to tenant B sees tenant B's roster —
    // non-empty — and NOTHING of tenant A. The platform role never widened
    // row visibility.
    await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(ADMIN_USER) },
      async (tx) => {
        const roster = await tx.query<{ tenant_id: string }>(
          'SELECT tenant_id FROM public.tenant_members',
        );
        expect(roster.rowCount).toBe(2);
        for (const row of roster.rows) {
          expect(row.tenant_id).toBe(TenantId.toString(TENANT_B));
        }
        const tenantA = await tx.query('SELECT * FROM public.tenant_members WHERE tenant_id = $1', [
          TenantId.toString(TENANT_A),
        ]);
        expect(tenantA.rowCount).toBe(0);
      },
    );
  });

  it('assignment RLS arms: self-visibility (non-empty), cross-user platform rows invisible, tenant roster arm, missing GUC empty', async () => {
    // Self arm, no tenant: TARGET sees its own platform rows and nothing else.
    await asApp(database, { userId: UserId.toString(TARGET_USER) }, async (tx) => {
      const own = await tx.query<{ user_id: string; tenant_id: string | null }>(
        'SELECT user_id, tenant_id FROM public.role_assignments',
      );
      expect(own.rowCount).toBeGreaterThan(0); // non-empty first
      for (const row of own.rows) {
        expect(row.user_id).toBe(UserId.toString(TARGET_USER));
        expect(row.tenant_id).toBeNull();
      }
      // ADMIN's bootstrap row is a platform row of ANOTHER user: invisible.
      const admins = await tx.query('SELECT * FROM public.role_assignments WHERE user_id = $1', [
        UserId.toString(ADMIN_USER),
      ]);
      expect(admins.rowCount).toBe(0);
    });

    // Tenant arm: a tenant-A context sees tenant-A assignments (the roster
    // mirror), not tenant-B's or anyone's platform rows.
    await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_B1) },
      async (tx) => {
        const visible = await tx.query<{ tenant_id: string | null; user_id: string }>(
          'SELECT tenant_id, user_id FROM public.role_assignments',
        );
        expect(visible.rowCount).toBe(1); // USER_A1's TENANT_ADMIN in A — non-empty
        expect(visible.rows[0]?.tenant_id).toBe(TenantId.toString(TENANT_A));
        expect(visible.rows[0]?.user_id).toBe(UserId.toString(USER_A1));
      },
    );

    // Missing GUCs: nothing at all.
    await asApp(database, {}, async (tx) => {
      const none = await tx.query('SELECT * FROM public.role_assignments');
      expect(none.rowCount).toBe(0);
    });
  });

  it('writes are bound to the transaction principal: cross-user INSERT refused (42501), self-shape proven and rolled back', async () => {
    // Cross-user: a transaction bound to USER_B1 cannot create a row FOR TARGET.
    const crossUser = await asApp(
      database,
      { userId: UserId.toString(USER_B1) },
      (tx) =>
        tx
          .query(
            `INSERT INTO public.role_assignments (id, user_id, role_id, tenant_id, granted_by, reason, effective_from)
             VALUES ('99999999-0000-4000-8000-000000000011', $1, 'SUPPORT', NULL, $2, 'smuggled', now())`,
            [UserId.toString(TARGET_USER), UserId.toString(USER_B1)],
          )
          .then(
            () => null,
            (error: unknown) => error,
          ),
    );
    expect(crossUser).toBeInstanceOf(PgError);
    expect((crossUser as PgError).sqlState).toBe('42501');

    // Positive control: the target-bound shape the repository uses IS
    // insertable — proven, then rolled back. Layer 1 (who may reach this
    // write path) lives in the use case; the policy bounds the blast radius.
    await withAdapter(database, 'app', async (adapter) => {
      const marker = new Error('rollback-after-proof');
      const failure = await adapter
        .withTransaction(async (tx) => {
          await tx.query(BIND_GUCS, ['', UserId.toString(USER_B1)]);
          const insert = await tx.query(
            `INSERT INTO public.role_assignments (id, user_id, role_id, tenant_id, granted_by, reason, effective_from)
             VALUES ('99999999-0000-4000-8000-000000000012', $1, 'SUPPORT', NULL, $1, 'proof', now())`,
            [UserId.toString(USER_B1)],
          );
          expect(insert.rowCount).toBe(1);
          throw marker;
        })
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(failure).toBe(marker);
    });

    // UPDATE under the wrong principal matches nothing.
    await asApp(database, { userId: UserId.toString(USER_B1) }, async (tx) => {
      const update = await tx.query(
        `UPDATE public.role_assignments SET status = 'REVOKED', revoked_at = now(), revoked_by = $1, effective_to = now()
         WHERE user_id = $2`,
        [UserId.toString(USER_B1), UserId.toString(TARGET_USER)],
      );
      expect(update.rowCount).toBe(0);
    });

    // DELETE: no grant, any context (42501).
    const del = await asApp(database, { userId: UserId.toString(TARGET_USER) }, (tx) =>
      tx.query('DELETE FROM public.role_assignments').then(
        () => null,
        (error: unknown) => error,
      ),
    );
    expect((del as PgError).sqlState).toBe('42501');
  });

  it('FORCE vs owner: karar_migrator owns role_assignments and still sees nothing without a GUC', async () => {
    await withAdapter(database, 'migrator', async (adapter) => {
      await adapter.withTransaction(async (tx) => {
        const rows = await tx.query('SELECT * FROM public.role_assignments');
        expect(rows.rowCount).toBe(0);
      });
    });
  });

  it('revoked assignments are immutable — even for the superuser (trigger, not policy)', async () => {
    // TARGET's first SUPPORT assignment was revoked earlier in this suite.
    await withAdapter(database, 'superuser', async (adapter) => {
      const revoked = await adapter.query<{ id: string }>(
        `SELECT id FROM public.role_assignments WHERE status = 'REVOKED' LIMIT 1`,
      );
      expect(revoked.rowCount).toBe(1);
      const id = revoked.rows[0]?.id;

      const edit = await adapter
        .query(`UPDATE public.role_assignments SET reason = 'rewritten' WHERE id = $1`, [id])
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(edit).toBeInstanceOf(PgError);
      expect(String((edit as PgError).message)).toContain('revoked and immutable');

      const del = await adapter
        .query(`DELETE FROM public.role_assignments WHERE id = $1`, [id])
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(String((del as PgError).message)).toContain('DELETE is not permitted');
    });
  });

  it('the un-revoked bootstrap row rejects edits of grant columns (only the revocation transition exists)', async () => {
    await withAdapter(database, 'superuser', async (adapter) => {
      const edit = await adapter
        .query(
          `UPDATE public.role_assignments SET reason = 'tampered' WHERE id = $1`,
          [BOOTSTRAP_ASSIGNMENT_ID],
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(String((edit as PgError).message)).toContain('revocation transition');
    });
  });

  it('pooled-connection hygiene: after repository work the session carries no GUC and sees no assignments', async () => {
    await repository.listOwnActive({ userId: ADMIN_USER }, clock.now());
    const probe = await handle.client.$queryRawUnsafe<
      { user_guc: string | null; assignments: bigint }[]
    >(
      `SELECT current_setting('app.user_id', true) AS user_guc,
              (SELECT count(*) FROM public.role_assignments) AS assignments`,
    );
    const row = probe[0];
    expect(row?.user_guc === null || row?.user_guc === '').toBe(true);
    expect(String(row?.assignments)).toBe('0');
  });
});
