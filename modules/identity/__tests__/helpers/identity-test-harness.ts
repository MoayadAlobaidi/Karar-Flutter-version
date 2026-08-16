/**
 * Shared harness for the identity integration suites: a fresh database per
 * suite (bootstrapped and migrated through the real runner, so every test
 * runs against the real grants, policies, and triggers), the real Prisma
 * repositories on the app role, and local/in-memory implementations of the
 * environment-shaped ports (mail sink, encryption, rate limiting, keys).
 *
 * Suites SKIP with a loud banner when PostgreSQL is unreachable — a skipped
 * run is never evidence (same stance as the audit module's suite).
 */

import pg from 'pg';

import { Clock, Result } from '@karar/shared-kernel';
import {
  RecordAuditEvent,
  type AuditEvent,
  type AuditEventIdSource,
  type AuditWriteError,
  type AuditWriter,
} from '@karar/audit';
import {
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import { InMemoryTestEncryptionProvider } from '@karar/platform/dist/keys/index.js';
import { LocalMailSink } from '@karar/platform/dist/notifications/index.js';
import { InProcessRateLimiter, type RateLimiter } from '@karar/platform/dist/ratelimit/index.js';

import type { IdentityPolicy } from '../../domain/identity-policy.js';
import {
  createIdentityRuntime,
  type IdentityRuntime,
} from '../../infrastructure/composition/create-identity-runtime.js';
import { loadIdentityConfig } from '../../infrastructure/config/identity-config.js';
import { LocalDevKeyProvider } from '../../infrastructure/providers/local-dev-key-provider.js';
import { uuidv7 } from '../../infrastructure/crypto/uuidv7.js';
import type { ClientContext } from '../../application/identity-deps.js';

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

export function printSkipBanner(suite: string, reason: string): void {
  process.stderr.write(
    [
      '='.repeat(76),
      `IDENTITY ${suite} TESTS SKIPPED — PostgreSQL is not reachable`,
      `(${reason})`,
      'These tests are the evidence for the identity module; a skipped run',
      'proves nothing. Start the local infrastructure and rerun:',
      '  POSTGRES_PORT=5433 REDIS_PORT=6380 docker compose up -d postgres redis --wait',
      '  POSTGRES_PORT=5433 KARAR_ENV=local pnpm --filter @karar/identity test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

/** Audit capture: the real RecordAuditEvent use case over an in-memory writer. */
export class CapturingAuditWriter implements AuditWriter {
  readonly events: AuditEvent[] = [];
  failNextWrite = false;

  record(event: AuditEvent): Promise<Result<AuditEvent, AuditWriteError>> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      return Promise.resolve(
        Result.err({ kind: 'unavailable' as const, message: 'audit store down (test)' }),
      );
    }
    this.events.push(event);
    return Promise.resolve(Result.ok(event));
  }
}

class TestAuditEventIdSource implements AuditEventIdSource {
  nextId() {
    return uuidv7() as ReturnType<AuditEventIdSource['nextId']>;
  }
}

export interface IdentityHarness {
  readonly runtime: IdentityRuntime;
  readonly clock: Clock.Fixed;
  readonly mailSink: LocalMailSink;
  readonly auditWriter: CapturingAuditWriter;
  readonly prisma: PrismaHandle;
  readonly database: string;
  readonly client: ClientContext;
  end(): Promise<void>;
}

export interface HarnessOptions {
  readonly suite: string;
  readonly policy?: Partial<IdentityPolicy>;
  readonly start?: Date;
  /** Override the limiter — e.g. `allowAllRateLimiter` for suites that prove the LEDGER controls. */
  readonly rateLimiter?: RateLimiter;
}

/**
 * A limiter that always admits: for suites proving the ledger-derived
 * controls (lockout, recovery lock), which sit BEHIND the distributed
 * limiter at the same thresholds. The limiter itself is proven separately.
 */
export const allowAllRateLimiter: RateLimiter = {
  enforce: () => Promise.resolve({ allowed: true, remaining: Number.MAX_SAFE_INTEGER }),
};

export async function createIdentityHarness(options: HarnessOptions): Promise<IdentityHarness> {
  const database = `karar_test_${process.pid}_idn_${options.suite}`;
  await bootstrapRolesAndDatabase({ database });
  const migrator = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv('migrator', { database }),
  );
  try {
    await migrateToLatest({ adapter: migrator });
  } finally {
    await migrator.end();
  }

  const prisma = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));
  const clock = new Clock.Fixed(options.start ?? new Date('2026-08-16T09:00:00.000Z'));
  const mailSink = new LocalMailSink({ env: 'local' });
  const auditWriter = new CapturingAuditWriter();
  const config = loadIdentityConfig('local', {});

  const runtime = createIdentityRuntime({
    config,
    prisma,
    recordAudit: new RecordAuditEvent(auditWriter, new TestAuditEventIdSource()),
    notifications: mailSink,
    encryption: new InMemoryTestEncryptionProvider(),
    rateLimiter: options.rateLimiter ?? new InProcessRateLimiter(),
    tokenKeys: new LocalDevKeyProvider({ env: 'local' }),
    clock,
    ...(options.policy !== undefined ? { policy: options.policy } : {}),
  });

  return {
    runtime,
    clock,
    mailSink,
    auditWriter,
    prisma,
    database,
    client: { ipDigest: runtime.deps.digester.ipDigest('203.0.113.10'), userAgentSummary: 'Chrome on macOS' },
    end: async () => {
      await prisma.end();
      const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
      try {
        await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      } finally {
        await maintenance.end();
      }
    },
  };
}

/** The captured verification code / reset token for an address, newest first. */
export function lastCodeFor(sink: LocalMailSink, email: string): string | null {
  const entry = [...sink.capturedFor(email)]
    .reverse()
    .find((item) => item.type === 'verification_code');
  return entry?.type === 'verification_code' ? entry.message.code : null;
}

export function lastResetTokenFor(sink: LocalMailSink, email: string): string | null {
  const entry = [...sink.capturedFor(email)].reverse().find((item) => item.type === 'password_reset');
  return entry?.type === 'password_reset' ? entry.message.token : null;
}

/** Count ledger rows of a type for an account, via the repository port. */
export async function securityEventCount(
  harness: IdentityHarness,
  accountId: string,
  eventType: string,
): Promise<number> {
  const rows = await harness.prisma.client.authenticationSecurityEvent.findMany({
    where: { accountId, eventType },
  });
  return rows.length;
}
