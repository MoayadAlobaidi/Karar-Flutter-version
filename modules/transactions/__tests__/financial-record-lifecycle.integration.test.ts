/**
 * Live-PostgreSQL evidence for the two ports `modules/financial-accounts`
 * consumes: financial-record presence, and account-scoped erasure.
 *
 * These are the implementations that let the accounts module block a currency
 * change while records exist, and erase an account's records when the account
 * goes — without ever importing this module. Both claims are only as good as
 * the database behind them, so both are tested against it:
 *
 *  - presence answers a bare boolean and never a row, proven by reading what
 *    the port returns AND by asserting the shape of the answer;
 *  - erasure reports exact per-kind counts, is atomic, is idempotent, and
 *    leaves **no orphan rows** — counted as superuser, which bypasses RLS, so
 *    "gone" is proven rather than "hidden";
 *  - neither crosses a principal boundary, with both sides seeded non-empty.
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

import { AssignCategory } from '../application/use-cases/assign-category.js';
import { CreateManualTransaction } from '../application/use-cases/create-manual-transaction.js';
import { UpdateOwnTransaction } from '../application/use-cases/update-own-transaction.js';
import type {
  FinancialRecordEraserPort,
  FinancialRecordPresencePort,
} from '../application/ports/financial-record-lifecycle.js';
import type { TransactionsPrincipal } from '../application/ports/principal-context.js';
import {
  PrismaFinancialRecordEraser,
  PrismaFinancialRecordPresenceReader,
} from '../infrastructure/persistence/prisma-financial-record-lifecycle.js';
import {
  PrismaCategoryAssignmentRepository,
  PrismaFinancialCategoryCatalogue,
} from '../infrastructure/persistence/prisma-category-repositories.js';
import { PrismaTransactionRepository } from '../infrastructure/persistence/prisma-transaction-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { LocalAesGcmFieldEncryptionProvider } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import { LocalKeyedDedupFingerprintProvider } from '../infrastructure/providers/local-keyed-dedup-fingerprint-provider.js';
import { LocalSyntheticRetentionDecisionProvider } from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';
import {
  FixedAccountDirectory,
  FixedPrincipalContext,
  InMemoryTransferMatchEraser,
} from './fakes/in-memory-repositories.js';
import type { FinancialAccountId } from '@karar/financial-accounts';
import {
  BOOKED,
  EARLIER,
  NOW,
  SYNTHETIC_MARKER,
  fixedClock,
  principal,
  qar,
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
      `FINANCIAL-RECORD LIFECYCLE TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence that the accounts module can ask whether',
      'records exist and erase them without importing this module, and that',
      'an erasure leaves no orphan rows. Start the database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  KARAR_ENV=local POSTGRES_PORT=5433 pnpm --filter @karar/transactions test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_txn_lifecycle`;

describe.skipIf(unreachable !== null)('financial-record lifecycle ports (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  let context: FixedPrincipalContext;
  let create: CreateManualTransaction;
  let update: UpdateOwnTransaction;
  let assign: AssignCategory;
  let presence: FinancialRecordPresencePort;
  let eraser: FinancialRecordEraserPort;
  /**
   * `modules/transfer-matching` satisfies `TransferMatchEraserPort` for real,
   * and this module may not import it — the dependency runs the other way. So
   * the eraser is driven here by the in-memory double, whose subject is THIS
   * module's contract: that the relationships are cut before the records, and
   * that a refusal there refuses the whole erasure. The end-to-end proof over
   * real `transfer_matches` rows lives in that module's own suite, where the
   * real adapter and real rows exist.
   */
  let transferMatches: InMemoryTransferMatchEraser;
  /** Held at suite scope so a case can add an account it seeds for itself. */
  let accountDirectory: FixedAccountDirectory;

  const tenant = randomUUID();
  const alice: TransactionsPrincipal = principal(tenant);
  /** Same tenant, different user. */
  const mallory: TransactionsPrincipal = principal(tenant);
  /** Different tenant. */
  const bob: TransactionsPrincipal = principal(randomUUID());

  // The ports take a branded FinancialAccountId. These ids are synthetic seed
  // values for a live-database fixture, so the brand is asserted once here
  // rather than at each of the call sites below — and asserting it at the seam
  // is what makes the compiler check every one of those call sites.
  const asAccountId = (value: string): FinancialAccountId => value as FinancialAccountId;

  const doomedAccount = asAccountId(randomUUID());
  const survivingAccount = randomUUID();
  const malloryAccount = asAccountId(randomUUID());
  const bobAccount = asAccountId(randomUUID());
  const emptyAccount = asAccountId(randomUUID());

  /** Superuser counts scoped to one account's transactions. RLS-free. */
  async function rowsFor(accountId: string): Promise<{
    transactions: number;
    revisions: number;
    provenance: number;
    assignments: number;
  }> {
    const result = await superuserAdapter.query<{
      transactions: string;
      revisions: string;
      provenance: string;
      assignments: string;
    }>(
      `WITH scoped AS (SELECT id FROM public.transactions WHERE account_id = $1)
       SELECT (SELECT count(*) FROM scoped) AS transactions,
              (SELECT count(*) FROM public.transaction_revisions
                WHERE transaction_id IN (SELECT id FROM scoped)) AS revisions,
              (SELECT count(*) FROM public.transaction_provenance
                WHERE transaction_id IN (SELECT id FROM scoped)) AS provenance,
              (SELECT count(*) FROM public.transaction_category_assignments
                WHERE transaction_id IN (SELECT id FROM scoped)) AS assignments`,
      [accountId],
    );
    const row = result.rows[0];
    return {
      transactions: Number(row?.transactions ?? -1),
      revisions: Number(row?.revisions ?? -1),
      provenance: Number(row?.provenance ?? -1),
      assignments: Number(row?.assignments ?? -1),
    };
  }

  async function seed(
    who: TransactionsPrincipal,
    accountId: string,
    label: string,
    bookingDate = BOOKED,
  ): Promise<string> {
    context.actAs(who);
    const created = await create.execute({
      accountId,
      magnitude: qar(45),
      direction: 'MONEY_OUT',
      bookingDate,
      merchant: syntheticMerchant(`${label} merchant`),
      description: syntheticMerchant(`${label} purchase`),
      note: syntheticMerchant(`${label} note`),
    });
    if (!created.ok) throw new Error(`seed failed: ${JSON.stringify(created.error)}`);
    return created.value.id;
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
      key: Buffer.alloc(32, 31),
      keyVersion: 'karar-ref:key-version:local-transactions-hsf@v1',
    });
    const repository = new PrismaTransactionRepository(prismaHandle, encryption);
    const assignments = new PrismaCategoryAssignmentRepository(prismaHandle);
    const ids = new Uuidv7IdSource();
    const clock = fixedClock(NOW);
    accountDirectory = new FixedAccountDirectory([
      { accountId: doomedAccount, owner: alice, currencyCode: 'QAR' },
      { accountId: survivingAccount, owner: alice, currencyCode: 'QAR' },
      { accountId: emptyAccount, owner: alice, currencyCode: 'QAR' },
      { accountId: malloryAccount, owner: mallory, currencyCode: 'QAR' },
      { accountId: bobAccount, owner: bob, currencyCode: 'QAR' },
    ]);
    const accounts = accountDirectory;

    context = new FixedPrincipalContext(alice);
    create = new CreateManualTransaction(
      context,
      repository,
      new LocalKeyedDedupFingerprintProvider({ rootKey: Buffer.alloc(32, 37) }),
      ids,
      clock,
      new LocalSyntheticRetentionDecisionProvider({ environment: 'local' }),
      accounts,
    );
    update = new UpdateOwnTransaction(context, repository, ids, clock);
    assign = new AssignCategory(
      context,
      repository,
      assignments,
      new PrismaFinancialCategoryCatalogue(prismaHandle),
      ids,
      clock,
    );
    presence = new PrismaFinancialRecordPresenceReader(prismaHandle);
    transferMatches = new InMemoryTransferMatchEraser();
    eraser = new PrismaFinancialRecordEraser(prismaHandle, transferMatches);

    // SEED EVERY SIDE NON-EMPTY, and seed every KIND of row the erasure has
    // to remove: transactions, a correction (so revisions and provenance are
    // more than one per transaction), and a category assignment chain.
    const doomedOne = await seed(alice, doomedAccount, 'doomed one');
    const doomedTwo = await seed(alice, doomedAccount, 'doomed two', EARLIER);
    await seed(alice, survivingAccount, 'surviving');
    await seed(mallory, malloryAccount, 'mallory');
    await seed(bob, bobAccount, 'bob');

    context.actAs(alice);
    const corrected = await update.execute({
      transactionId: doomedOne,
      expectedVersion: 1,
      magnitude: qar(54),
      direction: 'MONEY_OUT',
    });
    if (!corrected.ok) throw new Error(`correction seed failed: ${JSON.stringify(corrected.error)}`);
    for (const [id, code] of [
      [doomedOne, 'FOOD'],
      [doomedTwo, 'TRANSPORT'],
    ] as const) {
      const assigned = await assign.execute({
        transactionId: id,
        categoryCode: code,
        assignmentSource: 'USER',
      });
      if (!assigned.ok) throw new Error(`category seed failed: ${JSON.stringify(assigned.error)}`);
    }
    // A supersession, so the chain has more than one row per transaction.
    const superseded = await assign.execute({
      transactionId: doomedOne,
      categoryCode: 'TRANSPORT',
      assignmentSource: 'USER',
    });
    if (!superseded.ok) throw new Error(`supersession seed failed: ${JSON.stringify(superseded.error)}`);
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

  it('the seed is real: every kind of row exists on the doomed account', async () => {
    const rows = await rowsFor(doomedAccount);
    expect(rows.transactions).toBe(2);
    // One transaction was corrected, so it carries two revisions and two
    // provenance records — an erasure that only handled the first would show.
    expect(rows.revisions).toBe(3);
    expect(rows.provenance).toBe(3);
    // Two assignments plus one supersession.
    expect(rows.assignments).toBe(3);
  });

  describe('presence', () => {
    it('answers true for an account with records and false for one without', async () => {
      const withRecords = await presence.hasAnyRecordForAccount(alice, doomedAccount);
      const without = await presence.hasAnyRecordForAccount(alice, emptyAccount);
      expect(withRecords).toEqual({ accountId: doomedAccount, hasAnyRecord: true });
      expect(without).toEqual({ accountId: emptyAccount, hasAnyRecord: false });
    });

    it('leaks no transaction content — the answer is a boolean and an echo', async () => {
      const answer = await presence.hasAnyRecordForAccount(alice, doomedAccount);
      // The WHOLE answer, exactly: one boolean and an echo of the caller's
      // own input. Asserted by equality rather than by absence, so a field
      // added later — a count, a date, a merchant — fails this test instead
      // of slipping past a list of things it must not contain.
      expect(answer).toEqual({ accountId: doomedAccount, hasAnyRecord: true });
      expect(Object.keys(answer).sort()).toEqual(['accountId', 'hasAnyRecord']);
      expect(typeof answer.hasAnyRecord).toBe('boolean');
      const serialized = JSON.stringify(answer);
      expect(serialized).not.toContain(SYNTHETIC_MARKER);
      // Nothing derived from the rows: no amounts, no dates, no count.
      expect(serialized.replace(doomedAccount, '')).not.toMatch(/\d/);
    });

    it('does not cross a user or a tenant boundary', async () => {
      // Both sides are populated, so these are real refusals rather than
      // empty tables answering false.
      expect((await presence.hasAnyRecordForAccount(mallory, malloryAccount)).hasAnyRecord).toBe(
        true,
      );
      expect((await presence.hasAnyRecordForAccount(bob, bobAccount)).hasAnyRecord).toBe(true);

      // …and neither can see the other's, nor alice's.
      expect((await presence.hasAnyRecordForAccount(mallory, doomedAccount)).hasAnyRecord).toBe(
        false,
      );
      expect((await presence.hasAnyRecordForAccount(bob, doomedAccount)).hasAnyRecord).toBe(false);
      expect((await presence.hasAnyRecordForAccount(alice, malloryAccount)).hasAnyRecord).toBe(
        false,
      );
    });
  });

  describe('erasure', () => {
    it('erases every kind and reports exact per-kind counts', async () => {
      const before = await rowsFor(doomedAccount);
      const outcome = await eraser.eraseAccountScopedRecords(alice, doomedAccount);
      // `erased` is the ONLY arm a caller may report as a success, so the
      // assertion is on the arm as much as on the numbers.
      expect(outcome.kind).toBe('erased');
      if (outcome.kind !== 'erased') return;
      expect(outcome.deleted).toEqual({
        FINANCIAL_RECORD: before.transactions,
        FINANCIAL_RECORD_REVISION: before.revisions,
        FINANCIAL_RECORD_PROVENANCE: before.provenance,
        FINANCIAL_RECORD_CATEGORY_ASSIGNMENT: before.assignments,
      });
    });

    it('the dedup identity has no table of its own to leave residue in', async () => {
      // The kind set has no dedup entry because the fingerprint, its version
      // and the occurrence ordinal are COLUMNS on the transaction row. That
      // is checked against the live catalogue rather than assumed: a dedup
      // side table would be residue nobody counted, and the eraser refuses to
      // report success if the identity count and the record count diverge.
      const carriers = await superuserAdapter.query<{ table_name: string }>(
        `SELECT DISTINCT table_name FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name IN ('dedup_fingerprint', 'fingerprint_version', 'occurrence_ordinal')
            AND table_name <> 'transaction_provenance'
          ORDER BY table_name`,
      );
      expect(carriers.rows.map((row) => row.table_name)).toEqual(['transactions']);
    });

    it('leaves no orphan rows — counted as superuser, so "gone" is proven', async () => {
      const after = await rowsFor(doomedAccount);
      expect(after).toEqual({ transactions: 0, revisions: 0, provenance: 0, assignments: 0 });

      // Nothing anywhere still points at a transaction that no longer exists,
      // and nothing anywhere still names the erased account. The first would
      // be residue with a dangling reference; the second would be residue
      // hiding under a live transaction.
      const residue = await superuserAdapter.query<{
        orphan_revisions: string;
        orphan_provenance: string;
        orphan_assignments: string;
        provenance_naming_account: string;
      }>(
        `SELECT (SELECT count(*) FROM public.transaction_revisions r
                  WHERE NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = r.transaction_id)) AS orphan_revisions,
                (SELECT count(*) FROM public.transaction_provenance p
                  WHERE NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = p.transaction_id)) AS orphan_provenance,
                (SELECT count(*) FROM public.transaction_category_assignments a
                  WHERE NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = a.transaction_id)) AS orphan_assignments,
                (SELECT count(*) FROM public.transaction_provenance WHERE account_id = $1) AS provenance_naming_account`,
        [doomedAccount],
      );
      const row = residue.rows[0];
      expect(Number(row?.orphan_revisions)).toBe(0);
      expect(Number(row?.orphan_provenance)).toBe(0);
      expect(Number(row?.orphan_assignments)).toBe(0);
      expect(Number(row?.provenance_naming_account)).toBe(0);

      // The presence port agrees, which is the property the accounts module
      // actually depends on: an erased account is one whose currency may
      // change again.
      expect((await presence.hasAnyRecordForAccount(alice, doomedAccount)).hasAnyRecord).toBe(
        false,
      );
    });

    it('touched nothing outside the account it was given', async () => {
      // The other three populated accounts are untouched. An erasure scoped
      // by principal alone, rather than by principal AND account, would have
      // taken the surviving account with it.
      expect((await rowsFor(survivingAccount)).transactions).toBe(1);
      expect((await rowsFor(malloryAccount)).transactions).toBe(1);
      expect((await rowsFor(bobAccount)).transactions).toBe(1);
    });

    it('is idempotent: a retry answers erased with zeroes rather than failing', async () => {
      // Erasure is the operation most likely to be retried after a lost
      // response, and least able to afford a retry that reports failure over
      // an empty table.
      const first = await eraser.eraseAccountScopedRecords(alice, doomedAccount);
      const second = await eraser.eraseAccountScopedRecords(alice, doomedAccount);
      for (const outcome of [first, second]) {
        expect(outcome.kind).toBe('erased');
        if (outcome.kind !== 'erased') continue;
        expect(outcome.deleted).toEqual({
          FINANCIAL_RECORD: 0,
          FINANCIAL_RECORD_REVISION: 0,
          FINANCIAL_RECORD_PROVENANCE: 0,
          FINANCIAL_RECORD_CATEGORY_ASSIGNMENT: 0,
        });
      }
    });

    it('erases nothing across a principal boundary, and reports honestly', async () => {
      // Alice asking for mallory's account: not "erased 1", not an error
      // naming somebody else's data — zeros, because within alice's scope
      // there is indeed nothing.
      const crossUser = await eraser.eraseAccountScopedRecords(alice, malloryAccount);
      // The WHOLE outcome, by equality: the relationship count belongs in it
      // too, and asserting the exact shape is what makes a field added later
      // fail here instead of slipping past.
      expect(crossUser).toEqual({
        kind: 'erased',
        deleted: {
          FINANCIAL_RECORD: 0,
          FINANCIAL_RECORD_REVISION: 0,
          FINANCIAL_RECORD_PROVENANCE: 0,
          FINANCIAL_RECORD_CATEGORY_ASSIGNMENT: 0,
        },
        financialRecordRelationshipsDeleted: 0,
      });
      const crossTenant = await eraser.eraseAccountScopedRecords(alice, bobAccount);
      expect(crossTenant.kind).toBe('erased');
      if (crossTenant.kind === 'erased') {
        expect(crossTenant.deleted.FINANCIAL_RECORD).toBe(0);
      }

      // Counted as superuser: still there, untouched.
      expect((await rowsFor(malloryAccount)).transactions).toBe(1);
      expect((await rowsFor(bobAccount)).transactions).toBe(1);

      // And the owners can still erase their own.
      const byOwner = await eraser.eraseAccountScopedRecords(mallory, malloryAccount);
      expect(byOwner.kind).toBe('erased');
      if (byOwner.kind === 'erased') expect(byOwner.deleted.FINANCIAL_RECORD).toBe(1);
      expect((await rowsFor(malloryAccount)).transactions).toBe(0);
    });
  });

  /**
   * The relationships that name a person's records go with them, or nothing
   * goes.
   *
   * `public.transfer_matches` says two of the subject's transactions were ONE
   * movement of their own money. Its references are raw uuids with no foreign
   * keys back, so an account erasure took the records and left every match
   * asserting a transfer whose other side no longer existed — which keeps a
   * real expense hidden from the person's own record of what they spent.
   */
  describe('the transfer matches naming the account', () => {
    /** A fresh account with one real transaction on it, per case. */
    async function accountWithOneRecord(label: string): Promise<FinancialAccountId> {
      const accountId = asAccountId(randomUUID());
      accountDirectory.add({ accountId, owner: alice, currencyCode: 'QAR' });
      await seed(alice, accountId, label);
      expect((await rowsFor(accountId)).transactions).toBe(1);
      return accountId;
    }

    it('are erased BEFORE the records, and the exact count travels in the outcome', async () => {
      const accountId = await accountWithOneRecord('matched account');
      transferMatches.seed(alice, { accountIds: [accountId] }, 2);

      const outcome = await eraser.eraseAccountScopedRecords(alice, accountId);
      expect(outcome.kind).toBe('erased');
      if (outcome.kind !== 'erased') return;
      // The count the accounts module folds into what it tells the person.
      // Reported, never assumed: two rows were there and two went.
      expect(outcome.financialRecordRelationshipsDeleted).toBe(2);
      expect(outcome.deleted.FINANCIAL_RECORD).toBe(1);
      expect(transferMatches.rows).toHaveLength(0);
      expect((await rowsFor(accountId)).transactions).toBe(0);
    });

    it('refuse the WHOLE erasure when they cannot go, leaving every record in place', async () => {
      // The ordering made checkable. If the records went first and the match
      // erasure then failed, the residue would be permanent and nothing
      // afterwards would know to look for it.
      const accountId = await accountWithOneRecord('unerasable matches');
      transferMatches.seed(alice, { accountIds: [accountId] }, 1);
      transferMatches.failErasureWith(new Error('synthetic transfer-match store outage'));

      const outcome = await eraser.eraseAccountScopedRecords(alice, accountId);
      expect(outcome.kind).toBe('failed');
      // A coherent world to retry into, counted as superuser: the record is
      // still there, and so is the relationship naming it.
      expect((await rowsFor(accountId)).transactions).toBe(1);
      expect(transferMatches.rows).toHaveLength(1);
    });

    it('carry NO store text outward when they fail, and keep the cause for the boundary', async () => {
      // The accounts module interpolates `reason` into a message a person
      // sees. A driver message can carry a connection string, the failing SQL,
      // or a fragment of the very record being erased.
      const CONNECTION_STRING = 'postgres://user:password@internal-host:5432/karar';
      const SQL = 'DELETE FROM public.transfer_matches';
      const poisoned = new Error(`connection to ${CONNECTION_STRING} failed while running ${SQL}`);
      const accountId = await accountWithOneRecord('poisoned matches');
      transferMatches.failErasureWith(poisoned);

      const outcome = await eraser.eraseAccountScopedRecords(alice, accountId);
      expect(outcome.kind).toBe('failed');
      if (outcome.kind !== 'failed') return;
      for (const rendered of [
        outcome.reason,
        JSON.stringify(outcome) ?? '',
        JSON.stringify({ ...outcome }),
        Object.keys(outcome).join(','),
      ]) {
        expect(rendered).not.toContain(CONNECTION_STRING);
        expect(rendered).not.toContain(SQL);
        expect(rendered).not.toContain('password');
        expect(rendered).not.toContain('internal-host');
      }
      // Reachable by name for the one boundary allowed to log it, and
      // non-enumerable so no serializer reaches it by accident.
      expect((outcome as { cause?: unknown }).cause).toBe(poisoned);
      expect(Object.getOwnPropertyDescriptor(outcome, 'cause')?.enumerable).toBe(false);
      expect((await rowsFor(accountId)).transactions).toBe(1);
    });

    it('refuse on a PARTIAL erasure too — half a relationship set is not a completion', async () => {
      const accountId = await accountWithOneRecord('partially erased matches');
      transferMatches.eraseWith(() => ({
        kind: 'incomplete',
        transferMatchesDeleted: 1,
        reason: 'one match could not be removed',
      }));

      const outcome = await eraser.eraseAccountScopedRecords(alice, accountId);
      expect(outcome.kind).toBe('failed');
      // Nothing here was removed, which is what makes the retry safe and what
      // the reason promises.
      expect((await rowsFor(accountId)).transactions).toBe(1);
    });
  });
});
