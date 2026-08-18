/**
 * DELETING AN ACCOUNT TAKES THE INSTRUMENTS THAT SPEND FROM IT — against live
 * PostgreSQL, through the accounts module's REAL `DeleteOwnAccount`, and
 * counted as the bootstrap SUPERUSER with RLS bypassed.
 *
 * ## Why the superuser count is the whole point
 *
 * Every other read in this module runs as `karar_app` under a principal
 * context, where RLS makes another subject's rows invisible. That is the right
 * boundary for production and the wrong instrument for this question: counting
 * as `karar_app` after a delete proves rows are HIDDEN, not that they are
 * GONE, and "hidden" is exactly what a surviving instrument looks like from
 * the application.
 *
 * ## The defect being proven fixed
 *
 * `payment_instruments.account_id` is a raw uuid with NO foreign key back to
 * `financial_accounts` — no FK crosses a module boundary (data-model.md §2) —
 * so nothing cascaded, and `DeleteOwnAccount` removed the account row while
 * every instrument naming it survived. A person was told their account was
 * gone while rows describing what SPENT from it, and holding the encrypted
 * mask they read off their own card, stayed behind. An instrument still naming
 * a deleted account is worse than untidy: it is a way to spend from something
 * the person believes no longer exists.
 *
 * ## Why this suite lives HERE and not in the accounts module
 *
 * The dependency runs one way. `modules/financial-accounts` declares
 * `PaymentInstrumentEraserPort` and knows nothing about instruments,
 * `payment_instruments` or this module; this module satisfies the port and may
 * import that one. So the only place the whole path can be assembled from real
 * parts is this side of the boundary — exactly where
 * `modules/financial-connections/__tests__/account-erasure.integration.test.ts`
 * proves the source-link half.
 *
 * What is real: the account, the instruments, the repository, the use case,
 * the adapter, `DeleteOwnAccount` itself, and the counts. Only the record and
 * source-link erasers stand in, because this database holds no transaction and
 * no source link for these accounts and this module must not write one — so
 * the honest answer from both is that nothing was there and nothing went.
 *
 * All fixtures are obviously synthetic.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  DeleteOwnAccount,
  NO_RECORDS_ERASED,
  type AccountSourceLinkEraserPort,
  type FinancialAccountId,
  type FinancialRecordEraserPort,
} from '@karar/financial-accounts';

import { ErasePaymentInstruments } from '../application/use-cases/erase-payment-instruments.js';
import { ListOwnPaymentInstruments } from '../application/use-cases/list-own-payment-instruments.js';
import { RecordPaymentInstrument } from '../application/use-cases/record-payment-instrument.js';
import type { InstrumentsPrincipal } from '../application/principal.js';
import type { PaymentInstrumentRepository } from '../application/ports/payment-instrument-repository.js';
import type { PaymentInstrument } from '../domain/payment-instrument.js';
import type { BalanceBearingAccountRef, PaymentInstrumentId } from '../domain/refs.js';
import { FinancialAccountsBalanceBearingAccountAdapter } from '../infrastructure/adapters/financial-accounts-balance-bearing-account-access.js';
import { FinancialAccountsPaymentInstrumentEraser } from '../infrastructure/adapters/financial-accounts-payment-instrument-eraser.js';
import { PrismaPaymentInstrumentRepository } from '../infrastructure/persistence/prisma-payment-instrument-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  ACTOR_A2,
  SYNTHETIC_MASK_ONE,
  SYNTHETIC_MASK_TWO,
  accountsRepository,
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  seedAccount,
  skipBanner,
  superuserMaintenanceProfile,
  testEncryption,
  testRetention,
  withAdapter,
} from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'PAYMENT-INSTRUMENTS ACCOUNT-DELETION ERASURE TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_instrument_account_erasure`;
const clock = new Clock.Fixed(new Date('2026-08-19T12:00:00.000Z'));

/**
 * The synthetic driver throw the refusing repository raises. Every fragment of
 * it is something that must never reach a caller, so the redaction assertion
 * below has real needles to look for.
 */
