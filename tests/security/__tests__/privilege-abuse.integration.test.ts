/**
 * Privilege and role abuse across the Phase 3 schema (access-control.md;
 * data-model.md §10). Everything here attacks the database contract directly
 * — role attributes, FORCE-vs-owner, append-only ledgers, immutability
 * triggers, revoked/immutable rows — as karar_app and as the table owner
 * karar_migrator, with Layer 1 absent on purpose.
 *
 * Auth/token abuse at the SQL contract level (one-time refresh rotation,
 * concurrent presentation, reuse detection, lockout arithmetic, session RLS)
 * is already covered by modules/identity/__tests__ and is deliberately NOT
 * duplicated here; this suite adds the cross-account confinement of the
 * bootstrap-armed identity tables, which no module suite probes.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PgError } from '@karar/platform/dist/db/index.js';

import {
  asApp,
  ASSIGNMENT_A1_PLATFORM,
  ASSIGNMENT_A1_TENANT,
  CONSENT_A1,
  DOCUMENT_VERSION_ID,
  dropDatabase,
  probePostgres,
  provisionSecurityDatabase,
  refusalOf,
  seedTenantData,
  skipBanner,
  SYNTHETIC_PASSWORD_HASH,
  tenantA,
  userA1,
  userB1,
  withAdapter,
} from '../fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(skipBanner('PRIVILEGE ABUSE (security suite)', unreachable));
}

const database = `karar_sec_${process.pid}_privilege`;

const expectSqlState = (failure: unknown, sqlState: string, what: string): void => {
  expect(failure, what).toBeInstanceOf(PgError);
  expect({ what, sqlState: (failure as PgError).sqlState }).toEqual({ what, sqlState });
};

describe.skipIf(unreachable !== null)(
  'privilege and role abuse against the live schema (PostgreSQL)',
  () => {
    beforeAll(async () => {
      await provisionSecurityDatabase(database);
      await seedTenantData(database);

      // Identity accounts arrive through the REAL pre-auth shape: the
      // bootstrap INSERT arm, no principal context (migration 0030).
      await asApp(database, {}, async (tx) => {
        for (const [id, email] of [
          [userA1, 'sec-alice@security-suite.invalid'],
          [userB1, 'sec-badr@security-suite.invalid'],
        ]) {
          await tx.query(`INSERT INTO public.identity_accounts (id, email) VALUES ($1, $2)`, [
            id,
            email,
          ]);
          await tx.query(
            `INSERT INTO public.password_credentials (account_id, password_hash, params_version)
             VALUES ($1, $2, 1)`,
            [id, SYNTHETIC_PASSWORD_HASH],
          );
        }
        // A pre-auth security event that resolved no account (bootstrap arm).
        await tx.query(
          `INSERT INTO public.authentication_security_events (id, account_id, event_type)
           VALUES ('99999999-5555-4000-8000-000000000001', NULL, 'login_failed')`,
        );
      });

      // A status-history row through the self-insert policy (migration 0040).
      await asApp(database, { tenantId: tenantA, userId: userA1 }, (tx) =>
        tx.query(
          `INSERT INTO public.user_status_history
             (id, user_id, tenant_id, from_status, to_status, actor, occurred_at)
           VALUES ('99999999-5555-4000-8000-000000000002', $1, $2, 'ACTIVE', 'DISABLE_REQUESTED',
                   $3, now())`,
          [userA1, tenantA, `user:${userA1}`],
        ),
      );
    }, 180_000);

    afterAll(async () => {
      await dropDatabase(database);
    }, 60_000);

    it('karar_app and karar_migrator carry no SUPER/BYPASSRLS/CREATEDB/CREATEROLE, live from pg_roles', async () => {
      const roles = await asApp(database, {}, (tx) =>
        tx.query<{
          rolname: string;
          rolsuper: boolean;
          rolbypassrls: boolean;
          rolcreatedb: boolean;
          rolcreaterole: boolean;
        }>(
          `SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
             FROM pg_roles WHERE rolname IN ('karar_app', 'karar_migrator') ORDER BY rolname`,
        ),
      );
      expect(roles.rows).toHaveLength(2); // non-empty first: both roles exist
      for (const row of roles.rows) {
        expect(row).toEqual({
          rolname: row.rolname,
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
        });
      }
    });

    it('karar_app cannot escalate: SET ROLE, CREATE TABLE, trigger disable, and replication-role change all refuse', async () => {
      expectSqlState(
        await refusalOf(database, {}, `SET ROLE karar_migrator`),
        '42501',
        'SET ROLE karar_migrator',
      );
      expectSqlState(
        await refusalOf(database, {}, `CREATE TABLE public.intruder_table (id int)`),
        '42501',
        'CREATE TABLE in schema public (revoked in 0002)',
      );
      expectSqlState(
        await refusalOf(
          database,
          {},
          `ALTER TABLE public.consent_grants DISABLE TRIGGER consent_grants_guard`,
        ),
        '42501',
        'disabling an immutability trigger requires ownership',
      );
      expectSqlState(
        await refusalOf(database, {}, `SET session_replication_role = 'replica'`),
        '42501',
        'session_replication_role (the trigger-bypass switch) is superuser-only',
      );
    });

    it('FORCE holds for the table owner: karar_migrator without a GUC sees zero rows across the tenant surface', async () => {
      await withAdapter(database, 'migrator', async (adapter) => {
        await adapter.withTransaction(async (tx) => {
          for (const table of [
            'public.user_profiles',
            'public.tenant_members',
            'public.tenant_invitations',
            'public.role_assignments',
            'public.consent_grants',
            'public.tenants',
          ]) {
            const rows = await tx.query(`SELECT 1 FROM ${table}`);
            expect({ table, rows: rows.rowCount }).toEqual({ table, rows: 0 });
          }
          const update = await tx.query(`UPDATE public.consent_grants SET status = 'WITHDRAWN'`);
          expect(update.rowCount).toBe(0);
        });
        // With a bound principal the owner sees exactly that principal's rows
        // — FORCE keeps the owner inside the policy, not above it.
        await adapter.withTransaction(async (tx) => {
          await tx.query(
            `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`,
            [tenantA, userA1],
          );
          const grants = await tx.query('SELECT 1 FROM public.consent_grants');
          expect(grants.rowCount).toBe(1);
        });
      });
    });

    it('append-only ledgers reject rewriting: authentication_security_events, kill_switch_history, user_status_history, audit_events', async () => {
      // Non-empty first: each ledger holds its seeded evidence.
      await asApp(database, {}, async (tx) => {
        expect(
          (await tx.query('SELECT 1 FROM public.authentication_security_events')).rowCount,
        ).toBeGreaterThan(0);
        expect((await tx.query('SELECT 1 FROM public.kill_switch_history')).rowCount).toBe(4); // 0053 seeds v1 per switch
      });

      // karar_app: grants were never given (or explicitly revoked in 0034/0054).
      const appDenials: Array<[string, string]> = [
        [`UPDATE public.authentication_security_events SET event_type = 'rewritten'`, '42501'],
        [`DELETE FROM public.authentication_security_events`, '42501'],
        [
          `INSERT INTO public.kill_switch_history (id, switch_id, state, scope, reason, actor, version, effective_from)
           VALUES ('99999999-5555-4000-8000-000000000003', 'PASSWORD_LOGIN', 'INACTIVE', 'GLOBAL', 'forged', 'intruder', 99, now())`,
          '42501',
        ],
        [`UPDATE public.kill_switch_history SET reason = 'rewritten'`, '42501'],
        [`DELETE FROM public.kill_switch_history`, '42501'],
        [`UPDATE public.user_status_history SET to_status = 'ACTIVE'`, '42501'],
        [`DELETE FROM public.user_status_history`, '42501'],
        [`UPDATE audit.audit_events SET outcome = 'SUCCESS'`, '42501'],
        [`DELETE FROM audit.audit_events`, '42501'],
      ];
      for (const [sql, code] of appDenials) {
        expectSqlState(await refusalOf(database, {}, sql), code, sql);
      }

      // The table OWNER hits the second mechanism: the immutability triggers
      // raise even for karar_migrator, and FOR EACH STATEMENT means a zero-row
      // UPDATE raises instead of succeeding vacuously.
      await withAdapter(database, 'migrator', async (adapter) => {
        for (const sql of [
          `UPDATE public.authentication_security_events SET event_type = 'rewritten'`,
          `DELETE FROM public.authentication_security_events`,
          `UPDATE public.kill_switch_history SET reason = 'rewritten'`,
          `DELETE FROM audit.audit_events`,
        ]) {
          const failure = await adapter.query(sql).then(
            () => null,
            (error: unknown) => error,
          );
          expectSqlState(failure, 'P0001', `owner: ${sql}`);
        }
      });
    });

    it('kill switches: operate works only as the versioned UPDATE shape; the registry is closed and permanent', async () => {
      // Restrict-only ground state, readable PRE-AUTH (no GUC): non-empty first.
      await asApp(database, {}, async (tx) => {
        const switches = await tx.query<{ id: string; state: string }>(
          'SELECT id, state FROM public.kill_switches ORDER BY id',
        );
        expect(switches.rowCount).toBe(4);
        expect(new Set(switches.rows.map((r) => r.state))).toEqual(new Set(['INACTIVE']));

        // The legitimate operate shape: version+1, trigger appends history.
        const operate = await tx.query(
          `UPDATE public.kill_switches
              SET state = 'ACTIVE_RESTRICTION', reason = 'security-suite restriction (synthetic)',
                  actor = 'security-suite', version = 2, effective_from = now()
            WHERE id = 'TENANT_INVITATIONS' AND version = 1`,
        );
        expect(operate.rowCount).toBe(1);
        const history = await tx.query(
          `SELECT 1 FROM public.kill_switch_history WHERE switch_id = 'TENANT_INVITATIONS'`,
        );
        expect(history.rowCount).toBe(2); // v1 seed + v2 appended by the SECURITY DEFINER trigger
      });

      // A version skip breaks optimistic concurrency: the guard raises.
      expectSqlState(
        await refusalOf(
          database,
          {},
          `UPDATE public.kill_switches SET state = 'INACTIVE', version = 9, expires_at = NULL
            WHERE id = 'TENANT_INVITATIONS'`,
        ),
        'P0001',
        'kill-switch version skip',
      );
      // Closed registry: INSERT and DELETE have no grant…
      expectSqlState(
        await refusalOf(
          database,
          {},
          `INSERT INTO public.kill_switches (id, state, reason, actor) VALUES ('PASSWORD_LOGIN', 'INACTIVE', 'dup', 'intruder')`,
        ),
        '42501',
        'kill-switch INSERT (closed registry)',
      );
      expectSqlState(
        await refusalOf(database, {}, `DELETE FROM public.kill_switches`),
        '42501',
        'kill-switch DELETE (no grant)',
      );
      // …and the owner is stopped by the guard trigger, not by grants.
      await withAdapter(database, 'migrator', async (adapter) => {
        const failure = await adapter.query(`DELETE FROM public.kill_switches`).then(
          () => null,
          (error: unknown) => error,
        );
        expectSqlState(failure, 'P0001', 'owner: kill-switch DELETE');
      });
    });

    it('a revoked role assignment is immutable, and an active one permits ONLY the revocation transition', async () => {
      // Positive control: the permitted transition works in the bound context.
      await asApp(database, { tenantId: tenantA, userId: userA1 }, async (tx) => {
        const revoke = await tx.query(
          `UPDATE public.role_assignments
              SET status = 'REVOKED', revoked_at = now(), revoked_by = $2, effective_to = now()
            WHERE id = $1`,
          [ASSIGNMENT_A1_TENANT, userA1],
        );
        expect(revoke.rowCount).toBe(1);
      });
      // The revoked row rejects everything afterwards — trigger, not policy.
      expectSqlState(
        await refusalOf(
          database,
          { tenantId: tenantA, userId: userA1 },
          `UPDATE public.role_assignments SET reason = 'rewritten' WHERE id = $1`,
          [ASSIGNMENT_A1_TENANT],
        ),
        'P0001',
        'editing a revoked assignment',
      );
      // An ACTIVE row rejects grant-column edits (only revocation exists).
      expectSqlState(
        await refusalOf(
          database,
          { userId: userA1 },
          `UPDATE public.role_assignments SET reason = 'laundered' WHERE id = $1`,
          [ASSIGNMENT_A1_PLATFORM],
        ),
        'P0001',
        'editing grant columns of an active assignment',
      );
      expectSqlState(
        await refusalOf(
          database,
          { tenantId: tenantA, userId: userA1 },
          `DELETE FROM public.role_assignments`,
        ),
        '42501',
        'role_assignments DELETE (no grant)',
      );
    });

    it('a published legal document version is immutable evidence', async () => {
      // Non-empty first: the published version is there and published.
      await asApp(database, {}, async (tx) => {
        const version = await tx.query<{ published_at: Date | null }>(
          `SELECT published_at FROM public.legal_document_versions WHERE id = $1`,
          [DOCUMENT_VERSION_ID],
        );
        expect(version.rowCount).toBe(1);
        expect(version.rows[0]?.published_at).not.toBeNull();
      });
      expectSqlState(
        await refusalOf(
          database,
          {},
          `UPDATE public.legal_document_versions SET content_hash = $2 WHERE id = $1`,
          [DOCUMENT_VERSION_ID, 'e5'.repeat(32)],
        ),
        'P0001',
        'rewriting a published version (app)',
      );
      expectSqlState(
        await refusalOf(database, {}, `DELETE FROM public.legal_document_versions`),
        '42501',
        'deleting versions (no grant)',
      );
      await withAdapter(database, 'migrator', async (adapter) => {
        const failure = await adapter
          .query(`UPDATE public.legal_document_versions SET storage_ref = 'moved' WHERE id = $1`, [
            DOCUMENT_VERSION_ID,
          ])
          .then(
            () => null,
            (error: unknown) => error,
          );
        expectSqlState(failure, 'P0001', 'owner: rewriting a published version');
      });
    });

    it('consent grants: pins never move, transitions are exactly the two legal ones, DELETE has no grant', async () => {
      const ownCtx = { tenantId: tenantA, userId: userA1 };
      // Pinned provenance is immutable even for the row's own subject.
      expectSqlState(
        await refusalOf(
          database,
          ownCtx,
          `UPDATE public.consent_grants SET operating_entity_id = '99999999-5555-4000-8000-00000000000e' WHERE id = $1`,
          [CONSENT_A1],
        ),
        'P0001',
        'moving the pinned operating entity',
      );
      // The permitted withdrawal works (positive control)…
      await asApp(database, ownCtx, async (tx) => {
        const withdraw = await tx.query(
          `UPDATE public.consent_grants SET status = 'WITHDRAWN', withdrawn_at = now() WHERE id = $1`,
          [CONSENT_A1],
        );
        expect(withdraw.rowCount).toBe(1);
      });
      // …and un-withdrawing does not exist.
      expectSqlState(
        await refusalOf(
          database,
          ownCtx,
          `UPDATE public.consent_grants SET status = 'ACTIVE', withdrawn_at = NULL WHERE id = $1`,
          [CONSENT_A1],
        ),
        'P0001',
        'reactivating a withdrawn grant',
      );
      expectSqlState(
        await refusalOf(database, ownCtx, `DELETE FROM public.consent_grants`),
        '42501',
        'consent_grants DELETE (no grant)',
      );
    });

    it('bootstrap-armed identity tables confine any transaction that HAS a principal to its own account', async () => {
      // The bootstrap arm exists and is non-empty (documented allow-list hole):
      // with NO principal, login/verification must find accounts by e-mail.
      await asApp(database, {}, async (tx) => {
        const preAuth = await tx.query('SELECT 1 FROM public.identity_accounts');
        expect(preAuth.rowCount).toBe(2);
      });
      // With a principal bound, the same tables collapse to the owner's rows.
      await asApp(database, { userId: userA1 }, async (tx) => {
        const own = await tx.query('SELECT id FROM public.identity_accounts');
        expect(own.rowCount).toBe(1); // non-empty: the account sees itself…
        const other = await tx.query('SELECT 1 FROM public.identity_accounts WHERE id = $1', [
          userB1,
        ]);
        expect(other.rowCount).toBe(0); // …and nobody else.
        const updateOther = await tx.query(
          `UPDATE public.identity_accounts SET email = 'stolen@security-suite.invalid' WHERE id = $1`,
          [userB1],
        );
        expect(updateOther.rowCount).toBe(0);
        const otherCredential = await tx.query(
          'SELECT 1 FROM public.password_credentials WHERE account_id = $1',
          [userB1],
        );
        expect(otherCredential.rowCount).toBe(0);
        // Credential deletion has no grant at all (0034).
        const del = await tx.query('DELETE FROM public.password_credentials').then(
          () => null,
          (error: unknown) => error,
        );
        expect((del as PgError).sqlState).toBe('42501');
      });
    });
  },
);
