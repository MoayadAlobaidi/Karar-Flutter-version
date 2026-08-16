/**
 * Tenant selection and binding groundwork against live PostgreSQL
 * (Phase 3.5, KAR-RSK-021): the 0080 tenant_members SELF-arm and 0081
 * tenants MEMBER-arm proven adversarially (non-empty OWN case FIRST — the
 * AZ2 lesson — then other-user invisibility), the
 * ListOwnMemberships / ResolveTenantContext / GrantFirstPartyMembership use
 * cases over the real repositories, SwitchTenant's verification order and
 * denials over real membership truth (identity seam faked), the
 * CONCURRENT-revocation race with two clients, and pooled-GUC hygiene.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, Result, TenantId, UserId } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  asApp,
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  skipBanner,
  superuserMaintenanceProfile,
  withAdapter,
  TENANT_A,
  TENANT_B,
  USER_A1,
  USER_A2,
  USER_B1,
  USER_NEW,
} from './fixtures.js';
import { PrismaTenantRepository } from '../infrastructure/persistence/prisma-tenant-repository.js';
import { PrismaMembershipRepository } from '../infrastructure/persistence/prisma-membership-repository.js';
import { ListOwnMemberships } from '../application/use-cases/list-own-memberships.js';
import { ResolveTenantContext } from '../application/use-cases/resolve-tenant-context.js';
import { SwitchTenant } from '../application/use-cases/switch-tenant.js';
import { GrantFirstPartyMembership } from '../application/use-cases/grant-first-party-membership.js';
import type {
  BindingClientContext,
  RebindSessionTenantPort,
  RevokeSessionPort,
} from '../application/ports/session-binding.js';
import type { AuditTrail, AuditTrailEntry } from '../application/ports/audit-trail.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'TENANT-CONTEXT TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_tenant_ctx`;

// Extra Phase 3.5 fixtures beyond provisionDatabase's two tenants:
// TENANT_C — a SUSPENDED (disabled) tenant A1 actively belongs to.
// FP_TENANT — the first-party tenant GrantFirstPartyMembership targets.
// USER_NEW — a REMOVED membership in A and an EXPIRED (window-closed) one in B.
const TENANT_C = TenantId.of('cccccccc-0000-4000-8000-00000000000c');
const FP_TENANT = TenantId.of('f1f1f1f1-0000-4000-8000-0000000000f1');
const client: BindingClientContext = { ipDigest: 'digest-1', userAgentSummary: 'test' };

// Fixed AFTER seeding: provisionDatabase (and the rows below) stamp
// effective_from with the database's now(), so the evaluation instant must
// sit past it or every membership reads as not-yet-effective. The
// window-EXPIRED fixture (effective_to 2026-01-01) stays expired at this
// instant, which is exactly what the expiry cases need.
const clock = new Clock.Fixed(new Date('2026-12-01T00:00:00.000Z'));
let handle: PrismaHandle;
let tenants: PrismaTenantRepository;
let memberships: PrismaMembershipRepository;
let auditEntries: AuditTrailEntry[];
let auditTrail: AuditTrail;

function fakeSession(sessionId: string) {
  const at = new Date('2026-08-16T13:00:00.000Z');
  return {
    sessionId,
    accessToken: 'new-access',
    accessTokenExpiresAt: at,
    refreshToken: 'new-refresh',
    refreshTokenExpiresAt: at,
    absoluteExpiresAt: at,
  };
}

describe.skipIf(unreachable !== null)('tenant context and switching (live PostgreSQL)', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    await withAdapter(database, 'superuser', async (adapter) => {
      await adapter.query(
        `INSERT INTO public.tenants (id, type, name, status)
         VALUES ($1, 'WHITE_LABEL', 'Tenant C (suspended)', 'SUSPENDED'),
                ($2, 'FIRST_PARTY', 'Karar (first-party)', 'ACTIVE')`,
        [TenantId.toString(TENANT_C), TenantId.toString(FP_TENANT)],
      );
      const rows: Array<[string, string, string, string, string | null]> = [
        // A1 also actively belongs to B and to the SUSPENDED C.
        ['1a1a1a1a-0000-4000-8000-000000000001', TenantId.toString(TENANT_B), UserId.toString(USER_A1), 'ACTIVE', null],
        ['1a1a1a1a-0000-4000-8000-000000000002', TenantId.toString(TENANT_C), UserId.toString(USER_A1), 'ACTIVE', null],
        // USER_NEW: REMOVED in A; ACTIVE-state but window-EXPIRED in B.
        ['1a1a1a1a-0000-4000-8000-000000000003', TenantId.toString(TENANT_A), UserId.toString(USER_NEW), 'REMOVED', null],
        ['1a1a1a1a-0000-4000-8000-000000000004', TenantId.toString(TENANT_B), UserId.toString(USER_NEW), 'ACTIVE', '2026-01-01T00:00:00.000Z'],
      ];
      for (const [id, tenantId, userId, state, effectiveTo] of rows) {
        await adapter.query(
          `INSERT INTO public.tenant_members (id, tenant_id, user_id, role_hint, state, effective_from, effective_to)
           VALUES ($1, $2, $3, 'MEMBER', $4, '2026-01-01T00:00:00.000Z', $5)`,
          [id, tenantId, userId, state, effectiveTo],
        );
      }
    });
    handle = buildHandle(database);
    tenants = new PrismaTenantRepository(handle);
    memberships = new PrismaMembershipRepository(handle);
    auditEntries = [];
    auditTrail = {
      record: (entry) => {
        auditEntries.push(entry);
        return Promise.resolve(Result.ok(undefined));
      },
    };
  }, 180_000);

  afterAll(async () => {
    await handle.end();
    await dropDatabase(database);
  });

  describe('0080 self-arm and 0081 member-arm (adversarial, SQL as karar_app)', () => {
    it('NON-EMPTY FIRST: with ONLY app.user_id bound, A1 reads their own membership rows across tenants', async () => {
      const rows = await asApp(database, { userId: UserId.toString(USER_A1) }, async (tx) =>
        tx.query<{ tenant_id: string; user_id: string }>(
          'SELECT tenant_id, user_id FROM public.tenant_members ORDER BY tenant_id',
        ),
      );
      expect(rows.rowCount).toBe(3); // A (fixture), B, C
      for (const row of rows.rows) {
        expect(row.user_id).toBe(UserId.toString(USER_A1));
      }
    });

    it("the self-arm exposes NO other user's rows and NO roster: everything visible belongs to the caller", async () => {
      const rows = await asApp(database, { userId: UserId.toString(USER_A1) }, async (tx) =>
        tx.query<{ n: string }>(
          'SELECT count(*)::text AS n FROM public.tenant_members WHERE user_id <> $1',
          [UserId.toString(USER_A1)],
        ),
      );
      expect(rows.rows[0]?.n).toBe('0');
      // A2's row in A1's own tenant stays invisible without a tenant context.
      const a2Row = await asApp(database, { userId: UserId.toString(USER_A1) }, async (tx) =>
        tx.query('SELECT 1 FROM public.tenant_members WHERE user_id = $1', [
          UserId.toString(USER_A2),
        ]),
      );
      expect(a2Row.rowCount).toBe(0);
    });

    it('no GUC at all: zero membership rows (fail closed)', async () => {
      const rows = await asApp(database, {}, async (tx) =>
        tx.query('SELECT 1 FROM public.tenant_members'),
      );
      expect(rows.rowCount).toBe(0);
    });

    it('the self-arm is SELECT-only: user-only context cannot INSERT or UPDATE membership rows', async () => {
      const insert = await asApp(database, { userId: UserId.toString(USER_A1) }, async (tx) =>
        tx
          .query(
            `INSERT INTO public.tenant_members (id, tenant_id, user_id, role_hint, state, effective_from)
             VALUES ('99999999-0000-4000-8000-000000000099', $1, $2, 'MEMBER', 'ACTIVE', now())`,
            [TenantId.toString(TENANT_A), UserId.toString(USER_A1)],
          )
          .then(
            () => 'inserted',
            (error) => (error as { sqlState?: string }).sqlState ?? 'error',
          ),
      );
      expect(insert).toBe('42501');
      const update = await asApp(database, { userId: UserId.toString(USER_A1) }, async (tx) =>
        tx.query(`UPDATE public.tenant_members SET role_hint = 'OWNER' WHERE user_id = $1`, [
          UserId.toString(USER_A1),
        ]),
      );
      expect(update.rowCount).toBe(0); // UPDATE policy needs the tenant arm
    });

    it('NON-EMPTY FIRST: the 0081 member-arm shows A1 the tenants they actively belong to', async () => {
      const rows = await asApp(database, { userId: UserId.toString(USER_A1) }, async (tx) =>
        tx.query<{ id: string }>('SELECT id FROM public.tenants ORDER BY id'),
      );
      expect(rows.rows.map((row) => row.id)).toEqual([
        TenantId.toString(TENANT_A),
        TenantId.toString(TENANT_B),
        TenantId.toString(TENANT_C),
      ]);
    });

    it('the member-arm never exposes the register: B1 sees only tenant B; a REMOVED membership opens nothing', async () => {
      const b1 = await asApp(database, { userId: UserId.toString(USER_B1) }, async (tx) =>
        tx.query<{ id: string }>('SELECT id FROM public.tenants'),
      );
      expect(b1.rows.map((row) => row.id)).toEqual([TenantId.toString(TENANT_B)]);
      // USER_NEW: REMOVED in A (blocked), window-expired-but-ACTIVE-state in B
      // (the ARM is state-keyed; the WINDOW is use-case logic — see below).
      const nw = await asApp(database, { userId: UserId.toString(USER_NEW) }, async (tx) =>
        tx.query<{ id: string }>('SELECT id FROM public.tenants'),
      );
      expect(nw.rows.map((row) => row.id)).toEqual([TenantId.toString(TENANT_B)]);
    });
  });

  describe('ListOwnMemberships and ResolveTenantContext (real repositories)', () => {
    it('lists ONLY active-in-window memberships: USER_NEW has none (REMOVED + expired)', async () => {
      const list = new ListOwnMemberships(memberships, clock);
      const own = await list.execute({ userId: USER_NEW });
      expect(own.ok).toBe(true);
      if (!own.ok) throw new Error('expected a list');
      expect(own.value).toHaveLength(0);
    });

    it('resolves 0 usable memberships to UNBOUND', async () => {
      const resolve = new ResolveTenantContext(memberships, tenants, clock);
      const resolution = await resolve.execute({ userId: USER_NEW });
      expect(resolution.ok && resolution.value.kind).toBe('UNBOUND');
    });

    it('resolves exactly 1 usable membership to AUTO_BIND with safe choice fields only', async () => {
      const resolve = new ResolveTenantContext(memberships, tenants, clock);
      const resolution = await resolve.execute({ userId: USER_A2 });
      expect(resolution.ok).toBe(true);
      if (!resolution.ok) throw new Error('expected a resolution');
      expect(resolution.value.kind).toBe('AUTO_BIND');
      if (resolution.value.kind !== 'AUTO_BIND') throw new Error('expected AUTO_BIND');
      expect(resolution.value.tenantId).toBe(TENANT_A);
      expect(resolution.value.choice).toEqual({
        tenantId: TenantId.toString(TENANT_A),
        name: 'Tenant A',
        roleHint: 'MEMBER',
      });
    });

    it('resolves several memberships to TENANT_SELECTION_REQUIRED with only-active choices — the SUSPENDED tenant C is NOT a choice', async () => {
      const resolve = new ResolveTenantContext(memberships, tenants, clock);
      const resolution = await resolve.execute({ userId: USER_A1 });
      expect(resolution.ok).toBe(true);
      if (!resolution.ok) throw new Error('expected a resolution');
      expect(resolution.value.kind).toBe('TENANT_SELECTION_REQUIRED');
      if (resolution.value.kind !== 'TENANT_SELECTION_REQUIRED') throw new Error('unexpected');
      expect(resolution.value.choices.map((choice) => choice.tenantId)).toEqual([
        TenantId.toString(TENANT_A),
        TenantId.toString(TENANT_B),
      ]);
      for (const choice of resolution.value.choices) {
        expect(Object.keys(choice).sort()).toEqual(['name', 'roleHint', 'tenantId']);
      }
    });

    it('a disabled tenant invalidates the only membership: resolution is UNBOUND, never a half-usable choice', async () => {
      // B2's tenant B suspended IN A SCRATCH STEP would disturb siblings;
      // instead: a user whose ONLY membership is in suspended C.
      await withAdapter(database, 'superuser', async (adapter) => {
        await adapter.query(
          `INSERT INTO public.tenant_members (id, tenant_id, user_id, role_hint, state, effective_from)
           VALUES ('1a1a1a1a-0000-4000-8000-000000000005', $1, $2, 'MEMBER', 'ACTIVE', now())`,
          [TenantId.toString(TENANT_C), '5e5e5e5e-0000-4000-8000-0000000000e5'],
        );
      });
      const resolve = new ResolveTenantContext(memberships, tenants, clock);
      const resolution = await resolve.execute({
        userId: UserId.of('5e5e5e5e-0000-4000-8000-0000000000e5'),
      });
      expect(resolution.ok && resolution.value.kind).toBe('UNBOUND');
    });
  });

  describe('GrantFirstPartyMembership (§35 mechanism, real repositories)', () => {
    it('creates the first-party membership (MEMBER role hint), audited, and is idempotent', async () => {
      const grant = new GrantFirstPartyMembership(memberships, tenants, auditTrail, clock, FP_TENANT);
      auditEntries.length = 0;

      const created = await grant.execute({ userId: USER_NEW });
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error('expected a grant');
      expect(created.value.kind).toBe('created');
      expect(created.value.membership?.roleHint).toBe('MEMBER');
      expect(created.value.membership?.state).toBe('ACTIVE');
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0]?.action).toBe('tenancy.membership.first_party_granted');
      expect(auditEntries[0]?.outcome).toBe('SUCCESS');

      const again = await grant.execute({ userId: USER_NEW });
      expect(again.ok && again.value.kind).toBe('already_member');
      expect(auditEntries).toHaveLength(1); // no second audit for the no-op

      // The membership is real: USER_NEW's resolution now AUTO_BINDs to it.
      const resolve = new ResolveTenantContext(memberships, tenants, clock);
      const resolution = await resolve.execute({ userId: USER_NEW });
      expect(resolution.ok).toBe(true);
      if (!resolution.ok) throw new Error('expected a resolution');
      expect(resolution.value.kind).toBe('AUTO_BIND');
      if (resolution.value.kind !== 'AUTO_BIND') throw new Error('expected AUTO_BIND');
      expect(resolution.value.tenantId).toBe(FP_TENANT);
    });

    it('fails loudly when the configured tenant is not an ACTIVE FIRST_PARTY tenant', async () => {
      const misconfigured = new GrantFirstPartyMembership(
        memberships,
        tenants,
        auditTrail,
        clock,
        TENANT_C, // SUSPENDED and WHITE_LABEL
      );
      const outcome = await misconfigured.execute({ userId: USER_A2 });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected refusal');
      expect(outcome.error.kind).toBe('first_party_tenant_unavailable');
    });
  });

  describe('SwitchTenant (real membership truth, identity seam faked)', () => {
    function switchTenantWith(
      rebind: RebindSessionTenantPort,
      revoke: RevokeSessionPort,
    ): SwitchTenant {
      return new SwitchTenant(memberships, tenants, rebind, revoke, auditTrail, clock);
    }

    const noRevoke: RevokeSessionPort = {
      execute: () => {
        throw new Error('revoke must not be reached in this test');
      },
    };

    it('a valid switch verifies the target, rebinds through the seam, and audits old → new', async () => {
      auditEntries.length = 0;
      const rebindCalls: string[] = [];
      const rebind: RebindSessionTenantPort = {
        execute: (input) => {
          rebindCalls.push(String(input.newTenantId));
          return Promise.resolve(
            Result.ok({
              session: fakeSession('11111111-0000-4000-8000-000000000011'),
              previousBinding: TenantId.toString(TENANT_A),
            }),
          );
        },
      };
      const outcome = await switchTenantWith(rebind, noRevoke).execute(
        { targetTenantId: TenantId.toString(TENANT_B), client },
        { userId: USER_A1, sessionId: 'aaaa1111-0000-4000-8000-000000000001' },
      );
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('expected a switch');
      expect(outcome.value.tenantId).toBe(TenantId.toString(TENANT_B));
      expect(outcome.value.previousTenantId).toBe(TenantId.toString(TENANT_A));
      expect(rebindCalls).toEqual([TenantId.toString(TENANT_B)]);
      const audit = auditEntries.find((entry) => entry.action === 'tenancy.tenant.switch');
      expect(audit?.outcome).toBe('SUCCESS');
      expect(audit?.beforeMetadata).toEqual({ tenantId: TenantId.toString(TENANT_A) });
      expect(audit?.afterMetadata).toEqual({ tenantId: TenantId.toString(TENANT_B) });
    });

    it('denies uniformly — arbitrary tenant, no membership, REMOVED, window-expired, disabled tenant, malformed id — WITHOUT reaching the rebind seam', async () => {
      const rebind: RebindSessionTenantPort = {
        execute: () => {
          throw new Error('rebind must not be reached on a denial');
        },
      };
      const switchTenant = switchTenantWith(rebind, noRevoke);
      const attempts: Array<[UserId, string]> = [
        [USER_A2, '99999999-0000-4000-8000-000000000009'], // arbitrary
        [USER_A2, TenantId.toString(TENANT_B)], // no membership
        [USER_A2, 'not-a-uuid'], // malformed
        [USER_NEW, TenantId.toString(TENANT_A)], // REMOVED membership
        [USER_NEW, TenantId.toString(TENANT_B)], // expired window
        [USER_A1, TenantId.toString(TENANT_C)], // disabled tenant
      ];
      for (const [userId, target] of attempts) {
        const outcome = await switchTenant.execute(
          { targetTenantId: target, client },
          { userId, sessionId: 'aaaa1111-0000-4000-8000-000000000002' },
        );
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error('expected denial');
        expect(outcome.error.kind).toBe('membership_not_found');
      }
    });

    it('FAILS CLOSED when the switch cannot be audited: the replacement session is REVOKED and the caller is failed — a binding nobody can account for does not stand', async () => {
      const failingAudit: AuditTrail = {
        record: () =>
          Promise.resolve(
            Result.err({ kind: 'audit_unavailable' as const, message: 'audit store down (test)' }),
          ),
      };
      const revoked: string[] = [];
      const revoke: RevokeSessionPort = {
        execute: (input) => {
          revoked.push(input.sessionId);
          return Promise.resolve(Result.ok(undefined));
        },
      };
      const rebind: RebindSessionTenantPort = {
        execute: () =>
          Promise.resolve(
            Result.ok({
              session: fakeSession('33333333-0000-4000-8000-000000000033'),
              previousBinding: TenantId.toString(TENANT_A),
            }),
          ),
      };
      const outcome = await new SwitchTenant(
        memberships,
        tenants,
        rebind,
        revoke,
        failingAudit,
        clock,
      ).execute(
        { targetTenantId: TenantId.toString(TENANT_B), client },
        { userId: USER_A1, sessionId: 'aaaa1111-0000-4000-8000-000000000004' },
      );

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected the fail-closed answer');
      expect(outcome.error.kind).toBe('store_failure');
      // The replacement session was reversed, not left live and unrecorded.
      expect(revoked).toEqual(['33333333-0000-4000-8000-000000000033']);
    });

    it('requires the session identity: no sessionId → missing principal context', async () => {
      const outcome = await switchTenantWith(
        { execute: () => Promise.reject(new Error('unreached')) },
        noRevoke,
      ).execute({ targetTenantId: TenantId.toString(TENANT_B), client }, { userId: USER_A1 });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected denial');
      expect(outcome.error.kind).toBe('missing_principal_context');
    });

    it('TWO CLIENTS, CONCURRENT REVOCATION: the membership dies mid-switch — the replacement session is revoked and the caller ends denied, never bound without membership', async () => {
      // Seed a dedicated victim so the race leaves no residue for others.
      const victim = UserId.of('7c7c7c7c-0000-4000-8000-0000000000c7');
      await withAdapter(database, 'superuser', async (adapter) => {
        await adapter.query(
          `INSERT INTO public.tenant_members (id, tenant_id, user_id, role_hint, state, effective_from)
           VALUES ('1a1a1a1a-0000-4000-8000-000000000006', $1, $2, 'MEMBER', 'ACTIVE', now()),
                  ('1a1a1a1a-0000-4000-8000-000000000007', $3, $2, 'MEMBER', 'ACTIVE', now())`,
          [TenantId.toString(TENANT_A), UserId.toString(victim), TenantId.toString(TENANT_B)],
        );
      });

      auditEntries.length = 0;
      const revoked: string[] = [];
      const revoke: RevokeSessionPort = {
        execute: (input) => {
          revoked.push(input.sessionId);
          return Promise.resolve(Result.ok(undefined));
        },
      };
      // CLIENT 2 (the tenant admin, a separate connection): revokes the
      // victim's TARGET membership exactly inside the switch window — after
      // verification passed and the rebind landed, before re-verification.
      const rebind: RebindSessionTenantPort = {
        execute: async () => {
          await asApp(
            database,
            { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(USER_B1) },
            async (tx) => {
              const updated = await tx.query(
                `UPDATE public.tenant_members SET state = 'REMOVED', effective_to = now()
                 WHERE tenant_id = $1 AND user_id = $2`,
                [TenantId.toString(TENANT_B), UserId.toString(victim)],
              );
              expect(updated.rowCount).toBe(1);
            },
          );
          return Result.ok({
            session: fakeSession('22222222-0000-4000-8000-000000000022'),
            previousBinding: TenantId.toString(TENANT_A),
          });
        },
      };

      const outcome = await switchTenantWith(rebind, revoke).execute(
        { targetTenantId: TenantId.toString(TENANT_B), client },
        { userId: victim, sessionId: 'aaaa1111-0000-4000-8000-000000000003' },
      );
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('expected the compensated denial');
      expect(outcome.error.kind).toBe('membership_revoked_concurrently');
      // The compensating action revoked the REPLACEMENT session.
      expect(revoked).toEqual(['22222222-0000-4000-8000-000000000022']);
      const audit = auditEntries.find((entry) => entry.action === 'tenancy.tenant.switch');
      expect(audit?.outcome).toBe('DENIED');
      expect(audit?.reason).toBe('membership_revoked_concurrently');
    });
  });

  it('pooled-context hygiene: after every self-scoped read above, the pool carries no GUC and sees zero rows', async () => {
    const probe = await handle.client.$queryRawUnsafe<
      Array<{ tenant_guc: string | null; user_guc: string | null; members: string }>
    >(
      `SELECT current_setting('app.tenant_id', true) AS tenant_guc,
              current_setting('app.user_id', true) AS user_guc,
              (SELECT count(*) FROM public.tenant_members)::text AS members`,
    );
    const row = probe[0];
    expect(row?.tenant_guc === null || row?.tenant_guc === '').toBe(true);
    expect(row?.user_guc === null || row?.user_guc === '').toBe(true);
    expect(row?.members).toBe('0');
  });
});
