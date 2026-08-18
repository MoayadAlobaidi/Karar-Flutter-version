/**
 * DELETING A TRANSACTION, OR AN ACCOUNT, TAKES THE MATCHES THAT NAME IT —
 * against live PostgreSQL, through the REAL `DeleteOwnTransaction` and the
 * REAL `DeleteOwnAccount`, and counted as the bootstrap SUPERUSER with RLS
 * bypassed.
 *
 * ## Why the superuser count is the whole point
 *
 * Every other read in this module runs as `karar_app` under a principal
 * context, where RLS makes another subject's rows invisible. That is the right
 * boundary for production and the wrong instrument for this question: counting
 * as `karar_app` after a delete proves rows are HIDDEN, not that they are
 * GONE, and "hidden" is exactly what a surviving match looks like from the
 * application.
 *
 * ## The defect being proven fixed
 *
 * `transfer_matches.outflow_transaction_id`, `inflow_transaction_id`,
 * `outflow_account_id` and `inflow_account_id` are raw uuids with NO foreign
 * keys back — no FK crosses a module boundary (data-model.md §2) — so nothing
 * cascaded from either deletion path, and a match outlived the movement it
 * named.
 *
 * **A dangling match is not cosmetic.** It asserts that two movements were one
 * movement while one of them no longer exists, so the surviving side is still
 * explained away as a transfer and a real expense stays hidden from the
 * person's own record of what they spent. Deleting one row made a second row
 * say something false.
 *
 * ## The TWO paths, and why the second is the one that is easy to miss
 *
 *   1. `DeleteOwnTransaction` → `eraseTransferMatchesForTransaction`. A person
 *      removes one movement.
 *   2. `DeleteOwnAccount` → `FinancialRecordEraserPort` →
 *      `PrismaFinancialRecordEraser` → `eraseTransferMatchesForAccount`.
 *      Nothing about `DeleteOwnAccount` names a transfer match; it reaches
 *      them through the record eraser. The account-scoped method exists
 *      because that eraser deletes an account's transactions in BULK without
 *      enumerating their ids, and a caller holding only the per-transaction
 *      method would have to scan a person's entire history first.
 *
 * ## Why this suite lives HERE
 *
 * The dependency runs one way. `modules/transactions` declares
 * `TransferMatchEraserPort` and knows nothing about matches or
 * `transfer_matches`; `modules/financial-accounts` knows less still. This
 * module satisfies the port and may import both, so this is the only side of
 * the boundary where the whole path can be assembled from real parts.
 *
 * Everything here is real: the accounts, the transactions, the confirmed
 * matches, the repositories, both delete use cases, the record eraser, the
 * adapter, and the counts. Only the source-link eraser stands in, because this
 * database holds no source link and this module must not write one.
 *
 * All fixtures are obviously synthetic.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, Currency } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  DeleteOwnAccount,
  type AccountSourceLinkEraserPort,
  type FinancialAccountId,
} from '@karar/financial-accounts';
import { DeleteOwnTransaction, PrismaFinancialRecordEraser } from '@karar/transactions';

import { ConfirmTransferMatch } from '../application/use-cases/confirm-transfer-match.js';
import { EraseTransferMatches } from '../application/use-cases/erase-transfer-matches.js';
import { SuggestTransferMatch } from '../application/use-cases/suggest-transfer-match.js';
import type { MatchingPrincipal } from '../application/principal.js';
import type {
  TransferMatchCreateOutcome,
  TransferMatchRepository,
  TransferMatchUpdateOutcome,
} from '../application/ports/transfer-match-repository.js';
import type { TransactionRef, TransferMatchId } from '../domain/refs.js';
import type { MatchState, TransferMatch } from '../domain/transfer-match.js';
import { TransactionsMatchableTransactionAdapter } from '../infrastructure/adapters/transactions-matchable-transaction-access.js';
import { TransactionsTransferMatchEraser } from '../infrastructure/adapters/transactions-transfer-match-eraser.js';
import { PrismaTransferMatchRepository } from '../infrastructure/persistence/prisma-transfer-match-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  ACTOR_A2,
  accountsRepository,
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
import type { PaymentInstrumentEraserPort } from '@karar/financial-accounts';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'TRANSFER-MATCHING DELETION ERASURE TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_match_deletion_erasure`;
const clock = new Clock.Fixed(new Date('2026-08-19T12:00:00.000Z'));
const QAR = Currency.get('QAR');

/**
 * The synthetic driver throw the refusing repository raises. Every fragment of
 * it is something that must never reach a caller, so the redaction assertions
 * below have real needles to look for.
 */
