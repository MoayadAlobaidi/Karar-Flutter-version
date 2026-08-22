/**
 * Live-PostgreSQL fixtures for the financial-accounts adversarial suites.
 *
 * Each suite gets its own scratch database, bootstrapped and migrated from
 * zero (database-portability.md §6). Tenants, memberships, and the
 * institution catalogue are seeded as the bootstrap superuser because none of
 * them has a runtime write path — the catalogue changes by reviewed migration
 * and `karar_app` holds SELECT only on it. Everything a subject owns goes
 * through the REAL repositories as `karar_app`, so what the tests observe is
 * what production code would do.
 *
 * ## Every fixture here is obviously synthetic, deliberately
 *
 * The institutions are named `Synthetic Test Institution ...` with codes that
 * say so — no real bank, telco, wallet or exchange house is named anywhere in
 * this module's fixtures, and none may be; the accounts are `Synthetic Test Account ...`; the masks are
 * `0000`-shaped; the identifiers are patterned UUIDs. Nothing resembles a real
 * bank, a real account, or a plausible balance — a test corpus that looks like
 * real financial data is a leak waiting for someone to copy it somewhere.
 */

import pg from 'pg';
import { expect } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  dropScratchDatabase,
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

import type { BalanceSnapshotRepository } from '../application/ports/balance-snapshot-repository.js';
import type { FinancialAccountRepository } from '../application/ports/financial-account-repository.js';
import type { FinancialAccountRetentionDecisionPort } from '../application/ports/financial-account-retention-decision.js';
import type { HsfFieldEncryptionPort } from '../application/ports/hsf-field-encryption.js';
import type { AccountsPrincipal } from '../application/principal.js';
import type { BalanceSnapshot } from '../domain/balance-snapshot.js';
import type { FinancialAccount } from '../domain/financial-account.js';
import type {
  FinancialAccountId,
  InstitutionRef,
  SourceReference,
} from '../domain/refs.js';
import { LocalAesGcmFieldEncryptionProvider } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import { LocalSyntheticRetentionDecisionProvider } from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';

export const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
export const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');
/** Two people inside ONE tenant: the case tenant scoping alone would miss. */
export const USER_A1 = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
export const USER_A2 = UserId.of('a2a2a2a2-0000-4000-8000-0000000000a2');
export const USER_B1 = UserId.of('b1b1b1b1-0000-4000-8000-0000000000b1');

export const ACTOR_A1: AccountsPrincipal = { tenantId: TENANT_A, userId: USER_A1 };
export const ACTOR_A2: AccountsPrincipal = { tenantId: TENANT_A, userId: USER_A2 };
export const ACTOR_B1: AccountsPrincipal = { tenantId: TENANT_B, userId: USER_B1 };

export const INSTITUTION_ACTIVE = '11111111-0000-4000-8000-000000000011' as InstitutionRef;
export const INSTITUTION_RETIRED = '22222222-0000-4000-8000-000000000022' as InstitutionRef;
/** A second selectable issuer: an issuer is an attribute, never an identity. */
export const INSTITUTION_SECOND_ACTIVE =
  '33333333-0000-4000-8000-000000000033' as InstitutionRef;

/**
 * A UUID, because migration 0089 makes `source_reference` one — a column that
 * structurally cannot hold a statement line or an explanation.
 */
export const SYNTHETIC_SOURCE_REFERENCE =
  '5e000000-0000-4000-8000-00000000005e' as SourceReference;

/**
 * A FIXED key, so a suite can build a second adapter that reads what the
 * first wrote — and so a test that wants a rotation can ask for a different
 * key version deliberately rather than getting one by accident. The default
 * random-per-instance key would make every repository in a suite mutually
 * unreadable.
 */
const SYNTHETIC_HSF_KEY = new Uint8Array(32).fill(11);

/**
 * The LOCAL encryption adapter, with the synthetic key. Not a production key
 * custody story and it refuses to construct outside `KARAR_ENV=local`; these
 * suites are local by definition.
 */
export function testEncryption(keyVersion?: string): HsfFieldEncryptionPort {
  return new LocalAesGcmFieldEncryptionProvider({
    env: 'local',
    key: SYNTHETIC_HSF_KEY,
    keyVersion: keyVersion ?? 'karar-ref:key-version:synthetic-test-accounts@v1',
  });
}

/**
 * The LOCAL retention fixture — a labelled synthetic answer with no legal
 * effect, which is what lets these suites create durable rows at all.
 */
