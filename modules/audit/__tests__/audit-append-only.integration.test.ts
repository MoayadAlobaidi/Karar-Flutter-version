import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import {
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PgError,
  PostgresPersistenceAdapter,
  type DatabaseRole,
} from '@karar/platform/dist/db/index.js';

import { AuditMetadataViolation } from '../application/audit-metadata-guard.js';
import { RecordAuditEvent } from '../application/use-cases/record-audit-event.js';
import { PostgresAuditWriter } from '../infrastructure/persistence/postgres-audit-writer.js';
import { Uuidv7AuditEventIdSource } from '../infrastructure/persistence/uuidv7-audit-event-id-source.js';

// Append-only audit foundation against a real PostgreSQL (data-model.md §10;
// migration 0010). One file, serial execution, same pattern and reasoning as
// packages/platform/src/db/contract.test.ts: these tests are the evidence
// that BOTH append-only mechanisms hold — revoked grants (42501 for
// karar_app) AND the immutability trigger (P0001 even for the owner).
//
// If PostgreSQL is unreachable the suite SKIPS with a loud banner; a skipped
// run is never acceptable evidence for a change to this module.

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
      `AUDIT APPEND-ONLY TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for the append-only audit foundation; a',
      'skipped run proves nothing. Start the local database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  PGPORT=5433 pnpm --filter @karar/audit test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_audit`;

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

const idSource = new Uuidv7AuditEventIdSource();

const inputFor = (resourceId: string) => ({
  occurredAt: new Date('2026-08-15T12:00:00.000Z'),
  environment: 'local-test',
  actorRef: 'staff:security-reviewer',
  tenantRef: 'tenant:qa',
  action: 'user.record.read',
  resourceType: 'user',
  resourceId,
  reason: 'support case 4711',
  requestId: 'req-1',
  traceId: 'trace-1',
  correlationId: 'corr-1',
  outcome: 'SUCCESS' as const,
});

