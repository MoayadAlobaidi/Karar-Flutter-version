/**
 * Live-PostgreSQL evidence that a refused manual entry writes NOTHING.
 *
 * The unit half of this evidence (`write-gates.test.ts`) proves the ordering:
 * retention and the account are consulted before the fingerprint and long
 * before the commit. What only a database can prove is the consequence — that
 * after every refusal there is no transaction row, no revision, and no
 * provenance record anywhere, including rows the refusing principal could not
 * see even if they existed.
 *
 * So every count below is taken **as superuser**, which bypasses RLS. A count
 * taken as the refused principal would prove only that the principal cannot
 * see what it wrote, and "invisible" is not "absent".
 *
 * Both sides are seeded and non-empty before anything is asserted: two users
 * inside one tenant and a second tenant, each with real committed
 * transactions and real accounts. A "nothing was written" assertion against
 * an empty database passes for the wrong reason.
 *
 * Same probe-or-skip pattern as the rest of the suite: a skipped run is
 * announced loudly, because a green run that tested nothing is worse than a
 * red one.
 */

import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { CreateManualTransaction } from '../application/use-cases/create-manual-transaction.js';
import type { CreateManualTransactionInput } from '../application/use-cases/create-manual-transaction.js';
import type { TransactionsPrincipal } from '../application/ports/principal-context.js';
import type { TransactionRetentionDecision } from '../application/ports/transaction-retention-decision.js';
import { PrismaTransactionRepository } from '../infrastructure/persistence/prisma-transaction-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { LocalAesGcmFieldEncryptionProvider } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import { LocalKeyedDedupFingerprintProvider } from '../infrastructure/providers/local-keyed-dedup-fingerprint-provider.js';
import {
  FixedAccountDirectory,
  FixedPrincipalContext,
  StubRetentionDecisionPort,
} from './fakes/in-memory-repositories.js';
import { BOOKED, NOW, fixedClock, kwd, principal, qar, syntheticMerchant } from './fakes/synthetic-fixtures.js';
import { TRANSACTION_SYNTHETIC_PERIOD } from '@karar/financial-retention-local-fixtures';

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
      `TRANSACTION WRITE-GATE TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence that a refused manual entry writes no',
      'transaction, no revision and no provenance row — counted as superuser,',
      'so "gone" is proven rather than "hidden". Start the database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  KARAR_ENV=local POSTGRES_PORT=5433 pnpm --filter @karar/transactions test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_txn_gates`;

const DECIDED: TransactionRetentionDecision = {
  state: 'DECIDED',
  retentionPeriod: TRANSACTION_SYNTHETIC_PERIOD,
  basis: 'test fixture — no legal effect',
  effect: 'SYNTHETIC_NO_LEGAL_EFFECT',
};

