/**
 * Live-PostgreSQL fixtures for the transfer-matching adversarial suites.
 *
 * Each suite gets its own scratch database, bootstrapped and migrated from
 * zero (database-portability.md §6). Tenants and memberships are seeded as
 * the bootstrap superuser because neither has a runtime write path here.
 * Everything a subject owns — accounts, transactions, matches — goes through
 * the REAL repositories as `karar_app`, so what the tests observe is what
 * production code would do.
 *
 * **The transactions are created through `@karar/transactions`' own use
 * case**, not seeded with raw SQL, and the accounts through
 * `@karar/financial-accounts`'. That is deliberate: the adapter this module
 * ships (`TransactionsMatchableTransactionAdapter`) reads real transaction
 * rows through that module's real repository, and a transaction seeded with
 * placeholder ciphertext would fail to decrypt, so the adapter would never be
 * exercised at all.
 *
 * The two fakes below implement ports **`@karar/transactions` declares** —
 * `PrincipalContextPort` and `FinancialAccountAccessPort` — because that
 * module's own test doubles live inside its `__tests__` folder and nothing
 * crosses a module boundary except through `public-api.ts` (architecture test
 * 3). They are the smallest honest implementations: one holds a principal,
 * the other answers from a seeded list.
 *
 * ## Every fixture here is obviously synthetic, deliberately
 *
 * The accounts are `Synthetic Test Account ...`; the descriptions are
 * `Synthetic Test ...`; the identifiers are patterned UUIDs. **No real bank,
 * telco, card scheme, wallet provider or exchange house is named anywhere in
 * this module's fixtures, and none may be.** The amounts are round numbers
 * that could not be mistaken for a real statement line — a test corpus that
 * looks like real financial data is a leak waiting for someone to copy it
 * somewhere.
 */

import pg from 'pg';
import { expect } from 'vitest';

import { CalendarDay, Clock, Money, TenantId, UserId } from '@karar/shared-kernel';
import type { Currency } from '@karar/shared-kernel';
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
import {
  CreateManualTransaction,
  LocalAesGcmFieldEncryptionProvider as TransactionsEncryptionProvider,
  LocalKeyedDedupFingerprintProvider,
  LocalSyntheticRetentionDecisionProvider as TransactionsRetentionProvider,
  PrismaTransactionRepository,
  Uuidv7IdSource as TransactionsIdSource,
  AccountRef,
  type AccountAccessSummary,
  type FinancialAccountAccessPort,
  type MoneyDirection,
  type PrincipalContextPort,
  type TransactionsPrincipal,
} from '@karar/transactions';

import type { TransferMatchRepository } from '../application/ports/transfer-match-repository.js';
import type { TransferMatchRetentionDecisionPort } from '../application/ports/transfer-match-retention-decision.js';
import type { MatchingPrincipal } from '../application/principal.js';
import type { TransferMatch } from '../domain/transfer-match.js';
import { LocalSyntheticRetentionDecisionProvider } from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';

export const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
export const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');
/** Two people inside ONE tenant: the case tenant scoping alone would miss. */
export const USER_A1 = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
export const USER_A2 = UserId.of('a2a2a2a2-0000-4000-8000-0000000000a2');
export const USER_B1 = UserId.of('b1b1b1b1-0000-4000-8000-0000000000b1');

export const ACTOR_A1: MatchingPrincipal = { tenantId: TENANT_A, userId: USER_A1 };
export const ACTOR_A2: MatchingPrincipal = { tenantId: TENANT_A, userId: USER_A2 };
export const ACTOR_B1: MatchingPrincipal = { tenantId: TENANT_B, userId: USER_B1 };

/** The booking day every seeded transaction uses unless a test says otherwise. */
export const BOOKED = CalendarDay.of(2026, 8, 17);

const SYNTHETIC_ACCOUNTS_HSF_KEY = new Uint8Array(32).fill(11);
const SYNTHETIC_TRANSACTIONS_HSF_KEY = new Uint8Array(32).fill(13);
const SYNTHETIC_DEDUP_ROOT_KEY = new Uint8Array(32).fill(17);

/** The LOCAL retention fixture — a labelled synthetic answer, no legal effect. */
export function testRetention(): TransferMatchRetentionDecisionPort {
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
    skipUnlessDatabaseRequired('transfer-matching integration suite', reason);
    return reason;
  }
}

