/**
 * Live-PostgreSQL evidence for the dedup design: content identity, legitimate
 * repeat, and duplicate handling as three separate things (migration 0090).
 *
 * The claims under test, each of which failed in the earlier draft where the
 * commentary and the SQL described different schemes:
 *
 *  - the fingerprint is CONTENT identity, so two identical movements produce
 *    the SAME digest and are told apart by `occurrence_ordinal`;
 *  - the unique key is over the fingerprint AND the ordinal, so the same
 *    content at the same occurrence collides;
 *  - two concurrent commits of the same content resolve to exactly one
 *    winner, by the index rather than by application timing;
 *  - a fingerprint-version rotation starts a fresh namespace instead of
 *    colliding with the old one;
 *  - **and an arbitrary high ordinal is not a way around duplicate review** —
 *    the only claimable ordinal is the next unused one, enforced in the
 *    writing transaction for the message and by a trigger for the guarantee.
 */

import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  dropScratchDatabase,
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PgError,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  CreateManualTransaction,
  type CreateManualTransactionInput,
} from '../application/use-cases/create-manual-transaction.js';
import { DeleteOwnTransaction } from '../application/use-cases/delete-own-transaction.js';
import type { DedupFingerprintPort } from '../application/ports/dedup-fingerprint.js';
import type { TransactionsPrincipal } from '../application/ports/principal-context.js';
import { PrismaTransactionRepository } from '../infrastructure/persistence/prisma-transaction-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { LocalAesGcmFieldEncryptionProvider } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import {
  DEDUP_FINGERPRINT_VERSION,
  LocalKeyedDedupFingerprintProvider,
} from '../infrastructure/providers/local-keyed-dedup-fingerprint-provider.js';
import { LocalSyntheticRetentionDecisionProvider } from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';
import {
  ERASES_NO_TRANSFER_MATCHES,
  FixedAccountDirectory,
  FixedPrincipalContext,
} from './fakes/in-memory-repositories.js';
import { BOOKED, NOW, fixedClock, principal, qar, syntheticMerchant } from './fakes/synthetic-fixtures.js';

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
      `TRANSACTION DEDUP TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for the dedup key and the occurrence',
      'guard in migration 0090: content identity, legitimate repeats,',
      'concurrency, version rotation, and the anti-bypass rule. Start the',
      'database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  KARAR_ENV=local POSTGRES_PORT=5433 pnpm --filter @karar/transactions test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_txn_dedup`;

/**
 * A fingerprint port under a different version, over the same construction.
 * Rotation is the property under test, so the value has to come from a real
 * keyed derivation rather than from a literal.
 */
class RotatedFingerprintPort implements DedupFingerprintPort {
  readonly version = 'dedup/hmac-sha256/utc-day/v3-test-rotation';

  constructor(private readonly inner: DedupFingerprintPort) {}

  async fingerprint(
    subject: TransactionsPrincipal,
    input: Parameters<DedupFingerprintPort['fingerprint']>[1],
  ) {
    const base = await this.inner.fingerprint(subject, input);
    return { version: this.version, value: base.value };
  }
}

