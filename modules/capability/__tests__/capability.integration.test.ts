/**
 * Live-PostgreSQL evidence for the capability module (migrations 0076-0077):
 * RLS isolation on tenant_capability_entitlements asserted on NON-EMPTY data,
 * the trigger-enforced append-only ledgers, the version-increment and
 * immutability guards, the closed capability_id CHECK (synthetic ids cannot
 * reach a row), deny-by-default reads through the real repositories, and the
 * §44 TOCTOU pin behaviour against a genuinely concurrent change.
 *
 * Same probe-or-skip pattern as modules/consent and modules/audit: a scratch
 * database per run, never the shared karar database.
 */

import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  dropScratchDatabase,
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PgError,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import { TenantId, UserId } from '@karar/shared-kernel';

import { PrismaCapabilityAvailabilityRepository } from '../infrastructure/persistence/prisma-availability-repository.js';
import { PrismaTenantCapabilityEntitlementRepository } from '../infrastructure/persistence/prisma-entitlement-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import type { EntitlementPrincipal } from '../application/ports/entitlement-repository.js';
import type { TenantCapabilityEntitlement } from '../domain/entitlement.js';

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
if (unreachable !== null) {
  process.stderr.write(
    [
      '='.repeat(76),
      `CAPABILITY TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for migrations 0076-0077 (RLS on entitlements,',
      'append-only ledgers, version guards); a skipped run proves nothing. Start the',
      'database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  POSTGRES_PORT=5433 pnpm --filter @karar/capability test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_capability`;
const NOW = new Date('2026-08-16T12:00:00.000Z');
const ids = new Uuidv7IdSource();

describe.skipIf(unreachable !== null)('capability (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  let availability: PrismaCapabilityAvailabilityRepository;
  let entitlements: PrismaTenantCapabilityEntitlementRepository;

  const tenant1 = TenantId.of(randomUUID());
  const tenant2 = TenantId.of(randomUUID());
  const alice: EntitlementPrincipal = { tenantId: tenant1, userId: UserId.of(randomUUID()) };
  const bob: EntitlementPrincipal = { tenantId: tenant2, userId: UserId.of(randomUUID()) };

  /** Raw SQL under a principal context — for adversarial probes. */
  async function rawAsPrincipal<T extends pg.QueryResultRow>(
    principal: EntitlementPrincipal,
    sql: string,
    params?: readonly unknown[],
  ): Promise<pg.QueryResult<T>> {
    return appAdapter.withTransaction(async (tx) => {
      await tx.query(
        `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`,
        [principal.tenantId, principal.userId],
      );
      return tx.query<T>(sql, params);
    });
  }

  function entitlement(
    principal: EntitlementPrincipal,
    capabilityId: string,
    overrides: Partial<TenantCapabilityEntitlement> = {},
  ): TenantCapabilityEntitlement {
    return {
      id: ids.nextId(),
      tenantId: principal.tenantId,
      capabilityId,
      status: 'ACTIVE',
      sourceRef: 'operator:integration-test',
      reason: 'integration fixture',
      actorRef: 'staff:integration-test',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      version: 1,
      ...overrides,
    };
  }

  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
    migratorAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database }),
    );
    const { applied } = await migrateToLatest({ adapter: migratorAdapter });
    expect(applied.map((f) => f.filename)).toEqual(
      expect.arrayContaining([
        '0076_capability_availability.sql',
        '0077_tenant_capability_entitlements.sql',
      ]),
    );
    appAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database }),
    );
    superuserAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
    );
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));
    availability = new PrismaCapabilityAvailabilityRepository(prismaHandle);
    entitlements = new PrismaTenantCapabilityEntitlementRepository(prismaHandle);
  }, 60_000);

  afterAll(async () => {
    await prismaHandle?.end();
    await appAdapter?.end();
    await migratorAdapter?.end();
    await superuserAdapter?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await dropScratchDatabase(maintenance, database);
    } finally {
      await maintenance.end();
    }
  });

  it('ships with NO seed rows — deny by default is the absence of configuration', async () => {
    const rows = await appAdapter.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.capability_availability`,
    );
    expect(rows.rows[0]?.count).toBe('0');
    const facts = await availability.factsFor('local', 'jurisdiction:qa', 'TRANSACTIONS');
    expect(facts).toEqual({ kind: 'NO_ROW', existsForOtherEnvironment: false });
  });

  it('refuses a synthetic capability id at the database — the closed CHECK', async () => {
    const failure = await appAdapter
      .query(
        `INSERT INTO public.capability_availability
           (id, environment, jurisdiction_ref, capability_id, state, reason, actor_ref, updated_at)
         VALUES ($1, 'local', NULL, 'TEST_SYNTH', 'AVAILABLE', 'probe', 'staff:probe', now())`,
        [randomUUID()],
      )
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(PgError);
    expect((failure as PgError).sqlState).toBe('23514'); // check_violation
  });

  it('refuses an unknown availability state and an unknown environment', async () => {
    for (const [column, sql] of [
      [
        'state',
        `INSERT INTO public.capability_availability
           (id, environment, jurisdiction_ref, capability_id, state, reason, actor_ref, updated_at)
         VALUES ($1, 'local', NULL, 'ZAKAT', 'TOTALLY_ON', 'probe', 'staff:probe', now())`,
      ],
      [
        'environment',
        `INSERT INTO public.capability_availability
           (id, environment, jurisdiction_ref, capability_id, state, reason, actor_ref, updated_at)
         VALUES ($1, 'prod', NULL, 'ZAKAT', 'DISABLED', 'probe', 'staff:probe', now())`,
      ],
    ] as const) {
      const failure = await appAdapter.query(sql, [randomUUID()]).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure, column).toBeInstanceOf(PgError);
      expect((failure as PgError).sqlState).toBe('23514');
    }
  });

  it('appends an availability ledger row on INSERT and on every UPDATE', async () => {
    const record = {
      id: ids.nextId(),
      environment: 'local',
      jurisdictionRef: 'jurisdiction:qa',
      capabilityId: 'ZAKAT' as const,
      state: 'PENDING_LEGAL_REVIEW' as const,
      reason: 'no Sharia review exists',
      actorRef: 'staff:integration-test',
      version: 1,
    };
    await availability.insert(record, NOW);
    const updated = await availability.updateState(
      record.id,
      1,
      'DISABLED',
      'withdrawn pending review',
      'staff:integration-test',
      NOW,
    );
    expect(updated).toBe('UPDATED');

    const ledger = await appAdapter.query<{ version: number; state: string }>(
      `SELECT version, state FROM public.capability_availability_history
        WHERE availability_id = $1 ORDER BY version`,
      [record.id],
    );
    expect(ledger.rows).toEqual([
      { version: 1, state: 'PENDING_LEGAL_REVIEW' },
      { version: 2, state: 'DISABLED' },
    ]);
  });

  it('rejects a stale expected version (optimistic concurrency)', async () => {
    const record = {
      id: ids.nextId(),
      environment: 'local',
      jurisdictionRef: null,
      capabilityId: 'GOALS' as const,
      state: 'DISABLED' as const,
      reason: 'ground state',
      actorRef: 'staff:integration-test',
      version: 1,
    };
    await availability.insert(record, NOW);
    const stale = await availability.updateState(
      record.id,
      7,
      'PENDING_PROVIDER',
      'stale write',
      'staff:integration-test',
      NOW,
    );
    expect(stale).toBe('VERSION_CONFLICT');
  });

  it('refuses a version jump, an identity edit, a DELETE, and a TRUNCATE — even for the owner', async () => {
    const record = {
      id: ids.nextId(),
      environment: 'local',
      jurisdictionRef: null,
      capabilityId: 'BUDGETS' as const,
      state: 'DISABLED' as const,
      reason: 'ground state',
      actorRef: 'staff:integration-test',
      version: 1,
    };
    await availability.insert(record, NOW);

    for (const sql of [
      `UPDATE public.capability_availability SET version = 5 WHERE id = $1`,
      `UPDATE public.capability_availability SET capability_id = 'GOALS', version = 2 WHERE id = $1`,
      `DELETE FROM public.capability_availability WHERE id = $1`,
    ]) {
      const failure = await appAdapter.query(sql, [record.id]).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure, sql).toBeInstanceOf(PgError);
    }

    const truncate = await migratorAdapter
      .query(`TRUNCATE public.capability_availability CASCADE`)
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(truncate).toBeInstanceOf(PgError);
  });

  it('keeps the availability ledger append-only — UPDATE and DELETE raise for the owner too', async () => {
    for (const sql of [
      `UPDATE public.capability_availability_history SET state = 'AVAILABLE'`,
      `DELETE FROM public.capability_availability_history`,
    ]) {
      const failure = await migratorAdapter.query(sql).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure, sql).toBeInstanceOf(PgError);
    }
  });

  it('RLS: entitlements are tenant-isolated, asserted on NON-EMPTY data', async () => {
    // Seed BOTH tenants first — an isolation test on empty tables proves nothing.
    await entitlements.insert(alice, entitlement(alice, 'INSIGHTS'), NOW);
    await entitlements.insert(bob, entitlement(bob, 'BUDGETS'), NOW);

    // Proven from outside RLS (superuser bypasses policies): the rows really
    // are there, so the isolation assertions below are not vacuous.
    const bothExist = await superuserAdapter.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.tenant_capability_entitlements`,
    );
    expect(Number(bothExist.rows[0]?.count)).toBeGreaterThanOrEqual(2);

    // FORCE applies to the table OWNER too: karar_migrator, with no principal
    // context bound, sees none of them.
    const ownerView = await migratorAdapter.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.tenant_capability_entitlements`,
    );
    expect(ownerView.rows[0]?.count).toBe('0');

    // Alice sees only her tenant's row.
    const aliceRows = await rawAsPrincipal<{ capability_id: string; tenant_id: string }>(
      alice,
      `SELECT capability_id, tenant_id FROM public.tenant_capability_entitlements`,
    );
    expect(aliceRows.rows.map((r) => r.capability_id)).toEqual(['INSIGHTS']);
    expect(aliceRows.rows.every((r) => r.tenant_id === tenant1)).toBe(true);

    // Bob sees only his.
    const bobRows = await rawAsPrincipal<{ capability_id: string }>(
      bob,
      `SELECT capability_id FROM public.tenant_capability_entitlements`,
    );
    expect(bobRows.rows.map((r) => r.capability_id)).toEqual(['BUDGETS']);

    // Alice cannot reach Bob's row even by naming his tenant explicitly.
    const crossTenant = await rawAsPrincipal<{ count: string }>(
      alice,
      `SELECT count(*)::text AS count FROM public.tenant_capability_entitlements WHERE tenant_id = $1`,
      [tenant2],
    );
    expect(crossTenant.rows[0]?.count).toBe('0');

    // The repository under Alice's context agrees.
    expect(await entitlements.factsFor(alice, 'BUDGETS')).toEqual({ kind: 'NONE' });
    const own = await entitlements.factsFor(alice, 'INSIGHTS');
    expect(own.kind).toBe('ROW');
  });

  it('RLS: an unbound session sees nothing and writes nothing — fail closed', async () => {
    const unbound = await appAdapter.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.tenant_capability_entitlements`,
    );
    expect(unbound.rows[0]?.count).toBe('0');

    const blocked = await appAdapter
      .query(
        `INSERT INTO public.tenant_capability_entitlements
           (id, tenant_id, capability_id, status, source_ref, reason, actor_ref,
            effective_from, updated_at)
         VALUES ($1, $2, 'GOALS', 'ACTIVE', 'operator:probe', 'probe', 'staff:probe', now(), now())`,
        [randomUUID(), tenant1],
      )
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(blocked).toBeInstanceOf(PgError);
    expect((blocked as PgError).sqlState).toBe('42501'); // insufficient_privilege (RLS)
  });

  it('RLS: an insert naming ANOTHER tenant is refused by the WITH CHECK arm', async () => {
    const blocked = await appAdapter
      .withTransaction(async (tx) => {
        await tx.query(
          `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`,
          [alice.tenantId, alice.userId],
        );
        return tx.query(
          `INSERT INTO public.tenant_capability_entitlements
             (id, tenant_id, capability_id, status, source_ref, reason, actor_ref,
              effective_from, updated_at)
           VALUES ($1, $2, 'GOALS', 'ACTIVE', 'operator:probe', 'probe', 'staff:probe', now(), now())`,
          [randomUUID(), tenant2],
        );
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(blocked).toBeInstanceOf(PgError);
    expect((blocked as PgError).sqlState).toBe('42501');
  });

  it('appends a tenant-scoped entitlement ledger row per version, readable only by that tenant', async () => {
    const row = entitlement(alice, 'AI_ADVISOR');
    await entitlements.insert(alice, row, NOW);
    const transitioned = await entitlements.transition(
      alice,
      row.id,
      1,
      {
        status: 'REVOKED',
        sourceRef: row.sourceRef,
        reason: 'withdrawn',
        actorRef: 'staff:integration-test',
        effectiveFrom: row.effectiveFrom,
        effectiveTo: NOW,
      },
      NOW,
    );
    expect(transitioned).toBe('UPDATED');

    const ledger = await rawAsPrincipal<{ version: number; status: string }>(
      alice,
      `SELECT version, status FROM public.tenant_capability_entitlement_history
        WHERE entitlement_id = $1 ORDER BY version`,
      [row.id],
    );
    expect(ledger.rows).toEqual([
      { version: 1, status: 'ACTIVE' },
      { version: 2, status: 'REVOKED' },
    ]);

    // Bob cannot read Alice's ledger.
    const bobView = await rawAsPrincipal<{ count: string }>(
      bob,
      `SELECT count(*)::text AS count FROM public.tenant_capability_entitlement_history
        WHERE entitlement_id = $1`,
      [row.id],
    );
    expect(bobView.rows[0]?.count).toBe('0');
  });

  it('keeps the entitlement ledger append-only — UPDATE/DELETE raise even for the owner', async () => {
    for (const sql of [
      `UPDATE public.tenant_capability_entitlement_history SET status = 'ACTIVE'`,
      `DELETE FROM public.tenant_capability_entitlement_history`,
    ]) {
      const failure = await migratorAdapter.query(sql).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure, sql).toBeInstanceOf(PgError);
    }
  });

  it('refuses an entitlement version jump and a DELETE from inside the tenant context', async () => {
    const row = entitlement(bob, 'TRANSACTIONS');
    await entitlements.insert(bob, row, NOW);
    // Probed under Bob's own principal context: the row IS visible there, so
    // the guard trigger — not RLS — is what refuses each statement.
    for (const sql of [
      `UPDATE public.tenant_capability_entitlements SET version = 9 WHERE id = $1`,
      `UPDATE public.tenant_capability_entitlements SET capability_id = 'GOALS', version = 2 WHERE id = $1`,
      `DELETE FROM public.tenant_capability_entitlements WHERE id = $1`,
    ]) {
      const failure = await rawAsPrincipal(bob, sql, [row.id]).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure, sql).toBeInstanceOf(PgError);
    }
    // The row survived every attempt, at its original version.
    const survivor = await rawAsPrincipal<{ version: number; capability_id: string }>(
      bob,
      `SELECT version, capability_id FROM public.tenant_capability_entitlements WHERE id = $1`,
      [row.id],
    );
    expect(survivor.rows).toEqual([{ version: 1, capability_id: 'TRANSACTIONS' }]);
  });

  it('refuses a REVOKED entitlement with no recorded end (CHECK)', async () => {
    const failure = await appAdapter
      .withTransaction(async (tx) => {
        await tx.query(
          `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`,
          [alice.tenantId, alice.userId],
        );
        return tx.query(
          `INSERT INTO public.tenant_capability_entitlements
             (id, tenant_id, capability_id, status, source_ref, reason, actor_ref,
              effective_from, updated_at)
           VALUES ($1, $2, 'ZAKAT', 'REVOKED', 'operator:probe', 'probe', 'staff:probe', now(), now())`,
          [randomUUID(), alice.tenantId],
        );
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(PgError);
    expect((failure as PgError).sqlState).toBe('23514');
  });

  it('§44: a concurrent change lands in a LATER read; the pinned version says which was used', async () => {
    const record = {
      id: ids.nextId(),
      environment: 'local',
      jurisdictionRef: 'jurisdiction:qa',
      capabilityId: 'INSIGHTS' as const,
      state: 'DISABLED' as const,
      reason: 'ground state',
      actorRef: 'staff:integration-test',
      version: 1,
    };
    await availability.insert(record, NOW);

    const before = await availability.factsFor('local', 'jurisdiction:qa', 'INSIGHTS');
    expect(before).toMatchObject({ kind: 'ROW', version: 1, state: 'DISABLED' });

    // A concurrent operator change between the two reads.
    expect(
      await availability.updateState(
        record.id,
        1,
        'PENDING_PROVIDER',
        'concurrent change',
        'staff:other-operator',
        NOW,
      ),
    ).toBe('UPDATED');

    const after = await availability.factsFor('local', 'jurisdiction:qa', 'INSIGHTS');
    expect(after).toMatchObject({ kind: 'ROW', version: 2, state: 'PENDING_PROVIDER' });

    // Each snapshot is internally consistent — no half-applied mix — and the
    // ledger explains both pinned versions.
    const ledger = await appAdapter.query<{ version: number; state: string }>(
      `SELECT version, state FROM public.capability_availability_history
        WHERE availability_id = $1 ORDER BY version`,
      [record.id],
    );
    expect(ledger.rows).toEqual([
      { version: 1, state: 'DISABLED' },
      { version: 2, state: 'PENDING_PROVIDER' },
    ]);
  });

  it('reports WRONG_ENVIRONMENT input when rows exist only for another environment', async () => {
    await availability.insert(
      {
        id: ids.nextId(),
        environment: 'staging',
        jurisdictionRef: null,
        capabilityId: 'AMANAT',
        state: 'DISABLED',
        reason: 'staging only',
        actorRef: 'staff:integration-test',
        version: 1,
      },
      NOW,
    );
    const facts = await availability.factsFor('local', 'jurisdiction:qa', 'AMANAT');
    expect(facts).toEqual({ kind: 'NO_ROW', existsForOtherEnvironment: true });
  });

  it('prefers the jurisdiction-specific row over the environment-wide row', async () => {
    await availability.insert(
      {
        id: ids.nextId(),
        environment: 'dev',
        jurisdictionRef: null,
        capabilityId: 'GOALS',
        state: 'PENDING_PROVIDER',
        reason: 'environment-wide',
        actorRef: 'staff:integration-test',
        version: 1,
      },
      NOW,
    );
    await availability.insert(
      {
        id: ids.nextId(),
        environment: 'dev',
        jurisdictionRef: 'jurisdiction:qa',
        capabilityId: 'GOALS',
        state: 'DISABLED',
        reason: 'narrower row wins',
        actorRef: 'staff:integration-test',
        version: 1,
      },
      NOW,
    );
    const facts = await availability.factsFor('dev', 'jurisdiction:qa', 'GOALS');
    expect(facts).toMatchObject({ kind: 'ROW', state: 'DISABLED' });
  });
});