describe.skipIf(unreachable !== null)('manual-entry write gates (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  let context: FixedPrincipalContext;
  let retention: StubRetentionDecisionPort;
  let create: CreateManualTransaction;

  const tenant1 = randomUUID();
  const tenant2 = randomUUID();
  const alice: TransactionsPrincipal = principal(tenant1);
  /** Same tenant as alice, different user. A tenant-only check misses this. */
  const mallory: TransactionsPrincipal = principal(tenant1);
  /** A different tenant entirely. */
  const bob: TransactionsPrincipal = principal(tenant2);

  const aliceAccount = randomUUID();
  const aliceKwdAccount = randomUUID();
  const malloryAccount = randomUUID();
  const bobAccount = randomUUID();

  /** Superuser row counts across every table a commit would touch. */
  async function durableRowCounts(): Promise<{
    transactions: number;
    revisions: number;
    provenance: number;
  }> {
    const result = await superuserAdapter.query<{
      transactions: string;
      revisions: string;
      provenance: string;
    }>(
      `SELECT (SELECT count(*) FROM public.transactions) AS transactions,
              (SELECT count(*) FROM public.transaction_revisions) AS revisions,
              (SELECT count(*) FROM public.transaction_provenance) AS provenance`,
    );
    const row = result.rows[0];
    return {
      transactions: Number(row?.transactions ?? -1),
      revisions: Number(row?.revisions ?? -1),
      provenance: Number(row?.provenance ?? -1),
    };
  }

  function entry(accountId: string): CreateManualTransactionInput {
    return {
      accountId,
      magnitude: qar(45),
      direction: 'MONEY_OUT',
      bookingDate: BOOKED,
      description: syntheticMerchant('gate probe'),
    };
  }

  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
    migratorAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database }),
    );
    await migrateToLatest({ adapter: migratorAdapter });
    superuserAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
    );
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));

    const encryption = new LocalAesGcmFieldEncryptionProvider({
      key: Buffer.alloc(32, 13),
      keyVersion: 'karar-ref:key-version:local-transactions-hsf@v1',
    });
    const fingerprints = new LocalKeyedDedupFingerprintProvider({ rootKey: Buffer.alloc(32, 17) });
    const accounts = new FixedAccountDirectory([
      { accountId: aliceAccount, owner: alice, currencyCode: 'QAR' },
      { accountId: aliceKwdAccount, owner: alice, currencyCode: 'KWD' },
      { accountId: malloryAccount, owner: mallory, currencyCode: 'QAR' },
      { accountId: bobAccount, owner: bob, currencyCode: 'QAR' },
    ]);
    retention = new StubRetentionDecisionPort(DECIDED);
    context = new FixedPrincipalContext(alice);
    create = new CreateManualTransaction(
      context,
      new PrismaTransactionRepository(prismaHandle, encryption),
      fingerprints,
      new Uuidv7IdSource(),
      fixedClock(NOW),
      retention,
      accounts,
    );

    // SEED EVERY SIDE, NON-EMPTY. All three principals commit real rows into
    // their own accounts first, so every "nothing was written" assertion
    // below runs against a populated database.
    for (const [who, accountId, label] of [
      [alice, aliceAccount, 'alice seed'],
      [mallory, malloryAccount, 'mallory seed'],
      [bob, bobAccount, 'bob seed'],
    ] as const) {
      context.actAs(who);
      const seeded = await create.execute({
        ...entry(accountId),
        description: syntheticMerchant(label),
      });
      if (!seeded.ok) throw new Error(`seed failed: ${JSON.stringify(seeded.error)}`);
    }
    context.actAs(alice);
    const kwdSeed = await create.execute({
      accountId: aliceKwdAccount,
      magnitude: kwd(45),
      direction: 'MONEY_OUT',
      bookingDate: BOOKED,
      description: syntheticMerchant('alice kwd seed'),
    });
    if (!kwdSeed.ok) throw new Error(`seed failed: ${JSON.stringify(kwdSeed.error)}`);
  }, 90_000);

  afterAll(async () => {
    await prismaHandle?.end();
    await migratorAdapter?.end();
    await superuserAdapter?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally {
      await maintenance.end();
    }
  });

  it('the seed is real: four transactions, each with its revision and provenance', async () => {
    // The premise every assertion below depends on. Without it, "the counts
    // did not move" would be a statement about an empty database.
    const counts = await durableRowCounts();
    expect(counts.transactions).toBe(4);
    expect(counts.revisions).toBe(4);
    expect(counts.provenance).toBe(4);
  });

  it('commits into the principal’s own account, in that account’s currency', async () => {
    context.actAs(alice);
    const before = await durableRowCounts();
    const created = await create.execute({
      ...entry(aliceAccount),
      description: syntheticMerchant('own account accepted'),
    });
    expect(created.ok ? null : created.error).toBeNull();
    const after = await durableRowCounts();
    expect(after.transactions).toBe(before.transactions + 1);
    expect(after.revisions).toBe(before.revisions + 1);
    expect(after.provenance).toBe(before.provenance + 1);
  });

  it('refuses another user’s account in the same tenant, and writes nothing', async () => {
    context.actAs(alice);
    const before = await durableRowCounts();
    const refused = await create.execute(entry(malloryAccount));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('NOT_FOUND');
    expect(await durableRowCounts()).toEqual(before);
  });

  it('refuses another tenant’s account, and writes nothing', async () => {
    context.actAs(alice);
    const before = await durableRowCounts();
    const refused = await create.execute(entry(bobAccount));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('NOT_FOUND');
    expect(await durableRowCounts()).toEqual(before);
  });

  it('refuses an account nobody ever minted, and writes nothing', async () => {
    context.actAs(alice);
    const before = await durableRowCounts();
    const refused = await create.execute(entry(randomUUID()));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('NOT_FOUND');
    expect(await durableRowCounts()).toEqual(before);
  });

  it('gives the same refusal for a guessed, a cross-tenant and an absent account', async () => {
    context.actAs(alice);
    const guessed = await create.execute(entry(malloryAccount));
    const crossTenant = await create.execute(entry(bobAccount));
    const absent = await create.execute(entry(randomUUID()));
    expect([guessed.ok, crossTenant.ok, absent.ok]).toEqual([false, false, false]);
    if (!guessed.ok && !crossTenant.ok && !absent.ok) {
      // Identical but for the id the caller supplied themselves. A
      // distinguishable denial would let a caller enumerate which account ids
      // exist in other tenants by watching which error came back.
      expect({ ...guessed.error, id: '' }).toEqual({ ...absent.error, id: '' });
      expect({ ...crossTenant.error, id: '' }).toEqual({ ...absent.error, id: '' });
    }
  });

  it('refuses a currency the account does not hold, and writes nothing', async () => {
    context.actAs(alice);
    const before = await durableRowCounts();
    const refused = await create.execute({
      ...entry(aliceKwdAccount),
      magnitude: qar(45),
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'ACCOUNT_CURRENCY_MISMATCH') {
      expect(refused.error.accountCurrency).toBe('KWD');
      expect(refused.error.transactionCurrency).toBe('QAR');
    } else {
      expect.unreachable('expected ACCOUNT_CURRENCY_MISMATCH');
    }
    expect(await durableRowCounts()).toEqual(before);
  });

  it('writes nothing while retention is unresolved, in either state', async () => {
    context.actAs(alice);
    const before = await durableRowCounts();
    for (const decision of [
      {
        state: 'PENDING_LEGAL_REVIEW',
        openQuestion: 'how long may a transaction record be retained?',
      },
      { state: 'UNAVAILABLE', reason: 'no pack is activated for this subject' },
    ] as const) {
      retention.answerWith(decision);
      const refused = await create.execute({
        ...entry(aliceAccount),
        description: syntheticMerchant(`retention ${decision.state}`),
      });
      expect(refused.ok, decision.state).toBe(false);
      if (!refused.ok && refused.error.kind === 'RETENTION_UNDECIDED') {
        expect(refused.error.state).toBe(decision.state);
      } else {
        expect.unreachable(`expected RETENTION_UNDECIDED for ${decision.state}`);
      }
      // Counted as superuser after EACH refusal, not once at the end: a
      // single check at the end could be satisfied by a write and a
      // compensating delete, which is not the same as never writing.
      expect(await durableRowCounts(), decision.state).toEqual(before);
    }
    retention.answerWith(DECIDED);
  });

  it('the refused entries left no orphan revision or provenance either', async () => {
    // Belt and braces on the counts above: every revision and every
    // provenance row still points at a transaction that exists. A gate that
    // wrote a child row and then failed would show up here even if the
    // totals happened to match.
    const orphans = await superuserAdapter.query<{ revisions: string; provenance: string }>(
      `SELECT (SELECT count(*) FROM public.transaction_revisions r
                WHERE NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = r.transaction_id)) AS revisions,
              (SELECT count(*) FROM public.transaction_provenance p
                WHERE NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = p.transaction_id)) AS provenance`,
    );
    expect(Number(orphans.rows[0]?.revisions)).toBe(0);
    expect(Number(orphans.rows[0]?.provenance)).toBe(0);
  });
});
