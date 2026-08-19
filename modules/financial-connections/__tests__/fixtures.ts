/**
 * Live-PostgreSQL fixtures for the financial-connections adversarial suites.
 *
 * Each suite gets its own scratch database, bootstrapped and migrated from
 * zero (database-portability.md §6). Tenants and memberships are seeded as
 * the bootstrap superuser because neither has a runtime write path here.
 * Everything a subject owns — accounts, connections, source links — goes
 * through the REAL repositories as `karar_app`, so what the tests observe is
 * what production code would do.
 *
 * **The canonical accounts are created through `@karar/financial-accounts`'
 * own use case**, not seeded with raw SQL. That is deliberate: the adapter
 * this module ships (`FinancialAccountsCanonicalAccountAdapter`) reads real
 * account rows through that module's real repository, and an account seeded
 * with placeholder ciphertext would fail to decrypt and the adapter would
 * never be exercised at all.
 *
 * ## Every fixture here is obviously synthetic, deliberately
 *
 * The accounts are `Synthetic Test Account ...`; the connection labels are
 * `Synthetic Test Connection ...`; the external account references are
 * `SYNTHETIC-...` tokens that carry no digits an account number could hide
 * in; the identifiers are patterned UUIDs. **No real bank, telco, wallet
 * provider or exchange house is named anywhere in this module's fixtures, and
 * none may be.** Nothing resembles a real account, a real reference, or a
 * plausible balance — a test corpus that looks like real financial data is a
 * leak waiting for someone to copy it somewhere.
 */

import pg from 'pg';
import { expect } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';
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
  CreateManualAccount,
  LocalAesGcmFieldEncryptionProvider as AccountsEncryptionProvider,
  LocalSyntheticRetentionDecisionProvider as AccountsRetentionProvider,
  PrismaFinancialAccountRepository,
  PrismaInstitutionCatalogueReader,
  Uuidv7IdSource as AccountsIdSource,
} from '@karar/financial-accounts';

import type { AccountSourceLinkRepository } from '../application/ports/account-source-link-repository.js';
import type { FinancialConnectionRepository } from '../application/ports/financial-connection-repository.js';
import type { FinancialConnectionRetentionDecisionPort } from '../application/ports/financial-connection-retention-decision.js';
import type { HsfFieldEncryptionPort } from '../application/ports/hsf-field-encryption.js';
import type { SourceAccountFingerprintPort } from '../application/ports/source-account-fingerprint.js';
import type { ConnectionsPrincipal } from '../application/principal.js';
import type { AccountSourceLink } from '../domain/account-source-link.js';
import type { FinancialConnection } from '../domain/financial-connection.js';
import { LocalAesGcmFieldEncryptionProvider } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import { LocalKeyedSourceAccountFingerprintProvider } from '../infrastructure/providers/local-keyed-source-account-fingerprint-provider.js';
import { LocalSyntheticRetentionDecisionProvider } from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';

export const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
export const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');
/** Two people inside ONE tenant: the case tenant scoping alone would miss. */
export const USER_A1 = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
export const USER_A2 = UserId.of('a2a2a2a2-0000-4000-8000-0000000000a2');
export const USER_B1 = UserId.of('b1b1b1b1-0000-4000-8000-0000000000b1');

export const ACTOR_A1: ConnectionsPrincipal = { tenantId: TENANT_A, userId: USER_A1 };
export const ACTOR_A2: ConnectionsPrincipal = { tenantId: TENANT_A, userId: USER_A2 };
export const ACTOR_B1: ConnectionsPrincipal = { tenantId: TENANT_B, userId: USER_B1 };

/**
 * Synthetic external account references. Identifier tokens with no digit run
 * long enough to be an account number, a card number or a phone number — the
 * domain rule would refuse anything that was.
 */
export const SYNTHETIC_SOURCE_REF_ONE = 'SYNTHETIC-SRC-ACCT-ALPHA';
export const SYNTHETIC_SOURCE_REF_TWO = 'SYNTHETIC-SRC-ACCT-BETA';

