/**
 * Live-PostgreSQL fixtures for the payment-instruments adversarial suites.
 *
 * Each suite gets its own scratch database, bootstrapped and migrated from
 * zero (database-portability.md §6). Tenants and memberships are seeded as
 * the bootstrap superuser because neither has a runtime write path here.
 * Everything a subject owns — accounts, instruments — goes through the REAL
 * repositories as `karar_app`, so what the tests observe is what production
 * code would do.
 *
 * **The canonical accounts are created through `@karar/financial-accounts`'
 * own use case**, not seeded with raw SQL. That is deliberate: the adapter
 * this module ships (`FinancialAccountsBalanceBearingAccountAdapter`) reads
 * real account rows through that module's real repository, and an account
 * seeded with placeholder ciphertext would fail to decrypt and the adapter
 * would never be exercised at all.
 *
 * `seedWallet` exists because the headline case in ADR-0028 is a WALLET with
 * two virtual cards on it. A wallet is a financial account with
 * `accountType = 'WALLET'` and a required `walletKind`, and using one here
 * means the "two cards, one balance" suite is testing the shape the ADR
 * actually describes rather than a convenient stand-in.
 *
 * ## Every fixture here is obviously synthetic, deliberately
 *
 * The accounts are `Synthetic Test Account ...`; the instrument labels are
 * `Synthetic Test Instrument ...`; the masks are `**00`-shaped values that
 * are visibly placeholders; the identifiers are patterned UUIDs. **No real
 * bank, telco, card scheme, wallet provider or exchange house is named
 * anywhere in this module's fixtures, and none may be.** Nothing resembles a
 * real card, a real account, or a plausible balance — a test corpus that
 * looks like real financial data is a leak waiting for someone to copy it
 * somewhere.
 */

import pg from 'pg';

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
  type AccountType,
  type WalletKind,
} from '@karar/financial-accounts';

import type { HsfFieldEncryptionPort } from '../application/ports/hsf-field-encryption.js';
import type { PaymentInstrumentRetentionDecisionPort } from '../application/ports/payment-instrument-retention-decision.js';
import type { InstrumentsPrincipal } from '../application/principal.js';
import { LocalAesGcmFieldEncryptionProvider } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import { LocalSyntheticRetentionDecisionProvider } from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';

export const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
export const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');
/** Two people inside ONE tenant: the case tenant scoping alone would miss. */
export const USER_A1 = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
export const USER_A2 = UserId.of('a2a2a2a2-0000-4000-8000-0000000000a2');
export const USER_B1 = UserId.of('b1b1b1b1-0000-4000-8000-0000000000b1');

export const ACTOR_A1: InstrumentsPrincipal = { tenantId: TENANT_A, userId: USER_A1 };
export const ACTOR_A2: InstrumentsPrincipal = { tenantId: TENANT_A, userId: USER_A2 };
export const ACTOR_B1: InstrumentsPrincipal = { tenantId: TENANT_B, userId: USER_B1 };

/**
 * Synthetic masks. Visibly placeholders: the digits are zeros and ones, so a
 * value copied out of a test into anything real is immediately recognisable
 * as fixture data rather than somebody's card.
 */
export const SYNTHETIC_MASK_ONE = '**00';
export const SYNTHETIC_MASK_TWO = '**11';

/**
 * FIXED keys, so a suite can build a second adapter that reads what the first
 * wrote, and so a test that wants a rotation asks for a different key version
 * deliberately rather than getting one by accident. The default
 * random-per-instance keys would make every repository in a suite mutually
 * unreadable.
 */
const SYNTHETIC_HSF_KEY = new Uint8Array(32).fill(29);
const SYNTHETIC_ACCOUNTS_HSF_KEY = new Uint8Array(32).fill(11);

/** The LOCAL encryption adapter for this module, with the synthetic key. */
export function testEncryption(keyVersion?: string): HsfFieldEncryptionPort {
  return new LocalAesGcmFieldEncryptionProvider({
    env: 'local',
    key: SYNTHETIC_HSF_KEY,
    keyVersion: keyVersion ?? 'karar-ref:key-version:synthetic-test-instruments@v1',
  });
}

/** The LOCAL retention fixture — a labelled synthetic answer, no legal effect. */
export function testRetention(): PaymentInstrumentRetentionDecisionPort {
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
    skipUnlessDatabaseRequired('payment-instruments integration suite', reason);
    return reason;
  }
}

export function skipBanner(suite: string, host: string, port: number, why: string): string {
  return [
    '='.repeat(76),
    `${suite} SKIPPED — PostgreSQL is not reachable at ${host}:${port}`,
    `(${why})`,
    'These tests are the adversarial evidence that RLS confines the payment',
    'instruments and that no balance column exists on them; a skipped run',
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
  actor: InstrumentsPrincipal,
  displayName: string,
  clock: Clock,
  options?: { readonly accountType?: AccountType; readonly walletKind?: WalletKind | null },
): Promise<string> {
  const create = new CreateManualAccount(
    accountsRepository(handle),
    new PrismaInstitutionCatalogueReader(handle),
    new AccountsRetentionProvider({ env: 'local' }),
    new AccountsIdSource(),
    clock,
  );
  const accountType = options?.accountType ?? 'CURRENT';
  const created = await create.execute(
    {
      accountType,
      // `walletKind` is present if and only if accountType is WALLET — the
      // accounts module enforces the biconditional, and passing it
      // unconditionally would fail for every other type.
      ...(accountType === 'WALLET'
        ? { walletKind: options?.walletKind ?? ('E_MONEY' as WalletKind) }
        : {}),
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

/** The ADR-0028 headline case: a wallet, which is where two virtual cards live. */
export function seedWallet(
  handle: PrismaHandle,
  actor: InstrumentsPrincipal,
  displayName: string,
  clock: Clock,
): Promise<string> {
  return seedAccount(handle, actor, displayName, clock, {
    accountType: 'WALLET',
    walletKind: 'E_MONEY',
  });
}
