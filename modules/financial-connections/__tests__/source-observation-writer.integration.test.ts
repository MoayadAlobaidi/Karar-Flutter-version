/**
 * `PrismaSourceObservationWriter` against live PostgreSQL — the seam through
 * which `modules/statement-imports` reports that a delivery arrived, without
 * ever writing a row in this module's table.
 *
 * The properties under test are the ones the boundary move turns on, and each
 * of them is a way it could have gone wrong:
 *
 *  1. **It writes what an observation is, and nothing else.** The window, the
 *     coverage and the concurrency token move; the account, the connection,
 *     the fingerprint, the status and the subject's confirmation do not. A
 *     write that could promote a probable match by delivering data is the
 *     defect ADR-0028 exists to prevent, so its absence is asserted column by
 *     column rather than assumed from the shape of the `data` object.
 *  2. **It advances the token by exactly one.** `account_source_links_guard`
 *     raises `KAR22` on any UPDATE that does not, so a writer that forgot
 *     would not skip the increment quietly — it would abort the caller's whole
 *     statement commit. This is the assertion that would have caught the
 *     direct write this move replaced, which never set `version` at all.
 *  3. **It opens no transaction of its own.** A caller that rolls back leaves
 *     the link exactly as it was, which is what makes "everything, or nothing"
 *     true across two modules rather than only inside one.
 *  4. **Zero matching links is an ordinary answer.** A person may import a
 *     file through no connection at all, and an import must not fail because
 *     the route it arrived by is gone.
 *  5. **A link this observation could not lawfully move is left alone**, not
 *     raised over: a `first_observed_at` in the future is a clock problem on
 *     one row of this module's table, and it is not somebody's statement
 *     import's to answer.
 *
 * Rows are counted and read back **as the bootstrap superuser with RLS
 * bypassed**, because reading as `karar_app` would prove what is visible
 * rather than what is stored.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CalendarDay, Clock } from '@karar/shared-kernel';
import { withPrincipalContext } from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { ConfirmProbableSourceLink } from '../application/use-cases/confirm-probable-source-link.js';
import { CreateManualConnection } from '../application/use-cases/create-manual-connection.js';
import { ProposeAccountSourceLink } from '../application/use-cases/propose-account-source-link.js';
import type { ConnectionsPrincipal } from '../application/principal.js';
import { FinancialConnectionsStoreError } from '../domain/errors.js';
import { CanonicalAccountRef, type FinancialConnectionId } from '../domain/refs.js';
import { FinancialAccountsCanonicalAccountAdapter } from '../infrastructure/adapters/financial-accounts-canonical-account-access.js';
import { PrismaAccountSourceLinkRepository } from '../infrastructure/persistence/prisma-account-source-link-repository.js';
import { PrismaFinancialConnectionRepository } from '../infrastructure/persistence/prisma-financial-connection-repository.js';
import { PrismaSourceObservationWriter } from '../infrastructure/persistence/prisma-source-observation-writer.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  SYNTHETIC_SOURCE_REF_ONE,
  SYNTHETIC_SOURCE_REF_TWO,
  accountsRepository,
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  seedAccount,
  skipBanner,
  superuserMaintenanceProfile,
  testEncryption,
  testFingerprints,
  testRetention,
  withAdapter,
} from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'FINANCIAL-CONNECTIONS SOURCE OBSERVATION TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_connections_observation`;
const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));

/** The delivery every test reports unless it is testing a different one. */
const DELIVERED_AT = new Date('2026-08-19T09:30:00.000Z');
const COVERAGE = { start: CalendarDay.of(2026, 8, 1), end: CalendarDay.of(2026, 8, 18) };

let handle: PrismaHandle;
let createConnection: CreateManualConnection;
let propose: ProposeAccountSourceLink;
let confirm: ConfirmProbableSourceLink;
let writer: PrismaSourceObservationWriter;

let linkedAccount = '';
let unlinkedAccount = '';
let connectionId: FinancialConnectionId;

/** One link row, exactly as stored — read with RLS bypassed. */
interface StoredLink {
  readonly id: string;
  readonly account_id: string;
  readonly connection_id: string;
  readonly source_status: string;
  readonly match_basis: string;
  readonly subject_confirmed_at: Date | null;
  readonly source_account_fingerprint: string;
  readonly source_priority: number;
  readonly first_observed_at: Date;
  readonly last_observed_at: Date;
  readonly last_successful_import_at: Date | null;
  /**
   * The two `date` columns as TEXT, not as `Date`.
   *
   * A `date` read through the driver becomes local midnight, and this server
   * runs on `Asia/Qatar` — so a stored `2026-08-01` arrives as an instant
   * whose UTC day is the 31st of July. Comparing the day as the database
   * spells it is the only reading that cannot be moved by the host's zone
   * (ADR-0027).
   */
  readonly coverage_start_text: string | null;
  readonly coverage_end_text: string | null;
  readonly balance_capability: string;
  readonly version: number;
  readonly updated_at: Date;
}