/**
 * FIXED keys, so a suite can build a second adapter that reads what the first
 * wrote, and so a test that wants a rotation asks for a different key version
 * deliberately rather than getting one by accident. The default
 * random-per-instance keys would make every repository in a suite mutually
 * unreadable and every fingerprint mutually incomparable.
 */
const SYNTHETIC_HSF_KEY = new Uint8Array(32).fill(23);
const SYNTHETIC_ACCOUNTS_HSF_KEY = new Uint8Array(32).fill(11);
export const SYNTHETIC_FINGERPRINT_ROOT_KEY = new Uint8Array(32).fill(37);

/** The LOCAL encryption adapter for this module, with the synthetic key. */
export function testEncryption(keyVersion?: string): HsfFieldEncryptionPort {
  return new LocalAesGcmFieldEncryptionProvider({
    env: 'local',
    key: SYNTHETIC_HSF_KEY,
    keyVersion: keyVersion ?? 'karar-ref:key-version:synthetic-test-connections@v1',
  });
}

/** The LOCAL fingerprint adapter, with a fixed root key. */
export function testFingerprints(): SourceAccountFingerprintPort {
  return new LocalKeyedSourceAccountFingerprintProvider({
    rootKey: SYNTHETIC_FINGERPRINT_ROOT_KEY,
  });
}

/** The LOCAL retention fixture — a labelled synthetic answer, no legal effect. */
export function testRetention(): FinancialConnectionRetentionDecisionPort {
  return new LocalSyntheticRetentionDecisionProvider({ env: 'local' });
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
    skipUnlessDatabaseRequired('financial-connections integration suite', reason);
    return reason;
  }
}

