import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';
import {
  PgError,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { PrincipalContextError } from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  asApp,
  buildAuditTrail,
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  skipBanner,
  superuserMaintenanceProfile,
  withAdapter,
  appProfile,
  BIND_GUCS,
  TENANT_A,
  TENANT_B,
  USER_A1,
  USER_A2,
  USER_B1,
} from './fixtures.js';
import { PrismaTenantRepository } from '../infrastructure/persistence/prisma-tenant-repository.js';
import { PrismaMembershipRepository } from '../infrastructure/persistence/prisma-membership-repository.js';
import { PrismaInvitationRepository } from '../infrastructure/persistence/prisma-invitation-repository.js';
import { Sha256InvitationTokenSource } from '../infrastructure/providers/sha256-invitation-token-source.js';
import { PermissiveForTestsPolicyService } from '../application/testing/permissive-policy-service.js';
import { GetOwnTenant } from '../application/use-cases/get-own-tenant.js';
import { ListMembers } from '../application/use-cases/list-members.js';
import { CreateInvitation } from '../application/use-cases/create-invitation.js';
import { RevokeInvitation } from '../application/use-cases/revoke-invitation.js';
import type { PrincipalActor } from '../application/principal.js';

// ADVERSARIAL CROSS-TENANT ISOLATION for tenants, tenant_members, and
// tenant_invitations (tenancy.md §2 layer 4; ADR-0022; legacy AZ2): two
// tenants, both with NON-EMPTY rosters asserted FIRST, then every
// cross-tenant path — direct SQL as karar_app (wrong GUC + missing GUC), the
// Prisma repositories, and the use cases — for SELECT, INSERT, UPDATE, and
// DELETE, plus the FORCE-vs-owner probe and pooled-connection hygiene.
// Layer 1 is deliberately WIDE OPEN here (PermissiveForTestsPolicyService):
// what these tests prove is that RLS alone still holds the boundary.

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'TENANCY ISOLATION TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_tenancy_rls`;

const actorA1: PrincipalActor = { tenantId: TENANT_A, userId: USER_A1 };
const actorB1: PrincipalActor = { tenantId: TENANT_B, userId: USER_B1 };
/** A1's credentials with a session claiming tenant B. */
const actorA1inB: PrincipalActor = { tenantId: TENANT_B, userId: USER_A1 };

const clock = new Clock.Fixed(new Date('2026-08-16T12:00:00.000Z'));
const permissive = new PermissiveForTestsPolicyService();
let handle: PrismaHandle;
let auditAdapter: PostgresPersistenceAdapter;
let tenants: PrismaTenantRepository;
let memberships: PrismaMembershipRepository;
let invitations: PrismaInvitationRepository;
let createInvitation: CreateInvitation;
let revokeInvitation: RevokeInvitation;
let invitationIdA = '';