async function storedLinks(accountId: string): Promise<readonly StoredLink[]> {
  return withAdapter(database, 'superuser', async (adapter) => {
    const rows = await adapter.query<StoredLink>(
      // Ordered by id, which is UUIDv7 and therefore creation order. The
      // clock is fixed in these fixtures, so `created_at` is identical across
      // both links and would not order them at all.
      `SELECT *, history_coverage_start::text AS coverage_start_text,
              history_coverage_end::text AS coverage_end_text
         FROM public.account_source_links WHERE account_id = $1 ORDER BY id`,
      [accountId],
    );
    return rows.rows;
  });
}

/** A confirmed link from the shared connection to `accountId`. */
async function link(accountId: string, reference: string): Promise<string> {
  const proposed = await propose.execute(
    {
      connectionId,
      candidateAccountId: accountId,
      externalAccountReference: reference,
    },
    ACTOR_A1,
  );
  if (!proposed.ok) throw new Error(`fixture could not propose a link: ${proposed.error.kind}`);
  const settled = await confirm.execute(
    { linkId: proposed.value.link.id, expectedVersion: proposed.value.link.version },
    ACTOR_A1,
  );
  if (!settled.ok) throw new Error(`fixture could not confirm a link: ${settled.error.kind}`);
  return proposed.value.link.id;
}

/**
 * The writer, on a transaction opened here exactly as the ingestion module's
 * unit of work opens it. `andThen` runs after the write, inside the same
 * transaction, so a test can prove what a rollback leaves behind.
 */
async function observe(
  actor: ConnectionsPrincipal,
  accountId: string,
  delivery: { observedAt?: Date; coverage?: { start: CalendarDay; end: CalendarDay } } = {},
  andThen?: () => Promise<void>,
): Promise<number> {
  return withPrincipalContext(
    handle,
    { tenantId: actor.tenantId, userId: actor.userId },
    async (tx) => {
      const moved = await writer.recordDeliveryObserved({ unit: tx }, actor, {
        connectionId,
        accountRef: CanonicalAccountRef.of(accountId),
        observedAt: delivery.observedAt ?? DELIVERED_AT,
        historyCoverage: delivery.coverage ?? COVERAGE,
      });
      if (andThen) await andThen();
      return moved;
    },
    { require: ['tenantId', 'userId'] },
  );
}

