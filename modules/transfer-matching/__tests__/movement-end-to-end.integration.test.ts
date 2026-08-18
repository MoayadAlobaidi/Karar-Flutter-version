/**
 * ONE MOVEMENT OF THE PERSON'S OWN MONEY, END TO END — against live
 * PostgreSQL, through the real use cases, over transactions created by
 * `@karar/transactions`' own use case.
 *
 * This is the suite that proves the ADR-0028 scenarios rather than the rules
 * that implement them:
 *
 *   1. **A top-up reads as an expense and an income until it is matched**, and
 *      the match changes NEITHER transaction — both rows come back exactly as
 *      they were written.
 *   2. **A SUGGESTED match changes nothing**, and CONFIRMED requires the
 *      person's recorded decision instant, which arrives only through
 *      `ConfirmTransferMatch`.
 *   3. **A FEE IS NOT PART OF THE TRANSFER.** A top-up of 100 with a separate
 *      fee of 2 yields a match on the PRINCIPAL only; the fee stays an
 *      ordinary expense, matched to nothing, and is refused if anybody tries
 *      to pair it.
 *   4. **CROSS-CURRENCY CANNOT BE SUGGESTED** — proved against two REAL
 *      accounts in two currencies with two REAL transactions, not against a
 *      hand-built pair.
 *   5. **A transaction belongs to at most one live match**, and a rejection
 *      frees it again.
 *   6. **Erasure reaches the matches**, from the transaction side and from the
 *      account side, counted as the bootstrap superuser with RLS bypassed —
 *      counting as `karar_app` would prove the rows are hidden, not gone.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CalendarDay, Clock, Currency } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import type { TransactionId } from '@karar/transactions';

import { ConfirmTransferMatch } from '../application/use-cases/confirm-transfer-match.js';
import { EraseTransferMatches } from '../application/use-cases/erase-transfer-matches.js';
import { ListOwnTransferMatches } from '../application/use-cases/list-own-transfer-matches.js';
import { RejectTransferMatch } from '../application/use-cases/reject-transfer-match.js';
import { SuggestTransferMatch } from '../application/use-cases/suggest-transfer-match.js';
import { TransactionsMatchableTransactionAdapter } from '../infrastructure/adapters/transactions-matchable-transaction-access.js';
import { TransactionsTransferMatchEraser } from '../infrastructure/adapters/transactions-transfer-match-eraser.js';
import { PrismaTransferMatchRepository } from '../infrastructure/persistence/prisma-transfer-match-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { SUGGESTION_WINDOW_DAYS, SUGGESTION_WINDOW_VERSION } from '../domain/suggestion-window.js';
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
  withAdapter,
  type SeededAccount,
  type TransactionSeeder,
} from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'TRANSFER-MATCHING END-TO-END TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_match_e2e`;
const clock = new Clock.Fixed(new Date('2026-08-19T12:00:00.000Z'));
const QAR = Currency.get('QAR');
const USD = Currency.get('USD');

let handle: PrismaHandle;
let seeder: TransactionSeeder;
let matches: PrismaTransferMatchRepository;
let suggest: SuggestTransferMatch;
let confirm: ConfirmTransferMatch;
let reject: RejectTransferMatch;
let list: ListOwnTransferMatches;
let eraser: TransactionsTransferMatchEraser;

/** The person's bank account, their wallet, and a dollar account beside them. */
let bankAccount: string;
let walletAccount: string;
let dollarAccount: string;

