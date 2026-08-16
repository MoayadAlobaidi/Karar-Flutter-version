/**
 * Cross-tenant isolation, END-TO-END across the Phase 3 module boundaries
 * (tenancy.md §2 layer 4; ADR-0022; legacy AZ2). The module suites prove each
 * table in its own scratch database; this suite seeds TWO tenants with real
 * rows across ALL the tenant-scoped tables at once — user_profiles,
 * tenant_members, tenant_invitations, role_assignments, consent_grants — and
 * probes the integrated surface in single transactions, exactly the way a
 * compromised or buggy request path would see it.
 *
 * Non-empty FIRST, always: every denial below is preceded by the same read
 * succeeding in the rightful context, because "an empty roster is
 * indistinguishable from correct isolation" (legacy AZ2).
 *
 * Layer 1 does not exist in this suite on purpose: everything runs as direct
 * SQL on the karar_app role. What is proven is that RLS ALONE holds the
 * boundary when every application-layer check is bypassed.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PgError, PostgresPersistenceAdapter } from '@karar/platform/dist/db/index.js';
import { withPrincipalContext } from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  appProfile,
  asApp,
  ASSIGNMENT_B1_TENANT,
  buildHandle,
  CONSENT_B1,
  dropDatabase,
  INVITATION_B,
  probePostgres,
  provisionSecurityDatabase,
  refusalOf,
  seedTenantData,
  skipBanner,
  TENANT_A,
  tenantA,
  tenantB,
  USER_A1,
  userA1,
  userA2,
  userB1,
} from '../fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(skipBanner('CROSS-TENANT ISOLATION (security suite)', unreachable));
}

const database = `karar_sec_${process.pid}_isolation`;

/** The five tenant-scoped tables this suite spans, with tenant A's expected row counts. */
const TENANT_SCOPED_COUNTS: ReadonlyArray<readonly [table: string, tenantARows: number]> = [
  ['public.user_profiles', 2],
  ['public.tenant_members', 2],
  ['public.tenant_invitations', 1],
  ['public.role_assignments', 2], // tenant arm (1) + A1's own platform-scoped row (1)
  ['public.consent_grants', 1],
];