describe.skipIf(unreachable !== null)('tenancy tables — adversarial isolation (live PostgreSQL)', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);
    auditAdapter = new PostgresPersistenceAdapter(appProfile(database));
    tenants = new PrismaTenantRepository(handle);
    memberships = new PrismaMembershipRepository(handle);
    invitations = new PrismaInvitationRepository(handle);
    const { auditTrail } = buildAuditTrail(auditAdapter);
    createInvitation = new CreateInvitation(
      invitations,
      memberships,
      permissive,
      new Sha256InvitationTokenSource(),
      auditTrail,
      clock,
    );
    revokeInvitation = new RevokeInvitation(invitations, memberships, permissive, auditTrail, clock);
  }, 60_000);

  afterAll(async () => {
    await handle?.end();
    await auditAdapter?.end();
    await dropDatabase(database);
  });

  it('AZ2, NON-EMPTY FIRST: each tenant\'s own roster has its two seeded members at every layer', async () => {
    // Direct SQL under the tenant's own context.
    const sqlA = await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
      async (tx) =>
        (await tx.query<{ n: string }>('SELECT count(*)::text AS n FROM public.tenant_members'))
          .rows[0]?.n,
    );
    expect(sqlA).toBe('2');

    // Repository.
    const rosterA = await memberships.listForTenant(actorA1);
    expect(rosterA).toHaveLength(2);
    expect(rosterA.map((m) => m.userId).sort()).toEqual(
      [UserId.toString(USER_A1), UserId.toString(USER_A2)].sort(),
    );

    // Use case, Layer 1 wide open on purpose.
    const listB = await new ListMembers(memberships, permissive).execute(actorB1);
    expect(listB.ok).toBe(true);
    if (listB.ok) {
      expect(listB.value).toHaveLength(2);
      // And none of tenant A's people appear in it.
      expect(listB.value.map((m) => String(m.userId))).not.toContain(UserId.toString(USER_A1));
    }
  });

  it('tenants: a principal sees exactly its own tenant row — and the OTHER tenant does not exist for it', async () => {
    const own = await tenants.findOwn(actorA1);
    expect(own?.name).toBe('Tenant A'); // non-empty first

    await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
      async (tx) => {
        const visible = await tx.query<{ id: string }>('SELECT id FROM public.tenants');
        expect(visible.rowCount).toBe(1);
        expect(visible.rows[0]?.id).toBe(TenantId.toString(TENANT_A));
        const other = await tx.query('SELECT * FROM public.tenants WHERE id = $1', [
          TenantId.toString(TENANT_B),
        ]);
        expect(other.rowCount).toBe(0);
      },
    );

    // Missing GUC: no tenant exists at all.
    await asApp(database, {}, async (tx) => {
      const none = await tx.query('SELECT * FROM public.tenants');
      expect(none.rowCount).toBe(0);
    });
  });

  it('tenants: karar_app holds no write grants at all (42501 on INSERT/UPDATE/DELETE)', async () => {
    for (const sql of [
      `INSERT INTO public.tenants (id, type, name, status) VALUES ('99999999-0000-4000-8000-000000000099', 'INTERNAL', 'intruder', 'ACTIVE')`,
      `UPDATE public.tenants SET name = 'renamed'`,
      `DELETE FROM public.tenants`,
    ]) {
      const failure = await asApp(
        database,
        { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
        (tx) =>
          tx.query(sql).then(
            () => null,
            (error: unknown) => error,
          ),
      );
      expect(failure).toBeInstanceOf(PgError);
      expect((failure as PgError).sqlState).toBe('42501');
    }
  });

  it('tenant_members, direct SQL: wrong GUC sees/updates nothing; DELETE has no grant; INSERT is tenant+self bound', async () => {
    const gucB = { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(USER_B1) };
    await asApp(database, gucB, async (tx) => {
      const select = await tx.query('SELECT * FROM public.tenant_members WHERE tenant_id = $1', [
        TenantId.toString(TENANT_A),
      ]);
      expect(select.rowCount).toBe(0);

      const update = await tx.query(
        `UPDATE public.tenant_members SET state = 'REMOVED' WHERE tenant_id = $1`,
        [TenantId.toString(TENANT_A)],
      );
      expect(update.rowCount).toBe(0);

      const insertCross = await tx
        .query(
          `INSERT INTO public.tenant_members (id, tenant_id, user_id, state, effective_from)
           VALUES ('99999999-0000-4000-8000-000000000098', $1, $2, 'ACTIVE', now())`,
          [TenantId.toString(TENANT_A), UserId.toString(USER_B1)],
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect((insertCross as PgError).sqlState).toBe('42501');
    });

    // Same tenant, but inserting a row for SOMEONE ELSE: the self-bind WITH
    // CHECK refuses it — membership can only be created for the
    // authenticated principal (the database-level redeemer binding).
    const gucA1 = { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) };
    const insertOther = await asApp(database, gucA1, (tx) =>
      tx
        .query(
          `INSERT INTO public.tenant_members (id, tenant_id, user_id, state, effective_from)
           VALUES ('99999999-0000-4000-8000-000000000097', $1, '99999999-0000-4000-8000-000000000096', 'ACTIVE', now())`,
          [TenantId.toString(TENANT_A)],
        )
        .then(
          () => null,
          (error: unknown) => error,
        ),
    );
    expect((insertOther as PgError).sqlState).toBe('42501');

    // DELETE: no grant, any context.
    const del = await asApp(database, gucA1, (tx) =>
      tx.query('DELETE FROM public.tenant_members').then(
        () => null,
        (error: unknown) => error,
      ),
    );
    expect((del as PgError).sqlState).toBe('42501');

    // Missing GUC: nothing visible.
    await asApp(database, {}, async (tx) => {
      const none = await tx.query('SELECT * FROM public.tenant_members');
      expect(none.rowCount).toBe(0);
    });
  });

  it('tenant_members: the ALLOWED insert shape (tenant + self) works — proven and rolled back', async () => {
    // Positive control for the two denials above: the same INSERT succeeds
    // when tenant AND user match the bound principal. Rolled back to keep
    // the seeded roster at exactly two rows per tenant.
    await withAdapter(database, 'app', async (adapter) => {
      const marker = new Error('rollback-after-proof');
      const failure = await adapter
        .withTransaction(async (tx) => {
          await tx.query(BIND_GUCS, [
            TenantId.toString(TENANT_A),
            '99999999-0000-4000-8000-000000000095',
          ]);
          const insert = await tx.query(
            `INSERT INTO public.tenant_members (id, tenant_id, user_id, state, effective_from)
             VALUES ('99999999-0000-4000-8000-000000000094', $1, '99999999-0000-4000-8000-000000000095', 'ACTIVE', now())`,
            [TenantId.toString(TENANT_A)],
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
    const roster = await memberships.listForTenant(actorA1);
    expect(roster).toHaveLength(2); // the proof left no residue
  });

  it('repository + use case: a tenant-B session cannot read tenant A (and vice versa stays non-empty)', async () => {
    expect(await memberships.findOwn(actorA1inB)).toBeNull();

    const ownTenantAsB = await new GetOwnTenant(tenants, memberships).execute(actorA1inB);
    expect(!ownTenantAsB.ok && ownTenantAsB.error.kind === 'membership_not_found').toBe(true);

    const ownTenantAsA = await new GetOwnTenant(tenants, memberships).execute(actorA1);
    expect(ownTenantAsA.ok).toBe(true);
    if (ownTenantAsA.ok) {
      expect(ownTenantAsA.value.tenant.id).toBe(TENANT_A);
      expect(ownTenantAsA.value.membership.roleHint).toBe('TENANT_ADMIN');
    }
  });

  it('invitations: created in tenant A (non-empty), invisible and irrevocable from tenant B', async () => {
    const created = await createInvitation.execute(
      { email: 'target@example.com', roleHint: 'MEMBER' },
      actorA1,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    invitationIdA = created.value.invitation.id;

    // Non-empty first: tenant A sees its invitation; the stored form is the
    // hash, not the raw token; the email is normalized.
    await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
      async (tx) => {
        const rows = await tx.query<{ email: string; token_hash: string }>(
          'SELECT email, token_hash FROM public.tenant_invitations',
        );
        expect(rows.rowCount).toBe(1);
        expect(rows.rows[0]?.email).toBe('target@example.com');
        expect(rows.rows[0]?.token_hash).not.toBe(created.value.token);
        expect(rows.rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
      },
    );

    // Tenant B: invisible to SELECT and UPDATE, not revocable, not listable.
    await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(USER_B1) },
      async (tx) => {
        const select = await tx.query('SELECT * FROM public.tenant_invitations');
        expect(select.rowCount).toBe(0);
        const update = await tx.query(
          `UPDATE public.tenant_invitations SET revoked_at = now() WHERE id = $1`,
          [invitationIdA],
        );
        expect(update.rowCount).toBe(0);
        const del = await tx.query('DELETE FROM public.tenant_invitations').then(
          () => null,
          (error: unknown) => error,
        );
        expect((del as PgError).sqlState).toBe('42501');
      },
    );

    const revokeFromB = await revokeInvitation.execute(invitationIdA, actorB1);
    expect(!revokeFromB.ok && revokeFromB.error.kind === 'invitation_not_found').toBe(true);

    // Missing GUC: invisible.
    await asApp(database, {}, async (tx) => {
      const none = await tx.query('SELECT * FROM public.tenant_invitations');
      expect(none.rowCount).toBe(0);
    });

    // And the rightful tenant CAN revoke it — one time only.
    const revoked = await revokeInvitation.execute(invitationIdA, actorA1);
    expect(revoked.ok).toBe(true);
    const revokedTwice = await revokeInvitation.execute(invitationIdA, actorA1);
    expect(!revokedTwice.ok && revokedTwice.error.kind === 'invitation_not_found').toBe(true);
  });

  it('invitations: cross-tenant INSERT is refused by WITH CHECK (42501)', async () => {
    const failure = await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(USER_B1) },
      (tx) =>
        tx
          .query(
            `INSERT INTO public.tenant_invitations (id, tenant_id, email, token_hash, expires_at, created_by)
             VALUES ('99999999-0000-4000-8000-000000000093', $1, 'x@example.com', 'deadbeef', now() + interval '1 day', $2)`,
            [TenantId.toString(TENANT_A), UserId.toString(USER_B1)],
          )
          .then(
            () => null,
            (error: unknown) => error,
          ),
    );
    expect(failure).toBeInstanceOf(PgError);
    expect((failure as PgError).sqlState).toBe('42501');
  });

  it('FORCE vs owner: karar_migrator owns every tenancy table and still sees nothing without a GUC', async () => {
    await withAdapter(database, 'migrator', async (adapter) => {
      await adapter.withTransaction(async (tx) => {
        for (const table of ['tenants', 'tenant_members', 'tenant_invitations']) {
          const rows = await tx.query(`SELECT * FROM public.${table}`);
          expect({ table, count: rows.rowCount }).toEqual({ table, count: 0 });
        }
        const update = await tx.query(`UPDATE public.tenant_members SET state = 'REMOVED'`);
        expect(update.rowCount).toBe(0);
      });
      // With a bound tenant the owner sees exactly that tenant — FORCE keeps
      // the owner inside the policy rather than above it.
      await adapter.withTransaction(async (tx) => {
        await tx.query(BIND_GUCS, [TenantId.toString(TENANT_B), UserId.toString(USER_B1)]);
        const members = await tx.query('SELECT * FROM public.tenant_members');
        expect(members.rowCount).toBe(2);
        const tenantRows = await tx.query<{ id: string }>('SELECT id FROM public.tenants');
        expect(tenantRows.rows.map((r) => r.id)).toEqual([TenantId.toString(TENANT_B)]);
      });
    });
  });

  it('repositories fail closed BEFORE any query on an incomplete principal', async () => {
    const failure = await memberships
      .listForTenant({ tenantId: TENANT_A } as unknown as PrincipalActor)
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(PrincipalContextError);
  });

  it('pooled-connection hygiene: after repository work the session carries no GUC and sees no tenancy rows', async () => {
    await memberships.listForTenant(actorA1);
    const probe = await handle.client.$queryRawUnsafe<
      { tenant_guc: string | null; members: bigint; tenant_rows: bigint }[]
    >(
      `SELECT current_setting('app.tenant_id', true) AS tenant_guc,
              (SELECT count(*) FROM public.tenant_members) AS members,
              (SELECT count(*) FROM public.tenants) AS tenant_rows`,
    );
    const row = probe[0];
    expect(row?.tenant_guc === null || row?.tenant_guc === '').toBe(true);
    expect(String(row?.members)).toBe('0');
    expect(String(row?.tenant_rows)).toBe('0');
  });
});
