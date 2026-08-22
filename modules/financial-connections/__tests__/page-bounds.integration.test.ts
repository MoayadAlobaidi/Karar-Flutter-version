/**
 * PAGE BOUNDS, proved against live PostgreSQL — the claim that listing a
 * subject's connections, or the sources feeding their accounts, costs what
 * the caller asked for rather than what the subject has accumulated.
 *
 * ## Why the assertions are about the database and not about the page
 *
 * A page of `limit` rows proves nothing on its own: a repository that reads
 * every row a subject owns and slices afterwards produces exactly the same
 * page as one that reads `limit + 1`. It was also the shape this surface had
 * — a bounded RESPONSE over an unbounded READ — and it costs more here than
 * elsewhere, because every source link and every connection carries an HSF
 * field that is decrypted on the way out. Reading them all to show four is a
 * key-management call per discarded row.
 *
 * `observingHandle` therefore records the cap each statement carried and the
 * number of rows PostgreSQL actually handed back, and both suites seed more
 * rows than they ask for.
 *
 * ## And the walk
 *
 * The links are seeded to TIE on the two columns the order used to be built
 * from — same source priority, same creation instant — so the walk below
 * passes only because the row id closes the order. Without it the store may
 * return tied rows in either order, and a page boundary between two of them
 * loses one row and repeats another.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { ConfirmProbableSourceLink } from '../application/use-cases/confirm-probable-source-link.js';
import { CreateManualConnection } from '../application/use-cases/create-manual-connection.js';
import { ProposeAccountSourceLink } from '../application/use-cases/propose-account-source-link.js';
import { FinancialAccountsCanonicalAccountAdapter } from '../infrastructure/adapters/financial-accounts-canonical-account-access.js';
import { PrismaAccountSourceLinkRepository } from '../infrastructure/persistence/prisma-account-source-link-repository.js';
import { PrismaFinancialConnectionRepository } from '../infrastructure/persistence/prisma-financial-connection-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  accountsRepository,
  buildHandle,
  dropDatabase,
  observingHandle,
  probePostgres,
  provisionDatabase,
  seedAccount,
  skipBanner,
  superuserMaintenanceProfile,
  testEncryption,
  testFingerprints,
  testRetention,
  type ObservedRead,
} from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'FINANCIAL-CONNECTIONS PAGE-BOUND TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_connections_page_bounds`;
const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));

/** More rows than any page below asks for, so the bound has something to cut. */
const SEEDED = 9;
const PAGE = 4;

const EVERY_LINK = { accountRef: null, connectionId: null, rail: null, status: null } as const;
const EVERY_CONNECTION = { rail: null, status: null, institutionId: null } as const;

let handle: PrismaHandle;
/** Repositories over the OBSERVED handle — the ones under test. */
let links: PrismaAccountSourceLinkRepository;
let connections: PrismaFinancialConnectionRepository;
const seen: ObservedRead[] = [];
/** The seeded connection ids, in seeding order — one link hangs off each. */
const seededConnectionIds: string[] = [];

function measured(model: string): readonly ObservedRead[] {
  return seen.filter((read) => read.model === model);
}

