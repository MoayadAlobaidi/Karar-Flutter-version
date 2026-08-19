/**
 * PAGE BOUNDS, proved against live PostgreSQL — the claim that a listing
 * costs what the caller asked for and not what the subject has accumulated.
 *
 * ## Why this suite exists, and why it does not look at pages
 *
 * A page of `limit` rows proves nothing on its own. A repository that reads
 * every row a subject owns and slices the result afterwards produces exactly
 * the same page as one that reads `limit + 1` rows, and it was the shape this
 * surface actually had: the response was bounded, the READ was not, and the
 * cost of one request grew for as long as somebody kept using the product.
 * Balance snapshots are the worst of them — append-only, never updated, never
 * pruned, one row per reported balance per account, forever.
 *
 * So every assertion below is about the DATABASE. `observingHandle` records
 * the row cap each statement carried and the number of rows PostgreSQL handed
 * back, read off the array the driver returned rather than off the page built
 * from it, and each suite seeds MORE rows than it then asks for. A repository
 * that dropped its `take` would still return a correct-looking page and would
 * fail here on the row count.
 *
 * ## And the walk
 *
 * A bound is only half of it: a page boundary that falls differently on two
 * reads drops one row and repeats another, which is the failure a person
 * discovers as a transaction that is simply not in their history. The walks
 * below follow the offset a cursor carries, exactly as the HTTP surface does,
 * across more rows than one page holds, and assert every seeded id appears
 * exactly once. The snapshot walk is the sharp one: its rows are seeded to
 * TIE on both ordering columns, so only the row id makes the order total.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, Currency, Money } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { CreateManualAccount } from '../application/use-cases/create-manual-account.js';
import { RecordReportedBalance } from '../application/use-cases/record-reported-balance.js';
import type { FinancialAccountId } from '../domain/refs.js';
import { PrismaBalanceSnapshotRepository } from '../infrastructure/persistence/prisma-balance-snapshot-repository.js';
import { PrismaFinancialAccountRepository } from '../infrastructure/persistence/prisma-financial-account-repository.js';
import { PrismaInstitutionCatalogueReader } from '../infrastructure/persistence/prisma-institution-catalogue-reader.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  INSTITUTION_ACTIVE,
  buildHandle,
  dropDatabase,
  observingHandle,
  probePostgres,
  provisionDatabase,
  skipBanner,
  superuserMaintenanceProfile,
  testEncryption,
  testRetention,
  type ObservedRead,
} from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'FINANCIAL-ACCOUNTS PAGE-BOUND TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_financial_accounts_page_bounds`;
const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));
const QAR = Currency.get('QAR');

/** More rows than any page below asks for, so the bound has something to cut. */
const SEEDED_ACCOUNTS = 9;
const SEEDED_SNAPSHOTS = 11;
const PAGE = 4;

/** The window, with no narrowing: the bound is what is under test. */
const NO_NARROWING = {
  institutionRef: null,
  institutionKind: null,
  accountType: null,
  walletKind: null,
  nature: null,
  status: null,
  origin: null,
  currencyCode: null,
} as const;

let handle: PrismaHandle;
/** Repositories over the OBSERVED handle — the ones under test. */
let accounts: PrismaFinancialAccountRepository;
let snapshots: PrismaBalanceSnapshotRepository;
const seen: ObservedRead[] = [];
let firstAccount: FinancialAccountId;

/** The reads one call issued, cleared before each measurement. */
function measured(model: string): readonly ObservedRead[] {
  return seen.filter((read) => read.model === model);
}

