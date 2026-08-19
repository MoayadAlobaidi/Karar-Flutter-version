/**
 * Live-PostgreSQL fixtures for the statement-imports suites.
 *
 * Each suite gets its own scratch database, bootstrapped and migrated from
 * zero (database-portability.md §6). Tenants and memberships are seeded as the
 * bootstrap superuser because neither has a runtime write path here.
 * Everything a subject owns — accounts, imports, sources, rows — goes through
 * the REAL repositories as `karar_app`, so what the tests observe is what
 * production code would do.
 *
 * ## Every fixture here is obviously synthetic, deliberately
 *
 * The statements are hand-written CSVs with merchants called
 * `SYNTHETIC MERCHANT ...`; the accounts are `Synthetic Test Account ...`;
 * the identifiers are patterned UUIDs. **No real bank, telco, wallet provider
 * or exchange house is named anywhere in this module's fixtures, and no real
 * statement data appears in any of them.** Nothing resembles a real account, a
 * real reference, or a plausible balance — a test corpus that looks like real
 * financial data is a leak waiting for somebody to copy it somewhere.
 *
 * ## The event catalogue here is synthetic too, and that is the point
 *
 * `statement_import.committed` is not in
 * `packages/api-contracts/events/catalogue.json` — that file belongs to the
 * platform and this module cannot add to it. So the outbox recorder takes a
 * catalogue as a constructor argument, and these tests hand it one built here.
 * That exercises the real `makeEnvelope` path, including its
 * identifier-only payload rule for a `HIGHLY_SENSITIVE_FINANCIAL` event,
 * without any module fabricating a production catalogue entry.
 */

import pg from 'pg';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';
import type { EventCatalogue } from '@karar/api-contracts';
import {
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PostgresPersistenceAdapter,
  skipUnlessDatabaseRequired,
  type ConnectionProfile,
  type DatabaseRole,
  type TransactionClient,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  CreateManualAccount,
  LocalAesGcmFieldEncryptionProvider as AccountsEncryptionProvider,
  LocalSyntheticRetentionDecisionProvider as AccountsRetentionProvider,
  PrismaFinancialAccountRepository,
  PrismaInstitutionCatalogueReader,
  Uuidv7IdSource as AccountsIdSource,
} from '@karar/financial-accounts';
import {
  LocalAesGcmFieldEncryptionProvider as TransactionsEncryptionProvider,
  LocalKeyedDedupFingerprintProvider,
} from '@karar/transactions';

import type { ImportsPrincipal } from '../application/principal.js';
import type { StatementRetentionDecisionPort } from '../application/ports/statement-retention-decision.js';
import { LocalAesGcmFieldEncryptionProvider } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import { LocalEncryptedSourceStore } from '../infrastructure/providers/local-encrypted-source-store.js';
import { LocalKeyedFileFingerprintProvider } from '../infrastructure/providers/local-keyed-file-fingerprint-provider.js';
import { LocalSyntheticRetentionDecisionProvider } from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';
import { STATEMENT_IMPORT_COMMITTED_EVENT } from '../infrastructure/persistence/platform-outbox-recorder.js';

export const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
export const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');
/** Two people inside ONE tenant: the case tenant scoping alone would miss. */
export const USER_A1 = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
export const USER_A2 = UserId.of('a2a2a2a2-0000-4000-8000-0000000000a2');
export const USER_B1 = UserId.of('b1b1b1b1-0000-4000-8000-0000000000b1');

export const ACTOR_A1: ImportsPrincipal = { tenantId: TENANT_A, userId: USER_A1 };
export const ACTOR_A2: ImportsPrincipal = { tenantId: TENANT_A, userId: USER_A2 };
export const ACTOR_B1: ImportsPrincipal = { tenantId: TENANT_B, userId: USER_B1 };

/**
 * FIXED keys, so a suite can build a second adapter that reads what the first
 * wrote, and so a test that wants a rotation asks for a different key version
 * deliberately rather than getting one by accident.
 */
