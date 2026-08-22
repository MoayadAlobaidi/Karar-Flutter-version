/**
 * THE ADR-0028 HEADLINE CASE, END TO END: two virtual cards on ONE wallet are
 * two rows against one account, and nothing anywhere sums or derives a
 * balance from them.
 *
 * ADR-0028 states the failure this suite exists to make impossible: "two
 * virtual cards on one wallet look like two more balances, and the person's
 * money appears to triple". The wallet here is a real `financial_accounts`
 * row with `accountType = 'WALLET'` created through the accounts module's own
 * use case, so the shape under test is the shape the ADR describes.
 *
 * Four claims, each proved rather than asserted:
 *
 *   1. Two instruments exist as TWO ROWS against ONE `account_id`.
 *   2. Recording the second one changes NOTHING about the account — same
 *      version, same everything, read back through the accounts module's own
 *      repository.
 *   3. No column, no view and no returned object anywhere carries a figure
 *      derived from the instruments. Checked against the live catalogue, not
 *      against this module's own code, because a derivation somebody added in
 *      a view would be invisible to a source scan.
 *   4. Erasing the account's instruments removes both rows and leaves the
 *      account itself untouched.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import type { FinancialAccountId } from '@karar/financial-accounts';

import { ErasePaymentInstruments } from '../application/use-cases/erase-payment-instruments.js';
import { ListOwnPaymentInstruments } from '../application/use-cases/list-own-payment-instruments.js';
import { RecordPaymentInstrument } from '../application/use-cases/record-payment-instrument.js';
import { FinancialAccountsBalanceBearingAccountAdapter } from '../infrastructure/adapters/financial-accounts-balance-bearing-account-access.js';
import { FinancialAccountsPaymentInstrumentEraser } from '../infrastructure/adapters/financial-accounts-payment-instrument-eraser.js';
import { PrismaPaymentInstrumentRepository } from '../infrastructure/persistence/prisma-payment-instrument-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  EVERY_INSTRUMENT_PAGE,
  SYNTHETIC_MASK_ONE,
  SYNTHETIC_MASK_TWO,
  accountsRepository,
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  seedWallet,
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
      'PAYMENT-INSTRUMENTS MANY-PER-ACCOUNT TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_instrument_many`;
const clock = new Clock.Fixed(new Date('2026-08-19T12:00:00.000Z'));

let handle: PrismaHandle;
let repository: PrismaPaymentInstrumentRepository;
let record: RecordPaymentInstrument;
let list: ListOwnPaymentInstruments;
let eraser: FinancialAccountsPaymentInstrumentEraser;
let walletId: string;

describe.skipIf(unreachable !== null)('two virtual cards, one wallet, one balance', () => {
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
    eraser = new FinancialAccountsPaymentInstrumentEraser(
      new ErasePaymentInstruments(repository),
    );
    walletId = await seedWallet(handle, ACTOR_A1, 'Synthetic Test Wallet Alpha', clock);
  }, 180_000);

  afterAll(async () => {
    await handle?.end().catch(() => {});
    await dropDatabase(database);
  });

  it('records two virtual cards against the SAME wallet', async () => {
    for (const [mask, label] of [
      [SYNTHETIC_MASK_ONE, 'Synthetic Test Card One'],
      [SYNTHETIC_MASK_TWO, 'Synthetic Test Card Two'],
    ]) {
      const created = await record.execute(
        {
          accountId: walletId,
          instrumentType: 'VIRTUAL_CARD',
          mask: mask as string,
          displayLabel: label as string,
        },
        ACTOR_A1,
      );
      expect(created.ok).toBe(true);
    }

    const listed = await list.execute({ accountId: walletId, ...EVERY_INSTRUMENT_PAGE }, ACTOR_A1);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    // TWO instruments. ONE account.
    expect(listed.value.instruments).toHaveLength(2);
    expect(new Set(listed.value.instruments.map((i) => i.accountRef.accountId))).toEqual(
      new Set([walletId]),
    );
    expect(new Set(listed.value.instruments.map((i) => i.id)).size).toBe(2);
    expect(listed.value.instruments.map((i) => i.mask.reveal()).sort()).toEqual(
      [SYNTHETIC_MASK_ONE, SYNTHETIC_MASK_TWO].sort(),
    );
  });

  it('neither instrument carries a figure, so two cards cannot be two balances', async () => {
    const listed = await list.execute({ accountId: walletId, ...EVERY_INSTRUMENT_PAGE }, ACTOR_A1);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    for (const instrument of listed.value.instruments) {
      const numericFields = Object.entries(instrument)
        .filter(([, value]) => typeof value === 'number')
        .map(([key]) => key);
      expect(numericFields).toEqual(['version']);
    }
  });

  it('the wallet account is UNCHANGED by either instrument', async () => {
    // The claim that matters: adding a card changes nothing about the place
    // the money actually is. Read back through the ACCOUNTS module's own
    // repository, so this is that module's view and not a restatement of
    // this one's.
    const accounts = accountsRepository(handle);
    const account = await accounts.findOwnById(
      { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      walletId as FinancialAccountId,
    );
    expect(account).not.toBeNull();
    expect(account?.version).toBe(1);
    expect(account?.accountType).toBe('WALLET');
    expect(account?.status).toBe('ACTIVE');
  });

  it('no view, materialized view or generated column derives anything from instruments', async () => {
    // A source scan cannot see a derivation somebody added in SQL, so the
    // live catalogue is asked directly. Nothing anywhere may aggregate this
    // table.
    const views = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ viewname: string; definition: string }>(
        `SELECT viewname, definition FROM pg_views WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`,
      ),
    );
    const referencing = views.rows.filter((v) => v.definition.includes('payment_instruments'));
    expect(referencing.map((v) => v.viewname)).toEqual([]);

    const matviews = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ matviewname: string }>(
        `SELECT matviewname FROM pg_matviews WHERE definition LIKE '%payment_instruments%'`,
      ),
    );
    expect(matviews.rows.map((v) => v.matviewname)).toEqual([]);

    const generated = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'payment_instruments'
            AND is_generated <> 'NEVER'`,
      ),
    );
    expect(generated.rows.map((c) => c.column_name)).toEqual([]);
  });

  it('no foreign key points from the accounts table at an instrument', async () => {
    // The other direction a derivation could arrive from: an account row that
    // named a "primary instrument" would make the instrument part of the
    // account's identity, and the account is where the balance is.
    const fks = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ conname: string; source: string; target: string }>(
        `SELECT c.conname, s.relname AS source, t.relname AS target
           FROM pg_constraint c
           JOIN pg_class s ON s.oid = c.conrelid
           JOIN pg_class t ON t.oid = c.confrelid
          WHERE c.contype = 'f'
            AND (s.relname = 'payment_instruments' OR t.relname = 'payment_instruments')`,
      ),
    );
    // None in either direction: no foreign key crosses a module boundary.
    expect(fks.rows).toEqual([]);
  });

  it('erasing the account takes BOTH instruments and leaves the account alone', async () => {
    const erased = await eraser.erasePaymentInstruments(
      { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      walletId as FinancialAccountId,
    );
    expect(erased).toEqual({ kind: 'erased', paymentInstrumentsDeleted: 2 });

    // Counted as the bootstrap superuser with RLS bypassed — counting as
    // karar_app would prove the rows are hidden, not that they are gone.
    const remaining = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.payment_instruments WHERE account_id = $1`,
        [walletId],
      ),
    );
    expect(remaining.rows[0]?.count).toBe('0');

    // The account survives: erasing what spends from an account is not
    // erasing the account.
    const accounts = accountsRepository(handle);
    const account = await accounts.findOwnById(
      { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      walletId as FinancialAccountId,
    );
    expect(account).not.toBeNull();
  });

  it('a second erasure is idempotent and answers zero', async () => {
    const again = await eraser.erasePaymentInstruments(
      { tenantId: ACTOR_A1.tenantId, userId: ACTOR_A1.userId },
      walletId as FinancialAccountId,
    );
    expect(again).toEqual({ kind: 'erased', paymentInstrumentsDeleted: 0 });
  });

  it('the repository has no method that could return a per-account figure', async () => {
    // The surface, at runtime. A `countForAccount` or `totalForAccount` added
    // later fails here as well as in the source scan.
    const methods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(repository) as object,
    ).filter((name) => name !== 'constructor');
    expect(methods.sort()).toEqual([
      'create',
      'delete',
      'eraseForAccount',
      'findOwnById',
      'inContext',
      'mapAll',
      'pageOwn',
      'update',
    ]);
  });
});