describe.skipIf(unreachable !== null)(
  'financial accounts and reported balances read ONE PAGE, not the set (live PostgreSQL)',
  () => {
    beforeAll(async () => {
      await provisionDatabase(database);
      handle = buildHandle(database);

      // Seeding runs on the plain handle so nothing it does is measured; the
      // repositories under test run on the observing one.
      const seeding = new PrismaFinancialAccountRepository(handle, testEncryption());
      const seedingSnapshots = new PrismaBalanceSnapshotRepository(handle);
      const observed = observingHandle(handle, seen);
      accounts = new PrismaFinancialAccountRepository(observed, testEncryption());
      snapshots = new PrismaBalanceSnapshotRepository(observed);

      const create = new CreateManualAccount(
        seeding,
        new PrismaInstitutionCatalogueReader(handle),
        testRetention(),
        new Uuidv7IdSource(),
        clock,
      );
      const record = new RecordReportedBalance(
        seeding,
        seedingSnapshots,
        testRetention(),
        new Uuidv7IdSource(),
        clock,
      );

      for (let index = 0; index < SEEDED_ACCOUNTS; index += 1) {
        const created = await create.execute(
          {
            accountType: 'CURRENT',
            currencyCode: 'QAR',
            displayName: `Synthetic Test Account ${String(index)}`,
            institutionRef: INSTITUTION_ACTIVE,
            userSuppliedInstitutionLabel: null,
            mask: null,
          },
          ACTOR_A1,
        );
        if (!created.ok) throw new Error(`account fixture refused: ${created.error.kind}`);
        if (index === 0) firstAccount = created.value.id;
      }

      // Every snapshot is TRUE at one instant and captured at one instant, so
      // the two ordering columns tie on every pair and only the row id can
      // separate them. That is the arrangement a total order has to survive.
      const asOf = new Date('2026-08-17T00:00:00.000Z');
      for (let index = 0; index < SEEDED_SNAPSHOTS; index += 1) {
        const recorded = await record.execute(
          {
            accountId: firstAccount,
            amount: Money.of(BigInt(1_000 + index), QAR),
            asOf,
            balanceKind: 'BOOKED',
            sourceReference: `5e000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          },
          ACTOR_A1,
        );
        if (!recorded.ok) throw new Error(`snapshot fixture refused: ${recorded.error.kind}`);
      }
      seen.length = 0;
    }, 90_000);

    afterAll(async () => {
      await handle?.end();
      await dropDatabase(database);
    });

    it('the ACCOUNT listing asks the database for at most limit + 1 rows', async () => {
      seen.length = 0;
      const page = await accounts.pageOwn(ACTOR_A1, { ...NO_NARROWING, offset: 0, limit: PAGE });

      // The page itself is unremarkable and is not the claim.
      expect(page.accounts).toHaveLength(PAGE);
      expect(page.hasMore).toBe(true);

      // The claim: ONE statement, capped, and the database returned the cap
      // rather than everything the subject owns.
      const reads = measured('financialAccount');
      expect(reads.map((read) => read.take)).toEqual([PAGE + 1]);
      expect(reads.map((read) => read.rows)).toEqual([PAGE + 1]);
      expect(reads[0]?.rows).toBeLessThan(SEEDED_ACCOUNTS);
    });

    it('the BALANCE listing asks the database for at most limit + 1 rows', async () => {
      seen.length = 0;
      const page = await snapshots.pageForOwnAccount(ACTOR_A1, {
        accountId: firstAccount,
        balanceKind: null,
        sourceKind: null,
        offset: 0,
        limit: PAGE,
      });

      expect(page.snapshots).toHaveLength(PAGE);
      expect(page.hasMore).toBe(true);

      const reads = measured('financialAccountBalanceSnapshot');
      expect(reads.map((read) => read.take)).toEqual([PAGE + 1]);
      expect(reads.map((read) => read.rows)).toEqual([PAGE + 1]);
      expect(reads[0]?.rows).toBeLessThan(SEEDED_SNAPSHOTS);
    });

    it('the LAST page reads what is left and reports the end, without a second query', async () => {
      seen.length = 0;
      const page = await accounts.pageOwn(ACTOR_A1, {
        ...NO_NARROWING,
        offset: SEEDED_ACCOUNTS - 2,
        limit: PAGE,
      });
      expect(page.accounts).toHaveLength(2);
      // No extra row existed, so `hasMore` is false — and it was answered from
      // the same statement rather than from a count of the rest.
      expect(page.hasMore).toBe(false);
      expect(measured('financialAccount').map((read) => read.rows)).toEqual([2]);
    });

    it('a cursor walk over the ACCOUNTS sees every row exactly once and terminates', async () => {
      const walked: string[] = [];
      let offset = 0;
      let pages = 0;
      for (;;) {
        // The controller advances the offset by what it returned, which is
        // exactly what the opaque cursor encodes.
        const page = await accounts.pageOwn(ACTOR_A1, { ...NO_NARROWING, offset, limit: PAGE });
        walked.push(...page.accounts.map((account) => account.id));
        offset += page.accounts.length;
        pages += 1;
        if (!page.hasMore) break;
        // Termination, asserted rather than assumed: an empty page that still
        // claimed `hasMore` would otherwise spin here forever.
        expect(page.accounts.length).toBeGreaterThan(0);
        expect(pages).toBeLessThanOrEqual(SEEDED_ACCOUNTS);
      }
      expect(walked).toHaveLength(SEEDED_ACCOUNTS);
      expect(new Set(walked).size).toBe(SEEDED_ACCOUNTS);
      expect(pages).toBeGreaterThan(1);
    });

    it('a cursor walk over BALANCES that all tie sees every row exactly once', async () => {
      // The rows were seeded to tie on `asOf` and on `capturedAt`, so this
      // walk passes only because the row id closes the order. Without it the
      // store may return tied rows in any order it likes, and a page boundary
      // between two of them loses one and repeats another.
      const walked: string[] = [];
      let offset = 0;
      let pages = 0;
      for (;;) {
        const page = await snapshots.pageForOwnAccount(ACTOR_A1, {
          accountId: firstAccount,
          balanceKind: null,
          sourceKind: null,
          offset,
          limit: PAGE,
        });
        walked.push(...page.snapshots.map((snapshot) => snapshot.id));
        offset += page.snapshots.length;
        pages += 1;
        if (!page.hasMore) break;
        expect(page.snapshots.length).toBeGreaterThan(0);
        expect(pages).toBeLessThanOrEqual(SEEDED_SNAPSHOTS);
      }
      expect(walked).toHaveLength(SEEDED_SNAPSHOTS);
      expect(new Set(walked).size).toBe(SEEDED_SNAPSHOTS);
      expect(pages).toBeGreaterThan(1);
    });

    it('a narrowed listing is narrowed BY THE DATABASE, not after the read', async () => {
      // A filter applied after the read would make the offset a cursor
      // carries count rows in the unfiltered set. This asks for a value no
      // seeded account has: a store that narrowed would read nothing, and one
      // that narrowed afterwards would still have read a page of rows.
      seen.length = 0;
      const page = await accounts.pageOwn(ACTOR_A1, {
        ...NO_NARROWING,
        accountType: 'SAVINGS',
        offset: 0,
        limit: PAGE,
      });
      expect(page.accounts).toEqual([]);
      expect(page.hasMore).toBe(false);
      expect(measured('financialAccount').map((read) => read.rows)).toEqual([0]);
    });
  },
);