describe.skipIf(unreachable !== null)('source observation writer against live PostgreSQL', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);

    const encryption = testEncryption();
    const links = new PrismaAccountSourceLinkRepository(handle, encryption);
    const connections = new PrismaFinancialConnectionRepository(handle, encryption);
    const retention = testRetention();

    createConnection = new CreateManualConnection(
      connections,
      retention,
      new Uuidv7IdSource(),
      clock,
    );
    propose = new ProposeAccountSourceLink(
      links,
      connections,
      new FinancialAccountsCanonicalAccountAdapter(accountsRepository(handle)),
      testFingerprints(),
      retention,
      new Uuidv7IdSource(),
      clock,
    );
    confirm = new ConfirmProbableSourceLink(links, clock);
    writer = new PrismaSourceObservationWriter();

    linkedAccount = await seedAccount(handle, ACTOR_A1, 'Synthetic Test Account Linked', clock);
    unlinkedAccount = await seedAccount(
      handle,
      ACTOR_A1,
      'Synthetic Test Account Unlinked',
      clock,
    );

    const created = await createConnection.execute(
      {
        rail: 'USER_FILE_UPLOAD',
        displayLabel: 'Synthetic Test Connection Upload',
        institutionRef: null,
      },
      ACTOR_A1,
    );
    if (!created.ok) throw new Error('fixture could not create a synthetic connection');
    connectionId = created.value.id;

    // TWO source accounts behind one connection, both feeding one canonical
    // account — the ordinary case for a file that lists a current account
    // under two source references. Both delivered, so both must move.
    await link(linkedAccount, SYNTHETIC_SOURCE_REF_ONE);
    await link(linkedAccount, SYNTHETIC_SOURCE_REF_TWO);
  }, 180_000);

  afterAll(async () => {
    await handle?.end().catch(() => {});
    await dropDatabase(database);
  });

  it('records the observation on every link that delivered, and moves nothing else', async () => {
    const before = await storedLinks(linkedAccount);
    expect(before).toHaveLength(2);

    const moved = await observe(ACTOR_A1, linkedAccount);
    expect(moved).toBe(2);

    const after = await storedLinks(linkedAccount);
    expect(after).toHaveLength(2);
    for (const [index, row] of after.entries()) {
      const was = before[index];
      if (was === undefined) throw new Error('unreachable');

      // What an observation is.
      expect(row.last_observed_at.toISOString()).toBe(DELIVERED_AT.toISOString());
      expect(row.last_successful_import_at?.toISOString()).toBe(DELIVERED_AT.toISOString());
      expect(row.coverage_start_text).toBe('2026-08-01');
      expect(row.coverage_end_text).toBe('2026-08-18');

      // Exactly one, enforced by `account_source_links_guard` (KAR22). A
      // writer that omitted it would not under-count here — it would have
      // aborted the caller's transaction above.
      expect(row.version).toBe(was.version + 1);
      expect(row.updated_at.getTime()).toBeGreaterThanOrEqual(was.updated_at.getTime());

      // And everything that says WHAT this link is, unmoved. A delivery is a
      // report; it decides nothing about which account a source feeds or
      // whether the person agreed to it.
      expect(row.id).toBe(was.id);
      expect(row.account_id).toBe(was.account_id);
      expect(row.connection_id).toBe(was.connection_id);
      expect(row.source_status).toBe(was.source_status);
      expect(row.match_basis).toBe(was.match_basis);
      expect(row.subject_confirmed_at?.toISOString() ?? null).toBe(
        was.subject_confirmed_at?.toISOString() ?? null,
      );
      expect(row.source_account_fingerprint).toBe(was.source_account_fingerprint);
      expect(row.source_priority).toBe(was.source_priority);
      expect(row.first_observed_at.toISOString()).toBe(was.first_observed_at.toISOString());
      // A file arriving says nothing about whether the source provides
      // balances, and this port has no way to claim it does.
      expect(row.balance_capability).toBe(was.balance_capability);
    }
  }, 60_000);

  it('opens no transaction of its own: a rollback leaves the links exactly as they were', async () => {
    const before = await storedLinks(linkedAccount);
    const later = new Date('2026-08-20T09:30:00.000Z');

    await expect(
      observe(ACTOR_A1, linkedAccount, { observedAt: later }, () => {
        // The caller's unit fails AFTER the observation was written, which is
        // where a writer that had opened its own transaction would show: its
        // work would already be committed and would survive this throw.
        throw new Error('synthetic failure inside the caller unit of work');
      }),
    ).rejects.toThrow('synthetic failure inside the caller unit of work');

    const after = await storedLinks(linkedAccount);
    expect(after.map((row) => [row.version, row.last_observed_at.toISOString()])).toEqual(
      before.map((row) => [row.version, row.last_observed_at.toISOString()]),
    );
  }, 60_000);

  it('answers zero, and writes nothing, when no link matches', async () => {
    const before = await storedLinks(linkedAccount);

    // An account this connection does not feed. Nothing to report, nothing
    // reported — and above all, nothing created: this port cannot make a link.
    const moved = await observe(ACTOR_A1, unlinkedAccount);
    expect(moved).toBe(0);
    expect(await storedLinks(unlinkedAccount)).toEqual([]);

    // And the links that DO exist were untouched by the miss.
    expect(await storedLinks(linkedAccount)).toEqual(before);
  }, 60_000);

  it('leaves a link first observed after the delivery alone rather than failing the caller', async () => {
    // A clock problem on one row of this module's table: `first_observed_at`
    // in the future. `account_source_links_observation_order_check` would
    // refuse the write, which inside a statement commit means somebody's
    // import fails over a freshness report about a row they never saw. The
    // predicate excludes such links instead, and the count says so.
    await withAdapter(database, 'superuser', async (adapter) => {
      // The whole window moves together, and the token with it: the guard
      // and both order CHECKs hold for the superuser too, which is itself
      // worth seeing — the rules this writer obeys are the table's, not the
      // repository's.
      await adapter.query(
        `UPDATE public.account_source_links
            SET first_observed_at        = $1,
                last_observed_at         = $1,
                last_successful_import_at = $1,
                version                  = version + 1
          WHERE account_id = $2`,
        [new Date('2027-01-01T00:00:00.000Z'), linkedAccount],
      );
    });

    const before = await storedLinks(linkedAccount);
    const moved = await observe(ACTOR_A1, linkedAccount);
    expect(moved).toBe(0);
    expect(await storedLinks(linkedAccount)).toEqual(before);
  }, 60_000);

  it('refuses a coverage range that ends before it begins, without quoting the driver', async () => {
    // A caller defect rather than a fact about anyone's data. It is refused
    // here, in this module's own words, rather than reaching
    // `account_source_links_history_coverage_order` and coming back as driver
    // text inside somebody else's transaction.
    await expect(
      observe(ACTOR_A1, linkedAccount, {
        coverage: { start: CalendarDay.of(2026, 8, 18), end: CalendarDay.of(2026, 8, 1) },
      }),
    ).rejects.toBeInstanceOf(FinancialConnectionsStoreError);
  }, 60_000);
});
