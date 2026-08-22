/**
 * ONE TRANSACTION, AT MOST ONE LIVE MATCH — under GENUINE concurrency, against
 * live PostgreSQL, with every contender on its OWN connection.
 *
 * ## What this suite exists to catch
 *
 * `transfer_matches_guard` decides the crossed-side case with a SELECT, and no
 * SELECT sees a row another session has written and not yet committed. So two
 * writers proposing pairings that CROSS SIDES both found nothing, both passed
 * the guard, and both committed — and one of the person's movements ended up
 * explained away twice, with nothing on any screen saying a pairing happened.
 * The two partial unique indexes do not catch that: the two rows collide on no
 * single index entry, which is exactly why the crossing needed a trigger.
 *
 * Migration 0099 now has a third layer —
 * `public.transfer_matches_lock_transaction_pair`, a pair of transaction-scoped
 * advisory locks the writer takes over BOTH transactions, in ascending lock-key
 * order, before it inserts. `PrismaTransferMatchRepository.create` takes them
 * inside the same transaction as the insert. This suite is the evidence that it
 * works, and that the loser is refused in the module's own vocabulary.
 *
 * ## Why concurrency has to mean separate connections
 *
 * Two `await`s in a row are not a race, and neither are two promises on one
 * pooled connection — they queue. Every contender here gets its OWN
 * `PrismaHandle`, therefore its own pool and its own backend, and the
 * contenders are started with `Promise.all`. What the database sees is two (or
 * three) real sessions arriving at the same instant.
 *
 * ## Two layers are driven, deliberately
 *
 *   * **The same-side races run through `SuggestTransferMatch`**, the whole
 *     path a caller uses: retention gate, both transactions resolved, the
 *     domain rule, the pre-check, the write. What is asserted is what a CALLER
 *     receives.
 *   * **The crossed-side races run through the repository.** They cannot be
 *     reached through `SuggestTransferMatch` at all, and the reason is
 *     structural rather than an oversight: that use case decides which side is
 *     which FROM THE SIGNS, so a transaction that is negative is always an
 *     outflow and can never be proposed as an inflow. The crossing is a shape
 *     only a different writer can produce — an ingestion pass, a backfill, an
 *     importer not written yet — which is precisely why it is guarded in the
 *     DATABASE rather than in a use case. The repository is the layer that owns
 *     the lock, so the repository is the layer these drive. The transaction ids
 *     and account ids are real seeded rows; only the side each is proposed on
 *     is the thing under test.
 *
 * ## The ledger
 *
 * Every refusal and every throw this file observes is appended to one ledger,
 * and the last two assertions are made over the whole of it: no refusal was a
 * `store_failure`, and nothing anywhere deadlocked. A race that produces the
 * right row while answering the caller "the store did not answer" has failed at
 * the thing that matters — a caller cannot act on that, and a bulk suggestion
 * pass is built entirely on the difference between "already spoken for, skip
 * it" and "the store broke, stop".
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, Currency, TenantId, UserId } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { RejectTransferMatch } from '../application/use-cases/reject-transfer-match.js';
import { SuggestTransferMatch } from '../application/use-cases/suggest-transfer-match.js';
import { TransactionsMatchableTransactionAdapter } from '../infrastructure/adapters/transactions-matchable-transaction-access.js';
import { PrismaTransferMatchRepository } from '../infrastructure/persistence/prisma-transfer-match-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { suggestTransferMatch, type MatchCandidateSide } from '../domain/transfer-match.js';
import { MatchedAccountRef, TransactionRef, type TransferMatchId } from '../domain/refs.js';
import {
  ACTOR_A1,
  BOOKED,
  buildHandle,
  dropDatabase,
  money,
  probePostgres,
  provisionDatabase,
  seedAccount,
  seedTransaction,
  skipBanner,
  superuserMaintenanceProfile,
  testRetention,
  transactionSeeder,
  transactionsRepository,
  withAdapter,
  type SeededAccount,
  type TransactionSeeder,
} from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'TRANSFER-MATCHING CONCURRENCY TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_match_race`;
const clock = new Clock.Fixed(new Date('2026-08-19T12:00:00.000Z'));
const QAR = Currency.get('QAR');
const TENANT = TenantId.toString(ACTOR_A1.tenantId);
const USER = UserId.toString(ACTOR_A1.userId);

/** How many times the crossed-side race is rerun back to back. */
const CROSSING_REPEATS = 50;
/** How many times the three-way waiting cycle — the deadlock shape — is run. */
const CYCLE_REPEATS = 12;
/**
 * How many genuinely unrelated pairs are raced against each other at once, and
 * therefore how many contenders exist.
 *
 * One contender per pair rather than two contenders taking turns: a handle's
 * pool holds ONE connection here, so two overlapping transactions on one handle
 * would queue on the pool and prove nothing about the database.
 */
