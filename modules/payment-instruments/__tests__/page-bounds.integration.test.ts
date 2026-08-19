/**
 * PAGE BOUNDS, proved against live PostgreSQL — the claim that listing what
 * spends from an account costs what the caller asked for rather than however
 * many cards a person has ever held.
 *
 * ## Why the assertions are about the database and not about the page
 *
 * A page of `limit` rows proves nothing on its own: a repository that reads
 * every instrument a subject owns and slices afterwards produces exactly the
 * same page as one that reads `limit + 1`. It was also the shape this surface
 * had — a bounded RESPONSE over an unbounded READ — and nothing in the schema
 * limits the read, deliberately: no constraint may forbid a second card, so
 * "how many instruments exist" is a fact about usage and never about the
 * model. Each row also costs a key-management call to decrypt its mask and
 * its label, so reading them all to show four is a call per discarded row.
 *
 * `observingHandle` records the cap each statement carried and the number of
 * rows PostgreSQL handed back, and the suite seeds more rows than it asks for.
 *
 * ## What is NOT asserted here, on purpose
 *
 * Nothing counts the instruments. The module has no method that returns a
 * figure about an account's cards, this suite adds none, and `hasMore` is a
 * boolean answering "ask again?" rather than a quantity — see the
 * no-money-arithmetic suite for why that distinction is load-bearing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { RecordPaymentInstrument } from '../application/use-cases/record-payment-instrument.js';
import { FinancialAccountsBalanceBearingAccountAdapter } from '../infrastructure/adapters/financial-accounts-balance-bearing-account-access.js';
import { PrismaPaymentInstrumentRepository } from '../infrastructure/persistence/prisma-payment-instrument-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  accountsRepository,
  buildHandle,
  dropDatabase,
  observingHandle,
  probePostgres,
  provisionDatabase,
  seedWallet,
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
      'PAYMENT-INSTRUMENTS PAGE-BOUND TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_instrument_page_bounds`;
const clock = new Clock.Fixed(new Date('2026-08-19T12:00:00.000Z'));

/** More rows than any page below asks for, so the bound has something to cut. */
const SEEDED = 9;
const PAGE = 4;

const EVERY_INSTRUMENT = {
  accountRef: null,
  instrumentType: null,
  status: null,
  spendable: null,
} as const;

let handle: PrismaHandle;
/** The repository under test, over the OBSERVED handle. */
let instruments: PrismaPaymentInstrumentRepository;
let walletId: string;
const seen: ObservedRead[] = [];

function measured(): readonly ObservedRead[] {
  return seen.filter((read) => read.model === 'paymentInstrument');
}

describe.skipIf(unreachable !== null)(
  'payment instruments read ONE PAGE, not the set (live PostgreSQL)',
  () => {
    beforeAll(async () => {
      await provisionDatabase(database);
      handle = buildHandle(database);

      const encryption = testEncryption();
      // Seeding runs on the plain handle so nothing it does is measured; the
      // repository under test runs on the observing one.
      const seeding = new PrismaPaymentInstrumentRepository(handle, encryption);
      instruments = new PrismaPaymentInstrumentRepository(
        observingHandle(handle, seen),
        encryption,
      );
      const record = new RecordPaymentInstrument(
        seeding,
        new FinancialAccountsBalanceBearingAccountAdapter(accountsRepository(handle)),
        testRetention(),
        new Uuidv7IdSource(),
        clock,
      );

      walletId = await seedWallet(handle, ACTOR_A1, 'Synthetic Test Wallet Alpha', clock);
      // All against ONE wallet, all at one fixed clock instant: every pair
      // ties on `created_at`, so only the row id makes the order total.
      for (let index = 0; index < SEEDED; index += 1) {
        const created = await record.execute(
          {
            accountId: walletId,
            instrumentType: 'VIRTUAL_CARD',
            mask: `000${String(index)}`,
            displayLabel: `Synthetic Test Card ${String(index)}`,
          },
          ACTOR_A1,
        );
        if (!created.ok) throw new Error(`instrument fixture refused: ${created.error.kind}`);
      }
      seen.length = 0;
    }, 180_000);

    afterAll(async () => {
      await handle?.end().catch(() => {});
      await dropDatabase(database);
    });

    it('the listing asks the database for at most limit + 1 rows', async () => {
      seen.length = 0;
      const page = await instruments.pageOwn(ACTOR_A1, {
        ...EVERY_INSTRUMENT,
        offset: 0,
        limit: PAGE,
      });

      // The page itself is unremarkable and is not the claim.
      expect(page.instruments).toHaveLength(PAGE);
      expect(page.hasMore).toBe(true);

      // The claim: ONE statement, capped, and the database returned the cap
      // rather than every card the subject holds.
      const reads = measured();
      expect(reads.map((read) => read.take)).toEqual([PAGE + 1]);
      expect(reads.map((read) => read.rows)).toEqual([PAGE + 1]);
      expect(reads[0]?.rows).toBeLessThan(SEEDED);
    });

    it('narrowing to one account does not lift the bound', async () => {
      // The question this module exists to answer — what spends from this
      // account — is the one most likely to be treated as small enough to
      // read whole. Every seeded card is on this wallet, so an unbounded read
      // would come back with all of them.
      seen.length = 0;
      const page = await instruments.pageOwn(ACTOR_A1, {
        ...EVERY_INSTRUMENT,
        accountRef: { referenceType: 'FINANCIAL_ACCOUNT', accountId: walletId },
        offset: 0,
        limit: PAGE,
      });
      expect(page.instruments).toHaveLength(PAGE);
      expect(measured().map((read) => read.rows)).toEqual([PAGE + 1]);
    });

    it('a cursor walk over TIED instruments sees every row exactly once', async () => {
      const walked: string[] = [];
      let offset = 0;
      let pages = 0;
      for (;;) {
        // The controller advances the offset by what it returned, which is
        // exactly what the opaque cursor encodes.
        const page = await instruments.pageOwn(ACTOR_A1, {
          ...EVERY_INSTRUMENT,
          offset,
          limit: PAGE,
        });
        walked.push(...page.instruments.map((instrument) => instrument.id));
        offset += page.instruments.length;
        pages += 1;
        if (!page.hasMore) break;
        // Termination, asserted rather than assumed: an empty page still
        // claiming `hasMore` would otherwise spin here forever.
        expect(page.instruments.length).toBeGreaterThan(0);
        expect(pages).toBeLessThanOrEqual(SEEDED);
      }
      expect(walked).toHaveLength(SEEDED);
      expect(new Set(walked).size).toBe(SEEDED);
      expect(pages).toBeGreaterThan(1);
    });

    it('the SPENDABLE filter is answered by the database, not after the read', async () => {
      // Every seeded card is ACTIVE, so `spendable: false` must match nothing
      // — and must do so by reading nothing, because a filter applied after
      // the read leaves the offset counting rows in the unfiltered set.
      seen.length = 0;
      const none = await instruments.pageOwn(ACTOR_A1, {
        ...EVERY_INSTRUMENT,
        spendable: false,
        offset: 0,
        limit: PAGE,
      });
      expect(none.instruments).toEqual([]);
      expect(none.hasMore).toBe(false);
      expect(measured().map((read) => read.rows)).toEqual([0]);

      seen.length = 0;
      const some = await instruments.pageOwn(ACTOR_A1, {
        ...EVERY_INSTRUMENT,
        spendable: true,
        offset: 0,
        limit: PAGE,
      });
      expect(some.instruments).toHaveLength(PAGE);
      expect(measured().map((read) => read.rows)).toEqual([PAGE + 1]);
    });
  },
);
