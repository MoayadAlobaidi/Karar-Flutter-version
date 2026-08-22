import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';
import {
  dropScratchDatabase,
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PgError,
  PostgresPersistenceAdapter,
  type ConnectionProfile,
  type DatabaseRole,
  type TransactionClient,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import { PrincipalContextError } from '@karar/platform/dist/db/principal-context.js';
import {
  RecordAuditEvent,
  type AuditEvent,
  type AuditEventIdSource,
  type AuditWriter,
} from '@karar/audit';
import { Result } from '@karar/shared-kernel';

import { PrismaUserProfileRepository } from '../infrastructure/persistence/prisma-user-profile-repository.js';
import { RecordAuditEventAuditTrail } from '../infrastructure/audit/record-audit-event-audit-trail.js';
import { GetOwnProfile } from '../application/use-cases/get-own-profile.js';
import { UpdateOwnProfile } from '../application/use-cases/update-own-profile.js';
import { RequestAccountDisable } from '../application/use-cases/request-account-disable.js';
import type { PrincipalActor } from '../application/principal.js';
import { skipUnlessDatabaseRequired } from '@karar/platform/dist/db/index.js';

// ADVERSARIAL CROSS-TENANT ISOLATION for the users tables (tenancy.md §2
// layer 4; ADR-0022): two tenants, both NON-EMPTY, and every cross-tenant
// path — direct SQL as karar_app (wrong GUC and missing GUC), the Prisma
// repository, and the use case — exercised for SELECT, UPDATE, DELETE, and
// INSERT. Non-empty own-tenant expectations are asserted FIRST: an empty
// result is indistinguishable from correct isolation (legacy AZ2).

const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');
const USER_A1 = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
const USER_A2 = UserId.of('a2a2a2a2-0000-4000-8000-0000000000a2');
const USER_B1 = UserId.of('b1b1b1b1-0000-4000-8000-0000000000b1');
const USER_B2 = UserId.of('b2b2b2b2-0000-4000-8000-0000000000b2');

const actorA1: PrincipalActor = { tenantId: TENANT_A, userId: USER_A1 };
const actorA2: PrincipalActor = { tenantId: TENANT_A, userId: USER_A2 };
const actorB1: PrincipalActor = { tenantId: TENANT_B, userId: USER_B1 };
/** User A1's credentials, but a session claiming tenant B — the classic confused-deputy shape. */
const actorA1inB: PrincipalActor = { tenantId: TENANT_B, userId: USER_A1 };

const superuserMaintenanceProfile = LocalPostgresConnectionProfile.fromEnv('superuser', {
  database: maintenanceDatabase(),
});

async function probePostgres(): Promise<string | null> {
  const client = new pg.Client({
    host: superuserMaintenanceProfile.host,
    port: superuserMaintenanceProfile.port,
    database: superuserMaintenanceProfile.database,
    user: superuserMaintenanceProfile.user,
    password: superuserMaintenanceProfile.password.unwrap(),
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    await client.end();
    return null;
  } catch (error) {
    await client.end().catch(() => {});
    return error instanceof Error ? error.message : String(error);
  }
}

const unreachable = await probePostgres();
skipUnlessDatabaseRequired('users isolation suite', unreachable);
if (unreachable !== null) {
  process.stderr.write(
    [
      '='.repeat(76),
      `USERS ISOLATION TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the adversarial evidence for RLS on the users tables; a',
      'skipped run proves nothing. Start the local database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_users_rls`;

function appProfile(): ConnectionProfile {
  const base = LocalPostgresConnectionProfile.fromEnv('app', { database });
  return { ...base, poolMax: 1 }; // one session: pooled-reuse probes are honest
}

async function withAdapter<T>(
  role: DatabaseRole,
  fn: (adapter: PostgresPersistenceAdapter) => Promise<T>,
): Promise<T> {
  const adapter = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv(role, { database }),
  );
  try {
    return await fn(adapter);
  } finally {
    await adapter.end();
  }
}

const BIND_GUCS =
  `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`;

/** Runs statements as karar_app inside one transaction with the given (possibly absent) GUCs. */
async function asApp<T>(
  guc: { tenantId?: string; userId?: string },
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return withAdapter('app', (adapter) =>
    adapter.withTransaction(async (tx) => {
      await tx.query(BIND_GUCS, [guc.tenantId ?? '', guc.userId ?? '']);
      return fn(tx);
    }),
  );
}

const clock = new Clock.Fixed(new Date('2026-08-16T10:00:00.000Z'));
let handle: PrismaHandle;
let repository: PrismaUserProfileRepository;
let auditAdapter: PostgresPersistenceAdapter;
let requestDisable: RequestAccountDisable;

describe.skipIf(unreachable !== null)('users tables — adversarial isolation (live PostgreSQL)', () => {
  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
    await withAdapter('migrator', async (adapter) => {
      const { applied } = await migrateToLatest({ adapter });
      const names = applied.map((file) => file.filename);
      expect(names).toContain('0040_user_profiles.sql');
    });
    // Tenants are provisioned by the control plane in later phases; local
    // seeding uses the bootstrap superuser (never a runtime role).
    await withAdapter('superuser', async (adapter) => {
      for (const [id, name] of [
        [TenantId.toString(TENANT_A), 'Tenant A'],
        [TenantId.toString(TENANT_B), 'Tenant B'],
      ]) {
        await adapter.query(
          `INSERT INTO public.tenants (id, type, name, status) VALUES ($1, 'FIRST_PARTY', $2, 'ACTIVE')`,
          [id, name],
        );
      }
    });
    handle = createPrismaClient(appProfile());
    repository = new PrismaUserProfileRepository(handle);
    auditAdapter = new PostgresPersistenceAdapter(appProfile());

    // Real audit wiring: the module's AuditTrail adapter over the audit
    // module's RecordAuditEvent, with an AuditWriter on the app role.
    const writer: AuditWriter = {
      record: async (event: AuditEvent) => {
        await auditAdapter.query(
          `INSERT INTO audit.audit_events (
             audit_event_id, occurred_at, environment, actor_ref, tenant_ref,
             action, resource_type, resource_id, reason, request_id, trace_id,
             correlation_id, before_metadata, after_metadata, outcome)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            event.auditEventId,
            event.occurredAt,
            event.environment,
            event.actorRef,
            event.tenantRef,
            event.action,
            event.resourceType,
            event.resourceId,
            event.reason,
            event.requestId,
            event.traceId,
            event.correlationId,
            event.beforeMetadata === null ? null : JSON.stringify(event.beforeMetadata),
            event.afterMetadata === null ? null : JSON.stringify(event.afterMetadata),
            event.outcome,
          ],
        );
        return Result.ok(event);
      },
    };
    let counter = 0;
    const idSource: AuditEventIdSource = {
      nextId: () => {
        counter += 1;
        return `00000000-0000-7000-8000-${String(counter).padStart(12, '0')}` as ReturnType<
          AuditEventIdSource['nextId']
        >;
      },
    };
    const auditTrail = new RecordAuditEventAuditTrail(
      new RecordAuditEvent(writer, idSource),
      'local-test',
    );
    requestDisable = new RequestAccountDisable(repository, auditTrail, clock);
  });

  afterAll(async () => {
    await handle?.end();
    await auditAdapter?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await dropScratchDatabase(maintenance, database);
    } finally {
      await maintenance.end();
    }
  });

  it('seeds BOTH tenants with profiles through the real write path (self INSERT policy)', async () => {
    for (const [actor, name] of [
      [actorA1, 'User A1'],
      [actorA2, 'User A2'],
      [actorB1, 'User B1'],
      [{ tenantId: TENANT_B, userId: USER_B2 }, 'User B2'],
    ] as const) {
      const created = await repository.createOwn(actor as PrincipalActor, {
        displayName: name,
        locale: 'ar-QA',
        occurredAt: clock.now(),
      });
      expect(created.displayName).toBe(name);
    }
  });

  it('NON-EMPTY FIRST: each tenant reads its own two profiles (SQL, repository, use case)', async () => {
    const sqlCountA = await asApp({ tenantId: TenantId.toString(TENANT_A) }, async (tx) => {
      const rows = await tx.query<{ n: string }>('SELECT count(*)::text AS n FROM public.user_profiles');
      return rows.rows[0]?.n;
    });
    expect(sqlCountA).toBe('2');

    const repoProfile = await repository.findOwn(actorA1);
    expect(repoProfile?.displayName).toBe('User A1');

    const useCase = await new GetOwnProfile(repository).execute(actorB1);
    expect(useCase.ok).toBe(true);
    if (useCase.ok) {
      expect(useCase.value.displayName).toBe('User B1');
    }
  });

  it('direct SQL, wrong GUC: tenant B context sees zero of A\'s rows and cannot UPDATE or INSERT them', async () => {
    const guc = { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(USER_B1) };
    await asApp(guc, async (tx) => {
      const select = await tx.query(
        'SELECT * FROM public.user_profiles WHERE tenant_id = $1',
        [TenantId.toString(TENANT_A)],
      );
      expect(select.rowCount).toBe(0);

      const update = await tx.query(
        `UPDATE public.user_profiles SET display_name = 'pwned' WHERE user_id = $1`,
        [UserId.toString(USER_A1)],
      );
      expect(update.rowCount).toBe(0); // the row is invisible to UPDATE too

      const insert = await tx
        .query(
          `INSERT INTO public.user_profiles (user_id, tenant_id, display_name, locale)
           VALUES ('99999999-0000-4000-8000-000000000099', $1, 'intruder', 'en')`,
          [TenantId.toString(TENANT_A)],
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(insert).toBeInstanceOf(PgError);
      expect((insert as PgError).sqlState).toBe('42501'); // WITH CHECK violation
    });
  });

  it('direct SQL, missing GUC: nothing is visible and nothing can be written (fail closed)', async () => {
    await asApp({}, async (tx) => {
      const select = await tx.query('SELECT * FROM public.user_profiles');
      expect(select.rowCount).toBe(0);
      const history = await tx.query('SELECT * FROM public.user_status_history');
      expect(history.rowCount).toBe(0);
      const update = await tx.query(`UPDATE public.user_profiles SET display_name = 'x'`);
      expect(update.rowCount).toBe(0);
      const insert = await tx
        .query(
          `INSERT INTO public.user_profiles (user_id, tenant_id, display_name, locale)
           VALUES ('99999999-0000-4000-8000-000000000099', $1, 'ghost', 'en')`,
          [TenantId.toString(TENANT_A)],
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect((insert as PgError).sqlState).toBe('42501');
    });
  });

  it('self-write policy: a user in the SAME tenant cannot UPDATE another user\'s profile row', async () => {
    const guc = { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) };
    await asApp(guc, async (tx) => {
      const update = await tx.query(
        `UPDATE public.user_profiles SET display_name = 'renamed by neighbour' WHERE user_id = $1`,
        [UserId.toString(USER_A1)],
      );
      expect(update.rowCount).toBe(0); // visible to SELECT, untouchable to UPDATE
      const own = await tx.query(
        `UPDATE public.user_profiles SET display_name = 'User A2' WHERE user_id = $1`,
        [UserId.toString(USER_A2)],
      );
      expect(own.rowCount).toBe(1); // and the self row IS writable — non-empty control
    });
  });

  it('DELETE is denied outright by revoked grants (42501), for any context', async () => {
    const failure = await asApp(
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
      (tx) =>
        tx.query('DELETE FROM public.user_profiles').then(
          () => null,
          (error: unknown) => error,
        ),
    );
    expect(failure).toBeInstanceOf(PgError);
    expect((failure as PgError).sqlState).toBe('42501');
  });

  it('repository layer: a tenant-B principal cannot read or update A\'s profile', async () => {
    expect(await repository.findOwn(actorA1inB)).toBeNull();
    expect(
      await repository.updateOwnFields(actorA1inB, {
        displayName: 'stolen',
        occurredAt: clock.now(),
      }),
    ).toBeNull();
    // And the target row is untouched, read back through its own tenant.
    const intact = await repository.findOwn(actorA1);
    expect(intact?.displayName).toBe('User A1');
  });

  it('use-case layer: same denial, typed', async () => {
    const result = await new GetOwnProfile(repository).execute(actorA1inB);
    expect(!result.ok && result.error.kind === 'profile_not_found').toBe(true);
    const update = await new UpdateOwnProfile(repository, clock).execute(
      { displayName: 'stolen' },
      actorA1inB,
    );
    expect(!update.ok && update.error.kind === 'profile_not_found').toBe(true);
  });

  it('repository fails closed BEFORE any query when the principal is incomplete', async () => {
    const failure = await repository
      .findOwn({ userId: USER_A1 } as unknown as PrincipalActor)
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(PrincipalContextError);
    expect((failure as PrincipalContextError).kind).toBe('missing_required_context');
  });

  it('disable request: records intent + history + audit, exactly once', async () => {
    const result = await requestDisable.execute({ reason: 'leaving' }, actorA1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.change.fromStatus).toBe('ACTIVE');
      expect(result.value.change.toStatus).toBe('DISABLE_REQUESTED');
      expect(result.value.auditFailure).toBeNull();
    }

    const history = await repository.listOwnStatusHistory(actorA1);
    expect(history).toHaveLength(1);
    expect(history[0]?.toStatus).toBe('DISABLE_REQUESTED');

    const auditRows = await auditAdapter.query(
      `SELECT actor_ref, tenant_ref, outcome FROM audit.audit_events
       WHERE action = 'users.account.disable_requested'`,
    );
    expect(auditRows.rowCount).toBe(1);
    expect(auditRows.rows[0]).toEqual({
      actor_ref: `user:${UserId.toString(USER_A1)}`,
      tenant_ref: `tenant:${TenantId.toString(TENANT_A)}`,
      outcome: 'SUCCESS',
    });

    const second = await requestDisable.execute({}, actorA1);
    expect(!second.ok && second.error.kind === 'invalid_status_transition').toBe(true);
  });

  it('status history: own tenant reads its row (non-empty), the other tenant reads nothing, writes are append-only', async () => {
    const countAs = (tenant: TenantId, user: UserId) =>
      asApp({ tenantId: TenantId.toString(tenant), userId: UserId.toString(user) }, async (tx) => {
        const rows = await tx.query<{ n: string }>(
          'SELECT count(*)::text AS n FROM public.user_status_history',
        );
        return rows.rows[0]?.n;
      });
    expect(await countAs(TENANT_A, USER_A2)).toBe('1'); // non-empty first
    expect(await countAs(TENANT_B, USER_B1)).toBe('0');

    const update = await asApp(
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
      (tx) =>
        tx.query(`UPDATE public.user_status_history SET reason = 'rewritten'`).then(
          () => null,
          (error: unknown) => error,
        ),
    );
    expect((update as PgError).sqlState).toBe('42501'); // no UPDATE grant: history is evidence
  });

  it('FORCE vs owner: karar_migrator owns the tables and still sees nothing without a GUC', async () => {
    await withAdapter('migrator', async (adapter) => {
      await adapter.withTransaction(async (tx) => {
        const profiles = await tx.query('SELECT * FROM public.user_profiles');
        expect(profiles.rowCount).toBe(0);
        const history = await tx.query('SELECT * FROM public.user_status_history');
        expect(history.rowCount).toBe(0);
        const update = await tx.query(`UPDATE public.user_profiles SET display_name = 'owner'`);
        expect(update.rowCount).toBe(0);
      });
      // And with a bound tenant, the owner sees exactly that tenant — the
      // policy applies to the owner because the tables are FORCEd.
      await adapter.withTransaction(async (tx) => {
        await tx.query(BIND_GUCS, [TenantId.toString(TENANT_A), UserId.toString(USER_A1)]);
        const profiles = await tx.query('SELECT * FROM public.user_profiles');
        expect(profiles.rowCount).toBe(2);
      });
    });
  });

  it('pooled-connection hygiene: after repository work, the SAME session carries no GUC and sees no rows', async () => {
    await repository.findOwn(actorA1); // binds GUCs transaction-locally on the pool's one session
    const probe = await handle.client.$queryRawUnsafe<
      { tenant_guc: string | null; visible: bigint }[]
    >(
      `SELECT current_setting('app.tenant_id', true) AS tenant_guc,
              (SELECT count(*) FROM public.user_profiles) AS visible`,
    );
    const row = probe[0];
    expect(row?.tenant_guc === null || row?.tenant_guc === '').toBe(true);
    expect(String(row?.visible)).toBe('0');
  });
});