const UNRELATED_PAIRS = 6;
const CONTENDERS = UNRELATED_PAIRS;

// ---------------------------------------------------------------------------
// Reading a refusal without reading prose
// ---------------------------------------------------------------------------

/**
 * The SQLSTATE a driver error carries, or null.
 *
 * The same STRUCTURAL read the repository performs, restated here rather than
 * imported: this file has to be able to see a code the repository did NOT map,
 * which is the whole point of asserting that nothing deadlocked and nothing
 * arrived as a store failure. A test that borrowed the mapping under test would
 * be asserting that the mapping agrees with itself.
 */
function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) return null;
  const adapterError = (meta as { driverAdapterError?: unknown }).driverAdapterError;
  if (typeof adapterError !== 'object' || adapterError === null) return null;
  const cause = (adapterError as { cause?: unknown }).cause;
  if (typeof cause !== 'object' || cause === null) return null;
  const code = (cause as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** PostgreSQL's deadlock. Never expected, always fatal to the claim. */
const DEADLOCK_DETECTED = '40P01';
/** PostgreSQL's lock timeout — a lock wait that outlived `lock_timeout`. */
const LOCK_NOT_AVAILABLE = '55P03';

/** What one contender's attempt settled as, in this suite's own vocabulary. */
type Attempt =
  | { readonly kind: 'created'; readonly matchId: string }
  | {
      readonly kind: 'transaction_already_matched';
      readonly conflictingMatchId: string;
      readonly collision: 'SAME_SIDE' | 'CROSSED_SIDES';
      readonly message: string;
    }
  | { readonly kind: 'other_refusal'; readonly refusalKind: string }
  | { readonly kind: 'threw'; readonly sqlState: string | null; readonly name: string };

/**
 * Every attempt the suite observed, in order.
 *
 * Kept because the last assertions are about the WHOLE run rather than about
 * one race: no store failure anywhere, and no deadlock anywhere. Those are
 * claims a per-test assertion cannot make.
 */
const ledger: Attempt[] = [];

function record(attempt: Attempt): Attempt {
  ledger.push(attempt);
  return attempt;
}

const refusals = (attempts: readonly Attempt[]): readonly Attempt[] =>
  attempts.filter((attempt) => attempt.kind !== 'created');

const created = (attempts: readonly Attempt[]): readonly Attempt[] =>
  attempts.filter((attempt) => attempt.kind === 'created');

/**
 * Readers that narrow an attempt to the one field being asserted.
 *
 * Written as accessors rather than inline conditionals so a WRONG kind reads
 * as `null` in the failure message instead of silently satisfying an optional
 * chain: an assertion that passes because a value was `undefined` is the shape
 * of test that stops noticing.
 */
const collisionOf = (attempt: Attempt | undefined): string | null =>
  attempt?.kind === 'transaction_already_matched' ? attempt.collision : null;

const conflictingIdOf = (attempt: Attempt | undefined): string | null =>
  attempt?.kind === 'transaction_already_matched' ? attempt.conflictingMatchId : null;

const matchIdOf = (attempt: Attempt | undefined): string | null =>
  attempt?.kind === 'created' ? attempt.matchId : null;

// ---------------------------------------------------------------------------
// One contender: its own handle, its own pool, its own backend
// ---------------------------------------------------------------------------

interface Session {
  readonly handle: PrismaHandle;
  readonly matches: PrismaTransferMatchRepository;
  readonly suggest: SuggestTransferMatch;
  readonly reject: RejectTransferMatch;
}

function buildSession(): Session {
  const handle = buildHandle(database);
  const matches = new PrismaTransferMatchRepository(handle);
  return {
    handle,
    matches,
    suggest: new SuggestTransferMatch(
      matches,
      new TransactionsMatchableTransactionAdapter(transactionsRepository(handle)),
      testRetention(),
      new Uuidv7IdSource(),
      clock,
    ),
    reject: new RejectTransferMatch(matches, clock),
  };
}

/** One `SuggestTransferMatch` call, as an attempt. It must never throw. */
async function attemptSuggest(
  session: Session,
  firstTransactionId: string,
  secondTransactionId: string,
): Promise<Attempt> {
  try {
    const outcome = await session.suggest.execute(
      { firstTransactionId, secondTransactionId },
      ACTOR_A1,
    );
    if (outcome.ok) return record({ kind: 'created', matchId: outcome.value.id });
    if (outcome.error.kind === 'transaction_already_matched') {
      return record({
        kind: 'transaction_already_matched',
        conflictingMatchId: outcome.error.conflictingMatchId,
        collision: outcome.error.collision,
        message: outcome.error.message,
      });
    }
    // Every other kind is a finding, `store_failure` most of all. Kept as the
    // kind rather than collapsed, so a failure message names what arrived.
    return record({ kind: 'other_refusal', refusalKind: outcome.error.kind });
  } catch (error) {
    return record({
      kind: 'threw',
      sqlState: sqlStateOf(error),
      name: error instanceof Error ? error.name : 'unknown',
    });
  }
}

/** One `create` on a proposal the sign rule could not have produced. */
async function attemptCreate(
  session: Session,
  outflow: MatchCandidateSide,
  inflow: MatchCandidateSide,
): Promise<Attempt> {
  const built = suggestTransferMatch({
    id: new Uuidv7IdSource().nextId() as TransferMatchId,
    tenantId: ACTOR_A1.tenantId,
    userId: ACTOR_A1.userId,
    outflow,
    inflow,
    suggestedAt: clock.now(),
  });
  if (!built.ok) throw new Error(`fixture built an unsuggestable pair: ${built.error.kind}`);
  try {
    const outcome = await session.matches.create(ACTOR_A1, built.value);
    return outcome.kind === 'created'
      ? record({ kind: 'created', matchId: outcome.match.id })
      : record({
          kind: 'transaction_already_matched',
          conflictingMatchId: outcome.conflictingMatchId,
          collision: outcome.collision,
          // The repository outcome carries no sentence of its own; the use
          // case supplies it. Recorded as present so the ledger's shape is
          // uniform.
          message: 'refused by the repository outcome',
        });
  } catch (error) {
    return record({
      kind: 'threw',
      sqlState: sqlStateOf(error),
      name: error instanceof Error ? error.name : 'unknown',
    });
  }
}

// ---------------------------------------------------------------------------
// Candidate sides, and the crossings built out of them
// ---------------------------------------------------------------------------

function side(
  transactionId: string,
  accountId: string,
  minorUnits: bigint,
): MatchCandidateSide {
  return {
    transactionRef: TransactionRef.of(transactionId),
    accountRef: MatchedAccountRef.of(accountId),
    amountMinorUnits: minorUnits,
    currencyCode: 'QAR',
    bookingDate: BOOKED,
  };
}

/** One hundred, in minor units, on each side of a proposal. */
const LEAVING = -10_000n;
const ARRIVING = 10_000n;

// ---------------------------------------------------------------------------
// Rows on the table, counted with RLS BYPASSED
// ---------------------------------------------------------------------------

/**
 * How many live matches name this transaction, counted as the bootstrap
 * superuser.
 *
 * As `karar_app` this would prove the rows are HIDDEN. The claim is that they
 * do not EXIST, and only a count that RLS does not filter can make it.
 */
async function liveMatchesNaming(transactionId: string): Promise<number> {
  return withAdapter(database, 'superuser', async (adapter) => {
    const result = await adapter.query(
      `SELECT count(*)::int AS matched
         FROM public.transfer_matches
        WHERE match_state <> 'REJECTED'
          AND (outflow_transaction_id = $1 OR inflow_transaction_id = $1)`,
      [transactionId],
    );
    return Number((result.rows[0] as { matched: number } | undefined)?.matched ?? -1);
  });
}

/** Every match row, live or rejected, for the one subject these tests use. */
async function allMatchRows(): Promise<number> {
  return withAdapter(database, 'superuser', async (adapter) => {
    const result = await adapter.query(
      `SELECT count(*)::int AS matched FROM public.transfer_matches
        WHERE tenant_id = $1 AND user_id = $2`,
      [TENANT, USER],
    );
    return Number((result.rows[0] as { matched: number } | undefined)?.matched ?? -1);
  });
}

/** Clears the table between repeats, so each repeat is a fresh race. */
async function clearMatches(): Promise<void> {
  await withAdapter(database, 'superuser', async (adapter) => {
    await adapter.query('DELETE FROM public.transfer_matches');
  });
}

// ---------------------------------------------------------------------------

let seedHandle: PrismaHandle;
let seeder: TransactionSeeder;
let sessions: Session[];

/** Four accounts, so every proposal below has two distinct ones. */
let bank: string;
let wallet: string;
let savings: string;
let spare: string;

/** The three transactions the crossed-side races are built from. */
let crossingA: string;
let crossingB: string;
let crossingC: string;

/** Fresh, sign-consistent transactions for the same-side races. */
let sharedOutflow: string;
let inflowOne: string;
let inflowTwo: string;
let sharedInflow: string;
let outflowOne: string;
let outflowTwo: string;

/** Real pairs that share nothing, for the "unrelated pairs" race. */
let unrelated: Array<readonly [string, string]>;

/** Transactions the REJECTED-does-not-block case uses. */
let rejectedPairOutflow: string;
let rejectedPairInflow: string;
let freeInflowOne: string;
let freeInflowTwo: string;

let uniqueDescription = 0;

/** A description no other seeded transaction shares, so dedup never fires. */
function nextDescription(what: string): string {
  uniqueDescription += 1;
  return `Synthetic Test ${what} ${String(uniqueDescription)}`;
}

async function seedOutflow(accountId: string, what: string): Promise<string> {
  return seedTransaction(seeder, ACTOR_A1, {
    accountId,
    magnitude: money(100, QAR),
    direction: 'MONEY_OUT',
    description: nextDescription(what),
  });
}

async function seedInflow(accountId: string, what: string): Promise<string> {
  return seedTransaction(seeder, ACTOR_A1, {
    accountId,
    magnitude: money(100, QAR),
    direction: 'MONEY_IN',
    description: nextDescription(what),
  });
}

describe.skipIf(unreachable !== null)('one live match per transaction, under concurrency', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    seedHandle = buildHandle(database);

    bank = await seedAccount(seedHandle, ACTOR_A1, 'Synthetic Test Bank Account', clock);
    wallet = await seedAccount(seedHandle, ACTOR_A1, 'Synthetic Test Wallet', clock);
    savings = await seedAccount(seedHandle, ACTOR_A1, 'Synthetic Test Savings Account', clock);
    spare = await seedAccount(seedHandle, ACTOR_A1, 'Synthetic Test Spare Account', clock);

    const accounts: SeededAccount[] = [bank, wallet, savings, spare].map((accountId) => ({
      accountId,
      owner: ACTOR_A1,
      currencyCode: 'QAR',
    }));
    seeder = transactionSeeder(seedHandle, accounts, clock);

    crossingA = await seedOutflow(bank, 'Crossing Leg A');
    crossingB = await seedInflow(wallet, 'Crossing Leg B');
    crossingC = await seedOutflow(savings, 'Crossing Leg C');

    sharedOutflow = await seedOutflow(bank, 'Shared Outflow');
    inflowOne = await seedInflow(wallet, 'Counterpart One');
    inflowTwo = await seedInflow(savings, 'Counterpart Two');

    sharedInflow = await seedInflow(wallet, 'Shared Inflow');
    outflowOne = await seedOutflow(bank, 'Origin One');
    outflowTwo = await seedOutflow(savings, 'Origin Two');

    unrelated = [];
    for (let index = 0; index < UNRELATED_PAIRS; index += 1) {
      unrelated.push([
        await seedOutflow(bank, 'Unrelated Outflow'),
        await seedInflow(wallet, 'Unrelated Inflow'),
      ] as const);
    }

    rejectedPairOutflow = await seedOutflow(bank, 'Wrongly Paired Outflow');
    rejectedPairInflow = await seedInflow(wallet, 'Wrongly Paired Inflow');
    freeInflowOne = await seedInflow(savings, 'Right Counterpart');
    freeInflowTwo = await seedInflow(spare, 'Other Counterpart');

    // Two are enough for a pairwise race and three for the waiting cycle that
    // is the classic deadlock shape; the rest exist so the unrelated-pairs race
    // has one connection per contender.
    sessions = Array.from({ length: CONTENDERS }, () => buildSession());
  }, 300_000);

  afterAll(async () => {
    for (const session of sessions ?? []) await session.handle.end().catch(() => {});
    await seedHandle?.end().catch(() => {});
    await dropDatabase(database);
  });

  // -------------------------------------------------------------------------
  // 1 and 2 — the same side, twice, at the same instant
  // -------------------------------------------------------------------------

  it('the same transaction proposed twice as the OUTFLOW settles as exactly one match', async () => {
    const [first, second] = await Promise.all([
      attemptSuggest(sessions[0] as Session, sharedOutflow, inflowOne),
      attemptSuggest(sessions[1] as Session, sharedOutflow, inflowTwo),
    ]);
    const attempts = [first, second] as const;

    expect(created(attempts)).toHaveLength(1);
    expect(refusals(attempts)).toHaveLength(1);
    // The loser is refused in this module's vocabulary — not "the store did
    // not answer", which a caller cannot act on.
    const loser = refusals(attempts)[0];
    expect(loser?.kind).toBe('transaction_already_matched');
    // And it is the SAME side, said so. The guard is BEFORE INSERT, so it
    // fires ahead of the unique index and answers KAR42 even here; the label
    // is read off the surviving row rather than off the code, so it stays
    // true.
    expect(collisionOf(loser)).toBe('SAME_SIDE');

    // NO PARTIAL MATCH: exactly one row names this transaction, counted with
    // RLS bypassed.
    expect(await liveMatchesNaming(sharedOutflow)).toBe(1);
    expect(await liveMatchesNaming(inflowOne)).toBeLessThanOrEqual(1);
    expect(await liveMatchesNaming(inflowTwo)).toBeLessThanOrEqual(1);
  }, 120_000);

  it('the same transaction proposed twice as the INFLOW settles as exactly one match', async () => {
    const [first, second] = await Promise.all([
      attemptSuggest(sessions[0] as Session, sharedInflow, outflowOne),
      attemptSuggest(sessions[1] as Session, sharedInflow, outflowTwo),
    ]);
    const attempts = [first, second] as const;

    expect(created(attempts)).toHaveLength(1);
    expect(refusals(attempts)[0]?.kind).toBe('transaction_already_matched');
    expect(await liveMatchesNaming(sharedInflow)).toBe(1);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 3 and 4 — the crossing, in both directions
  // -------------------------------------------------------------------------

  it('a transaction proposed as the OUTFLOW of one and the INFLOW of another, at once', async () => {
    await clearMatches();
    // crossingB is the INFLOW of the first proposal and the OUTFLOW of the
    // second. No index expresses that collision, and before the claim was
    // taken both proposals passed the guard's SELECT and both committed.
    const [first, second] = await Promise.all([
      attemptCreate(
        sessions[0] as Session,
        side(crossingA, bank, LEAVING),
        side(crossingB, wallet, ARRIVING),
      ),
      attemptCreate(
        sessions[1] as Session,
        side(crossingB, wallet, LEAVING),
        side(crossingC, savings, ARRIVING),
      ),
    ]);
    const attempts = [first, second] as const;

    const loser = refusals(attempts)[0];
    const winner = created(attempts)[0];
    expect(created(attempts)).toHaveLength(1);
    expect(loser?.kind).toBe('transaction_already_matched');
    expect(collisionOf(loser)).toBe('CROSSED_SIDES');
    // The loser names the row it lost to, and that row is the winner's.
    expect(conflictingIdOf(loser)).toBe(matchIdOf(winner));

    expect(await liveMatchesNaming(crossingB)).toBe(1);
    expect(await allMatchRows()).toBe(1);
  }, 120_000);

  it('the crossing the other way round settles the same way', async () => {
    await clearMatches();
    // Now crossingA is the shared one: the OUTFLOW of the first proposal and
    // the INFLOW of the second. Run in the opposite session order too, so the
    // two locks are requested from both directions.
    const [first, second] = await Promise.all([
      attemptCreate(
        sessions[1] as Session,
        side(crossingC, savings, LEAVING),
        side(crossingA, bank, ARRIVING),
      ),
      attemptCreate(
        sessions[0] as Session,
        side(crossingA, bank, LEAVING),
        side(crossingB, wallet, ARRIVING),
      ),
    ]);
    const attempts = [first, second] as const;

    expect(created(attempts)).toHaveLength(1);
    expect(refusals(attempts)[0]?.kind).toBe('transaction_already_matched');
    expect(await liveMatchesNaming(crossingA)).toBe(1);
    expect(await allMatchRows()).toBe(1);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 5 — the lock must not serialize the world
  // -------------------------------------------------------------------------

  it('pairs that share no transaction all succeed, concurrently', async () => {
    await clearMatches();
    // A lock taken over the wrong thing — the table, the subject, a single
    // global key — would still make every assertion above pass while turning
    // every suggestion in the product into a queue of one. Six unrelated pairs
    // go at once and all six must be created.
    const attempts = await Promise.all(
      unrelated.map((pair, index) =>
        attemptSuggest(
          sessions[index % sessions.length] as Session,
          pair[0],
          pair[1],
        ),
      ),
    );
    expect(created(attempts)).toHaveLength(UNRELATED_PAIRS);
    expect(refusals(attempts)).toEqual([]);
    expect(await allMatchRows()).toBe(UNRELATED_PAIRS);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 6 — a rejection is history, not a block
  // -------------------------------------------------------------------------

  it('a REJECTED match does not block a later suggestion, even a raced one', async () => {
    await clearMatches();
    const wrong = await attemptSuggest(
      sessions[0] as Session,
      rejectedPairOutflow,
      rejectedPairInflow,
    );
    expect(wrong.kind).toBe('created');
    const wrongId = wrong.kind === 'created' ? wrong.matchId : '';

    const rejected = await (sessions[0] as Session).reject.execute(
      { matchId: wrongId, expectedVersion: 1 },
      ACTOR_A1,
    );
    expect(rejected.ok).toBe(true);

    // The rejected row is KEPT — without it the same wrong suggestion returns
    // on every import — and it must not stand in the way of the right one.
    // Raced, so what is proved is that the REJECTED row blocks NEITHER
    // contender into failing: exactly one wins, never zero.
    const [first, second] = await Promise.all([
      attemptSuggest(sessions[0] as Session, rejectedPairOutflow, freeInflowOne),
      attemptSuggest(sessions[1] as Session, rejectedPairOutflow, freeInflowTwo),
    ]);
    const attempts = [first, second] as const;

    expect(created(attempts)).toHaveLength(1);
    expect(refusals(attempts)[0]?.kind).toBe('transaction_already_matched');
    // One live match plus the rejection that is still on the table.
    expect(await liveMatchesNaming(rejectedPairOutflow)).toBe(1);
    expect(await allMatchRows()).toBe(2);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 7 — the loser's refusal, in full
  // -------------------------------------------------------------------------

  it('the loser receives the typed refusal a caller can act on', async () => {
    await clearMatches();
    const [first, second] = await Promise.all([
      attemptSuggest(sessions[0] as Session, sharedOutflow, inflowOne),
      attemptSuggest(sessions[1] as Session, sharedOutflow, inflowTwo),
    ]);
    const attempts = [first, second] as const;
    const loser = refusals(attempts)[0];
    const winner = created(attempts)[0];

    expect(loser?.kind).toBe('transaction_already_matched');
    if (loser?.kind !== 'transaction_already_matched') return;
    if (winner?.kind !== 'created') return;

    // It names the row it lost to, and that row is the SUBJECT'S OWN — telling
    // them which match already spoke for the transaction is the entire point,
    // and a caller who could not already see it could not have reached here.
    expect(loser.conflictingMatchId).toBe(winner.matchId);
    expect(loser.collision).toBe('SAME_SIDE');
    // The sentence describes the RULE and carries no amount, no driver text
    // and no SQL — the refusals in this module are about a person's money.
    expect(loser.message).toMatch(/live transfer match/i);
    expect(loser.message.toLowerCase()).not.toContain('sqlstate');
    expect(loser.message.toLowerCase()).not.toContain('insert into');
    expect(loser.message.toLowerCase()).not.toContain('transfer_matches');
  }, 120_000);

  // -------------------------------------------------------------------------
  // 9 — the deadlock shape, run on purpose
  // -------------------------------------------------------------------------

  it('three writers forming a waiting cycle do not deadlock', async () => {
    // {A,B}, {B,C}, {C,A} is the shape that deadlocks a lock order derived
    // from the transaction ids rather than from the lock keys: the hash is not
    // monotonic in the id, so an order over ids is not an order over locks and
    // three sessions can wait in a ring. Every pair here shares a transaction,
    // so exactly ONE may survive.
    for (let repeat = 0; repeat < CYCLE_REPEATS; repeat += 1) {
      await clearMatches();
      const attempts = await Promise.all([
        attemptCreate(
          sessions[0] as Session,
          side(crossingA, bank, LEAVING),
          side(crossingB, wallet, ARRIVING),
        ),
        attemptCreate(
          sessions[1] as Session,
          side(crossingB, wallet, LEAVING),
          side(crossingC, savings, ARRIVING),
        ),
        attemptCreate(
          sessions[2] as Session,
          side(crossingC, savings, LEAVING),
          side(crossingA, bank, ARRIVING),
        ),
      ]);
      expect(created(attempts)).toHaveLength(1);
      expect(refusals(attempts).map((attempt) => attempt.kind)).toEqual([
        'transaction_already_matched',
        'transaction_already_matched',
      ]);
      expect(await allMatchRows()).toBe(1);
    }
  }, 300_000);

  // -------------------------------------------------------------------------
  // The repeat run — the same race, over and over
  // -------------------------------------------------------------------------

  it(`the crossed-side race settles correctly ${String(CROSSING_REPEATS)} times running`, async () => {
    // A concurrency defect that reproduces one time in twenty passes a single
    // run and ships. The counts below are reported rather than only asserted,
    // so a run that went green says how green.
    let bothCommitted = 0;
    let neitherCommitted = 0;
    let storeFailures = 0;
    let deadlocks = 0;
    let lockTimeouts = 0;
    let threw = 0;
    let leftoverRows = 0;

    for (let repeat = 0; repeat < CROSSING_REPEATS; repeat += 1) {
      await clearMatches();
      // Alternate which crossing is run and which session leads it, so both
      // orderings of the two locks are exercised across the run.
      const forward = repeat % 2 === 0;
      const [leader, follower] = forward
        ? [sessions[0] as Session, sessions[1] as Session]
        : [sessions[1] as Session, sessions[0] as Session];
      const attempts = await Promise.all([
        attemptCreate(
          leader,
          side(crossingA, bank, LEAVING),
          side(crossingB, wallet, ARRIVING),
        ),
        forward
          ? attemptCreate(
              follower,
              side(crossingB, wallet, LEAVING),
              side(crossingC, savings, ARRIVING),
            )
          : attemptCreate(
              follower,
              side(crossingC, savings, LEAVING),
              side(crossingA, bank, ARRIVING),
            ),
      ]);

      const winners = created(attempts).length;
      if (winners > 1) bothCommitted += 1;
      if (winners === 0) neitherCommitted += 1;
      for (const attempt of attempts) {
        if (attempt.kind === 'other_refusal' && attempt.refusalKind === 'store_failure') {
          storeFailures += 1;
        }
        if (attempt.kind === 'threw') {
          threw += 1;
          if (attempt.sqlState === DEADLOCK_DETECTED) deadlocks += 1;
          if (attempt.sqlState === LOCK_NOT_AVAILABLE) lockTimeouts += 1;
        }
      }
      const rows = await allMatchRows();
      if (rows !== 1) leftoverRows += 1;
    }

    process.stderr.write(
      [
        '',
        `crossed-side race, ${String(CROSSING_REPEATS)} consecutive runs:`,
        `  both committed (the defect): ${String(bothCommitted)}`,
        `  neither committed:           ${String(neitherCommitted)}`,
        `  store failures:              ${String(storeFailures)}`,
        `  deadlocks (40P01):           ${String(deadlocks)}`,
        `  lock timeouts (55P03):       ${String(lockTimeouts)}`,
        `  throws of any kind:          ${String(threw)}`,
        `  repeats not leaving exactly one row: ${String(leftoverRows)}`,
        '',
      ].join('\n'),
    );

    expect({
      bothCommitted,
      neitherCommitted,
      storeFailures,
      deadlocks,
      lockTimeouts,
      threw,
      leftoverRows,
    }).toEqual({
      bothCommitted: 0,
      neitherCommitted: 0,
      storeFailures: 0,
      deadlocks: 0,
      lockTimeouts: 0,
      threw: 0,
      leftoverRows: 0,
    });
  }, 600_000);

  // -------------------------------------------------------------------------
  // 8 and 9, over the whole run
  // -------------------------------------------------------------------------

  it('no refusal anywhere in this suite was a store failure', () => {
    // The claim the ledger exists for. A race whose loser is told "the store
    // did not answer" has produced the right row and the wrong answer, and a
    // caller cannot tell it apart from a database that fell over.
    expect(ledger.length).toBeGreaterThan(2 * CROSSING_REPEATS);
    const notTyped = ledger.filter(
      (attempt) => attempt.kind === 'other_refusal' || attempt.kind === 'threw',
    );
    expect(notTyped).toEqual([]);
  });

  it('nothing anywhere in this suite deadlocked or timed out on a lock', () => {
    const locking = ledger.filter(
      (attempt) =>
        attempt.kind === 'threw' &&
        (attempt.sqlState === DEADLOCK_DETECTED || attempt.sqlState === LOCK_NOT_AVAILABLE),
    );
    expect(locking).toEqual([]);
  });
});