describe.skipIf(unreachable !== null)(
  'cross-tenant isolation across all Phase 3 tenant-scoped tables (live PostgreSQL)',
  () => {
    beforeAll(async () => {
      await provisionSecurityDatabase(database);
      await seedTenantData(database);
    }, 180_000);

    afterAll(async () => {
      await dropDatabase(database);
    }, 60_000);

    it('NON-EMPTY FIRST: one transaction per tenant reads its own seeded rows across every table', async () => {
      const countsA = await asApp(database, { tenantId: tenantA, userId: userA1 }, async (tx) => {
        const out: Record<string, number> = {};
        for (const [table] of TENANT_SCOPED_COUNTS) {
          out[table] = (await tx.query(`SELECT 1 FROM ${table}`)).rowCount ?? 0;
        }
        return out;
      });
      for (const [table, expected] of TENANT_SCOPED_COUNTS) {
        expect({ table, rows: countsA[table] }).toEqual({ table, rows: expected });
      }

      // Tenant B sees its own rows too — the isolation below is not emptiness.
      const countsB = await asApp(database, { tenantId: tenantB, userId: userB1 }, async (tx) => ({
        profiles: (await tx.query('SELECT 1 FROM public.user_profiles')).rowCount,
        members: (await tx.query('SELECT 1 FROM public.tenant_members')).rowCount,
        invitations: (await tx.query('SELECT 1 FROM public.tenant_invitations')).rowCount,
        assignments: (await tx.query('SELECT 1 FROM public.role_assignments')).rowCount,
        grants: (await tx.query('SELECT 1 FROM public.consent_grants')).rowCount,
      }));
      expect(countsB).toEqual({
        profiles: 2,
        members: 2,
        invitations: 1,
        assignments: 1,
        grants: 1,
      });
    });

    it("tenant A's principal context cannot SELECT one single row of tenant B, by PK or by scan", async () => {
      await asApp(database, { tenantId: tenantA, userId: userA1 }, async (tx) => {
        const probes: Array<[string, unknown[]]> = [
          ['SELECT * FROM public.user_profiles WHERE user_id = $1', [userB1]],
          ['SELECT * FROM public.tenant_members WHERE tenant_id = $1', [tenantB]],
          ['SELECT * FROM public.tenant_invitations WHERE id = $1', [INVITATION_B]],
          ['SELECT * FROM public.role_assignments WHERE id = $1', [ASSIGNMENT_B1_TENANT]],
          ['SELECT * FROM public.consent_grants WHERE id = $1', [CONSENT_B1]],
          ['SELECT * FROM public.tenants WHERE id = $1', [tenantB]],
        ];
        for (const [sql, params] of probes) {
          const result = await tx.query(sql, params);
          expect({ sql, rows: result.rowCount }).toEqual({ sql, rows: 0 });
        }
        // Scans show ONLY tenant A rows — never a mixed set.
        const scanned = await tx.query<{ tenant_id: string }>(
          'SELECT DISTINCT tenant_id FROM public.user_profiles',
        );
        expect(scanned.rows.map((r) => r.tenant_id)).toEqual([tenantA]);
      });
    });

    it("tenant A's principal context cannot UPDATE tenant B's rows (zero rows affected, silently nothing)", async () => {
      await asApp(database, { tenantId: tenantA, userId: userA1 }, async (tx) => {
        const updates: Array<[string, unknown[]]> = [
          [
            `UPDATE public.user_profiles SET display_name = 'intruded' WHERE user_id = $1`,
            [userB1],
          ],
          [`UPDATE public.tenant_members SET state = 'REMOVED' WHERE tenant_id = $1`, [tenantB]],
          [`UPDATE public.tenant_invitations SET revoked_at = now() WHERE id = $1`, [INVITATION_B]],
          [
            `UPDATE public.role_assignments
                SET status = 'REVOKED', revoked_at = now(), revoked_by = $2, effective_to = now()
              WHERE id = $1`,
            [ASSIGNMENT_B1_TENANT, userA1],
          ],
          [
            `UPDATE public.consent_grants SET status = 'WITHDRAWN', withdrawn_at = now() WHERE id = $1`,
            [CONSENT_B1],
          ],
        ];
        for (const [sql, params] of updates) {
          const result = await tx.query(sql, params);
          expect({ sql, rows: result.rowCount }).toEqual({ sql, rows: 0 });
        }
      });

      // And B's rows are untouched, read back in B's own context.
      await asApp(database, { tenantId: tenantB, userId: userB1 }, async (tx) => {
        const member = await tx.query<{ state: string }>(
          `SELECT state FROM public.tenant_members WHERE user_id = $1`,
          [userB1],
        );
        expect(member.rows[0]?.state).toBe('ACTIVE');
        const grant = await tx.query<{ status: string }>(
          `SELECT status FROM public.consent_grants WHERE id = $1`,
          [CONSENT_B1],
        );
        expect(grant.rows[0]?.status).toBe('ACTIVE');
      });
    });

    it('DELETE is refused outright by revoked grants (42501) on every tenant-scoped table, any context', async () => {
      for (const [table] of TENANT_SCOPED_COUNTS) {
        const failure = await refusalOf(
          database,
          { tenantId: tenantA, userId: userA1 },
          `DELETE FROM ${table}`,
        );
        expect(failure).toBeInstanceOf(PgError);
        expect({ table, sqlState: (failure as PgError).sqlState }).toEqual({
          table,
          sqlState: '42501',
        });
      }
    });

    it('missing GUCs fail closed: nothing visible, nothing insertable', async () => {
      await asApp(database, {}, async (tx) => {
        for (const [table] of TENANT_SCOPED_COUNTS) {
          const result = await tx.query(`SELECT 1 FROM ${table}`);
          expect({ table, rows: result.rowCount }).toEqual({ table, rows: 0 });
        }
      });
      const insert = await refusalOf(
        database,
        {},
        `INSERT INTO public.user_profiles (user_id, tenant_id, display_name, locale)
         VALUES ('99999999-0000-4000-8000-000000000001', $1, 'no-context intruder', 'en')`,
        [tenantA],
      );
      expect((insert as PgError).sqlState).toBe('42501');
    });

    it('a malformed tenant GUC fails loudly (22P02), never silently open', async () => {
      const failure = await refusalOf(
        database,
        { tenantId: 'not-a-uuid', userId: userA1 },
        'SELECT * FROM public.user_profiles',
      );
      expect(failure).toBeInstanceOf(PgError);
      expect((failure as PgError).sqlState).toBe('22P02');
    });

    it("cross-binding (A1's user id under tenant B): tenant A's data is gone, and writes into A are refused", async () => {
      await asApp(database, { tenantId: tenantB, userId: userA1 }, async (tx) => {
        for (const [table] of [
          ['public.user_profiles'],
          ['public.tenant_invitations'],
          ['public.consent_grants'],
        ] as const) {
          const result = await tx.query(`SELECT 1 FROM ${table} WHERE tenant_id = $1`, [tenantA]);
          expect({ table, rows: result.rowCount }).toEqual({ table, rows: 0 });
        }
      });
      // WITH CHECK refuses writing into tenant A from the mismatched binding.
      const insert = await refusalOf(
        database,
        { tenantId: tenantB, userId: userA1 },
        `INSERT INTO public.tenant_invitations (id, tenant_id, email, token_hash, expires_at, created_by)
         VALUES ('99999999-0000-4000-8000-000000000002', $1, 'x@security-suite.invalid', $2,
                 now() + interval '1 day', $3)`,
        [tenantA, 'd4'.repeat(32), userA1],
      );
      expect((insert as PgError).sqlState).toBe('42501');
    });

    it('pooled-connection hygiene (adapter pool): after withPrincipalContext the SAME session carries no GUC and sees nothing', async () => {
      const adapter = new PostgresPersistenceAdapter(appProfile(database)); // poolMax 1
      try {
        const inContext = await withPrincipalContext(
          adapter,
          { tenantId: TENANT_A, userId: USER_A1 },
          async (tx) => (await tx.query('SELECT 1 FROM public.user_profiles')).rowCount,
        );
        expect(inContext).toBe(2); // non-empty inside the context

        const probe = await adapter.query<{
          tenant_guc: string | null;
          user_guc: string | null;
          profiles: string;
          grants: string;
        }>(
          `SELECT current_setting('app.tenant_id', true) AS tenant_guc,
                  current_setting('app.user_id', true) AS user_guc,
                  (SELECT count(*) FROM public.user_profiles)::text AS profiles,
                  (SELECT count(*) FROM public.consent_grants)::text AS grants`,
        );
        const row = probe.rows[0];
        expect(row?.tenant_guc === null || row?.tenant_guc === '').toBe(true);
        expect(row?.user_guc === null || row?.user_guc === '').toBe(true);
        expect(row?.profiles).toBe('0');
        expect(row?.grants).toBe('0');
      } finally {
        await adapter.end();
      }
    });

    it('pooled-connection hygiene (Prisma pool): same guarantee on the Prisma handle', async () => {
      const handle: PrismaHandle = buildHandle(database); // poolMax 1
      try {
        const inContext = await withPrincipalContext(
          handle,
          { tenantId: TENANT_A, userId: USER_A1 },
          async (tx) => {
            const rows = await tx.$queryRaw<
              { n: string }[]
            >`SELECT count(*)::text AS n FROM public.user_profiles`;
            return rows[0]?.n;
          },
        );
        expect(inContext).toBe('2');

        const probe = await handle.client.$queryRawUnsafe<
          { tenant_guc: string | null; profiles: string }[]
        >(
          `SELECT current_setting('app.tenant_id', true) AS tenant_guc,
                  (SELECT count(*) FROM public.user_profiles)::text AS profiles`,
        );
        expect(probe[0]?.tenant_guc === null || probe[0]?.tenant_guc === '').toBe(true);
        expect(probe[0]?.profiles).toBe('0');
      } finally {
        await handle.end();
      }
    });

    it("the same-tenant boundary holds inside a tenant: A2 cannot UPDATE A1's profile (self-write policy)", async () => {
      // Non-empty first: A2 sees A1's profile through the tenant SELECT arm…
      await asApp(database, { tenantId: tenantA, userId: userA2 }, async (tx) => {
        const visible = await tx.query('SELECT 1 FROM public.user_profiles WHERE user_id = $1', [
          userA1,
        ]);
        expect(visible.rowCount).toBe(1);
        // …but the self-only UPDATE policy matches zero rows for someone else's.
        const update = await tx.query(
          `UPDATE public.user_profiles SET display_name = 'peer overwrite' WHERE user_id = $1`,
          [userA1],
        );
        expect(update.rowCount).toBe(0);
      });
    });
  },
);