export function skipBanner(suite: string, host: string, port: number, why: string): string {
  return [
    '='.repeat(76),
    `${suite} SKIPPED — PostgreSQL is not reachable at ${host}:${port}`,
    `(${why})`,
    'These tests are the adversarial evidence that RLS confines the source',
    'links and the protected external identity behind them; a skipped run',
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
      [
        '0a0a0a0a-0000-4000-8000-0000000000a1',
        TenantId.toString(TENANT_A),
        UserId.toString(USER_A1),
      ],
      [
        '0a0a0a0a-0000-4000-8000-0000000000a2',
        TenantId.toString(TENANT_A),
        UserId.toString(USER_A2),
      ],
      [
        '0b0b0b0b-0000-4000-8000-0000000000b1',
        TenantId.toString(TENANT_B),
        UserId.toString(USER_B1),
      ],
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

/** The financial-accounts repository, wired with its own synthetic key. */
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

/**
 * Creates a canonical account through the accounts module's OWN use case and
 * returns its id. Names no institution — `institutionRef` null and no
 * user-supplied label — so the catalogue never has to be seeded and no issuer
 * is named anywhere in this module's fixtures.
 */
export async function seedAccount(
  handle: PrismaHandle,
  actor: ConnectionsPrincipal,
  displayName: string,
  clock: Clock,
): Promise<string> {
  const create = new CreateManualAccount(
    accountsRepository(handle),
    new PrismaInstitutionCatalogueReader(handle),
    new AccountsRetentionProvider({ env: 'local' }),
    new AccountsIdSource(),
    clock,
  );
  const created = await create.execute(
    {
      accountType: 'CURRENT',
      currencyCode: 'QAR',
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


/**
 * The window an isolation probe reads through, now that neither repository
 * offers an unbounded list.
 *
 * `expectEveryVisible*` asserts `hasMore` is false before handing the rows
 * back, deliberately. Without it a probe would silently weaken the day a
 * fixture seeds more rows than the limit: "this principal sees nothing of
 * that one" would start passing because the page ran out rather than because
 * the rows did.
 */
const PROBE_PAGE = { offset: 0, limit: 50 } as const;

/** No narrowing at all — every connection the principal can see. */
export const EVERY_CONNECTION_PAGE = {
  rail: null,
  status: null,
  institutionId: null,
  ...PROBE_PAGE,
} as const;

/** No narrowing at all — every source link the principal can see. */
export const EVERY_SOURCE_LINK_PAGE = {
  connectionId: null,
  rail: null,
  status: null,
  ...PROBE_PAGE,
} as const;

/** The same window, narrowed to the links feeding one account. */
export function everySourceLinkPageFor(accountId: string) {
  return { accountId, ...EVERY_SOURCE_LINK_PAGE } as const;
}

export async function expectEveryVisibleConnection(
  repository: FinancialConnectionRepository,
  actor: ConnectionsPrincipal,
): Promise<readonly FinancialConnection[]> {
  const page = await repository.pageOwn(actor, EVERY_CONNECTION_PAGE);
  expect(page.hasMore).toBe(false);
  return page.connections;
}

export async function expectEveryVisibleSourceLink(
  repository: AccountSourceLinkRepository,
  actor: ConnectionsPrincipal,
): Promise<readonly AccountSourceLink[]> {
  const page = await repository.pageOwn(actor, { accountRef: null, ...EVERY_SOURCE_LINK_PAGE });
  expect(page.hasMore).toBe(false);
  return page.links;
}


/**
 * What one `findMany` actually did: the cap the statement carried, and the
 * number of rows PostgreSQL handed back.
 */
export interface ObservedRead {
  readonly model: string;
  /** The row cap in the statement, or `undefined` when it carried none. */
  readonly take: number | undefined;
  /** How many rows the database actually returned. */
  readonly rows: number;
}

/**
 * A handle that records every `findMany` a repository issues inside its
 * principal-context transaction.
 *
 * THIS IS WHAT MAKES A PAGE-BOUND TEST A CLAIM ABOUT THE DATABASE. Asserting
 * that a page holds `limit` rows proves only that something trimmed a list —
 * a repository that read every row a subject owns and sliced afterwards
 * satisfies it exactly as a bounded one does. What separates the two is how
 * many rows crossed the wire, so that is what is recorded here, read off the
 * array PostgreSQL returned rather than off the page built from it.
 *
 * `withPrincipalContext` reaches the store through `client.$transaction`, so
 * this substitutes the transaction client the callback receives and leaves
 * every other property alone — including the `$queryRaw` that binds the
 * principal GUCs, so an observed read runs under exactly the RLS context a
 * real one does.
 */
export function observingHandle(handle: PrismaHandle, seen: ObservedRead[]): PrismaHandle {
  const client = new Proxy(handle.client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      const bound = value.bind(target) as (...args: unknown[]) => unknown;
      if (property !== '$transaction') return bound;
      return (first: unknown, ...rest: unknown[]): unknown =>
        typeof first === 'function'
          ? bound(
              (tx: object) => (first as (tx: unknown) => unknown)(observedTransaction(tx, seen)),
              ...rest,
            )
          : bound(first, ...rest);
    },
  });
  return { client, pool: handle.pool, end: () => handle.end() };
}

/** The transaction client, with `findMany` on every model delegate observed. */
function observedTransaction(tx: object, seen: ObservedRead[]): object {
  return new Proxy(tx, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      // `$`-prefixed members are Prisma's own plumbing and are passed through
      // untouched; only the model delegates are wrapped.
      if (typeof property !== 'string' || property.startsWith('$')) {
        return typeof value === 'function' ? value.bind(target) : value;
      }
      if (typeof value !== 'object' || value === null) return value;
      return new Proxy(value, {
        get(model, method) {
          const inner: unknown = Reflect.get(model, method);
          if (method !== 'findMany' || typeof inner !== 'function') return inner;
          const call = inner.bind(model) as (args: unknown) => Promise<unknown[]>;
          return async (args: { readonly take?: number }): Promise<unknown[]> => {
            const rows = await call(args);
            seen.push({ model: property, take: args.take, rows: rows.length });
            return rows;
          };
        },
      });
    },
  });
}
