/**
 * PAGE BOUNDS, proved against live PostgreSQL — the claim that listing a
 * person's transfer matches costs what the caller asked for rather than what
 * they have accumulated.
 *
 * ## Why the assertions are about the database and not about the page
 *
 * A page of `limit` rows proves nothing on its own: a repository that reads
 * every match a subject holds and slices afterwards produces exactly the same
 * page as one that reads `limit + 1`. It was also the shape this surface had
 * — a bounded RESPONSE over an unbounded READ. This table grows with a
 * person's transactions and nothing prunes it: a rejected match is KEPT, on
 * purpose, so that the same pair is not suggested again as though nobody had
 * ever looked at it.
 *
 * `observingHandle` records the cap each statement carried and the number of
 * rows PostgreSQL handed back, and the suite seeds more matches than it asks
 * for.
 *
 * ## What is NOT asserted here, on purpose
 *
 * Nothing counts the matches and nothing sums anything about them. `hasMore`
 * is a boolean answering "ask again?" and never a figure about a person's
 * transfers — see the no-money-arithmetic suite for why that distinction is
 * the one this module is built around.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, Currency } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { SuggestTransferMatch } from '../application/use-cases/suggest-transfer-match.js';
import { TransactionsMatchableTransactionAdapter } from '../infrastructure/adapters/transactions-matchable-transaction-access.js';
import { PrismaTransferMatchRepository } from '../infrastructure/persistence/prisma-transfer-match-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  buildHandle,
  dropDatabase,
  money,
  observingHandle,
  probePostgres,
  provisionDatabase,
  seedAccount,
  seedTransaction,
  skipBanner,
  superuserMaintenanceProfile,
  testRetention,
  transactionSeeder,
  type ObservedRead,
  type SeededAccount,
} from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'TRANSFER-MATCHING PAGE-BOUND TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_match_page_bounds`;
const clock = new Clock.Fixed(new Date('2026-08-19T12:00:00.000Z'));
const QAR = Currency.get('QAR');

/** More matches than any page below asks for, so the bound has work to do. */
const SEEDED = 7;
const PAGE = 3;

let handle: PrismaHandle;
/** The repository under test, over the OBSERVED handle. */
let matches: PrismaTransferMatchRepository;
const seen: ObservedRead[] = [];

function measured(): readonly ObservedRead[] {
  return seen.filter((read) => read.model === 'transferMatch');
}