const POISONED_CONNECTION_STRING = 'postgres://user:password@internal-host:5432/karar';
const POISONED_SQL = 'DELETE FROM public.payment_instruments WHERE account_id = $1';

/**
 * The real repository with `eraseForAccount` replaced by an outage, and every
 * other method delegated untouched.
 *
 * A decorator rather than a hand-written fake port: the failure then travels
 * the REAL path — repository throw, `ErasePaymentInstruments` wrapping it, the
 * adapter mapping it to `failed`, `DeleteOwnAccount` refusing on it — which is
 * the path whose redaction and ordering this suite is about. A fake port would
 * have proven only that a fake port works.
 */
class RefusingInstrumentRepository implements PaymentInstrumentRepository {
  constructor(private readonly real: PaymentInstrumentRepository) {}

  listOwn(actor: InstrumentsPrincipal): Promise<readonly PaymentInstrument[]> {
    return this.real.listOwn(actor);
  }

  listOwnForAccount(
    actor: InstrumentsPrincipal,
    accountRef: BalanceBearingAccountRef,
  ): Promise<readonly PaymentInstrument[]> {
    return this.real.listOwnForAccount(actor, accountRef);
  }

  findOwnById(
    actor: InstrumentsPrincipal,
    id: PaymentInstrumentId,
  ): Promise<PaymentInstrument | null> {
    return this.real.findOwnById(actor, id);
  }

  create(
    actor: InstrumentsPrincipal,
    instrument: PaymentInstrument,
  ): ReturnType<PaymentInstrumentRepository['create']> {
    return this.real.create(actor, instrument);
  }

  update(
    actor: InstrumentsPrincipal,
    expectedVersion: number,
    next: PaymentInstrument,
  ): ReturnType<PaymentInstrumentRepository['update']> {
    return this.real.update(actor, expectedVersion, next);
  }

  delete(actor: InstrumentsPrincipal, id: PaymentInstrumentId): Promise<boolean> {
    return this.real.delete(actor, id);
  }

  eraseForAccount(): Promise<number> {
    return Promise.reject(
      new Error(`connection to ${POISONED_CONNECTION_STRING} failed while running ${POISONED_SQL}`),
    );
  }
}

/**
 * Stands in for the transactions module. This database holds no transaction
 * for these accounts and this module must not write one, so the honest answer
 * is that nothing was there and nothing went.
 */
const ERASES_NO_RECORDS: FinancialRecordEraserPort = {
  eraseAccountScopedRecords: () => Promise.resolve({ kind: 'erased', deleted: NO_RECORDS_ERASED }),
};

/** Stands in for the financial-connections module, for the same reason. */
const ERASES_NO_SOURCE_LINKS: AccountSourceLinkEraserPort = {
  eraseAccountSourceLinks: () => Promise.resolve({ kind: 'erased', accountSourceLinksDeleted: 0 }),
};

let handle: PrismaHandle;
let repository: PrismaPaymentInstrumentRepository;
let record: RecordPaymentInstrument;
let list: ListOwnPaymentInstruments;
/** The wiring a composition root performs. */
let deleteAccount: DeleteOwnAccount;
/** The same wiring, with the instrument store unable to answer. */
let deleteAccountWithRefusingInstruments: DeleteOwnAccount;

/** Raw counts with RLS bypassed: proof of "gone", not of "hidden". */
async function countAsSuperuser(accountId: string): Promise<{
  accounts: number;
  instruments: number;
}> {
  return withAdapter(database, 'superuser', async (adapter) => {
    const rows = await adapter.query<{ accounts: number; instruments: number }>(
      `SELECT (SELECT count(*)::int FROM public.financial_accounts WHERE id = $1) AS accounts,
              (SELECT count(*)::int FROM public.payment_instruments WHERE account_id = $1)
                AS instruments`,
      [accountId],
    );
    return {
      accounts: rows.rows[0]?.accounts ?? -1,
      instruments: rows.rows[0]?.instruments ?? -1,
    };
  });
}

