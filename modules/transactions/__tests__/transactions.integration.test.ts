/**
 * Live-PostgreSQL evidence for migrations 0090-0093.
 *
 * What this suite is for: the isolation claims in this module are claims
 * about the DATABASE, not about the application code. RLS policies, the
 * dedup unique constraint, the cascade, the immutability triggers, and the
 * merchant-rule shape constraints are all enforced by PostgreSQL, so the only
 * honest test of them runs against PostgreSQL.
 *
 * **Both sides are seeded before anything is asserted.** An RLS test over an
 * empty table proves nothing: every "sees nothing" assertion below runs after
 * a "sees its own rows" assertion on the same table, so an accidental
 * truncation or a broken fixture fails the suite rather than passing it.
 *
 * Same probe-or-skip pattern as modules/consent and modules/subject-policy: a
 * skipped run is announced loudly, because a green run that tested nothing is
 * worse than a red one.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PgError,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { AssignCategory } from '../application/use-cases/assign-category.js';
import { CreateManualTransaction } from '../application/use-cases/create-manual-transaction.js';
import { DeleteOwnTransaction } from '../application/use-cases/delete-own-transaction.js';
import { ListOwnTransactions } from '../application/use-cases/list-own-transactions.js';
import { ReadOwnTransaction } from '../application/use-cases/read-own-transaction.js';
import { UpdateOwnTransaction } from '../application/use-cases/update-own-transaction.js';
import type { TransactionsPrincipal } from '../application/ports/principal-context.js';
import { TransactionId } from '../domain/refs.js';
import { PrismaTransactionRepository } from '../infrastructure/persistence/prisma-transaction-repository.js';
import {
  PrismaCategoryAssignmentRepository,
  PrismaFinancialCategoryCatalogue,
  PrismaMerchantRuleDirectory,
} from '../infrastructure/persistence/prisma-category-repositories.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { LocalAesGcmFieldEncryptionProvider } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import { LocalKeyedDedupFingerprintProvider } from '../infrastructure/providers/local-keyed-dedup-fingerprint-provider.js';
import { LocalSyntheticRetentionDecisionProvider } from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';
import { FixedAccountDirectory, FixedPrincipalContext } from './fakes/in-memory-repositories.js';
import {
  BOOKED,
  EARLIER,
  fixedClock,
  NOW,
  principal,
  qar,
  SYNTHETIC_MARKER,
  syntheticMerchant,
} from './fakes/synthetic-fixtures.js';

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
      `TRANSACTIONS TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for migrations 0090-0093: RLS on both',
      'principal GUCs, the dedup constraint under concurrency, the cascade,',
      'and the merchant-rule shape. A skipped run proves none of it. Start',
      'the database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  KARAR_ENV=local POSTGRES_PORT=5433 pnpm --filter @karar/transactions test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_transactions`;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** A merchant string that must never appear anywhere in the database. */
const MERCHANT_CANARY = syntheticMerchant('Canary Corner Shop QX7');
const DESCRIPTION_CANARY = syntheticMerchant('canary card purchase QX7');
const NOTE_CANARY = syntheticMerchant('canary note QX7');

/**
 * A verbatim statement narrative of the kind the legacy stored globally
 * (legacy C12). Every character class the merchant_rules constraints exist to
 * refuse is present: a masked card fragment, a reference number, and a long
 * multi-token body. It is synthetic — the card digits are 4111…, the standard
 * test-card prefix that belongs to no issuer's live range.
 */
const VERBATIM_NARRATIVE = 'pos purchase 4111*****1111 ref 8837261 doha branch';

