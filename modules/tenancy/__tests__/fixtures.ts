/**
 * Shared live-PostgreSQL fixtures for the tenancy adversarial suites. Each
 * suite gets its own scratch database (bootstrapped and migrated from zero —
 * database-portability.md §6); tenants and FOUNDING members are seeded as the
 * bootstrap superuser because tenant provisioning is a control-plane
 * operation in later phases, never a runtime path. Everything else goes
 * through the real repositories and use cases as karar_app.
 */

import pg from 'pg';

import { TenantId, UserId } from '@karar/shared-kernel';
import { Result } from '@karar/shared-kernel';
import {
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PostgresPersistenceAdapter,
  type ConnectionProfile,
  type DatabaseRole,
  type TransactionClient,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  RecordAuditEvent,
  type AuditEvent,
  type AuditEventIdSource,
  type AuditWriter,
} from '@karar/audit';

import { RecordAuditEventAuditTrail } from '../infrastructure/audit/record-audit-event-audit-trail.js';

export const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
export const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');
export const USER_A1 = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
export const USER_A2 = UserId.of('a2a2a2a2-0000-4000-8000-0000000000a2');
export const USER_B1 = UserId.of('b1b1b1b1-0000-4000-8000-0000000000b1');
export const USER_B2 = UserId.of('b2b2b2b2-0000-4000-8000-0000000000b2');
export const USER_NEW = UserId.of('c3c3c3c3-0000-4000-8000-0000000000c3');

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
    return error instanceof Error ? error.message : String(error);
  }
}

export function skipBanner(suite: string, host: string, port: number, why: string): string {
  return [
    '='.repeat(76),
    `${suite} SKIPPED — PostgreSQL is not reachable at ${host}:${port}`,
    `(${why})`,
    'These tests are the adversarial evidence for tenancy RLS; a skipped run',
    'proves nothing. Start the local database and rerun:',
    '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
    `${'='.repeat(76)}\n`,
  ].join('\n');
}

export function appProfile(database: string): ConnectionProfile {
  const base = LocalPostgresConnectionProfile.fromEnv('app', { database });
  return { ...base, poolMax: 1 }; // one session, so pooled-reuse probes are honest
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

export const BIND_GUCS =
  `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`;

/** Runs statements as karar_app inside one transaction with the given (possibly absent) GUCs. */
export async function asApp<T>(
  database: string,
  guc: { tenantId?: string; userId?: string },
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return withAdapter(database, 'app', (adapter) =>
    adapter.withTransaction(async (tx) => {
      await tx.query(BIND_GUCS, [guc.tenantId ?? '', guc.userId ?? '']);
      return fn(tx);
    }),
  );
}

/** Bootstrap + migrate from zero, then seed two tenants and their founding members. */
export async function provisionDatabase(database: string): Promise<void> {
  await bootstrapRolesAndDatabase({ database });
  await withAdapter(database, 'migrator', async (adapter) => {
    await migrateToLatest({ adapter });
  });
  await withAdapter(database, 'superuser', async (adapter) => {
    for (const [id, name] of [
      [TenantId.toString(TENANT_A), 'Tenant A'],
      [TenantId.toString(TENANT_B), 'Tenant B'],
    ]) {
      await adapter.query(
        `INSERT INTO public.tenants (id, type, name, status) VALUES ($1, 'FIRST_PARTY', $2, 'ACTIVE')`,
        [id, name],
      );
    }
    const members: Array<[string, string, string, string]> = [
      ['0a0a0a0a-0000-4000-8000-0000000000a1', TenantId.toString(TENANT_A), UserId.toString(USER_A1), 'TENANT_ADMIN'],
      ['0a0a0a0a-0000-4000-8000-0000000000a2', TenantId.toString(TENANT_A), UserId.toString(USER_A2), 'MEMBER'],
      ['0b0b0b0b-0000-4000-8000-0000000000b1', TenantId.toString(TENANT_B), UserId.toString(USER_B1), 'TENANT_ADMIN'],
      ['0b0b0b0b-0000-4000-8000-0000000000b2', TenantId.toString(TENANT_B), UserId.toString(USER_B2), 'MEMBER'],
    ];
    for (const [id, tenantId, userId, roleHint] of members) {
      await adapter.query(
        `INSERT INTO public.tenant_members (id, tenant_id, user_id, role_hint, state, effective_from)
         VALUES ($1, $2, $3, $4, 'ACTIVE', now())`,
        [id, tenantId, userId, roleHint],
      );
    }
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

/**
 * Real audit wiring for integration: the module's AuditTrail adapter over the
 * audit module's RecordAuditEvent, with an AuditWriter (the audit module's
 * exported port) appending through the app role.
 */
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

/** Module-global so multiple buildAuditTrail instances never collide on the audit PK. */
let auditIdCounter = 0;

export function buildHandle(database: string): PrismaHandle {
  return createPrismaClient(appProfile(database));
}