/** Two instruments on one account — the shape ADR-0028 actually describes. */
async function seedTwoInstruments(actor: InstrumentsPrincipal, accountId: string): Promise<void> {
  for (const [mask, label] of [
    [SYNTHETIC_MASK_ONE, 'Synthetic Test Card One'],
    [SYNTHETIC_MASK_TWO, 'Synthetic Test Card Two'],
  ] as const) {
    const created = await record.execute(
      { accountId, instrumentType: 'VIRTUAL_CARD', mask, displayLabel: label },
      actor,
    );
    if (!created.ok) throw new Error(`fixture instrument failed: ${created.error.kind}`);
  }
}

describe.skipIf(unreachable !== null)(
  'deleting an account takes its payment instruments with it (live PostgreSQL, counted as superuser)',
  () => {
    beforeAll(async () => {
      await provisionDatabase(database);
      handle = buildHandle(database);
      repository = new PrismaPaymentInstrumentRepository(handle, testEncryption());
      record = new RecordPaymentInstrument(
        repository,
        new FinancialAccountsBalanceBearingAccountAdapter(accountsRepository(handle)),
        testRetention(),
        new Uuidv7IdSource(),
        clock,
      );
      list = new ListOwnPaymentInstruments(repository);

      // The wiring a composition root performs: the accounts module's delete
      // path, holding this module's adapter through the port it declares.
      deleteAccount = new DeleteOwnAccount(
        accountsRepository(handle),
        ERASES_NO_RECORDS,
        ERASES_NO_SOURCE_LINKS,
        new FinancialAccountsPaymentInstrumentEraser(new ErasePaymentInstruments(repository)),
      );
      deleteAccountWithRefusingInstruments = new DeleteOwnAccount(
        accountsRepository(handle),
        ERASES_NO_RECORDS,
        ERASES_NO_SOURCE_LINKS,
        new FinancialAccountsPaymentInstrumentEraser(
          new ErasePaymentInstruments(new RefusingInstrumentRepository(repository)),
        ),
      );
    }, 180_000);

    afterAll(async () => {
      await handle?.end().catch(() => {});
      await dropDatabase(database);
    });

    it('erases BOTH instruments spending from the account, and reports the exact count', async () => {
      const accountId = await seedAccount(
        handle,
        ACTOR_A1,
        'Synthetic Test Account With Two Cards',
        clock,
      );
      await seedTwoInstruments(ACTOR_A1, accountId);

      // NON-EMPTY FIRST: an erasure test over an account with no instruments
      // proves nothing at all.
      expect(await countAsSuperuser(accountId)).toEqual({ accounts: 1, instruments: 2 });

      const deleted = await deleteAccount.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      );
      expect(deleted.ok).toBe(true);
      if (deleted.ok) {
        // Reported, never assumed: two rows were there and two went.
        expect(deleted.value.paymentInstrumentsDeleted).toBe(2);
      }

      // Counted with RLS bypassed: gone, not hidden.
      expect(await countAsSuperuser(accountId)).toEqual({ accounts: 0, instruments: 0 });
    });

    it('a second delete is idempotent and erases nothing twice', async () => {
      const accountId = await seedAccount(
        handle,
        ACTOR_A1,
        'Synthetic Test Account Deleted Twice',
        clock,
      );
      await seedTwoInstruments(ACTOR_A1, accountId);

      const first = await deleteAccount.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      );
      expect(first.ok).toBe(true);
      if (first.ok) expect(first.value.paymentInstrumentsDeleted).toBe(2);

      // The repeat: nothing left for any eraser, and the account is already
      // gone. Answered exactly as a delete of a never-existing account is, so
      // the refusal stays oracle-free.
      const second = await deleteAccount.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      );
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.kind).toBe('account_not_found');
      expect(await countAsSuperuser(accountId)).toEqual({ accounts: 0, instruments: 0 });
    });

    it('a FAILING instrument eraser leaves the account AND its instruments intact, and reports no success', async () => {
      const accountId = await seedAccount(
        handle,
        ACTOR_A1,
        'Synthetic Test Account Instruments Unerasable',
        clock,
      );
      await seedTwoInstruments(ACTOR_A1, accountId);

      const refused = await deleteAccountWithRefusingInstruments.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      );
      expect(refused.ok).toBe(false);
      if (refused.ok) return expect.unreachable('the erasure was supposed to fail');
      expect(refused.error.kind).toBe('instrument_erasure_incomplete');
      if (refused.error.kind === 'instrument_erasure_incomplete') {
        expect(refused.error.outcome).toBe('failed');
        // A throw is not a partial erasure: nothing is KNOWN to have gone.
        expect(refused.error.paymentInstrumentsDeleted).toBe(0);
      }

      // A coherent world to retry into: the anchor is still there, and so are
      // the instruments that point at it. A partial state is never reported as
      // a completion.
      expect(await countAsSuperuser(accountId)).toEqual({ accounts: 1, instruments: 2 });

      // And the retry converges, because the erasure is idempotent.
      const retried = await deleteAccount.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      );
      expect(retried.ok).toBe(true);
      if (retried.ok) expect(retried.value.paymentInstrumentsDeleted).toBe(2);
      expect(await countAsSuperuser(accountId)).toEqual({ accounts: 0, instruments: 0 });
    });

    it('the refusal carries NO store text outward, and keeps the cause for the boundary', async () => {
      // The rule this module states about `reason` and the accounts module
      // states about every refusal: a driver message can carry a connection
      // string, the failing SQL, or a fragment of the ciphertext of the very
      // mask being erased.
      const accountId = await seedAccount(
        handle,
        ACTOR_A1,
        'Synthetic Test Account Poisoned Throw',
        clock,
      );
      await seedTwoInstruments(ACTOR_A1, accountId);

      const refused = await deleteAccountWithRefusingInstruments.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      );
      expect(refused.ok).toBe(false);
      if (refused.ok) return expect.unreachable('the erasure was supposed to fail');

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
      // Reachable by name for the one boundary allowed to log it, and
      // non-enumerable so no serializer reaches it by accident. Redaction that
      // also DISCARDED the cause would trade a leak for blindness.
      expect((refused.error as { cause?: unknown }).cause).toBeInstanceOf(Error);
      expect(Object.getOwnPropertyDescriptor(refused.error, 'cause')?.enumerable).toBe(false);
    });

    it("a neighbour's account and instruments are untouched throughout", async () => {
      // Two people inside ONE tenant — the case tenant scoping alone would
      // miss. A2's account is seeded non-empty, so this is a real refusal
      // rather than an empty table answering zero.
      const mine = await seedAccount(handle, ACTOR_A1, 'Synthetic Test Account Mine', clock);
      const theirs = await seedAccount(handle, ACTOR_A2, 'Synthetic Test Account Theirs', clock);
      await seedTwoInstruments(ACTOR_A1, mine);
      await seedTwoInstruments(ACTOR_A2, theirs);

      // A1 naming A2's account: invisible, so the delete refuses before any
      // erasure runs.
      const refused = await deleteAccount.execute(
        { accountId: theirs as FinancialAccountId, expectedVersion: 1 },
        { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      );
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.kind).toBe('account_not_found');
      expect(await countAsSuperuser(theirs)).toEqual({ accounts: 1, instruments: 2 });

      // A1 deleting their OWN account takes only their own instruments.
      const deleted = await deleteAccount.execute(
        { accountId: mine as FinancialAccountId, expectedVersion: 1 },
        { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      );
      expect(deleted.ok).toBe(true);
      expect(await countAsSuperuser(mine)).toEqual({ accounts: 0, instruments: 0 });
      expect(await countAsSuperuser(theirs)).toEqual({ accounts: 1, instruments: 2 });

      // And the neighbour can still read their own two, through the real
      // list path — proof the rows are usable and not merely present.
      const listed = await list.execute({ accountId: theirs }, ACTOR_A2);
      expect(listed.ok).toBe(true);
      if (listed.ok) expect(listed.value).toHaveLength(2);
    });
  },
);