export function skipBanner(suite: string, host: string, port: number, why: string): string {
  return [
    '='.repeat(76),
    `${suite} SKIPPED — PostgreSQL is not reachable at ${host}:${port}`,
    `(${why})`,
    'These tests are the adversarial evidence that RLS confines the transfer',
    'matches, that cross-currency pairs are refused, and that only a recorded',
    'subject decision makes a match authoritative; a skipped run proves',
    'nothing. Start the local database and rerun:',
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

/** The transactions repository, wired with its own synthetic key. */
export function transactionsRepository(handle: PrismaHandle): PrismaTransactionRepository {
  return new PrismaTransactionRepository(
    handle,
    new TransactionsEncryptionProvider({
      key: SYNTHETIC_TRANSACTIONS_HSF_KEY,
      keyVersion: 'karar-ref:key-version:synthetic-test-transactions@v1',
    }),
  );
}

/**
 * `PrincipalContextPort`, as `@karar/transactions` declares it. Mutable
 * because a suite seeds for three principals through one use-case instance,
 * which is exactly what that module's own port is designed for.
 */
export class MutablePrincipalContext implements PrincipalContextPort {
  #current: TransactionsPrincipal | null = null;

  actAs(principal: MatchingPrincipal): void {
    this.#current = { tenantId: principal.tenantId, userId: principal.userId };
  }

  current(): TransactionsPrincipal | null {
    return this.#current;
  }
}

/** One seeded account, as the transactions module's access port sees it. */
export interface SeededAccount {
  readonly accountId: string;
  readonly owner: MatchingPrincipal;
  readonly currencyCode: string;
}

/**
 * `FinancialAccountAccessPort`, as `@karar/transactions` declares it.
 *
 * A list rather than a database read, deliberately: what these suites are
 * about is transfer matching, and going through the accounts module's real
 * gate here would make an account-module regression look like a
 * transfer-matching failure. The accounts themselves ARE real rows — see
 * `seedAccount` — so the ids are genuine.
 */
export class SeededAccountDirectory implements FinancialAccountAccessPort {
  constructor(private readonly accounts: readonly SeededAccount[]) {}

  resolveOwnAccount(
    principal: TransactionsPrincipal,
    accountRef: AccountRef,
  ): Promise<AccountAccessSummary | null> {
    const found = this.accounts.find(
      (candidate) =>
        candidate.accountId === accountRef.accountId &&
        candidate.owner.tenantId === principal.tenantId &&
        candidate.owner.userId === principal.userId,
    );
    // `providerConnected: false` is not a convenience: no provider connector
    // exists in this phase, so `true` is a claim nothing could have created
    // legitimately, and a fixture is exactly where one would first appear.
    return Promise.resolve(
      found === undefined
        ? null
        : {
            accountRef,
            currencyCode: found.currencyCode,
            lifecycleState: 'ACTIVE' as const,
            providerConnected: false,
          },
    );
  }
}

/**
 * Creates a canonical account through the accounts module's OWN use case and
 * returns its id. Names no institution — `institutionRef` null and no
 * user-supplied label — so the catalogue never has to be seeded and no issuer
 * is named anywhere in this module's fixtures.
 */
export async function seedAccount(
  handle: PrismaHandle,
  actor: MatchingPrincipal,
  displayName: string,
  clock: Clock,
  currencyCode = 'QAR',
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

/** A money amount in a given currency, from a whole-major-unit figure. */
export function money(major: number, currency: Currency): Money {
  return Money.of(BigInt(major) * 10n ** BigInt(currency.exponent), currency);
}

/**
 * Everything a suite needs to create real transactions through
 * `@karar/transactions`' own use case.
 */
export interface TransactionSeeder {
  readonly context: MutablePrincipalContext;
  readonly create: CreateManualTransaction;
  readonly repository: PrismaTransactionRepository;
}

export function transactionSeeder(
  handle: PrismaHandle,
  accounts: readonly SeededAccount[],
  clock: Clock,
): TransactionSeeder {
  const context = new MutablePrincipalContext();
  const repository = transactionsRepository(handle);
  const create = new CreateManualTransaction(
    context,
    repository,
    new LocalKeyedDedupFingerprintProvider({ rootKey: SYNTHETIC_DEDUP_ROOT_KEY }),
    new TransactionsIdSource(),
    clock,
    new TransactionsRetentionProvider({ environment: 'local' }),
    new SeededAccountDirectory(accounts),
  );
  return { context, create, repository };
}

/** One synthetic transaction, created through the transactions module's use case. */
export async function seedTransaction(
  seeder: TransactionSeeder,
  actor: MatchingPrincipal,
  input: {
    readonly accountId: string;
    readonly magnitude: Money;
    readonly direction: MoneyDirection;
    readonly description: string;
    readonly bookingDate?: CalendarDay;
  },
): Promise<string> {
  seeder.context.actAs(actor);
  const created = await seeder.create.execute({
    accountId: input.accountId,
    magnitude: input.magnitude,
    direction: input.direction,
    bookingDate: input.bookingDate ?? BOOKED,
    description: input.description,
  });
  if (!created.ok) {
    throw new Error(`fixture could not create a transaction: ${JSON.stringify(created.error)}`);
  }
  return created.value.id;
}


/**
 * The window a probe reads through, now that the repository offers no
 * unbounded list.
 *
 * `expectEveryVisibleMatch` asserts `hasMore` is false before handing the
 * rows back. Without it a probe would silently weaken the day a fixture seeds
 * more matches than the limit: "this principal sees nothing of that one"
 * would start passing because the page ran out rather than because the rows
 * did.
 */
export const EVERY_MATCH_PAGE = { offset: 0, limit: 50 } as const;

export async function expectEveryVisibleMatch(
  repository: TransferMatchRepository,
  actor: MatchingPrincipal,
): Promise<readonly TransferMatch[]> {
  const page = await repository.pageOwn(actor, { state: null, ...EVERY_MATCH_PAGE });
  expect(page.hasMore).toBe(false);
  return page.matches;
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
