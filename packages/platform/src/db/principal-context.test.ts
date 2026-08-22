import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';

import { bootstrapRolesAndDatabase } from './bootstrap.js';
import {
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  type ConnectionProfile,
} from './connection-profile.js';
import { PostgresPersistenceAdapter } from './adapter.js';
import { createPrismaClient, type PrismaHandle } from './prisma.js';
import { dropScratchDatabase } from './scratch-database.js';
import {
  DEFAULT_REQUIRED_CONTEXT,
  PrincipalContextError,
  withPrincipalContext,
  withTenant,
} from './principal-context.js';
import { skipUnlessDatabaseRequired } from './connection-budget.js';

// Principal context against a real PostgreSQL: the GUC binding that RLS
// policies read. Same live-database pattern and skip discipline as
// contract.test.ts — a skipped run is never evidence.

const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const USER_1 = UserId.of('11111111-0000-4000-8000-000000000001');

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
skipUnlessDatabaseRequired('platform principal context suite', unreachable);
if (unreachable !== null) {
  process.stderr.write(
    [
      '='.repeat(76),
      `PRINCIPAL CONTEXT TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for the transaction-local GUC binding; a',
      'skipped run proves nothing. Start the local database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_principal`;

/** App-role profile with poolMax 1 so sequential work shares ONE session. */
function singleSessionProfile(): ConnectionProfile {
  const base = LocalPostgresConnectionProfile.fromEnv('app', { database });
  return { ...base, poolMax: 1 };
}

const GUC_PROBE_SQL =
  `SELECT current_setting('app.tenant_id', true) AS tenant_guc, ` +
  `current_setting('app.user_id', true) AS user_guc, ` +
  `current_setting('app.session_id', true) AS session_guc, ` +
  `current_setting('app.request_id', true) AS request_guc`;

interface GucRow {
  tenant_guc: string | null;
  user_guc: string | null;
  session_guc: string | null;
  request_guc: string | null;
}

/** '' and NULL are both "absent": is_local reverts to the session value, which is empty. */
function expectGone(value: string | null | undefined): void {
  expect(value === null || value === undefined || value === '').toBe(true);
}

describe('fail-closed validation (no database required)', () => {
  // A live adapter pointing at a closed port: if the implementation ever
  // touched the database before validating, these tests would surface a
  // connection error instead of the typed PrincipalContextError.
  const deadEnv = {
    KARAR_ENV: 'local',
    KARAR_DB_HOST: '127.0.0.1',
    POSTGRES_PORT: '9',
  };
  const deadAdapter = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv('app', { env: deadEnv }),
  );
  afterAll(async () => {
    await deadAdapter.end();
  });

  it('requires tenantId and userId by default', async () => {
    const failure = await withPrincipalContext(deadAdapter, {}, async () => 'ran').then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(PrincipalContextError);
    const typed = failure as PrincipalContextError;
    expect(typed.kind).toBe('missing_required_context');
    expect(typed.keys).toEqual(['tenantId', 'userId']);
    expect(DEFAULT_REQUIRED_CONTEXT).toEqual(['tenantId', 'userId']);
  });

  it('reports exactly the missing keys from the call-site declaration', async () => {
    const failure = await withPrincipalContext(
      deadAdapter,
      { tenantId: TENANT_A },
      async () => 'ran',
      { require: ['tenantId', 'userId', 'sessionId'] },
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(PrincipalContextError);
    expect((failure as PrincipalContextError).keys).toEqual(['userId', 'sessionId']);
  });

  it('a relaxed call site (require: [userId]) accepts a tenantless principal', async () => {
    // Validation passes; the dead adapter then fails to connect — proving the
    // requirement gate, not the query path, is what admitted the context.
    const failure = await withPrincipalContext(deadAdapter, { userId: USER_1 }, async () => 'ran', {
      require: ['userId'],
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).not.toBeInstanceOf(PrincipalContextError);
  });

  it('rejects a non-UUID string cast through the branded type', async () => {
    const failure = await withPrincipalContext(
      deadAdapter,
      { tenantId: "evil' OR 1=1 --" as unknown as TenantId, userId: USER_1 },
      async () => 'ran',
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(PrincipalContextError);
    expect((failure as PrincipalContextError).kind).toBe('invalid_context_value');
    expect((failure as PrincipalContextError).keys).toEqual(['tenantId']);
  });

  it('rejects malformed opaque values (NUL byte, oversized)', async () => {
    for (const sessionId of ['bad\0session', 'x'.repeat(600)]) {
      const failure = await withPrincipalContext(
        deadAdapter,
        { tenantId: TENANT_A, userId: USER_1, sessionId },
        async () => 'ran',
      ).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(PrincipalContextError);
      expect((failure as PrincipalContextError).kind).toBe('invalid_context_value');
    }
  });

  it('withTenant fails closed when handed an empty identifier', async () => {
    const failure = await withTenant(
      deadAdapter,
      '' as unknown as TenantId,
      USER_1,
      async () => 'ran',
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(PrincipalContextError);
    expect((failure as PrincipalContextError).kind).toBe('missing_required_context');
  });
});

describe.skipIf(unreachable !== null)('principal context on a live PostgreSQL', () => {
  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
  });

  afterAll(async () => {
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await dropScratchDatabase(maintenance, database);
    } finally {
      await maintenance.end();
    }
  });

  it('adapter variant: binds all four GUCs inside the transaction', async () => {
    const adapter = new PostgresPersistenceAdapter(singleSessionProfile());
    try {
      const inside = await withPrincipalContext(
        adapter,
        { tenantId: TENANT_A, userId: USER_1, sessionId: 'sess-1', requestId: 'req-1' },
        async (tx) => (await tx.query<GucRow>(GUC_PROBE_SQL)).rows[0],
      );
      expect(inside).toEqual({
        tenant_guc: TenantId.toString(TENANT_A),
        user_guc: UserId.toString(USER_1),
        session_guc: 'sess-1',
        request_guc: 'req-1',
      });
    } finally {
      await adapter.end();
    }
  });

  it('adapter variant: the GUC is gone after the transaction on the SAME pooled session', async () => {
    const adapter = new PostgresPersistenceAdapter(singleSessionProfile());
    try {
      await withPrincipalContext(
        adapter,
        { tenantId: TENANT_A, userId: USER_1 },
        async (tx) => (await tx.query(GUC_PROBE_SQL)).rows[0],
      );
      // poolMax is 1: this is the same session the transaction just used.
      const outside = (await adapter.query<GucRow>(GUC_PROBE_SQL)).rows[0];
      expectGone(outside?.tenant_guc);
      expectGone(outside?.user_guc);

      // Second transaction on the same pool WITHOUT principal binding.
      const secondTxn = await adapter.withTransaction(
        async (tx) => (await tx.query<GucRow>(GUC_PROBE_SQL)).rows[0],
      );
      expectGone(secondTxn?.tenant_guc);
      expectGone(secondTxn?.user_guc);
    } finally {
      await adapter.end();
    }
  });

  it('adapter variant: values are bind parameters — SQL in a value is stored, not executed', async () => {
    const adapter = new PostgresPersistenceAdapter(singleSessionProfile());
    const hostile = `'; SELECT set_config('app.tenant_id','hijacked',false); --`;
    try {
      const inside = await withPrincipalContext(
        adapter,
        { tenantId: TENANT_A, userId: USER_1, sessionId: hostile },
        async (tx) => (await tx.query<GucRow>(GUC_PROBE_SQL)).rows[0],
      );
      expect(inside?.session_guc).toBe(hostile);
      expect(inside?.tenant_guc).toBe(TenantId.toString(TENANT_A));
      const outside = (await adapter.query<GucRow>(GUC_PROBE_SQL)).rows[0];
      expect(outside?.tenant_guc === 'hijacked').toBe(false);
    } finally {
      await adapter.end();
    }
  });

  it('adapter variant: absent optional keys shadow a stale session-level value for the transaction', async () => {
    const adapter = new PostgresPersistenceAdapter(singleSessionProfile());
    try {
      // Simulate a leak-shaped hazard: a SESSION-level value on the pooled session.
      await adapter.query(`SELECT set_config('app.session_id', 'stale-session-level', false)`);
      const inside = await withPrincipalContext(
        adapter,
        { tenantId: TENANT_A, userId: USER_1 },
        async (tx) => (await tx.query<GucRow>(GUC_PROBE_SQL)).rows[0],
      );
      // Bound to '' for the transaction, so the stale value is invisible where RLS reads it.
      expect(inside?.session_guc).toBe('');
    } finally {
      await adapter.end();
    }
  });

  it('prisma variant: binds inside the interactive transaction and reverts after it', async () => {
    const handle: PrismaHandle = createPrismaClient(singleSessionProfile());
    try {
      const inside = await withPrincipalContext(
        handle,
        { tenantId: TENANT_A, userId: USER_1, requestId: 'req-prisma' },
        async (tx) => {
          const rows = await tx.$queryRawUnsafe<GucRow[]>(GUC_PROBE_SQL);
          return rows[0];
        },
      );
      expect(inside?.tenant_guc).toBe(TenantId.toString(TENANT_A));
      expect(inside?.user_guc).toBe(UserId.toString(USER_1));
      expect(inside?.request_guc).toBe('req-prisma');

      // Same pool (poolMax 1), outside any transaction: nothing survives.
      const outside = await handle.client.$queryRawUnsafe<GucRow[]>(GUC_PROBE_SQL);
      expectGone(outside[0]?.tenant_guc);
      expectGone(outside[0]?.user_guc);
    } finally {
      await handle.end();
    }
  });

  it('prisma variant: fails closed before any query when required context is missing', async () => {
    const handle: PrismaHandle = createPrismaClient(singleSessionProfile());
    try {
      const failure = await withPrincipalContext(
        handle,
        { userId: USER_1 },
        async () => 'ran',
      ).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(PrincipalContextError);
      expect((failure as PrincipalContextError).keys).toEqual(['tenantId']);
    } finally {
      await handle.end();
    }
  });

  it('withTenant sugar binds tenant and user through either variant', async () => {
    const adapter = new PostgresPersistenceAdapter(singleSessionProfile());
    try {
      const inside = await withTenant(
        adapter,
        TENANT_A,
        USER_1,
        async (tx) => (await tx.query<GucRow>(GUC_PROBE_SQL)).rows[0],
      );
      expect(inside?.tenant_guc).toBe(TenantId.toString(TENANT_A));
      expect(inside?.user_guc).toBe(UserId.toString(USER_1));
    } finally {
      await adapter.end();
    }
  });
});