describe.skipIf(unreachable !== null)('dedup and occurrence (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  let context: FixedPrincipalContext;
  let repository: PrismaTransactionRepository;
  let create: CreateManualTransaction;
  let rotated: CreateManualTransaction;
  let remove: DeleteOwnTransaction;

  const tenant = randomUUID();
  const alice: TransactionsPrincipal = principal(tenant);
  const bob: TransactionsPrincipal = principal(randomUUID());
  const aliceAccount = randomUUID();
  const aliceSecondAccount = randomUUID();
  const bobAccount = randomUUID();

  async function rawAsPrincipal<T extends pg.QueryResultRow>(
    who: TransactionsPrincipal,
    sql: string,
    params?: readonly unknown[],
  ): Promise<pg.QueryResult<T>> {
    return appAdapter.withTransaction(async (tx) => {
      await tx.query(
        `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`,
        [who.tenantId, who.userId],
      );
      return tx.query<T>(sql, params);
    });
  }

  /** One repeatable movement. Identical content every time it is used. */
  function coffee(overrides: Partial<CreateManualTransactionInput> = {}): CreateManualTransactionInput {
    return {
      accountId: aliceAccount,
      magnitude: qar(12, 50),
      direction: 'MONEY_OUT',
      bookingDate: BOOKED,
      description: syntheticMerchant('corner shop coffee'),
      ...overrides,
    };
  }

  async function storedOrdinals(
    who: TransactionsPrincipal,
    accountId: string,
  ): Promise<readonly number[]> {
    const rows = await rawAsPrincipal<{ occurrence_ordinal: number; dedup_fingerprint: string }>(
      who,
      `SELECT occurrence_ordinal, dedup_fingerprint FROM transactions
        WHERE account_id = $1 ORDER BY occurrence_ordinal`,
      [accountId],
    );
    return rows.rows.map((row) => row.occurrence_ordinal);
  }

  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
    migratorAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database }),
    );
    await migrateToLatest({ adapter: migratorAdapter });
    appAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database }),
    );
    superuserAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
    );
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));

    const encryption = new LocalAesGcmFieldEncryptionProvider({
      key: Buffer.alloc(32, 23),
      keyVersion: 'karar-ref:key-version:local-transactions-hsf@v1',
    });
    const fingerprints = new LocalKeyedDedupFingerprintProvider({ rootKey: Buffer.alloc(32, 29) });
    const accounts = new FixedAccountDirectory([
      { accountId: aliceAccount, owner: alice, currencyCode: 'QAR' },
      { accountId: aliceSecondAccount, owner: alice, currencyCode: 'QAR' },
      { accountId: bobAccount, owner: bob, currencyCode: 'QAR' },
    ]);
    const retention = new LocalSyntheticRetentionDecisionProvider({ environment: 'local' });
    context = new FixedPrincipalContext(alice);
    repository = new PrismaTransactionRepository(prismaHandle, encryption);
    const ids = new Uuidv7IdSource();
    const clock = fixedClock(NOW);
    create = new CreateManualTransaction(
      context,
      repository,
      fingerprints,
      ids,
      clock,
      retention,
      accounts,
    );
    rotated = new CreateManualTransaction(
      context,
      repository,
      new RotatedFingerprintPort(fingerprints),
      ids,
      clock,
      retention,
      accounts,
    );
    remove = new DeleteOwnTransaction(context, repository, ERASES_NO_TRANSFER_MATCHES);
  }, 90_000);

  afterAll(async () => {
    await prismaHandle?.end();
    await appAdapter?.end();
    await migratorAdapter?.end();
    await superuserAdapter?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await dropScratchDatabase(maintenance, database);
    } finally {
      await maintenance.end();
    }
  });

  it('the unique key covers the fingerprint AND the ordinal', async () => {
    const columns = await appAdapter.query<{ attname: string; ord: number }>(
      `SELECT a.attname, k.ordinality AS ord
         FROM pg_constraint c
         JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        WHERE c.conname = 'transactions_dedup_key'
        ORDER BY k.ordinality`,
    );
    expect(columns.rows.map((row) => row.attname)).toEqual([
      'tenant_id',
      'user_id',
      'account_id',
      'fingerprint_version',
      'dedup_fingerprint',
      'occurrence_ordinal',
    ]);
  });

  it('two identical movements share ONE content identity and both commit', async () => {
    context.actAs(alice);
    const first = await create.execute(coffee());
    const second = await create.execute(coffee({ occurrenceOrdinal: 2 }));
    expect(first.ok ? null : first.error).toBeNull();
    expect(second.ok ? null : second.error).toBeNull();

    const rows = await rawAsPrincipal<{ dedup_fingerprint: string; occurrence_ordinal: number }>(
      alice,
      `SELECT dedup_fingerprint, occurrence_ordinal FROM transactions
        WHERE account_id = $1 ORDER BY occurrence_ordinal`,
      [aliceAccount],
    );
    expect(rows.rows.map((row) => row.occurrence_ordinal)).toEqual([1, 2]);
    // ONE content identity, two occurrences. This is the assertion the old
    // design could not make: with the ordinal inside the digest, the second
    // coffee had an unrelated fingerprint and "have I seen this content
    // before?" was unanswerable.
    expect(rows.rows[0]?.dedup_fingerprint).toBe(rows.rows[1]?.dedup_fingerprint);
  });

  it('the same content at the same ordinal collides', async () => {
    context.actAs(alice);
    // Occurrences 1 and 2 already exist from the previous case; asking for 2
    // again is the duplicate.
    const duplicate = await create.execute(coffee({ occurrenceOrdinal: 2 }));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      // The ordinal is already taken, so the caller is told it is a
      // duplicate rather than told to pick a different number.
      expect(duplicate.error.kind).toBe('DUPLICATE_TRANSACTION');
    }
    expect(await storedOrdinals(alice, aliceAccount)).toEqual([1, 2]);
  });

  it('an arbitrary high ordinal cannot bypass duplicate review', async () => {
    context.actAs(alice);
    // THE BYPASS: same content, an ordinal nothing has claimed. Under a key
    // that merely included the ordinal, this would commit — the same
    // statement row recorded twice, with no review of any kind.
    for (const ordinal of [4, 9999, 500]) {
      const refused = await create.execute(coffee({ occurrenceOrdinal: ordinal }));
      expect(refused.ok, `ordinal ${ordinal}`).toBe(false);
      if (!refused.ok && refused.error.kind === 'OCCURRENCE_ORDINAL_NOT_NEXT') {
        expect(refused.error.requestedOrdinal).toBe(ordinal);
        // The refusal names the only ordinal that WOULD be accepted, so a
        // person can act on it instead of guessing.
        expect(refused.error.nextOrdinal).toBe(3);
      } else {
        expect.unreachable(`expected OCCURRENCE_ORDINAL_NOT_NEXT for ${ordinal}`);
      }
    }
    expect(await storedOrdinals(alice, aliceAccount)).toEqual([1, 2]);

    // The next one is claimable, which is what makes the rule a rule and not
    // a ban on repeats.
    const third = await create.execute(coffee({ occurrenceOrdinal: 3 }));
    expect(third.ok ? null : third.error).toBeNull();
    expect(await storedOrdinals(alice, aliceAccount)).toEqual([1, 2, 3]);
  });

  it('the trigger holds the same rule against raw SQL, not just the repository', async () => {
    // The application check exists for the message; the trigger exists for
    // the guarantee. A writer that skips the repository — raw SQL today, the
    // ingestion pipeline tomorrow — meets the same rule.
    const fingerprint = await rawAsPrincipal<{ dedup_fingerprint: string }>(
      alice,
      `SELECT dedup_fingerprint FROM transactions WHERE account_id = $1 LIMIT 1`,
      [aliceAccount],
    );
    const digest = fingerprint.rows[0]?.dedup_fingerprint;
    expect(digest).toBeTypeOf('string');

    const forged = await rawAsPrincipal(
      alice,
      `INSERT INTO transactions
         (id, tenant_id, user_id, account_id, account_reference_type, amount_minor,
          currency_code, booking_date, hsf_algorithm, hsf_key_version,
          description_ciphertext, description_nonce, description_auth_tag,
          source_kind, status, dedup_fingerprint, fingerprint_version,
          occurrence_ordinal, version)
       VALUES ($1, $2, $3, $4, 'FINANCIAL_ACCOUNT', -1250, 'QAR', now(),
               'AES-256-GCM', 'v1', '\\x00'::bytea, decode('000000000000000000000000','hex'),
               decode('00000000000000000000000000000000','hex'),
               'MANUAL', 'POSTED', $5, $6, 9999, 1)`,
      [randomUUID(), alice.tenantId, alice.userId, aliceAccount, digest, DEDUP_FINGERPRINT_VERSION],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(forged).toBeInstanceOf(PgError);
    // KAR01, not the generic raise_exception these guards used to share: a
    // caller has to be able to tell "you claimed the wrong occurrence" apart
    // from every other server-side failure WITHOUT reading the message.
    expect((forged as PgError).sqlState).toBe('KAR01');
    expect((forged as PgError).message).toContain('not the next occurrence');
    expect(await storedOrdinals(alice, aliceAccount)).toEqual([1, 2, 3]);
  });

  it('the ordinal and the fingerprint cannot be rewritten by an UPDATE', async () => {
    // The same bypass by a different verb: relabelling which occurrence a row
    // IS would let one row stand in for two.
    const rewritten = await rawAsPrincipal(
      alice,
      `UPDATE transactions SET occurrence_ordinal = 77 WHERE account_id = $1`,
      [aliceAccount],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(rewritten).toBeInstanceOf(PgError);
    expect((rewritten as PgError).sqlState).toBe('KAR02');

    const relabelled = await rawAsPrincipal(
      alice,
      `UPDATE transactions SET dedup_fingerprint = 'rewritten' WHERE account_id = $1`,
      [aliceAccount],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect((relabelled as PgError).sqlState).toBe('KAR02');
    expect(await storedOrdinals(alice, aliceAccount)).toEqual([1, 2, 3]);
  });

  it('erasing an occurrence makes that ordinal claimable again', async () => {
    context.actAs(alice);
    const rows = await rawAsPrincipal<{ id: string }>(
      alice,
      `SELECT id FROM transactions WHERE account_id = $1 AND occurrence_ordinal = 3`,
      [aliceAccount],
    );
    const id = rows.rows[0]?.id;
    expect(id).toBeTypeOf('string');
    expect((await remove.execute({ transactionId: id as string })).ok).toBe(true);
    expect(await storedOrdinals(alice, aliceAccount)).toEqual([1, 2]);

    // `max(occurrence_ordinal)` is taken over SURVIVING rows, so a subject
    // who deleted a repeat can record it again. A monotonic counter would
    // make deletion irreversible in a way nothing asked for.
    const again = await create.execute(coffee({ occurrenceOrdinal: 3 }));
    expect(again.ok ? null : again.error).toBeNull();
    expect(await storedOrdinals(alice, aliceAccount)).toEqual([1, 2, 3]);
  });

  it('two concurrent commits of the same content resolve to exactly one winner', async () => {
    context.actAs(alice);
    const contested = coffee({
      accountId: aliceSecondAccount,
      description: syntheticMerchant('contested purchase'),
    });
    const outcomes = await Promise.allSettled([
      create.execute(contested),
      create.execute(contested),
    ]);
    const results = outcomes.map((outcome) =>
      outcome.status === 'fulfilled' ? outcome.value : null,
    );
    expect(results.filter((result) => result?.ok === true)).toHaveLength(1);
    const refused = results.filter((result) => result !== null && result.ok === false);
    expect(refused).toHaveLength(1);
    const denial = refused[0];
    if (denial && !denial.ok) {
      // Either shape is a correct refusal: the loser of the index race sees
      // 23505 (DUPLICATE_TRANSACTION), and a loser that read the winner's row
      // before its own insert sees the ordinal rule. What must never happen
      // is two rows.
      expect(['DUPLICATE_TRANSACTION', 'OCCURRENCE_ORDINAL_NOT_NEXT']).toContain(
        denial.error.kind,
      );
    }
    expect(await storedOrdinals(alice, aliceSecondAccount)).toEqual([1]);
  });

  it('a fingerprint-version rotation starts a fresh namespace', async () => {
    context.actAs(alice);
    // Identical content to an already-recorded occurrence, under a new
    // version. It commits — a version bump is a redefinition, and values
    // minted under two definitions must not be compared.
    const underNewVersion = await rotated.execute(coffee({ occurrenceOrdinal: 1 }));
    expect(underNewVersion.ok ? null : underNewVersion.error).toBeNull();

    const versions = await rawAsPrincipal<{ fingerprint_version: string; n: string }>(
      alice,
      `SELECT fingerprint_version, count(*) AS n FROM transactions
        WHERE account_id = $1 GROUP BY fingerprint_version ORDER BY fingerprint_version`,
      [aliceAccount],
    );
    expect(versions.rows.map((row) => row.fingerprint_version)).toEqual([
      DEDUP_FINGERPRINT_VERSION,
      'dedup/hmac-sha256/utc-day/v3-test-rotation',
    ]);
    // The old namespace is untouched: three occurrences under v2, one under
    // the rotated version.
    expect(versions.rows.map((row) => Number(row.n))).toEqual([3, 1]);

    // And the ordinal rule is per version too — occurrence 2 under the new
    // version is claimable even though v2 already has one.
    const secondUnderNewVersion = await rotated.execute(coffee({ occurrenceOrdinal: 2 }));
    expect(secondUnderNewVersion.ok ? null : secondUnderNewVersion.error).toBeNull();
  });

  it('the same movement in another subject’s account is unaffected', async () => {
    // The fingerprint is per subject, so it is not a cross-subject join key
    // and one subject's occurrences never constrain another's.
    context.actAs(bob);
    const bobs = await create.execute(coffee({ accountId: bobAccount }));
    expect(bobs.ok ? null : bobs.error).toBeNull();
    expect(await storedOrdinals(bob, bobAccount)).toEqual([1]);

    const digests = await superuserAdapter.query<{ n: string }>(
      `SELECT count(DISTINCT dedup_fingerprint) AS n FROM public.transactions
        WHERE account_id IN ($1, $2)`,
      [aliceAccount, bobAccount],
    );
    // Identical content, different subjects, different digests.
    expect(Number(digests.rows[0]?.n)).toBeGreaterThan(1);
  });
});