describe.skipIf(unreachable !== null)('audit.audit_events append-only (live PostgreSQL)', () => {
  afterAll(async () => {
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally {
      await maintenance.end();
    }
  });

  it('migrates a fresh database including 0010_audit_events', async () => {
    await bootstrapRolesAndDatabase({ database });
    await withAdapter('migrator', async (adapter) => {
      const { applied } = await migrateToLatest({ adapter });
      expect(applied.map((file) => file.filename)).toContain('0010_audit_events.sql');
    });
  });

  it('appends as karar_app and stores trace ids and redacted HSF metadata', async () => {
    await withAdapter('app', async (adapter) => {
      const useCase = new RecordAuditEvent(new PostgresAuditWriter(adapter), idSource);
      const result = await useCase.execute({
        ...inputFor('user-hsf'),
        beforeMetadata: {
          balance: { classification: 'HIGHLY_SENSITIVE_FINANCIAL', value: '990017' },
          accountId: { classification: 'HIGHLY_SENSITIVE_FINANCIAL', value: 'acc-7' },
        },
        afterMetadata: { status: 'VIEWED' },
      });
      expect(result.ok).toBe(true);

      // Read the row back and assert on what the database actually holds.
      const rows = await adapter.query<{
        actor_ref: string;
        request_id: string;
        trace_id: string;
        correlation_id: string;
        recorded_at: Date;
        before_metadata: { balance: string; accountId: string };
        outcome: string;
      }>(
        `SELECT actor_ref, request_id, trace_id, correlation_id, recorded_at,
                before_metadata, outcome
           FROM audit.audit_events WHERE resource_id = $1`,
        ['user-hsf'],
      );
      expect(rows.rowCount).toBe(1);
      const row = rows.rows[0];
      expect(row?.actor_ref).toBe('staff:security-reviewer');
      expect(row?.request_id).toBe('req-1');
      expect(row?.trace_id).toBe('trace-1');
      expect(row?.correlation_id).toBe('corr-1');
      expect(row?.outcome).toBe('SUCCESS');
      expect(row?.recorded_at).toBeInstanceOf(Date);
      // The HSF value never reached the database; the identifier did.
      expect(row?.before_metadata).toEqual({ balance: '[redacted:hsf]', accountId: 'acc-7' });
      const serialized = JSON.stringify(rows.rows);
      expect(serialized).not.toContain('990017');
    });
  });

  it('denies UPDATE to karar_app via revoked grants (42501)', async () => {
    await withAdapter('app', async (adapter) => {
      const failure = await adapter
        .query(`UPDATE audit.audit_events SET outcome = 'FAILURE' WHERE resource_id = 'user-hsf'`)
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(failure).toBeInstanceOf(PgError);
      expect((failure as PgError).code).toBe('insufficient_privilege');
      expect((failure as PgError).sqlState).toBe('42501');
    });
  });

  it('denies DELETE to karar_app via revoked grants (42501)', async () => {
    await withAdapter('app', async (adapter) => {
      const failure = await adapter.query(`DELETE FROM audit.audit_events`).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(PgError);
      expect((failure as PgError).sqlState).toBe('42501');
    });
  });

  it('denies UPDATE to the table owner via the trigger — even matching zero rows', async () => {
    await withAdapter('migrator', async (adapter) => {
      for (const sql of [
        `UPDATE audit.audit_events SET outcome = 'FAILURE' WHERE resource_id = 'user-hsf'`,
        `UPDATE audit.audit_events SET outcome = 'FAILURE' WHERE resource_id = 'matches-nothing'`,
      ]) {
        const failure = await adapter.query(sql).then(
          () => null,
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(PgError);
        expect((failure as PgError).sqlState).toBe('P0001'); // trigger RAISE, not privilege
        expect((failure as PgError).message).toContain('append-only');
      }
    });
  });

  it('denies DELETE and TRUNCATE to the table owner via the trigger', async () => {
    await withAdapter('migrator', async (adapter) => {
      for (const sql of ['DELETE FROM audit.audit_events', 'TRUNCATE audit.audit_events']) {
        const failure = await adapter.query(sql).then(
          () => null,
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(PgError);
        expect((failure as PgError).sqlState).toBe('P0001');
        expect((failure as PgError).message).toContain('append-only');
      }
    });
  });

  it('the denials had no effect: the appended row survived intact', async () => {
    await withAdapter('app', async (adapter) => {
      const rows = await adapter.query<{ outcome: string }>(
        `SELECT outcome FROM audit.audit_events WHERE resource_id = 'user-hsf'`,
      );
      expect(rows.rows).toEqual([{ outcome: 'SUCCESS' }]);
    });
  });

  it('rejects secret keys and SEALED values before any row is written', async () => {
    await withAdapter('app', async (adapter) => {
      const useCase = new RecordAuditEvent(new PostgresAuditWriter(adapter), idSource);
      await expect(
        useCase.execute({
          ...inputFor('never-written-1'),
          afterMetadata: { apiKey: 'sk-live-000' },
        }),
      ).rejects.toBeInstanceOf(AuditMetadataViolation);
      await expect(
        useCase.execute({
          ...inputFor('never-written-2'),
          afterMetadata: { payload: { classification: 'SEALED', value: 'obligation text' } },
        }),
      ).rejects.toBeInstanceOf(AuditMetadataViolation);

      const rows = await adapter.query(
        `SELECT 1 FROM audit.audit_events WHERE resource_id LIKE 'never-written-%'`,
      );
      expect(rows.rowCount).toBe(0);
    });
  });

  it('returns Result.err "denied" when INSERT privilege is revoked in a scratch state', async () => {
    await withAdapter('superuser', async (adapter) => {
      await adapter.query('REVOKE INSERT ON audit.audit_events FROM karar_app');
    });
    try {
      await withAdapter('app', async (adapter) => {
        const useCase = new RecordAuditEvent(new PostgresAuditWriter(adapter), idSource);
        const result = await useCase.execute(inputFor('denied-by-revoke'));
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.kind).toBe('denied');
          expect(result.error.message).toContain('insufficient_privilege');
        }
      });
    } finally {
      await withAdapter('superuser', async (adapter) => {
        await adapter.query('GRANT INSERT ON audit.audit_events TO karar_app');
      });
    }
  });

  it('returns Result.err "unavailable" when the store is unreachable', async () => {
    const adapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database }),
    );
    await adapter.end(); // simulate the store being gone
    const useCase = new RecordAuditEvent(new PostgresAuditWriter(adapter), idSource);
    const result = await useCase.execute(inputFor('unreachable'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unavailable');
    }
  });

  it('generates time-ordered UUID v7 primary keys', async () => {
    await withAdapter('app', async (adapter) => {
      const useCase = new RecordAuditEvent(new PostgresAuditWriter(adapter), idSource);
      const first = await useCase.execute(inputFor('ordering-1'));
      const second = await useCase.execute(inputFor('ordering-2'));
      expect(first.ok && second.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(first.value.auditEventId <= second.value.auditEventId).toBe(true);
      }
    });
  });
});