const POISONED_CONNECTION_STRING = 'postgres://user:password@internal-host:5432/karar';
const POISONED_SQL = 'DELETE FROM public.transfer_matches WHERE outflow_transaction_id = $1';

function poisonedOutage(): Error {
  return new Error(
    `connection to ${POISONED_CONNECTION_STRING} failed while running ${POISONED_SQL}`,
  );
}

/**
 * The real repository with BOTH erasure methods replaced by an outage, and
 * every other method delegated untouched.
 *
 * A decorator rather than a hand-written fake port: the failure then travels
 * the REAL path — repository throw, `EraseTransferMatches` wrapping it, the
 * adapter mapping it to `failed`, the deleting use case refusing on it — which
 * is the path whose redaction and ordering this suite is about. A fake port
 * would have proven only that a fake port works.
 */
class RefusingTransferMatchRepository implements TransferMatchRepository {
  constructor(private readonly real: TransferMatchRepository) {}

  listOwn(actor: MatchingPrincipal): Promise<readonly TransferMatch[]> {
    return this.real.listOwn(actor);
  }

  listOwnByState(actor: MatchingPrincipal, state: MatchState): Promise<readonly TransferMatch[]> {
    return this.real.listOwnByState(actor, state);
  }

  findOwnById(actor: MatchingPrincipal, id: TransferMatchId): Promise<TransferMatch | null> {
    return this.real.findOwnById(actor, id);
  }

  findOwnForTransaction(
    actor: MatchingPrincipal,
    transactionRef: TransactionRef,
  ): Promise<readonly TransferMatch[]> {
    return this.real.findOwnForTransaction(actor, transactionRef);
  }

  create(actor: MatchingPrincipal, match: TransferMatch): Promise<TransferMatchCreateOutcome> {
    return this.real.create(actor, match);
  }

  update(
    actor: MatchingPrincipal,
    expectedVersion: number,
    next: TransferMatch,
  ): Promise<TransferMatchUpdateOutcome> {
    return this.real.update(actor, expectedVersion, next);
  }

  eraseForTransaction(): Promise<number> {
    return Promise.reject(poisonedOutage());
  }

  eraseForAccount(): Promise<number> {
    return Promise.reject(poisonedOutage());
  }
}

/**
 * Stands in for the financial-connections module. This database holds no
 * source link and this module must not write one, so the honest answer is that
 * nothing was there and nothing went.
 */
/**
 * Explicit, because the argument is required rather than defaulted. This suite
 * is about transfer matches; naming the no-op says so, where a default would
 * have let a composition root skip instrument erasure without anyone deciding.
 */
const ERASES_NO_INSTRUMENTS: PaymentInstrumentEraserPort = {
  erasePaymentInstruments: async () => ({ kind: 'erased', paymentInstrumentsDeleted: 0 }),
};

const ERASES_NO_SOURCE_LINKS: AccountSourceLinkEraserPort = {
  eraseAccountSourceLinks: () => Promise.resolve({ kind: 'erased', accountSourceLinksDeleted: 0 }),
};

/**
 * The account list the seeded directory reads, held so a case can add an
 * account it seeds for itself. The accounts are real rows created through the
 * accounts module's own use case; this list is only what the transactions
 * module's account gate resolves against.
 */
const seededAccounts: SeededAccount[] = [];

let handle: PrismaHandle;
let seeder: TransactionSeeder;
let matches: PrismaTransferMatchRepository;
let suggest: SuggestTransferMatch;
let confirm: ConfirmTransferMatch;
/** The two delete paths, wired as a composition root would wire them. */
let deleteTransaction: DeleteOwnTransaction;
let deleteAccount: DeleteOwnAccount;
/** The same two, with the match store unable to answer. */
let deleteTransactionWithRefusingMatches: DeleteOwnTransaction;
let deleteAccountWithRefusingMatches: DeleteOwnAccount;