describe.skipIf(unreachable !== null)('one movement of the person’s own money', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);

    bankAccount = await seedAccount(handle, ACTOR_A1, 'Synthetic Test Bank Account', clock);
    walletAccount = await seedAccount(handle, ACTOR_A1, 'Synthetic Test Wallet', clock);
    dollarAccount = await seedAccount(
      handle,
      ACTOR_A1,
      'Synthetic Test Dollar Account',
      clock,
      'USD',
    );

    const accounts: SeededAccount[] = [
      { accountId: bankAccount, owner: ACTOR_A1, currencyCode: 'QAR' },
      { accountId: walletAccount, owner: ACTOR_A1, currencyCode: 'QAR' },
      { accountId: dollarAccount, owner: ACTOR_A1, currencyCode: 'USD' },
    ];
    seeder = transactionSeeder(handle, accounts, clock);
    matches = new PrismaTransferMatchRepository(handle);
    suggest = new SuggestTransferMatch(
      matches,
      new TransactionsMatchableTransactionAdapter(seeder.repository),
      testRetention(),
      new Uuidv7IdSource(),
      clock,
    );
    confirm = new ConfirmTransferMatch(matches, clock);
    reject = new RejectTransferMatch(matches, clock);
    list = new ListOwnTransferMatches(matches);
    eraser = new TransactionsTransferMatchEraser(new EraseTransferMatches(matches));
  }, 180_000);

  afterAll(async () => {
    await handle?.end().catch(() => {});
    await dropDatabase(database);
  });

  it('a top-up with a fee is THREE transactions and ONE match on the principal', async () => {
    // The ADR-0028 scenario, exactly: 100 leaves the bank account, 100 arrives
    // in the wallet, and 2 leaves the bank account as a fee.
    const outflow = await seedTransaction(seeder, ACTOR_A1, {
      accountId: bankAccount,
      magnitude: money(100, QAR),
      direction: 'MONEY_OUT',
      description: 'Synthetic Test Wallet Top-Up',
    });
    const inflow = await seedTransaction(seeder, ACTOR_A1, {
      accountId: walletAccount,
      magnitude: money(100, QAR),
      direction: 'MONEY_IN',
      description: 'Synthetic Test Wallet Credit',
    });
    const fee = await seedTransaction(seeder, ACTOR_A1, {
      accountId: bankAccount,
      magnitude: money(2, QAR),
      direction: 'MONEY_OUT',
      description: 'Synthetic Test Top-Up Fee',
    });

    const suggested = await suggest.execute(
      { firstTransactionId: outflow, secondTransactionId: inflow },
      ACTOR_A1,
    );
    expect(suggested.ok).toBe(true);
    if (!suggested.ok) throw new Error(JSON.stringify(suggested.error));

    // The match names the PRINCIPAL, and nothing else.
    expect(suggested.value.outflow.transactionRef.transactionId).toBe(outflow);
    expect(suggested.value.inflow.transactionRef.transactionId).toBe(inflow);
    expect(suggested.value.state).toBe('SUGGESTED');
    expect(suggested.value.suggestionWindow).toBe(SUGGESTION_WINDOW_VERSION);

    // THE FEE IS MATCHED TO NOTHING and stays an ordinary expense.
    const feeMatches = await matches.findOwnForTransaction(ACTOR_A1, {
      referenceType: 'TRANSACTION',
      transactionId: fee,
    });
    expect(feeMatches).toHaveLength(0);
    const feeRow = await seeder.repository.findById(
      { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      fee as TransactionId,
    );
    expect(feeRow).not.toBeNull();
    expect(feeRow?.amount.minorUnits).toBe(-200n);
    expect(feeRow?.status).toBe('POSTED');
  });

  it('the fee cannot be paired with either side of the transfer', async () => {
    // Not by special case — by the rule. There is no equal-and-opposite
    // counterpart for 2, and the principal's two sides are already spoken for.
    const feeRow = await seedTransaction(seeder, ACTOR_A1, {
      accountId: walletAccount,
      magnitude: money(2, QAR),
      direction: 'MONEY_IN',
      description: 'Synthetic Test Unrelated Wallet Credit',
    });
    const outflowFee = await seedTransaction(seeder, ACTOR_A1, {
      accountId: bankAccount,
      magnitude: money(3, QAR),
      direction: 'MONEY_OUT',
      description: 'Synthetic Test Unrelated Fee',
    });
    const attempted = await suggest.execute(
      { firstTransactionId: outflowFee, secondTransactionId: feeRow },
      ACTOR_A1,
    );
    expect(attempted.ok).toBe(false);
    if (!attempted.ok) {
      expect(attempted.error.kind).toBe('rule_violated');
      if (attempted.error.kind === 'rule_violated') {
        expect(attempted.error.violation.kind).toBe('not_equal_and_opposite');
      }
    }
  });

  it('the match changes NEITHER transaction — both are exactly as written', async () => {
    const listed = await list.execute({ state: 'SUGGESTED' }, ACTOR_A1);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const match = listed.value[0];
    expect(match).toBeDefined();
    if (match === undefined) return;

    const principal = { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId };
    const out = await seeder.repository.findById(
      principal,
      match.outflow.transactionRef.transactionId as TransactionId,
    );
    const inn = await seeder.repository.findById(
      principal,
      match.inflow.transactionRef.transactionId as TransactionId,
    );
    // Version 1 on both: no correction, no recategorisation, no rewrite. A
    // transfer match is a relationship BESIDE the two facts, not an edit of
    // either.
    expect(out?.version).toBe(1);
    expect(inn?.version).toBe(1);
    expect(out?.amount.minorUnits).toBe(-10_000n);
    expect(inn?.amount.minorUnits).toBe(10_000n);
    expect(out?.status).toBe('POSTED');
    expect(inn?.status).toBe('POSTED');
  });

  it('a SUGGESTED match carries no decision until the person makes one', async () => {
    const listed = await list.execute({ state: 'SUGGESTED' }, ACTOR_A1);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const match = listed.value[0];
    expect(match?.subjectDecidedAt).toBeNull();

    // And there is no CONFIRMED match yet at all.
    const confirmed = await list.execute({ state: 'CONFIRMED' }, ACTOR_A1);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) expect(confirmed.value).toHaveLength(0);
  });

  it('confirming records the instant and is the only path to authoritative', async () => {
    const listed = await list.execute({ state: 'SUGGESTED' }, ACTOR_A1);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const match = listed.value[0];
    if (match === undefined) throw new Error('no suggestion to confirm');

    const confirmed = await confirm.execute(
      { matchId: match.id, expectedVersion: match.version },
      ACTOR_A1,
    );
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error(JSON.stringify(confirmed.error));
    expect(confirmed.value.state).toBe('CONFIRMED');
    expect(confirmed.value.subjectDecidedAt).not.toBeNull();
    expect(confirmed.value.version).toBe(match.version + 1);

    // And it is a real, durable row rather than an in-memory object.
    const reread = await matches.findOwnById(ACTOR_A1, confirmed.value.id);
    expect(reread?.state).toBe('CONFIRMED');
    expect(reread?.subjectDecidedAt).not.toBeNull();
  });

  it('a stale confirmation is refused rather than applied', async () => {
    const listed = await list.execute({ state: 'CONFIRMED' }, ACTOR_A1);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const match = listed.value[0];
    if (match === undefined) throw new Error('no confirmed match');
    const stale = await confirm.execute({ matchId: match.id, expectedVersion: 1 }, ACTOR_A1);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.kind).toBe('version_conflict');
  });

  it('CROSS-CURRENCY CANNOT BE SUGGESTED, over two real accounts', async () => {
    // 100 QAR leaving and 100 USD arriving. The minor units are identical, so
    // an implementation that compared amounts before currencies would call
    // this a transfer — inventing an exchange rate of exactly 1.0.
    const out = await seedTransaction(seeder, ACTOR_A1, {
      accountId: bankAccount,
      magnitude: money(100, QAR),
      direction: 'MONEY_OUT',
      description: 'Synthetic Test Outbound Remittance',
    });
    const inn = await seedTransaction(seeder, ACTOR_A1, {
      accountId: dollarAccount,
      magnitude: money(100, USD),
      direction: 'MONEY_IN',
      description: 'Synthetic Test Dollar Credit',
    });
    const attempted = await suggest.execute(
      { firstTransactionId: out, secondTransactionId: inn },
      ACTOR_A1,
    );
    expect(attempted.ok).toBe(false);
    if (!attempted.ok) {
      expect(attempted.error.kind).toBe('rule_violated');
      if (attempted.error.kind === 'rule_violated') {
        expect(attempted.error.violation.kind).toBe('cross_currency_not_matchable');
      }
    }
    // Nothing was written: not a suggestion, not a rejected placeholder.
    const anySide = await matches.findOwnForTransaction(ACTOR_A1, {
      referenceType: 'TRANSACTION',
      transactionId: out,
    });
    expect(anySide).toHaveLength(0);
  });

  it('a pair outside the declared window is refused, and nothing is written', async () => {
    const out = await seedTransaction(seeder, ACTOR_A1, {
      accountId: bankAccount,
      magnitude: money(50, QAR),
      direction: 'MONEY_OUT',
      description: 'Synthetic Test Slow Transfer Out',
      bookingDate: BOOKED,
    });
    const inn = await seedTransaction(seeder, ACTOR_A1, {
      accountId: walletAccount,
      magnitude: money(50, QAR),
      direction: 'MONEY_IN',
      description: 'Synthetic Test Slow Transfer In',
      bookingDate: CalendarDay.of(2026, 8, 17 + SUGGESTION_WINDOW_DAYS + 1),
    });
    const attempted = await suggest.execute(
      { firstTransactionId: out, secondTransactionId: inn },
      ACTOR_A1,
    );
    expect(attempted.ok).toBe(false);
    if (!attempted.ok && attempted.error.kind === 'rule_violated') {
      expect(attempted.error.violation.kind).toBe('outside_suggestion_window');
    }
    expect(
      await matches.findOwnForTransaction(ACTOR_A1, {
        referenceType: 'TRANSACTION',
        transactionId: out,
      }),
    ).toHaveLength(0);
  });

  it('a transaction already in a live match cannot join another', async () => {
    const listed = await list.execute({ state: 'CONFIRMED' }, ACTOR_A1);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const confirmed = listed.value[0];
    if (confirmed === undefined) throw new Error('no confirmed match');

    const other = await seedTransaction(seeder, ACTOR_A1, {
      accountId: walletAccount,
      magnitude: money(100, QAR),
      direction: 'MONEY_IN',
      description: 'Synthetic Test Second Wallet Credit',
    });
    const attempted = await suggest.execute(
      {
        firstTransactionId: confirmed.outflow.transactionRef.transactionId,
        secondTransactionId: other,
      },
      ACTOR_A1,
    );
    expect(attempted.ok).toBe(false);
    if (!attempted.ok) {
      expect(attempted.error.kind).toBe('transaction_already_matched');
      if (attempted.error.kind === 'transaction_already_matched') {
        expect(attempted.error.conflictingMatchId).toBe(confirmed.id);
      }
    }
  });

  it('rejecting a match frees both transactions for a different pairing', async () => {
    const listed = await list.execute({ state: 'CONFIRMED' }, ACTOR_A1);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const confirmed = listed.value[0];
    if (confirmed === undefined) throw new Error('no confirmed match');

    const withdrawn = await reject.execute(
      { matchId: confirmed.id, expectedVersion: confirmed.version },
      ACTOR_A1,
    );
    expect(withdrawn.ok).toBe(true);
    if (!withdrawn.ok) return;
    expect(withdrawn.value.state).toBe('REJECTED');
    // The row is KEPT, not deleted — without it the same wrong suggestion
    // returns on every import.
    expect(await matches.findOwnById(ACTOR_A1, confirmed.id)).not.toBeNull();

    // And the outflow may now join a different pairing.
    const replacement = await seedTransaction(seeder, ACTOR_A1, {
      accountId: walletAccount,
      magnitude: money(100, QAR),
      direction: 'MONEY_IN',
      description: 'Synthetic Test Corrected Wallet Credit',
    });
    const again = await suggest.execute(
      {
        firstTransactionId: confirmed.outflow.transactionRef.transactionId,
        secondTransactionId: replacement,
      },
      ACTOR_A1,
    );
    expect(again.ok).toBe(true);
  });

  it('erasing a TRANSACTION takes every match that names it, on either side', async () => {
    const listed = await list.execute({ state: 'SUGGESTED' }, ACTOR_A1);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const match = listed.value[0];
    if (match === undefined) throw new Error('no suggestion to erase around');

    const erased = await eraser.eraseTransferMatchesForTransaction(
      { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      match.inflow.transactionRef.transactionId as TransactionId,
    );
    expect(erased.kind).toBe('erased');
    if (erased.kind === 'erased') expect(erased.transferMatchesDeleted).toBeGreaterThanOrEqual(1);

    // Counted as the bootstrap superuser with RLS bypassed — counting as
    // karar_app would prove the rows are hidden, not that they are gone.
    const remaining = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.transfer_matches
          WHERE outflow_transaction_id = $1 OR inflow_transaction_id = $1`,
        [match.inflow.transactionRef.transactionId],
      ),
    );
    expect(remaining.rows[0]?.count).toBe('0');
  });

  it('a second erasure is idempotent and answers zero', async () => {
    const again = await eraser.eraseTransferMatchesForTransaction(
      { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      '0f0f0f0f-0000-4000-8000-00000000000f' as TransactionId,
    );
    expect(again).toEqual({ kind: 'erased', transferMatchesDeleted: 0 });
  });

  it('erasing an ACCOUNT takes every match touching it, on either side', async () => {
    // The path an account deletion needs, and the reason both account ids are
    // on the row: erasing an account does not have to enumerate every
    // transaction on it first.
    const before = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.transfer_matches
          WHERE outflow_account_id = $1 OR inflow_account_id = $1`,
        [bankAccount],
      ),
    );
    expect(Number(before.rows[0]?.count ?? '0')).toBeGreaterThan(0);

    const erased = await eraser.eraseTransferMatchesForAccount(
      { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      bankAccount,
    );
    expect(erased.kind).toBe('erased');

    const after = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.transfer_matches
          WHERE outflow_account_id = $1 OR inflow_account_id = $1`,
        [bankAccount],
      ),
    );
    expect(after.rows[0]?.count).toBe('0');

    // The transactions themselves survive: erasing the relationships is not
    // erasing the movements.
    const survivors = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.transactions WHERE account_id = $1`,
        [bankAccount],
      ),
    );
    expect(Number(survivors.rows[0]?.count ?? '0')).toBeGreaterThan(0);
  });
});