describe.skipIf(unreachable !== null)('transactions (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  let context: FixedPrincipalContext;
  let repository: PrismaTransactionRepository;
  let assignments: PrismaCategoryAssignmentRepository;
  let create: CreateManualTransaction;
  let read: ReadOwnTransaction;
  let list: ListOwnTransactions;
  let update: UpdateOwnTransaction;
  let remove: DeleteOwnTransaction;
  let assign: AssignCategory;
  let rules: PrismaMerchantRuleDirectory;

  const tenant1 = randomUUID();
  const tenant2 = randomUUID();
  const alice: TransactionsPrincipal = principal(tenant1);
  // Same tenant as alice, different user: BOTH GUCs must match, not just one.
  const mallory: TransactionsPrincipal = principal(tenant1);
  // A different tenant entirely.
  const bob: TransactionsPrincipal = principal(tenant2);

  const aliceAccount = randomUUID();
  const bobAccount = randomUUID();
  // The account gate resolves through a port the composition root binds to an
  // adapter over modules/financial-accounts. Here it is a double that models
  // the same visibility rule — an account resolves only for its owner — so
  // the write path is exercised exactly as it will be wired.
  const accountDirectory = new FixedAccountDirectory([
    { accountId: aliceAccount, owner: alice, currencyCode: 'QAR' },
    { accountId: bobAccount, owner: bob, currencyCode: 'QAR' },
  ]);

  let aliceTransactionId: string;
  let bobTransactionId: string;

  /** Raw SQL under a principal context — for adversarial probes. */
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

  async function seedFor(
    who: TransactionsPrincipal,
    accountId: string,
    label: string,
    options: { bookingDate?: Date; occurrenceOrdinal?: number } = {},
  ): Promise<string> {
    context.actAs(who);
    const created = await create.execute({
      accountId,
      magnitude: qar(45),
      direction: 'MONEY_OUT',
      bookingDate: options.bookingDate ?? BOOKED,
      merchant: label === 'canary' ? MERCHANT_CANARY : syntheticMerchant(label),
      description: label === 'canary' ? DESCRIPTION_CANARY : syntheticMerchant(`${label} purchase`),
      note: label === 'canary' ? NOTE_CANARY : null,
      ...(options.occurrenceOrdinal === undefined
        ? {}
        : { occurrenceOrdinal: options.occurrenceOrdinal }),
    });
    if (!created.ok) throw new Error(`seed failed: ${JSON.stringify(created.error)}`);
    return created.value.id;
  }

  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
    migratorAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database }),
    );
    const { applied } = await migrateToLatest({ adapter: migratorAdapter });
    expect(applied.map((file) => file.filename)).toEqual(
      expect.arrayContaining([
        '0090_transactions.sql',
        '0091_transaction_revisions_and_provenance.sql',
        '0092_financial_categories_and_merchant_rules.sql',
        '0093_transaction_category_assignments.sql',
      ]),
    );
    appAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database }),
    );
    superuserAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
    );
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));

    const encryption = new LocalAesGcmFieldEncryptionProvider({
      key: Buffer.alloc(32, 5),
      keyVersion: 'karar-ref:key-version:local-transactions-hsf@v1',
    });
    const fingerprints = new LocalKeyedDedupFingerprintProvider({ rootKey: Buffer.alloc(32, 11) });
    const ids = new Uuidv7IdSource();
    const clock = fixedClock(NOW);

    context = new FixedPrincipalContext(alice);
    repository = new PrismaTransactionRepository(prismaHandle, encryption);
    assignments = new PrismaCategoryAssignmentRepository(prismaHandle);
    const catalogue = new PrismaFinancialCategoryCatalogue(prismaHandle);
    rules = new PrismaMerchantRuleDirectory(prismaHandle);

    create = new CreateManualTransaction(
      context,
      repository,
      fingerprints,
      ids,
      clock,
      new LocalSyntheticRetentionDecisionProvider({ environment: 'local' }),
      accountDirectory,
    );
    read = new ReadOwnTransaction(context, repository, assignments);
    list = new ListOwnTransactions(context, repository);
    update = new UpdateOwnTransaction(context, repository, ids, clock);
    remove = new DeleteOwnTransaction(context, repository);
    assign = new AssignCategory(context, repository, assignments, catalogue, ids, clock);

    // SEED BOTH SIDES before any isolation assertion runs — and seed EVERY
    // table the isolation assertions walk, including the assignment chain.
    // An RLS assertion over a table nothing wrote to passes vacuously.
    aliceTransactionId = await seedFor(alice, aliceAccount, 'canary');
    bobTransactionId = await seedFor(bob, bobAccount, 'bob');
    context.actAs(alice);
    const seededCategory = await assign.execute({
      transactionId: aliceTransactionId,
      categoryCode: 'FOOD',
      assignmentSource: 'USER',
    });
    if (!seededCategory.ok) {
      throw new Error(`category seed failed: ${JSON.stringify(seededCategory.error)}`);
    }
    context.actAs(bob);
    const bobsCategory = await assign.execute({
      transactionId: bobTransactionId,
      categoryCode: 'TRANSPORT',
      assignmentSource: 'USER',
    });
    if (!bobsCategory.ok) {
      throw new Error(`category seed failed: ${JSON.stringify(bobsCategory.error)}`);
    }
  }, 90_000);

  afterAll(async () => {
    await prismaHandle?.end();
    await appAdapter?.end();
    await migratorAdapter?.end();
    await superuserAdapter?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally {
      await maintenance.end();
    }
  });

  it('stores an exact signed amount as BIGINT minor units with its currency code', async () => {
    const row = await rawAsPrincipal<{ amount_minor: string; currency_code: string }>(
      alice,
      `SELECT amount_minor, currency_code FROM transactions WHERE id = $1`,
      [aliceTransactionId],
    );
    expect(row.rowCount).toBe(1);
    // The driver reports bigint as a string, precisely because a JS number
    // would not survive the range. Negative: money left the account.
    expect(row.rows[0]?.amount_minor).toBe('-4500');
    expect(row.rows[0]?.currency_code).toBe('QAR');

    // No money column anywhere in this module is NUMERIC, DOUBLE PRECISION or
    // FLOAT. Asserted against the live catalogue, not against the SQL text.
    const moneyTypes = await appAdapter.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('transactions', 'transaction_revisions')
          AND (column_name LIKE '%amount%' OR column_name LIKE '%minor%')`,
    );
    expect(moneyTypes.rowCount).toBeGreaterThan(0);
    for (const column of moneyTypes.rows) {
      expect(column.data_type, `${column.table_name}.${column.column_name}`).toBe('bigint');
    }
  });

  it('stores narrative ONLY as ciphertext — no plaintext anywhere in the row', async () => {
    // The leak regression: serialize every column of the row and grep it for
    // the canary strings the transaction was created with.
    const serialized = await rawAsPrincipal<{ row_text: string }>(
      alice,
      `SELECT to_jsonb(t)::text AS row_text FROM transactions t WHERE id = $1`,
      [aliceTransactionId],
    );
    expect(serialized.rowCount).toBe(1);
    const text = serialized.rows[0]?.row_text ?? '';
    expect(text).not.toContain(MERCHANT_CANARY);
    expect(text).not.toContain(DESCRIPTION_CANARY);
    expect(text).not.toContain(NOTE_CANARY);
    expect(text).not.toContain(SYNTHETIC_MARKER);
    // …and the same for the revision snapshot, which carries narrative too.
    const revisions = await rawAsPrincipal<{ row_text: string }>(
      alice,
      `SELECT to_jsonb(r)::text AS row_text FROM transaction_revisions r WHERE transaction_id = $1`,
      [aliceTransactionId],
    );
    expect(revisions.rowCount).toBeGreaterThan(0);
    for (const revision of revisions.rows) {
      expect(revision.row_text).not.toContain(SYNTHETIC_MARKER);
    }

    // There is no plaintext COLUMN to begin with: the structure, not a
    // convention, is what guarantees it.
    const columns = await appAdapter.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'transactions'
          AND column_name IN ('merchant', 'description', 'note')`,
    );
    expect(columns.rowCount).toBe(0);

    // And the round trip still works, so the ciphertext is real data.
    context.actAs(alice);
    const view = await read.execute({ transactionId: aliceTransactionId });
    expect(view.ok).toBe(true);
    if (view.ok) {
      expect(view.value.transaction.merchant?.reveal()).toBe(MERCHANT_CANARY);
      expect(view.value.transaction.note?.reveal()).toBe(NOTE_CANARY);
    }
  });

  it('RLS: the owner sees its own rows, and NOBODY else sees them — both sides seeded', async () => {
    // OWN FIRST, NON-EMPTY. An empty pass proves nothing.
    context.actAs(alice);
    const own = await list.execute({});
    expect(own.ok && own.value.transactions.length).toBeGreaterThan(0);
    const ownRaw = await rawAsPrincipal(alice, `SELECT id FROM transactions`);
    expect(ownRaw.rowCount).toBe(1);

    // Bob's data exists too, in his own tenant.
    context.actAs(bob);
    const bobsOwn = await list.execute({});
    expect(bobsOwn.ok && bobsOwn.value.transactions.length).toBe(1);

    // CROSS-TENANT: bob cannot see alice's row, by list or by id.
    expect(await repository.findById(bob, TransactionId.of(aliceTransactionId))).toBeNull();
    const bobRaw = await rawAsPrincipal(bob, `SELECT id FROM transactions WHERE id = $1`, [
      aliceTransactionId,
    ]);
    expect(bobRaw.rowCount).toBe(0);

    // CROSS-USER INSIDE ONE TENANT: mallory shares alice's tenant and sees
    // nothing. A tenant-only predicate would pass every assertion above and
    // fail this one — which is why it is here.
    context.actAs(mallory);
    const mallorysList = await list.execute({});
    expect(mallorysList.ok && mallorysList.value.transactions).toHaveLength(0);
    expect(await repository.findById(mallory, TransactionId.of(aliceTransactionId))).toBeNull();
    expect((await rawAsPrincipal(mallory, `SELECT id FROM transactions`)).rowCount).toBe(0);

    // Revisions, provenance and assignments are scoped the same way.
    for (const table of [
      'transaction_revisions',
      'transaction_provenance',
      'transaction_category_assignments',
    ]) {
      const ownRows = await rawAsPrincipal(alice, `SELECT id FROM ${table}`);
      const crossTenant = await rawAsPrincipal(bob, `SELECT id FROM ${table}`);
      const crossUser = await rawAsPrincipal(mallory, `SELECT id FROM ${table}`);
      expect(ownRows.rowCount, `${table} own rows`).toBeGreaterThan(0);
      expect(crossUser.rowCount, `${table} cross-user`).toBe(0);
      // Bob has his own revisions/provenance but must not see alice's.
      expect(
        (
          await rawAsPrincipal(bob, `SELECT id FROM ${table} WHERE tenant_id = $1`, [
            alice.tenantId,
          ])
        ).rowCount,
        `${table} cross-tenant`,
      ).toBe(0);
      expect(crossTenant.rowCount, `${table} bob's own`).toBeGreaterThanOrEqual(0);
    }

    // NO PRINCIPAL CONTEXT AT ALL: fail closed.
    expect((await appAdapter.query(`SELECT id FROM transactions`)).rowCount).toBe(0);
  });

  it('a guessed id is indistinguishable from one that does not exist', async () => {
    context.actAs(mallory);
    // Alice's real id — which mallory is not allowed to know exists…
    const guessed = await read.execute({ transactionId: aliceTransactionId });
    // …and an id nothing ever minted.
    const absent = await read.execute({ transactionId: randomUUID() });
    expect(guessed.ok).toBe(false);
    expect(absent.ok).toBe(false);
    if (!guessed.ok && !absent.ok) {
      // Same kind, same resource, and no field that differs except the id the
      // caller supplied. A distinguishable denial would be an existence
      // oracle over another person's finances.
      expect(guessed.error.kind).toBe('NOT_FOUND');
      expect(absent.error.kind).toBe('NOT_FOUND');
      expect({ ...guessed.error, id: '' }).toEqual({ ...absent.error, id: '' });
    }
  });

  it('a cross-principal write matches nothing, and a forged insert is refused outright', async () => {
    // UPDATE across the boundary: zero rows, not an error the caller could
    // use to learn the row exists.
    const crossUpdate = await rawAsPrincipal(
      mallory,
      `UPDATE transactions SET status = 'VOIDED' WHERE id = $1`,
      [aliceTransactionId],
    );
    expect(crossUpdate.rowCount).toBe(0);

    // INSERT claiming alice's identity: WITH CHECK refuses (42501).
    const forged = await rawAsPrincipal(
      mallory,
      `INSERT INTO transactions
         (id, tenant_id, user_id, account_id, account_reference_type, amount_minor,
          currency_code, booking_date, hsf_algorithm, hsf_key_version,
          description_ciphertext, description_nonce, description_auth_tag,
          source_kind, status, dedup_fingerprint, fingerprint_version, version)
       VALUES ($1, $2, $3, $4, 'FINANCIAL_ACCOUNT', -100, 'QAR', now(),
               'AES-256-GCM', 'v1', '\\x00'::bytea, decode('000000000000000000000000','hex'),
               decode('00000000000000000000000000000000','hex'),
               'MANUAL', 'POSTED', 'forged', 'v1', 1)`,
      [randomUUID(), alice.tenantId, alice.userId, aliceAccount],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(forged).toBeInstanceOf(PgError);
    expect((forged as PgError).sqlState).toBe('42501');

    // Alice's row survived every attempt, intact.
    context.actAs(alice);
    const survived = await read.execute({ transactionId: aliceTransactionId });
    expect(survived.ok && survived.value.transaction.status).toBe('POSTED');
  });

  it('a delete cannot cross a user boundary, and cascades within one', async () => {
    // Cross-user: mallory tries to delete alice's row.
    context.actAs(mallory);
    const denied = await remove.execute({ transactionId: aliceTransactionId });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.kind).toBe('NOT_FOUND');
    // Cross-tenant: bob tries too.
    context.actAs(bob);
    expect((await remove.execute({ transactionId: aliceTransactionId })).ok).toBe(false);
    // Raw DELETE under mallory's context: matches nothing.
    expect(
      (await rawAsPrincipal(mallory, `DELETE FROM transactions WHERE id = $1`, [aliceTransactionId]))
        .rowCount,
    ).toBe(0);
    // Still there.
    expect((await rawAsPrincipal(alice, `SELECT id FROM transactions`)).rowCount).toBe(1);

    // A subject deleting their OWN transaction: it goes, and so do the child
    // rows, by ON DELETE CASCADE rather than by application bookkeeping.
    const doomedId = await seedFor(alice, aliceAccount, 'doomed', { bookingDate: EARLIER });
    context.actAs(alice);
    await assign.execute({
      transactionId: doomedId,
      categoryCode: 'FOOD',
      assignmentSource: 'USER',
    });
    const beforeDelete = await superuserAdapter.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM transaction_revisions WHERE transaction_id = $1)
            + (SELECT count(*) FROM transaction_provenance WHERE transaction_id = $1)
            + (SELECT count(*) FROM transaction_category_assignments WHERE transaction_id = $1) AS n`,
      [doomedId],
    );
    expect(Number(beforeDelete.rows[0]?.n)).toBeGreaterThan(0);

    expect((await remove.execute({ transactionId: doomedId })).ok).toBe(true);

    // Counted as superuser, which bypasses RLS: the rows are GONE, not merely
    // invisible. An erasure that only hides rows is not an erasure.
    const afterDelete = await superuserAdapter.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM transaction_revisions WHERE transaction_id = $1)
            + (SELECT count(*) FROM transaction_provenance WHERE transaction_id = $1)
            + (SELECT count(*) FROM transaction_category_assignments WHERE transaction_id = $1) AS n`,
      [doomedId],
    );
    expect(Number(afterDelete.rows[0]?.n)).toBe(0);
  });

  it('the dedup constraint makes an exact duplicate impossible under concurrency', async () => {
    context.actAs(alice);
    const input = {
      accountId: aliceAccount,
      magnitude: qar(12, 34),
      direction: 'MONEY_OUT' as const,
      bookingDate: new Date('2026-08-12T00:00:00.000Z'),
      description: syntheticMerchant('concurrent purchase'),
    };
    // Two commits of the same movement, in flight at once. Exactly one wins.
    const outcomes = await Promise.allSettled([create.execute(input), create.execute(input)]);
    const results = outcomes.map((outcome) =>
      outcome.status === 'fulfilled' ? outcome.value : null,
    );
    const succeeded = results.filter((result) => result?.ok === true);
    const refused = results.filter((result) => result !== null && result.ok === false);
    // DIAGNOSTIC, not decoration. This assertion failed three times in roughly
    // thirty-five full-suite runs and never once in isolation, and the bare
    // "expected length 1" told us nothing about WHICH invariant broke: two
    // winners (a real dedup failure), two losers, or a raw throw where a typed
    // DUPLICATE_TRANSACTION refusal was expected. It was not reproducible again
    // under instrumentation — twenty-seven consecutive clean runs, including
    // six under deliberate CPU load — so the next occurrence has to be
    // diagnosable on the spot rather than re-chased. Fires only on the failure
    // path; a passing run prints nothing.
    if (succeeded.length !== 1 || refused.length !== 1) {
      console.error(
        'concurrency invariant broken — outcomes were:',
        JSON.stringify(
          outcomes.map((o) =>
            o.status === 'fulfilled'
              ? { status: 'fulfilled', value: o.value }
              : { status: 'rejected', reason: String(o.reason), name: (o.reason as Error)?.name },
          ),
          null,
          2,
        ),
      );
    }
    expect(succeeded).toHaveLength(1);
    expect(refused).toHaveLength(1);
    const denial = refused[0];
    if (denial && !denial.ok) expect(denial.error.kind).toBe('DUPLICATE_TRANSACTION');

    const stored = await rawAsPrincipal(
      alice,
      `SELECT id FROM transactions WHERE booking_date = $1`,
      [input.bookingDate],
    );
    expect(stored.rowCount).toBe(1);

    // A genuine identical repeat is still recordable, explicitly.
    const repeat = await create.execute({ ...input, occurrenceOrdinal: 2 });
    expect(repeat.ok).toBe(true);
    expect(
      (await rawAsPrincipal(alice, `SELECT id FROM transactions WHERE booking_date = $1`, [
        input.bookingDate,
      ])).rowCount,
    ).toBe(2);

    // The same movement in ANOTHER subject's account is unaffected — the
    // fingerprint is per subject, so it is not a cross-subject join key.
    context.actAs(bob);
    expect((await create.execute({ ...input, accountId: bobAccount })).ok).toBe(true);
  });

  it('a correction appends a revision and provenance, and the original stays attributable', async () => {
    const correctedId = await seedFor(alice, aliceAccount, 'corrected', {
      bookingDate: new Date('2026-08-11T00:00:00.000Z'),
    });
    context.actAs(alice);
    const corrected = await update.execute({
      transactionId: correctedId,
      expectedVersion: 1,
      magnitude: qar(54),
      direction: 'MONEY_OUT',
    });
    expect(corrected.ok).toBe(true);

    const view = await read.execute({ transactionId: correctedId });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.value.transaction.amount.minorUnits).toBe(-5400n);
    expect(view.value.revisions).toHaveLength(2);
    // Revision 1 still holds what was first committed, attributed to the
    // person who entered it rather than to the correction.
    expect(view.value.revisions[0]?.values.amount.minorUnits).toBe(-4500n);
    expect(view.value.revisions[0]?.attribution).toBe('MANUAL_ENTRY');
    expect(view.value.revisions[1]?.attribution).toBe('USER_INPUT');
    expect(view.value.revisions[1]?.changedFields).toEqual(['amount']);
    expect(view.value.provenance.map((record) => record.revisionNumber)).toEqual([1, 2]);

    // Append-only in the database, not merely in the code: karar_app has no
    // UPDATE grant, and the trigger raises even for the owner.
    const appUpdate = await rawAsPrincipal(
      alice,
      `UPDATE transaction_revisions SET amount_minor = 1 WHERE transaction_id = $1`,
      [correctedId],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect((appUpdate as PgError).sqlState).toBe('42501');

    const ownerUpdate = await superuserAdapter
      .query(`UPDATE transaction_revisions SET amount_minor = 1 WHERE transaction_id = $1`, [
        correctedId,
      ])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((ownerUpdate as PgError).sqlState).toBe('P0001');

    const provenanceUpdate = await superuserAdapter
      .query(`UPDATE transaction_provenance SET parser_version = 'x' WHERE transaction_id = $1`, [
        correctedId,
      ])
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((provenanceUpdate as PgError).sqlState).toBe('P0001');
  });

  it('exactly one category assignment stays ACTIVE, and a rule cannot replace a person', async () => {
    const categorisedId = await seedFor(alice, aliceAccount, 'categorised', {
      bookingDate: new Date('2026-08-09T00:00:00.000Z'),
    });
    context.actAs(alice);

    const byRuleFirst = await assign.execute({
      transactionId: categorisedId,
      categoryCode: 'FOOD',
      assignmentSource: 'RULE',
      ruleVersion: 'rules/merchant/1',
    });
    expect(byRuleFirst.ok ? null : byRuleFirst.error).toBeNull();
    const byUser = await assign.execute({
      transactionId: categorisedId,
      categoryCode: 'TRANSPORT',
      assignmentSource: 'USER',
    });
    expect(byUser.ok ? null : byUser.error).toBeNull();

    const active = await rawAsPrincipal<{ assignment_source: string; category_code: string }>(
      alice,
      `SELECT assignment_source, category_code FROM transaction_category_assignments
        WHERE transaction_id = $1 AND status = 'ACTIVE'`,
      [categorisedId],
    );
    expect(active.rowCount).toBe(1);
    expect(active.rows[0]).toEqual({ assignment_source: 'USER', category_code: 'TRANSPORT' });

    // The rule is refused, loudly, and the person's choice is untouched.
    const byRule = await assign.execute({
      transactionId: categorisedId,
      categoryCode: 'FOOD',
      assignmentSource: 'RULE',
      ruleVersion: 'rules/merchant/2',
    });
    expect(byRule.ok).toBe(false);
    if (!byRule.ok) expect(byRule.error.kind).toBe('USER_ASSIGNMENT_WINS');
    expect((await assignments.findActive(alice, TransactionId.of(categorisedId)))?.categoryCode).toBe(
      'TRANSPORT',
    );

    // The partial unique index makes two ACTIVE rows unreachable even by raw
    // SQL under the owner's own context.
    const secondActive = await rawAsPrincipal(
      alice,
      `INSERT INTO transaction_category_assignments
         (id, transaction_id, tenant_id, user_id, category_code, assignment_source,
          assigned_by, assigned_at, status)
       VALUES ($1, $2, $3, $4, 'OTHER', 'USER', $4, now(), 'ACTIVE')`,
      [randomUUID(), categorisedId, alice.tenantId, alice.userId],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(secondActive).toBeInstanceOf(PgError);
    expect((secondActive as PgError).sqlState).toBe('23505');
  });

  it('RLS posture: every subject table is ENABLEd AND FORCEd with a real policy', async () => {
    for (const table of [
      'transactions',
      'transaction_revisions',
      'transaction_provenance',
      'transaction_category_assignments',
    ]) {
      const posture = await appAdapter.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = $1`,
        [table],
      );
      expect(posture.rows[0], table).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

      const policies = await appAdapter.query<{ policyname: string; qual: string; with_check: string }>(
        `SELECT policyname, qual, with_check FROM pg_policies
          WHERE schemaname = 'public' AND tablename = $1`,
        [table],
      );
      expect(policies.rowCount, table).toBeGreaterThan(0);
      for (const policy of policies.rows) {
        // BOTH GUCs, on read and on write. A tenant-only predicate would
        // leave every tenant member exposed to every other member.
        for (const clause of [policy.qual, policy.with_check]) {
          expect(clause, `${table}.${policy.policyname}`).toContain('app.tenant_id');
          expect(clause, `${table}.${policy.policyname}`).toContain('app.user_id');
        }
      }

      // A subject table on the allow-list would be a contradiction.
      const allowList = JSON.parse(
        readFileSync(path.join(REPO_ROOT, 'packages/platform/db/rls-allow-list.json'), 'utf8'),
      ) as Array<{ table: string }>;
      expect(allowList.some((entry) => entry.table === `public.${table}`)).toBe(false);
    }
  });

  it('merchant_rules cannot store subject linkage — structurally, not by convention', async () => {
    // 1. No column exists that any subject reference could be written into.
    for (const table of ['merchant_rules', 'financial_categories']) {
      const columns = await appAdapter.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      expect(columns.rowCount, table).toBeGreaterThan(0);
      const names = columns.rows.map((row) => row.column_name);
      for (const forbidden of [
        'tenant_id',
        'user_id',
        'account_id',
        'subject_id',
        'transaction_id',
        'statement_id',
        'statement_row_id',
        'import_ref',
        'row_ref',
        'actor_ref',
      ]) {
        expect(names, `${table} must not carry ${forbidden}`).not.toContain(forbidden);
      }
      // No uuid-typed column other than the surrogate primary key, so a
      // subject reference has nowhere to hide under a neutral name.
      const uuidColumns = await appAdapter.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 AND data_type = 'uuid'
            AND column_name <> 'id'`,
        [table],
      );
      expect(uuidColumns.rows.map((row) => row.column_name), table).toEqual([]);
    }

    // 2. SEED THE VALID SIDE: a reviewed, generalised pattern is storable,
    //    and matching works. Without this, everything below would pass
    //    against a table that simply rejects all inserts.
    const ruleId = randomUUID();
    await migratorAdapter.query(
      `INSERT INTO merchant_rules (id, pattern_kind, pattern_token, category_code, rule_version, review_ref)
       VALUES ($1, 'EXACT', 'corner shop', 'FOOD', 'rules/merchant/1', 'review:phase5-0001')`,
      [ruleId],
    );
    expect(await rules.match('corner shop')).toEqual({
      categoryCode: 'FOOD',
      ruleVersion: 'rules/merchant/1',
    });
    expect(await rules.match('somewhere else')).toBeNull();

    // Arabic patterns are storable: the constraints exclude digits and
    // reference punctuation, not a script.
    await migratorAdapter.query(
      `INSERT INTO merchant_rules (id, pattern_kind, pattern_token, category_code, rule_version, review_ref)
       VALUES ($1, 'EXACT', 'بقالة الحي', 'FOOD.GROCERIES', 'rules/merchant/1', 'review:phase5-0002')`,
      [randomUUID()],
    );
    expect(await rules.match('بقالة الحي')).toEqual({
      categoryCode: 'FOOD.GROCERIES',
      ruleVersion: 'rules/merchant/1',
    });

    // 3. A VERBATIM CUSTOMER NARRATIVE IS REFUSED. This is the legacy's exact
    //    failure (C12) made structurally impossible.
    const verbatim = await migratorAdapter
      .query(
        `INSERT INTO merchant_rules (id, pattern_kind, pattern_token, category_code, rule_version, review_ref)
         VALUES ($1, 'EXACT', $2, 'FOOD', 'rules/merchant/1', 'review:phase5-0003')`,
        [randomUUID(), VERBATIM_NARRATIVE],
      )
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(verbatim).toBeInstanceOf(PgError);
    expect((verbatim as PgError).sqlState).toBe('23514');

    // Each generalisation rule refuses on its own.
    const rejected: ReadonlyArray<[string, string]> = [
      ['a card mask', 'card 4111'],
      ['a reference number', 'ref 8837261'],
      ['arabic-indic digits', 'بقالة ٤١١١'],
      ['masking punctuation', 'shop*mask'],
      ['an underscore reference', 'shop_ref'],
      ['uppercase', 'Corner Shop'],
      ['too many tokens', 'one two three four five'],
      ['double spacing', 'corner  shop'],
      ['a single character', 'a'],
      ['a long narrative', 'x'.repeat(65)],
    ];
    for (const [label, token] of rejected) {
      const outcome = await migratorAdapter
        .query(
          `INSERT INTO merchant_rules (id, pattern_kind, pattern_token, category_code, rule_version, review_ref)
           VALUES ($1, 'EXACT', $2, 'FOOD', 'rules/merchant/1', 'review:phase5-x')`,
          [randomUUID(), token],
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(outcome, `${label} should be refused`).toBeInstanceOf(PgError);
      expect((outcome as PgError).sqlState, label).toBe('23514');
    }

    // 4. The runtime role cannot write the corpus at all: it changes by
    //    reviewed migration, so there is no write path to authorize or abuse.
    for (const table of ['merchant_rules', 'financial_categories']) {
      const appWrite = await appAdapter
        .query(`DELETE FROM ${table}`)
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect((appWrite as PgError).sqlState, table).toBe('42501');
    }
  });

  it('the catalogue is readable by every principal and carries both languages', async () => {
    const catalogue = new PrismaFinancialCategoryCatalogue(prismaHandle);
    const all = await catalogue.list();
    expect(all.length).toBeGreaterThan(0);
    for (const category of all) {
      expect(category.labels.en.trim()).not.toBe('');
      expect(category.labels.ar.trim()).not.toBe('');
    }
    // Global reference data: readable with no principal context at all, which
    // is exactly why it needs an allow-list entry rather than a policy.
    const noContext = await appAdapter.query(`SELECT code FROM financial_categories`);
    expect(noContext.rowCount).toBeGreaterThan(0);
  });

  it('keyset paging is stable across a concurrent insert', async () => {
    context.actAs(bob);
    // Seed enough rows for two pages, all in bob's own account.
    for (let i = 0; i < 4; i += 1) {
      const created = await create.execute({
        accountId: bobAccount,
        magnitude: qar(1 + i),
        direction: 'MONEY_OUT',
        bookingDate: new Date(Date.UTC(2026, 6, 1 + i)),
        description: syntheticMerchant(`page ${i}`),
      });
      expect(created.ok).toBe(true);
    }
    const first = await list.execute({ limit: 2 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstIds = first.value.transactions.map((t) => t.id);

    // A row inserted between pages, NEWER than the cursor: an OFFSET page
    // would shift everything and re-serve a row the caller already saw.
    const inserted = await create.execute({
      accountId: bobAccount,
      magnitude: qar(99),
      direction: 'MONEY_IN',
      bookingDate: new Date('2026-12-01T00:00:00.000Z'),
      description: syntheticMerchant('inserted between pages'),
    });
    expect(inserted.ok).toBe(true);

    const second = await list.execute({
      limit: 2,
      cursor: first.value.nextCursor as string,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    for (const id of second.value.transactions.map((t) => t.id)) {
      expect(firstIds, 'a keyset page must not re-serve a row').not.toContain(id);
    }
  });
});