/** The person's wallet, and a neighbour's pair beside it. */
let walletAccount: string;
let neighbourBank: string;
let neighbourWallet: string;

/** Raw counts with RLS bypassed: proof of "gone", not of "hidden". */
async function countAsSuperuser(sql: string, parameter: string): Promise<number> {
  const rows = await withAdapter(database, 'superuser', (adapter) =>
    adapter.query<{ n: number }>(sql, [parameter]),
  );
  return rows.rows[0]?.n ?? -1;
}

const matchesNamingTransaction = (transactionId: string): Promise<number> =>
  countAsSuperuser(
    `SELECT count(*)::int AS n FROM public.transfer_matches
      WHERE outflow_transaction_id = $1 OR inflow_transaction_id = $1`,
    transactionId,
  );

const matchesTouchingAccount = (accountId: string): Promise<number> =>
  countAsSuperuser(
    `SELECT count(*)::int AS n FROM public.transfer_matches
      WHERE outflow_account_id = $1 OR inflow_account_id = $1`,
    accountId,
  );

const transactionsOn = (accountId: string): Promise<number> =>
  countAsSuperuser(
    `SELECT count(*)::int AS n FROM public.transactions WHERE account_id = $1`,
    accountId,
  );

const transactionRows = (transactionId: string): Promise<number> =>
  countAsSuperuser(
    `SELECT count(*)::int AS n FROM public.transactions WHERE id = $1`,
    transactionId,
  );

const accountRows = (accountId: string): Promise<number> =>
  countAsSuperuser(
    `SELECT count(*)::int AS n FROM public.financial_accounts WHERE id = $1`,
    accountId,
  );

/** A real account, registered with the gate the transactions module reads. */
async function newAccount(actor: MatchingPrincipal, displayName: string): Promise<string> {
  const accountId = await seedAccount(handle, actor, displayName, clock);
  seededAccounts.push({ accountId, owner: actor, currencyCode: 'QAR' });
  return accountId;
}

/**
 * One movement of the person's own money, CONFIRMED: 100 leaves one account,
 * 100 arrives in the other, and the person says the two are one thing.
 *
 * Confirmed rather than merely suggested, deliberately. A suggestion is a
 * question the product asked; a confirmation is the person's own statement
 * about their money, and it is the one an erasure has the strongest duty not
 * to leave dangling.
 */
async function confirmedTransfer(
  actor: MatchingPrincipal,
  out: string,
  into: string,
  label: string,
): Promise<{ outflow: string; inflow: string; matchId: string }> {
  seeder.context.actAs(actor);
  const outflow = await seedTransaction(seeder, actor, {
    accountId: out,
    magnitude: money(100, QAR),
    direction: 'MONEY_OUT',
    description: `Synthetic Test ${label} Outflow`,
  });
  const inflow = await seedTransaction(seeder, actor, {
    accountId: into,
    magnitude: money(100, QAR),
    direction: 'MONEY_IN',
    description: `Synthetic Test ${label} Inflow`,
  });
  const suggested = await suggest.execute(
    { firstTransactionId: outflow, secondTransactionId: inflow },
    actor,
  );
  if (!suggested.ok) throw new Error(`fixture suggest failed: ${JSON.stringify(suggested.error)}`);
  const confirmed = await confirm.execute(
    { matchId: suggested.value.id, expectedVersion: suggested.value.version },
    actor,
  );
  if (!confirmed.ok) throw new Error(`fixture confirm failed: ${JSON.stringify(confirmed.error)}`);
  seeder.context.actAs(actor);
  return { outflow, inflow, matchId: confirmed.value.id };
}