const SYNTHETIC_HSF_KEY = new Uint8Array(32).fill(31);
const SYNTHETIC_SOURCE_KEY = new Uint8Array(32).fill(41);
const SYNTHETIC_ACCOUNTS_HSF_KEY = new Uint8Array(32).fill(11);
const SYNTHETIC_TRANSACTIONS_HSF_KEY = new Uint8Array(32).fill(13);
export const SYNTHETIC_FILE_FINGERPRINT_ROOT_KEY = new Uint8Array(32).fill(53);
export const SYNTHETIC_DEDUP_ROOT_KEY = new Uint8Array(32).fill(59);

export function testEncryption(keyVersion?: string): LocalAesGcmFieldEncryptionProvider {
  return new LocalAesGcmFieldEncryptionProvider({
    env: 'local',
    key: SYNTHETIC_HSF_KEY,
    keyVersion: keyVersion ?? 'karar-ref:key-version:synthetic-test-imports@v1',
  });
}

export function testSourceStore(): LocalEncryptedSourceStore {
  return new LocalEncryptedSourceStore({
    env: 'local',
    key: SYNTHETIC_SOURCE_KEY,
    keyVersion: 'karar-ref:key-version:synthetic-test-source@v1',
  });
}

export function testFileFingerprints(): LocalKeyedFileFingerprintProvider {
  return new LocalKeyedFileFingerprintProvider({
    rootKey: SYNTHETIC_FILE_FINGERPRINT_ROOT_KEY,
  });
}

export function testDedupFingerprints(): LocalKeyedDedupFingerprintProvider {
  return new LocalKeyedDedupFingerprintProvider({ rootKey: SYNTHETIC_DEDUP_ROOT_KEY });
}

export function testTransactionsEncryption(): TransactionsEncryptionProvider {
  return new TransactionsEncryptionProvider({
    key: SYNTHETIC_TRANSACTIONS_HSF_KEY,
    keyVersion: 'karar-ref:key-version:synthetic-test-transactions@v1',
  });
}

/** The LOCAL retention fixture — a labelled synthetic answer, no legal effect. */
export function testRetention(): StatementRetentionDecisionPort {
  return new LocalSyntheticRetentionDecisionProvider({ env: 'local' });
}

/**
 * A catalogue with exactly one entry, built here rather than read from the
 * platform's file. See the header for why.
 *
 * `payloadRule: 'identifier-only'` and `payloadExemption: null` are the
 * interesting fields: this is a `HIGHLY_SENSITIVE_FINANCIAL` event, and the
 * platform's own `assertEventPayloadAllowed` refuses anything beyond an id
 * field or an occurred-at field without an exemption naming an owner, a
 * reason and a reviewer. The notice needs none, because it carries two
 * identifiers and nothing else — not even a count, which that rule correctly
 * treats as a fact about a person's spending volume rather than as an
 * identifier.
 */
export function syntheticEventCatalogue(): EventCatalogue {
  return {
    events: [
      {
        name: STATEMENT_IMPORT_COMMITTED_EVENT,
        schemaVersion: 1,
        ownerModule: 'statement-imports',
        classification: 'HIGHLY_SENSITIVE_FINANCIAL',
        piiFlag: false,
        allowedConsumers: ['statement-imports-tests'],
        retention: 'P7D',
        payloadRule: 'identifier-only',
        payloadExemption: null,
        payloadSchema: {
          type: 'object',
          properties: {
            importId: { type: 'string' },
            accountId: { type: 'string' },
          },
          required: ['importId', 'accountId'],
          additionalProperties: false,
        },
      },
    ],
  } as unknown as EventCatalogue;
}

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
    // because a skipped integration suite lands in the same green summary as
    // a passing one and proves nothing.
    skipUnlessDatabaseRequired('statement-imports integration suite', reason);
    return reason;
  }
}