export function testRetention(): FinancialAccountRetentionDecisionPort {
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
    // because a skipped integration suite lands in the same green summary as a
    // passing one and proves nothing.
    skipUnlessDatabaseRequired('financial-accounts integration suite', reason);
    return reason;
  }
}

export function skipBanner(suite: string, host: string, port: number, why: string): string {
  return [
    '='.repeat(76),
    `${suite} SKIPPED — PostgreSQL is not reachable at ${host}:${port}`,
    `(${why})`,
    'These tests are the adversarial evidence that RLS confines the most',
    'sensitive data this platform holds; a skipped run proves nothing. Start',
    'the local database and rerun:',
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

/**
 * Bootstrap and migrate from zero, then seed the tenancy rows and the
 * institution catalogue. Subject data is NOT seeded here: it is created by the
 * real repositories inside each suite, so the tests exercise the write path
 * they are asserting about.
 */
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
    // The catalogue has no runtime writer by design (karar_app holds SELECT
    // only), so the fixture seeds it as the superuser — the same position a
    // reviewed migration would occupy.
    const institutions: Array<[string, string, string, string, string, string]> = [
      [
        INSTITUTION_ACTIVE,
        'SYNTHETIC_TEST_ISSUER_ONE',
        'BANK',
        'Synthetic Test Institution One',
        'مؤسسة اختبار اصطناعية واحد',
        'ACTIVE',
      ],
      [
        INSTITUTION_RETIRED,
        'SYNTHETIC_TEST_ISSUER_TWO',
        'MOBILE_MONEY_OPERATOR',
        'Synthetic Test Institution Two',
        'مؤسسة اختبار اصطناعية اثنان',
        'RETIRED',
      ],
      // A third issuer, so a suite can prove that accounts at TWO issuers
      // coexist without anything treating the issuer as identity.
      [
        INSTITUTION_SECOND_ACTIVE,
        'SYNTHETIC_TEST_ISSUER_THREE',
        'E_MONEY_ISSUER',
        'Synthetic Test Institution Three',
        'مؤسسة اختبار اصطناعية ثلاثة',
        'ACTIVE',
      ],
    ];
    for (const [id, code, kind, en, ar, status] of institutions) {
      await adapter.query(
        `INSERT INTO public.institutions (id, code, kind, display_name_en, display_name_ar, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [id, code, kind, en, ar, status],
      );
    }
  });
}

export async function dropDatabase(database: string): Promise<void> {
  const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
  try {
    await dropScratchDatabase(maintenance, database);
  } finally {
    await maintenance.end();
  }
}

export function buildHandle(database: string): PrismaHandle {
  return createPrismaClient(appProfile(database));
}


/**
 * The window an isolation probe reads through, now that neither repository
 * offers an unbounded list.
 *
 * `expectEveryVisible*` deliberately asserts `hasMore` is false before
 * handing the rows back. Without that assertion a probe would silently become
 * weaker the day a fixture seeds more rows than the limit: "this principal
 * sees nothing of that one" would start passing because the page ran out
 * rather than because the rows did, and an isolation suite that stops
 * isolating looks exactly like one that never had anything to find.
 */
const PROBE_PAGE = { offset: 0, limit: 50 } as const;

/** No narrowing at all — the probe asks for everything the principal can see. */
const NO_ACCOUNT_NARROWING = {
  institutionRef: null,
  institutionKind: null,
  accountType: null,
  walletKind: null,
  nature: null,
  status: null,
  origin: null,
  currencyCode: null,
} as const;

export async function expectEveryVisibleAccount(
  repository: FinancialAccountRepository,
  actor: AccountsPrincipal,
): Promise<readonly FinancialAccount[]> {
  const page = await repository.pageOwn(actor, { ...NO_ACCOUNT_NARROWING, ...PROBE_PAGE });
  expect(page.hasMore).toBe(false);
  return page.accounts;
}

export async function expectEveryVisibleSnapshot(
  repository: BalanceSnapshotRepository,
  actor: AccountsPrincipal,
  accountId: FinancialAccountId,
): Promise<readonly BalanceSnapshot[]> {
  const page = await repository.pageForOwnAccount(actor, {
    accountId,
    balanceKind: null,
    sourceKind: null,
    ...PROBE_PAGE,
  });
  expect(page.hasMore).toBe(false);
  return page.snapshots;
}

/** The listing inputs a suite uses when it is not testing paging itself. */
export const EVERY_ACCOUNT_PAGE = { ...NO_ACCOUNT_NARROWING, ...PROBE_PAGE } as const;

export function everySnapshotPage(accountId: FinancialAccountId) {
  return { accountId, balanceKind: null, sourceKind: null, ...PROBE_PAGE } as const;
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