describe.skipIf(unreachable !== null)(
  'deleting a transaction or an account takes its transfer matches with it (live PostgreSQL, counted as superuser)',
  () => {
    beforeAll(async () => {
      await provisionDatabase(database);
      handle = buildHandle(database);

      // The seeder holds `seededAccounts` by reference, so an account created
      // later in a case is resolvable by the gate without rebuilding anything.
      seeder = transactionSeeder(handle, seededAccounts, clock);
      matches = new PrismaTransferMatchRepository(handle);
      suggest = new SuggestTransferMatch(
        matches,
        new TransactionsMatchableTransactionAdapter(seeder.repository),
        testRetention(),
        new Uuidv7IdSource(),
        clock,
      );
      confirm = new ConfirmTransferMatch(matches, clock);

      walletAccount = await newAccount(ACTOR_A1, 'Synthetic Test Wallet');
      neighbourBank = await newAccount(ACTOR_A2, 'Synthetic Test Neighbour Bank Account');
      neighbourWallet = await newAccount(ACTOR_A2, 'Synthetic Test Neighbour Wallet');

      // The wiring a composition root performs, for both deletion paths.
      const eraser = new TransactionsTransferMatchEraser(new EraseTransferMatches(matches));
      const refusingEraser = new TransactionsTransferMatchEraser(
        new EraseTransferMatches(new RefusingTransferMatchRepository(matches)),
      );
      deleteTransaction = new DeleteOwnTransaction(seeder.context, seeder.repository, eraser);
      deleteTransactionWithRefusingMatches = new DeleteOwnTransaction(
        seeder.context,
        seeder.repository,
        refusingEraser,
      );
      deleteAccount = new DeleteOwnAccount(
        accountsRepository(handle),
        new PrismaFinancialRecordEraser(handle, eraser),
        ERASES_NO_SOURCE_LINKS,
        ERASES_NO_INSTRUMENTS,
      );
      deleteAccountWithRefusingMatches = new DeleteOwnAccount(
        accountsRepository(handle),
        new PrismaFinancialRecordEraser(handle, refusingEraser),
        ERASES_NO_SOURCE_LINKS,
        ERASES_NO_INSTRUMENTS,
      );
    }, 180_000);

    afterAll(async () => {
      await handle?.end().catch(() => {});
      await dropDatabase(database);
    });

    it('deleting a TRANSACTION erases every match naming it, and reports the exact count', async () => {
      const bank = await newAccount(ACTOR_A1, 'Synthetic Test Bank Account One');
      const transfer = await confirmedTransfer(ACTOR_A1, bank, walletAccount, 'Transaction Delete');
      // NON-EMPTY FIRST: an erasure test with no match to erase proves nothing.
      expect(await matchesNamingTransaction(transfer.outflow)).toBe(1);

      const deleted = await deleteTransaction.execute({ transactionId: transfer.outflow });
      expect(deleted.ok).toBe(true);
      if (deleted.ok) {
        // Reported, never assumed: one row was there and one went.
        expect(deleted.value.transferMatchesDeleted).toBe(1);
      }

      // Counted with RLS bypassed: gone, not hidden — both the match and the
      // transaction it named.
      expect(await matchesNamingTransaction(transfer.outflow)).toBe(0);
      expect(await transactionRows(transfer.outflow)).toBe(0);

      // The OTHER side survives, unrewritten. Erasing a relationship is not
      // erasing the movements it related, and the surviving inflow is now an
      // ordinary unmatched movement rather than half of a transfer.
      expect(await transactionRows(transfer.inflow)).toBe(1);
      expect(await matchesNamingTransaction(transfer.inflow)).toBe(0);
    });

    it('a second delete of the same transaction is idempotent and erases nothing twice', async () => {
      const bank = await newAccount(ACTOR_A1, 'Synthetic Test Bank Account Two');
      const transfer = await confirmedTransfer(ACTOR_A1, bank, walletAccount, 'Deleted Twice');

      const first = await deleteTransaction.execute({ transactionId: transfer.inflow });
      expect(first.ok).toBe(true);
      if (first.ok) expect(first.value.transferMatchesDeleted).toBe(1);

      // The repeat: no match left and no transaction left. Answered exactly as
      // a delete of a never-minted id is, so the refusal stays oracle-free.
      const second = await deleteTransaction.execute({ transactionId: transfer.inflow });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.kind).toBe('NOT_FOUND');
      expect(await matchesNamingTransaction(transfer.inflow)).toBe(0);
    });

    it('a FAILING match eraser leaves the transaction AND its match intact, and reports no success', async () => {
      const bank = await newAccount(ACTOR_A1, 'Synthetic Test Bank Account Three');
      const transfer = await confirmedTransfer(
        ACTOR_A1,
        bank,
        walletAccount,
        'Unerasable Matches',
      );

      const refused = await deleteTransactionWithRefusingMatches.execute({
        transactionId: transfer.outflow,
      });
      expect(refused.ok).toBe(false);
      if (refused.ok) return expect.unreachable('the erasure was supposed to fail');
      expect(refused.error.kind).toBe('TRANSFER_MATCH_ERASURE_INCOMPLETE');
      if (refused.error.kind === 'TRANSFER_MATCH_ERASURE_INCOMPLETE') {
        expect(refused.error.outcome).toBe('failed');
        // A throw is not a partial erasure: nothing is KNOWN to have gone.
        expect(refused.error.transferMatchesDeleted).toBe(0);
      }

      // A coherent world to retry into: the movement is still there, and so is
      // the relationship naming it. A partial state is never a completion.
      expect(await matchesNamingTransaction(transfer.outflow)).toBe(1);
      expect(await transactionRows(transfer.outflow)).toBe(1);

      // And the retry converges, because the erasure is idempotent.
      const retried = await deleteTransaction.execute({ transactionId: transfer.outflow });
      expect(retried.ok).toBe(true);
      if (retried.ok) expect(retried.value.transferMatchesDeleted).toBe(1);
      expect(await matchesNamingTransaction(transfer.outflow)).toBe(0);
    });

    it('the transaction-path refusal carries NO store text outward, and keeps the cause', async () => {
      // A driver message can carry a connection string, the failing SQL, or a
      // fragment of the very record being erased. None of it may reach a
      // caller-visible message, and the original must still be reachable for
      // the one boundary allowed to log it — redaction that DISCARDED the
      // cause would trade a leak for blindness.
      const bank = await newAccount(ACTOR_A1, 'Synthetic Test Bank Account Four');
      const transfer = await confirmedTransfer(ACTOR_A1, bank, walletAccount, 'Poisoned Throw');

      const refused = await deleteTransactionWithRefusingMatches.execute({
        transactionId: transfer.outflow,
      });
      expect(refused.ok).toBe(false);
      if (refused.ok) return expect.unreachable('the erasure was supposed to fail');
      if (refused.error.kind !== 'TRANSFER_MATCH_ERASURE_INCOMPLETE') {
        return expect.unreachable('the match erasure was supposed to be the thing that refused');
      }

      for (const rendered of [
        JSON.stringify(refused.error) ?? '',
        JSON.stringify({ ...refused.error }),
        Object.keys(refused.error).join(','),
        refused.error.message,
      ]) {
        expect(rendered).not.toContain(POISONED_CONNECTION_STRING);
        expect(rendered).not.toContain(POISONED_SQL);
        expect(rendered).not.toContain('password');
        expect(rendered).not.toContain('internal-host');
      }
      expect((refused.error as { cause?: unknown }).cause).toBeInstanceOf(Error);
      expect(Object.getOwnPropertyDescriptor(refused.error, 'cause')?.enumerable).toBe(false);
    });

    it('deleting an ACCOUNT erases every match touching it, through the account-scoped path', async () => {
      // The second call site. Nothing about `DeleteOwnAccount` names a
      // transfer match: it reaches them through `FinancialRecordEraserPort`,
      // whose implementation cuts the relationships before deleting the
      // account's transactions in bulk — without enumerating a single id.
      const doomed = await newAccount(ACTOR_A1, 'Synthetic Test Account Doomed');
      const transfer = await confirmedTransfer(ACTOR_A1, doomed, walletAccount, 'Account Delete');
      expect(await matchesTouchingAccount(doomed)).toBe(1);
      expect(await transactionsOn(doomed)).toBe(1);

      const deleted = await deleteAccount.execute(
        { accountId: doomed as FinancialAccountId, expectedVersion: 1 },
        { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      );
      expect(deleted.ok).toBe(true);
      if (deleted.ok) {
        // The count the record eraser measured, folded into what the accounts
        // module reports — so a person is told what actually went and not only
        // the part the accounts module has vocabulary for.
        expect(deleted.value.financialRecordRelationshipsDeleted).toBe(1);
        expect(deleted.value.recordsDeleted.FINANCIAL_RECORD).toBe(1);
      }

      expect(await matchesTouchingAccount(doomed)).toBe(0);
      expect(await transactionsOn(doomed)).toBe(0);
      expect(await accountRows(doomed)).toBe(0);
      // The counterpart movement on the surviving account is untouched, and is
      // no longer explained away as half of a transfer.
      expect(await transactionRows(transfer.inflow)).toBe(1);
      expect(await matchesNamingTransaction(transfer.inflow)).toBe(0);
    });

    it('a FAILING match eraser leaves the account, its records AND its matches intact', async () => {
      const doomed = await newAccount(ACTOR_A1, 'Synthetic Test Account Matches Unerasable');
      await confirmedTransfer(ACTOR_A1, doomed, walletAccount, 'Account Delete Refused');
      expect(await matchesTouchingAccount(doomed)).toBe(1);

      const refused = await deleteAccountWithRefusingMatches.execute(
        { accountId: doomed as FinancialAccountId, expectedVersion: 1 },
        { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      );
      expect(refused.ok).toBe(false);
      if (refused.ok) return expect.unreachable('the erasure was supposed to fail');
      expect(refused.error.kind).toBe('erasure_incomplete');
      if (refused.error.kind === 'erasure_incomplete') {
        // `failed`, not `incomplete`: the record erasure refused as a WHOLE
        // rather than deleting records it could not first free of
        // relationships, so nothing went and an immediate retry is safe.
        expect(refused.error.outcome).toBe('failed');
      }

      // Everything survives, counted as superuser.
      expect(await matchesTouchingAccount(doomed)).toBe(1);
      expect(await transactionsOn(doomed)).toBe(1);
      expect(await accountRows(doomed)).toBe(1);

      // And the retry converges.
      const retried = await deleteAccount.execute(
        { accountId: doomed as FinancialAccountId, expectedVersion: 1 },
        { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      );
      expect(retried.ok).toBe(true);
      if (retried.ok) expect(retried.value.financialRecordRelationshipsDeleted).toBe(1);
      expect(await matchesTouchingAccount(doomed)).toBe(0);
      expect(await transactionsOn(doomed)).toBe(0);
    });

    it("a neighbour's matches are untouched throughout, by either path", async () => {
      // Two people inside ONE tenant — the case tenant scoping alone would
      // miss. The neighbour's side is seeded non-empty, so these are real
      // refusals rather than an empty table answering zero.
      const neighbour = await confirmedTransfer(
        ACTOR_A2,
        neighbourBank,
        neighbourWallet,
        'Neighbour Transfer',
      );
      expect(await matchesNamingTransaction(neighbour.outflow)).toBe(1);

      // A1 naming A2's transaction: invisible, so nothing is erased and the
      // delete refuses.
      seeder.context.actAs(ACTOR_A1);
      const refused = await deleteTransaction.execute({ transactionId: neighbour.outflow });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.kind).toBe('NOT_FOUND');
      expect(await matchesNamingTransaction(neighbour.outflow)).toBe(1);

      // A1 naming A2's account: invisible too, and the account delete refuses
      // before any erasure runs.
      const refusedAccount = await deleteAccount.execute(
        { accountId: neighbourBank as FinancialAccountId, expectedVersion: 1 },
        { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      );
      expect(refusedAccount.ok).toBe(false);
      if (!refusedAccount.ok) expect(refusedAccount.error.kind).toBe('account_not_found');
      expect(await matchesTouchingAccount(neighbourBank)).toBe(1);
      expect(await transactionsOn(neighbourBank)).toBe(1);

      // The owner can still erase their own, which is what makes the point
      // above about scoping rather than about the erasure simply not working.
      seeder.context.actAs(ACTOR_A2);
      const byOwner = await deleteTransaction.execute({ transactionId: neighbour.outflow });
      expect(byOwner.ok).toBe(true);
      if (byOwner.ok) expect(byOwner.value.transferMatchesDeleted).toBe(1);
      expect(await matchesNamingTransaction(neighbour.outflow)).toBe(0);
    });
  },
);