export function skipBanner(suite: string, host: string, port: number, why: string): string {
  return [
    '='.repeat(76),
    `${suite} SKIPPED — PostgreSQL is not reachable at ${host}:${port}`,
    `(${why})`,
    'These tests are the evidence that no durable byte of a statement exists',
    'before retention is decided, that RLS confines staged rows, and that a',
    'commit is atomic and idempotent. A skipped run proves none of it.',
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

export const BIND_GUCS = `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`;

/** Statements as karar_app inside one transaction with the given (possibly absent) GUCs. */
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

/** Bootstrap and migrate from zero, then seed the tenancy rows. */
export async function provisionDatabase(database: string): Promise<void> {
  await bootstrapRolesAndDatabase({ database });
  await withAdapter(database, 'migrator', async (adapter) => {
    await migrateToLatest({ adapter });
  });
  await withAdapter(database, 'superuser', async (adapter) => {
    for (const [id, name] of [
      [TenantId.toString(TENANT_A), 'Synthetic Test Tenant A'],
      [TenantId.toString(TENANT_B), 'Synthetic Test Tenant B'],
    ]) {
      await adapter.query(
        `INSERT INTO public.tenants (id, type, name, status) VALUES ($1, 'FIRST_PARTY', $2, 'ACTIVE')`,
        [id, name],
      );
    }
    const members: Array<[string, string, string]> = [
      ['0a0a0a0a-0000-4000-8000-0000000000a1', TenantId.toString(TENANT_A), UserId.toString(USER_A1)],
      ['0a0a0a0a-0000-4000-8000-0000000000a2', TenantId.toString(TENANT_A), UserId.toString(USER_A2)],
      ['0b0b0b0b-0000-4000-8000-0000000000b1', TenantId.toString(TENANT_B), UserId.toString(USER_B1)],
    ];
    for (const [id, tenantId, userId] of members) {
      await adapter.query(
        `INSERT INTO public.tenant_members (id, tenant_id, user_id, role_hint, state, effective_from)
         VALUES ($1, $2, $3, 'MEMBER', 'ACTIVE', now())`,
        [id, tenantId, userId],
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

export function buildHandle(database: string): PrismaHandle {
  return createPrismaClient(appProfile(database));
}

/**
 * Creates a canonical account through the accounts module's OWN use case and
 * returns its id. Names no institution — `institutionRef` null and no
 * user-supplied label — so the catalogue never has to be seeded and no issuer
 * is named anywhere in this module's fixtures.
 */
export async function seedAccount(
  handle: PrismaHandle,
  actor: ImportsPrincipal,
  displayName: string,
  clock: Clock,
  currencyCode: 'QAR' | 'KWD' | 'USD' = 'QAR',
): Promise<string> {
  const create = new CreateManualAccount(
    new PrismaFinancialAccountRepository(
      handle,
      new AccountsEncryptionProvider({
        env: 'local',
        key: SYNTHETIC_ACCOUNTS_HSF_KEY,
        keyVersion: 'karar-ref:key-version:synthetic-test-accounts@v1',
      }),
    ),
    new PrismaInstitutionCatalogueReader(handle),
    new AccountsRetentionProvider({ env: 'local' }),
    new AccountsIdSource(),
    clock,
  );
  const created = await create.execute(
    {
      accountType: 'CURRENT',
      currencyCode,
      displayName,
      institutionRef: null,
      userSuppliedInstitutionLabel: null,
      mask: '0000',
    },
    { tenantId: actor.tenantId, userId: actor.userId },
  );
  if (!created.ok) {
    throw new Error(
      `fixture could not create a synthetic account: ${JSON.stringify(created.error.kind)}`,
    );
  }
  return created.value.id;
}

/** The accounts repository, wired with the fixture key, for the access adapter. */
export function accountsRepository(handle: PrismaHandle): PrismaFinancialAccountRepository {
  return new PrismaFinancialAccountRepository(
    handle,
    new AccountsEncryptionProvider({
      env: 'local',
      key: SYNTHETIC_ACCOUNTS_HSF_KEY,
      keyVersion: 'karar-ref:key-version:synthetic-test-accounts@v1',
    }),
  );
}

/** A clock that never moves, so every assertion about time is about the code. */
export function fixedClock(at = new Date('2026-08-12T09:00:00.000Z')): Clock {
  return { now: () => at } as Clock;
}

/** Bytes of a synthetic statement, as the store and the parser see them. */
export function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** One buffer as a single-chunk async iterable. */
export async function* streamOf(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

/**
 * The same bytes, delivered in small chunks.
 *
 * Used to prove the parser is chunk-independent: a field split across two
 * chunks — or across a multi-byte character's bytes — must read identically to
 * one that was not.
 */
export async function* chunkedStreamOf(
  bytes: Uint8Array,
  chunkSize: number,
): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    yield bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength));
  }
}