describe.skipIf(unreachable !== null)(
  'connections and source links read ONE PAGE, not the set (live PostgreSQL)',
  () => {
    beforeAll(async () => {
      await provisionDatabase(database);
      handle = buildHandle(database);

      const encryption = testEncryption();
      const retention = testRetention();
      // Seeding runs on the plain handle so nothing it does is measured; the
      // repositories under test run on the observing one.
      const seedingLinks = new PrismaAccountSourceLinkRepository(handle, encryption);
      const seedingConnections = new PrismaFinancialConnectionRepository(handle, encryption);
      const observed = observingHandle(handle, seen);
      links = new PrismaAccountSourceLinkRepository(observed, encryption);
      connections = new PrismaFinancialConnectionRepository(observed, encryption);

      const createConnection = new CreateManualConnection(
        seedingConnections,
        retention,
        new Uuidv7IdSource(),
        clock,
      );
      const propose = new ProposeAccountSourceLink(
        seedingLinks,
        seedingConnections,
        new FinancialAccountsCanonicalAccountAdapter(accountsRepository(handle)),
        testFingerprints(),
        retention,
        new Uuidv7IdSource(),
        clock,
      );
      const confirm = new ConfirmProbableSourceLink(seedingLinks, clock);

      const account = await seedAccount(handle, ACTOR_A1, 'Synthetic Test Account One', clock);
      for (let index = 0; index < SEEDED; index += 1) {
        const created = await createConnection.execute(
          {
            rail: 'MANUAL',
            displayLabel: `Synthetic Test Connection ${String(index)}`,
            institutionRef: null,
          },
          ACTOR_A1,
        );
        if (!created.ok) throw new Error(`connection fixture refused: ${created.error.kind}`);
        seededConnectionIds.push(created.value.id);
        // One link per connection, all against ONE account: same default
        // source priority, and one fixed clock instant, so every pair ties on
        // both of the columns the ordering used to rest on.
        const proposed = await propose.execute(
          {
            connectionId: created.value.id,
            candidateAccountId: account,
            externalAccountReference: `SYNTHETIC-SRC-ACCT-${String(index)}`,
          },
          ACTOR_A1,
        );
        if (!proposed.ok) throw new Error(`link fixture refused: ${proposed.error.kind}`);
        const settled = await confirm.execute(
          {
            linkId: proposed.value.link.id,
            expectedVersion: proposed.value.link.version,
          },
          ACTOR_A1,
        );
        if (!settled.ok) throw new Error(`link confirmation refused: ${settled.error.kind}`);
      }
      seen.length = 0;
    }, 180_000);

    afterAll(async () => {
      await handle?.end().catch(() => {});
      await dropDatabase(database);
    });

    it('the SOURCE-LINK listing asks the database for at most limit + 1 rows', async () => {
      seen.length = 0;
      const page = await links.pageOwn(ACTOR_A1, { ...EVERY_LINK, offset: 0, limit: PAGE });

      expect(page.links).toHaveLength(PAGE);
      expect(page.hasMore).toBe(true);

      const reads = measured('accountSourceLink');
      expect(reads.map((read) => read.take)).toEqual([PAGE + 1]);
      expect(reads.map((read) => read.rows)).toEqual([PAGE + 1]);
      expect(reads[0]?.rows).toBeLessThan(SEEDED);
    });

    it('the CONNECTION listing asks the database for at most limit + 1 rows', async () => {
      seen.length = 0;
      const page = await connections.pageOwn(ACTOR_A1, {
        ...EVERY_CONNECTION,
        offset: 0,
        limit: PAGE,
      });

      expect(page.connections).toHaveLength(PAGE);
      expect(page.hasMore).toBe(true);

      const reads = measured('financialConnection');
      expect(reads.map((read) => read.take)).toEqual([PAGE + 1]);
      expect(reads.map((read) => read.rows)).toEqual([PAGE + 1]);
      expect(reads[0]?.rows).toBeLessThan(SEEDED);
    });

    it('a cursor walk over TIED source links sees every row exactly once', async () => {
      const walked: string[] = [];
      let offset = 0;
      let pages = 0;
      for (;;) {
        // The controller advances the offset by what it returned, which is
        // exactly what the opaque cursor encodes.
        const page = await links.pageOwn(ACTOR_A1, { ...EVERY_LINK, offset, limit: PAGE });
        walked.push(...page.links.map((link) => link.id));
        offset += page.links.length;
        pages += 1;
        if (!page.hasMore) break;
        // Termination, asserted rather than assumed: an empty page still
        // claiming `hasMore` would otherwise spin here forever.
        expect(page.links.length).toBeGreaterThan(0);
        expect(pages).toBeLessThanOrEqual(SEEDED);
      }
      expect(walked).toHaveLength(SEEDED);
      expect(new Set(walked).size).toBe(SEEDED);
      expect(pages).toBeGreaterThan(1);
    });

    it('a cursor walk over the CONNECTIONS sees every row exactly once', async () => {
      const walked: string[] = [];
      let offset = 0;
      let pages = 0;
      for (;;) {
        const page = await connections.pageOwn(ACTOR_A1, {
          ...EVERY_CONNECTION,
          offset,
          limit: PAGE,
        });
        walked.push(...page.connections.map((connection) => connection.id));
        offset += page.connections.length;
        pages += 1;
        if (!page.hasMore) break;
        expect(page.connections.length).toBeGreaterThan(0);
        expect(pages).toBeLessThanOrEqual(SEEDED);
      }
      expect(walked).toHaveLength(SEEDED);
      expect(new Set(walked).size).toBe(SEEDED);
      expect(pages).toBeGreaterThan(1);
    });

    it('narrowing links to ONE connection is done by the database', async () => {
      // The unbounded `listOwnForConnection` was the only way to read the
      // links one connection feeds, and it read all of them. It is gone, and
      // this is what replaced it: the same question asked of the paged read.
      // A filter applied after the read would have pulled a whole page and
      // then thrown most of it away, which is the shape the removal existed
      // to prevent.
      seen.length = 0;
      const page = await links.pageOwn(ACTOR_A1, {
        ...EVERY_LINK,
        connectionId: seededConnectionIds[0] as never,
        offset: 0,
        limit: PAGE,
      });

      expect(page.links).toHaveLength(1);
      expect(page.hasMore).toBe(false);
      // ONE row read, not a page of them, and not every link the subject owns.
      expect(measured('accountSourceLink').map((read) => read.rows)).toEqual([1]);
    });

    it('narrowing to a connection that feeds no link reads nothing at all', async () => {
      seen.length = 0;
      const page = await links.pageOwn(ACTOR_A1, {
        ...EVERY_LINK,
        // A well-formed id belonging to no seeded connection.
        connectionId: '00000000-0000-4000-8000-000000000000' as never,
        offset: 0,
        limit: PAGE,
      });

      expect(page.links).toEqual([]);
      expect(page.hasMore).toBe(false);
      expect(measured('accountSourceLink').map((read) => read.rows)).toEqual([0]);
    });

    it('a narrowed listing is narrowed BY THE DATABASE, not after the read', async () => {
      // A filter applied afterwards would make the offset a cursor carries
      // count rows in the unfiltered set. This asks for a rail no seeded
      // connection has: a store that narrowed reads nothing, one that
      // narrowed afterwards would still have read a page.
      seen.length = 0;
      const page = await connections.pageOwn(ACTOR_A1, {
        ...EVERY_CONNECTION,
        rail: 'USER_FILE_UPLOAD',
        offset: 0,
        limit: PAGE,
      });
      expect(page.connections).toEqual([]);
      expect(page.hasMore).toBe(false);
      expect(measured('financialConnection').map((read) => read.rows)).toEqual([0]);
    });
  },
);