describe.skipIf(unreachable !== null)(
  'transfer matches read ONE PAGE, not the set (live PostgreSQL)',
  () => {
    beforeAll(async () => {
      await provisionDatabase(database);
      handle = buildHandle(database);

      const bankAccount = await seedAccount(
        handle,
        ACTOR_A1,
        'Synthetic Test Bank Account',
        clock,
      );
      const walletAccount = await seedAccount(handle, ACTOR_A1, 'Synthetic Test Wallet', clock);
      const accounts: SeededAccount[] = [
        { accountId: bankAccount, owner: ACTOR_A1, currencyCode: 'QAR' },
        { accountId: walletAccount, owner: ACTOR_A1, currencyCode: 'QAR' },
      ];
      const seeder = transactionSeeder(handle, accounts, clock);

      // Seeding runs on the plain handle so nothing it does is measured; the
      // repository under test runs on the observing one.
      const seeding = new PrismaTransferMatchRepository(handle);
      matches = new PrismaTransferMatchRepository(observingHandle(handle, seen));
      const suggest = new SuggestTransferMatch(
        seeding,
        new TransactionsMatchableTransactionAdapter(seeder.repository),
        testRetention(),
        new Uuidv7IdSource(),
        clock,
      );

      // Every match is written at one fixed clock instant, so every pair ties
      // on `created_at` and only the row id makes the order total. Each pair
      // moves a different amount so no transaction is spoken for twice.
      for (let index = 0; index < SEEDED; index += 1) {
        const magnitude = money(10 + index, QAR);
        const outflow = await seedTransaction(seeder, ACTOR_A1, {
          accountId: bankAccount,
          magnitude,
          direction: 'MONEY_OUT',
          description: `Synthetic Test Wallet Top-Up ${String(index)}`,
        });
        const inflow = await seedTransaction(seeder, ACTOR_A1, {
          accountId: walletAccount,
          magnitude,
          direction: 'MONEY_IN',
          description: `Synthetic Test Wallet Credit ${String(index)}`,
        });
        const suggested = await suggest.execute(
          { firstTransactionId: outflow, secondTransactionId: inflow },
          ACTOR_A1,
        );
        if (!suggested.ok) throw new Error(`match fixture refused: ${suggested.error.kind}`);
      }
      seen.length = 0;
    }, 180_000);

    afterAll(async () => {
      await handle?.end().catch(() => {});
      await dropDatabase(database);
    });

    it('the listing asks the database for at most limit + 1 rows', async () => {
      seen.length = 0;
      const page = await matches.pageOwn(ACTOR_A1, { state: null, offset: 0, limit: PAGE });

      // The page itself is unremarkable and is not the claim.
      expect(page.matches).toHaveLength(PAGE);
      expect(page.hasMore).toBe(true);

      // The claim: ONE statement, capped, and the database returned the cap
      // rather than every match the subject has accumulated.
      const reads = measured();
      expect(reads.map((read) => read.take)).toEqual([PAGE + 1]);
      expect(reads.map((read) => read.rows)).toEqual([PAGE + 1]);
      expect(reads[0]?.rows).toBeLessThan(SEEDED);
    });

    it('a cursor walk over TIED matches sees every row exactly once', async () => {
      const walked: string[] = [];
      let offset = 0;
      let pages = 0;
      for (;;) {
        // The controller advances the offset by what it returned, which is
        // exactly what the opaque cursor encodes.
        const page = await matches.pageOwn(ACTOR_A1, { state: null, offset, limit: PAGE });
        walked.push(...page.matches.map((match) => match.id));
        offset += page.matches.length;
        pages += 1;
        if (!page.hasMore) break;
        // Termination, asserted rather than assumed: an empty page still
        // claiming `hasMore` would otherwise spin here forever.
        expect(page.matches.length).toBeGreaterThan(0);
        expect(pages).toBeLessThanOrEqual(SEEDED);
      }
      expect(walked).toHaveLength(SEEDED);
      expect(new Set(walked).size).toBe(SEEDED);
      expect(pages).toBeGreaterThan(1);
    });

    it('the STATE filter is answered by the database, not after the read', async () => {
      // Every seeded match is SUGGESTED. A filter applied after the read
      // leaves the offset a cursor carries counting rows across every state —
      // a set the caller is not walking.
      seen.length = 0;
      const none = await matches.pageOwn(ACTOR_A1, {
        state: 'CONFIRMED',
        offset: 0,
        limit: PAGE,
      });
      expect(none.matches).toEqual([]);
      expect(none.hasMore).toBe(false);
      expect(measured().map((read) => read.rows)).toEqual([0]);

      seen.length = 0;
      const some = await matches.pageOwn(ACTOR_A1, {
        state: 'SUGGESTED',
        offset: 0,
        limit: PAGE,
      });
      expect(some.matches).toHaveLength(PAGE);
      expect(measured().map((read) => read.rows)).toEqual([PAGE + 1]);
    });

    it('the LAST page reads what is left and reports the end from the same statement', async () => {
      seen.length = 0;
      const page = await matches.pageOwn(ACTOR_A1, {
        state: null,
        offset: SEEDED - 2,
        limit: PAGE,
      });
      expect(page.matches).toHaveLength(2);
      expect(page.hasMore).toBe(false);
      expect(measured().map((read) => read.rows)).toEqual([2]);
    });
  },
);
