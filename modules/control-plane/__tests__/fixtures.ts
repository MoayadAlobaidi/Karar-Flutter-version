/**
 * Shared live-PostgreSQL fixtures for the kill-switch adversarial suites.
 * Each suite gets its own scratch database (bootstrapped and migrated from
 * zero — database-portability.md §6). The OPERATOR role assignment is seeded
 * as the compose superuser — role bootstrap is a provisioning act — and
 * everything else goes through the real store, policy service, and use cases
 * as karar_app.
 */

import pg from 'pg';

import { Clock, Result, UserId } from '@karar/shared-kernel';
import {
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PostgresPersistenceAdapter,
  type ConnectionProfile,
  type DatabaseRole,
  type TransactionClient,
  skipUnlessDatabaseRequired,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  RecordAuditEvent,
  type AuditEvent,
  type AuditEventIdSource,
  type AuditWriter,
} from '@karar/audit';

import { RecordAuditEventAuditTrail } from '../infrastructure/audit/record-audit-event-audit-trail.js';

export const OPERATOR_USER = UserId.of('09e12a70-0000-4000-8000-00000000000e');
export const PLAIN_USER = UserId.of('c3c3c3c3-0000-4000-8000-0000000000c3');

export const superuserMaintenanceProfile = LocalPostgresConnectionProfile.fromEnv('superuser', {
  database: maintenanceDatabase(),
});

export async function probePostgres(): Promise<string | null> {
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
    const reason = error instanceof Error ? error.message : String(error);
    // KARAR_INTEGRATION=1 declares that this run MUST exercise the database.
    // Under it an unreachable server throws instead of producing a skip,
    // because a skipped integration suite lands in the same green summary as a
    // passing one and proves nothing.
    skipUnlessDatabaseRequired('control-plane integration suite', reason);
    return reason;
  }
}

export function skipBanner(suite: string, host: string, port: number, why: string): string {
  return [
    '='.repeat(76),
    `${suite} SKIPPED — PostgreSQL is not reachable at ${host}:${port}`,
    `(${why})`,
    'These tests are the adversarial evidence for restrict-only kill switches;',
    'a skipped run proves nothing. Start the local database and rerun:',
    '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
    `${'='.repeat(76)}\n`,
  ].join('\n');
}

export function appProfile(database: string): ConnectionProfile {
  const base = LocalPostgresConnectionProfile.fromEnv('app', { database });
  return { ...base, poolMax: 1 };
}

export async function withAdapter<T>(
  database: string,
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

/** Runs statements as karar_app (kill-switch tables are global — no GUCs required). */
export async function asApp<T>(
  database: string,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return withAdapter(database, 'app', (adapter) => adapter.withTransaction(fn));
}

/** Bootstrap + migrate from zero, then seed the OPERATOR role assignment. */
export async function provisionDatabase(database: string): Promise<void> {
  await bootstrapRolesAndDatabase({ database });
  await withAdapter(database, 'migrator', async (adapter) => {
    await migrateToLatest({ adapter });
  });
  await withAdapter(database, 'superuser', async (adapter) => {
    await adapter.query(
      `INSERT INTO public.role_assignments (id, user_id, role_id, tenant_id, granted_by, reason, effective_from)
       VALUES ('00000000-bbbb-4000-8000-000000000001', $1, 'OPERATOR', NULL, $1, 'bootstrap provisioning', now())`,
      [UserId.toString(OPERATOR_USER)],
    );
  });
}

export async function dropDatabase(database: string): Promise<void> {
  const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
  try {
    await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  } finally {
    await maintenance.end();
  }
}

export function buildAuditTrail(auditAdapter: PostgresPersistenceAdapter): {
  auditTrail: RecordAuditEventAuditTrail;
} {
  const writer: AuditWriter = {
    record: async (event: AuditEvent) => {
      try {
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
      } catch (error) {
        return Result.err({
          kind: 'unknown' as const,
          message: `audit append failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
  const idSource: AuditEventIdSource = {
    nextId: () => {
      auditIdCounter += 1;
      return `00000000-0000-7000-8000-${String(auditIdCounter).padStart(12, '0')}` as ReturnType<
        AuditEventIdSource['nextId']
      >;
    },
  };
  return {
    auditTrail: new RecordAuditEventAuditTrail(new RecordAuditEvent(writer, idSource), 'local-test'),
  };
}

let auditIdCounter = 0;

export function buildHandle(database: string): PrismaHandle {
  return createPrismaClient(appProfile(database));
}

/** Monotonic test clock: every now() advances one second (schema CHECKs need ordered instants). */
export class SteppingClock implements Clock {
  private at: number;

  constructor(start: Date) {
    this.at = start.getTime();
  }

  now(): Date {
    this.at += 1_000;
    return new Date(this.at);
  }
}
