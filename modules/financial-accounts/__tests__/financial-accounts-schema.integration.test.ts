/**
 * Structural guarantees, verified against the LIVE schema rather than against
 * prose in a migration header.
 *
 * Three families of claim are checked here, and each of them is a claim this
 * module makes elsewhere in words:
 *
 * 1. **What cannot be stored.** No account-number, IBAN, PAN, CVV, credential,
 *    or sync-cursor column exists; the catalogue carries no subject linkage;
 *    the mask column refuses a real number at the database. A comment saying
 *    so is worth exactly as much as the constraint behind it.
 * 2. **Code and schema agree.** The closed CHECK vocabularies for currency,
 *    account type, status, and source kind are compared against the
 *    compile-time unions. A drift here would let a row exist that the mapper
 *    then refuses to read — a defect that surfaces as an outage rather than a
 *    test failure.
 * 3. **Money survives the round trip exactly**, including beyond the range a
 *    JavaScript number can count, and the currency-immutability invariant is
 *    enforced by referential integrity rather than by remembering to call a
 *    function.
 *
 * All fixtures are obviously synthetic.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, Currency, Money, TenantId, UserId } from '@karar/shared-kernel';
import { PgError } from '@karar/platform/dist/db/index.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  ACTOR_A1,
  TENANT_A,
  USER_A1,
  asApp,
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  skipBanner,
  superuserMaintenanceProfile,
} from './fixtures.js';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  SOURCE_KINDS,
} from '../domain/financial-account.js';
import type { BalanceSnapshotId, FinancialAccountId, SourceReference } from '../domain/refs.js';
import { PrismaBalanceSnapshotRepository } from '../infrastructure/persistence/prisma-balance-snapshot-repository.js';
import { PrismaFinancialAccountRepository } from '../infrastructure/persistence/prisma-financial-account-repository.js';
import { PrismaInstitutionCatalogueReader } from '../infrastructure/persistence/prisma-institution-catalogue-reader.js';
import { CreateManualAccount } from '../application/use-cases/create-manual-account.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'FINANCIAL-ACCOUNTS SCHEMA TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_financial_accounts_schema`;
const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));
const QAR = Currency.get('QAR');
const KWD = Currency.get('KWD');

const MODULE_TABLES = [
  'institutions',
  'financial_accounts',
  'financial_account_balance_snapshots',
] as const;

let handle: PrismaHandle;
let accounts: PrismaFinancialAccountRepository;
let snapshots: PrismaBalanceSnapshotRepository;
let accountId = '' as FinancialAccountId;
let emptyAccountId = '' as FinancialAccountId;

const gucA1 = { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) };

/** Column names and SQL types for one table, from the live catalogue. */
async function columnsOf(table: string): Promise<Map<string, string>> {
  const rows = await asApp(database, gucA1, (tx) =>
    tx.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    ),
  );
  return new Map(rows.rows.map((row) => [row.column_name, row.data_type]));
}

/** Definitions of every CHECK constraint on one table, from the live catalogue. */
async function checkDefsOf(table: string): Promise<Map<string, string>> {
  const rows = await asApp(database, gucA1, (tx) =>
    tx.query<{ conname: string; def: string }>(
      `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = ('public.' || $1)::regclass AND contype = 'c'`,
      [table],
    ),
  );
  return new Map(rows.rows.map((row) => [row.conname, row.def]));
}

/**
 * The vocabulary literals inside a CHECK definition. PostgreSQL renders an
 * `IN (...)` list back as `= ANY (ARRAY['QAR'::text, ...])`, so the casts are
 * stripped and only the SCREAMING_CASE members are kept — a pattern or a
 * length bound in the same constraint is not a vocabulary member.
 */
function literalsIn(definition: string): string[] {
  return [...definition.matchAll(/'([^']*)'/g)]
    .map((match) => match[1] ?? '')
    .filter((value) => /^[A-Z][A-Z_]*$/.test(value));
}

describe.skipIf(unreachable !== null)(
  'financial-account schema — structural guarantees (live PostgreSQL)',
  () => {
    beforeAll(async () => {
      await provisionDatabase(database);
      handle = buildHandle(database);
      accounts = new PrismaFinancialAccountRepository(handle);
      snapshots = new PrismaBalanceSnapshotRepository(handle);
      const create = new CreateManualAccount(
        accounts,
        new PrismaInstitutionCatalogueReader(handle),
        new Uuidv7IdSource(),
        clock,
      );
      const withRecords = await create.execute(
        {
          accountType: 'CURRENT',
          currencyCode: 'QAR',
          displayName: 'Synthetic Test Account With Records',
          institutionRef: null,
          userSuppliedInstitutionLabel: null,
          mask: '*0000',
        },
        ACTOR_A1,
      );
      if (!withRecords.ok) throw new Error(`fixture create failed: ${withRecords.error.kind}`);
      accountId = withRecords.value.id;

      const empty = await create.execute(
        {
          accountType: 'CASH',
          currencyCode: 'QAR',
          displayName: 'Synthetic Test Account Without Records',
          institutionRef: null,
          userSuppliedInstitutionLabel: null,
          mask: null,
        },
        ACTOR_A1,
      );
      if (!empty.ok) throw new Error(`fixture create failed: ${empty.error.kind}`);
      emptyAccountId = empty.value.id;
    }, 90_000);

    afterAll(async () => {
      await handle?.end();
      await dropDatabase(database);
    });

    it('no table in this module has a column that could hold a real account identifier', async () => {
      // The point of the module: the sensitive value is structurally absent,
      // not merely unused. If any of these names ever appears, the guarantee
      // is gone and this test is where it is noticed.
      const forbidden =
        /(account_number|accountnumber|^iban|_iban|^pan$|_pan$|card_number|cardnumber|cvv|cvc|credential|password|secret|token|access_key|sync_cursor|sync_token)/;
      const offenders: string[] = [];
      for (const table of MODULE_TABLES) {
        for (const column of (await columnsOf(table)).keys()) {
          if (forbidden.test(column)) offenders.push(`${table}.${column}`);
        }
      }
      expect(offenders).toEqual([]);
    });

    it('the institution catalogue is structurally incapable of subject linkage', async () => {
      const columns = await columnsOf('institutions');
      expect([...columns.keys()].sort()).toEqual([
        'code',
        'created_at',
        'display_name_ar',
        'display_name_en',
        'id',
        'status',
        'updated_at',
      ]);
      for (const forbidden of ['tenant_id', 'user_id', 'account_id', 'subject_id']) {
        expect(columns.has(forbidden)).toBe(false);
      }
    });

    it('both subject tables carry BOTH principal columns, which is what the policy keys on', async () => {
      for (const table of ['financial_accounts', 'financial_account_balance_snapshots'] as const) {
        const columns = await columnsOf(table);
        expect({ table, tenant: columns.get('tenant_id') }).toEqual({ table, tenant: 'uuid' });
        expect({ table, user: columns.get('user_id') }).toEqual({ table, user: 'uuid' });
      }
    });

    it('money is BIGINT minor units, and no float type exists anywhere in this module', async () => {
      const snapshotColumns = await columnsOf('financial_account_balance_snapshots');
      expect(snapshotColumns.get('amount_minor_units')).toBe('bigint');

      const floats = ['numeric', 'double precision', 'real', 'money'];
      const offenders: string[] = [];
      for (const table of MODULE_TABLES) {
        for (const [column, type] of await columnsOf(table)) {
          if (floats.includes(type)) offenders.push(`${table}.${column} (${type})`);
        }
      }
      expect(offenders).toEqual([]);
    });

    it('the database currency vocabulary is exactly the shared-kernel registry', async () => {
      // A divergence here means a row can exist whose currency the platform
      // cannot interpret, or a currency the code offers that the database
      // refuses. Both are silent until someone hits them.
      const expected = [...Currency.codes()].sort();
      for (const [table, constraint] of [
        ['financial_accounts', 'financial_accounts_currency_code_check'],
        [
          'financial_account_balance_snapshots',
          'financial_account_balance_snapshots_currency_code_check',
        ],
      ] as const) {
        const definition = (await checkDefsOf(table)).get(constraint);
        expect({ table, hasConstraint: definition !== undefined }).toEqual({
          table,
          hasConstraint: true,
        });
        expect({ table, codes: literalsIn(definition ?? '').sort() }).toEqual({
          table,
          codes: expected,
        });
      }
    });

    it('the account vocabularies match their compile-time unions, and none means connected', async () => {
      const checks = await checkDefsOf('financial_accounts');
      expect(literalsIn(checks.get('financial_accounts_account_type_check') ?? '').sort()).toEqual(
        [...ACCOUNT_TYPES].sort(),
      );
      expect(literalsIn(checks.get('financial_accounts_status_check') ?? '').sort()).toEqual(
        [...ACCOUNT_STATUSES].sort(),
      );
      expect(literalsIn(checks.get('financial_accounts_source_kind_check') ?? '').sort()).toEqual(
        [...SOURCE_KINDS].sort(),
      );
      for (const status of literalsIn(checks.get('financial_accounts_status_check') ?? '')) {
        expect(/CONNECT|SYNC|LINK/i.test(status)).toBe(false);
      }
    });

    it('the mask CHECK carries the same pattern as the domain rule', async () => {
      const definition =
        (await checkDefsOf('financial_accounts')).get('financial_accounts_mask_check') ?? '';
      expect(definition).toContain('^[*xX#]{0,4}[0-9]{2,4}$');
    });

    it('the database itself refuses a full card number in the mask column', async () => {
      const failure = await asApp(database, gucA1, (tx) =>
        tx
          .query(
            `INSERT INTO public.financial_accounts
               (id, tenant_id, user_id, account_type, currency_code, display_name, mask, status, source_kind, updated_at)
             VALUES ('99999999-0000-4000-8000-000000000081', $1, $2, 'CREDIT_CARD', 'QAR',
                     'Synthetic Refused Account', '4111111111111111', 'ACTIVE', 'MANUAL', now())`,
            [TenantId.toString(TENANT_A), UserId.toString(USER_A1)],
          )
          .then(
            () => null,
            (error: unknown) => error,
          ),
      );
      expect(failure).toBeInstanceOf(PgError);
      expect((failure as PgError).sqlState).toBe('23514'); // check_violation
    });

    it('the database refuses a manual account that claims a provider connection', async () => {
      const failure = await asApp(database, gucA1, (tx) =>
        tx
          .query(
            `INSERT INTO public.financial_accounts
               (id, tenant_id, user_id, account_type, currency_code, display_name, status,
                source_kind, provider_connection_ref, updated_at)
             VALUES ('99999999-0000-4000-8000-000000000082', $1, $2, 'CURRENT', 'QAR',
                     'Synthetic Refused Account', 'ACTIVE', 'MANUAL', 'pretend-connection', now())`,
            [TenantId.toString(TENANT_A), UserId.toString(USER_A1)],
          )
          .then(
            () => null,
            (error: unknown) => error,
          ),
      );
      expect((failure as PgError).sqlState).toBe('23514');
    });

    it('the database refuses an external-provider account with no connection reference', async () => {
      const failure = await asApp(database, gucA1, (tx) =>
        tx
          .query(
            `INSERT INTO public.financial_accounts
               (id, tenant_id, user_id, account_type, currency_code, display_name, status,
                source_kind, updated_at)
             VALUES ('99999999-0000-4000-8000-000000000083', $1, $2, 'CURRENT', 'QAR',
                     'Synthetic Refused Account', 'ACTIVE', 'EXTERNAL_PROVIDER', now())`,
            [TenantId.toString(TENANT_A), UserId.toString(USER_A1)],
          )
          .then(
            () => null,
            (error: unknown) => error,
          ),
      );
      expect((failure as PgError).sqlState).toBe('23514');
    });

    it('the database refuses an account that names its institution both ways', async () => {
      const failure = await asApp(database, gucA1, (tx) =>
        tx
          .query(
            `INSERT INTO public.financial_accounts
               (id, tenant_id, user_id, institution_ref, user_supplied_institution_label,
                account_type, currency_code, display_name, status, source_kind, updated_at)
             VALUES ('99999999-0000-4000-8000-000000000084', $1, $2,
                     '11111111-0000-4000-8000-000000000011', 'Synthetic Unlisted Institution',
                     'CURRENT', 'QAR', 'Synthetic Refused Account', 'ACTIVE', 'MANUAL', now())`,
            [TenantId.toString(TENANT_A), UserId.toString(USER_A1)],
          )
          .then(
            () => null,
            (error: unknown) => error,
          ),
      );
      expect((failure as PgError).sqlState).toBe('23514');
    });

    it('money round-trips exactly through the database, beyond the safe integer range', async () => {
      // 2^53 + 1 in minor units: a value a JavaScript number cannot hold. If
      // any layer converts through a float, this is where it shows.
      const beyondSafeInteger = 9007199254740993n;
      const stored = await snapshots.append(ACTOR_A1, {
        id: 'b5000000-0000-4000-8000-0000000000c1' as BalanceSnapshotId,
        tenantId: TENANT_A,
        userId: USER_A1,
        accountId,
        amount: Money.of(beyondSafeInteger, QAR),
        asOf: clock.now(),
        sourceKind: 'MANUAL',
        sourceReference: 'synthetic-test-fixture' as SourceReference,
        capturedAt: clock.now(),
        createdAt: clock.now(),
      });
      expect(stored.amount.minorUnits).toBe(beyondSafeInteger);

      // And straight from the database, as text, so nothing in the driver can
      // launder the value on the way out.
      const raw = await asApp(database, gucA1, (tx) =>
        tx.query<{ amount: string }>(
          `SELECT amount_minor_units::text AS amount FROM public.financial_account_balance_snapshots
           WHERE id = 'b5000000-0000-4000-8000-0000000000c1'`,
        ),
      );
      expect(raw.rows[0]?.amount).toBe('9007199254740993');
    });

    it('a negative reported balance is storable, because a credit card owes money', async () => {
      const owed = await snapshots.append(ACTOR_A1, {
        id: 'b5000000-0000-4000-8000-0000000000c2' as BalanceSnapshotId,
        tenantId: TENANT_A,
        userId: USER_A1,
        accountId,
        amount: Money.fromDecimalString('-1234.56', QAR),
        asOf: clock.now(),
        sourceKind: 'MANUAL',
        sourceReference: 'synthetic-test-fixture' as SourceReference,
        capturedAt: clock.now(),
        createdAt: clock.now(),
      });
      expect(owed.amount.minorUnits).toBe(-123456n);
      expect(owed.amount.toString()).toBe('QAR -1234.56');
    });

    it('a snapshot cannot carry a currency its account does not have', async () => {
      const failure = await asApp(database, gucA1, (tx) =>
        tx
          .query(
            `INSERT INTO public.financial_account_balance_snapshots
               (id, tenant_id, user_id, account_id, amount_minor_units, currency_code, as_of,
                source_kind, source_reference, captured_at)
             VALUES ('99999999-0000-4000-8000-000000000085', $1, $2, $3, 1000, 'KWD', now(),
                     'MANUAL', 'synthetic-test-fixture', now())`,
            [TenantId.toString(TENANT_A), UserId.toString(USER_A1), accountId],
          )
          .then(
            () => null,
            (error: unknown) => error,
          ),
      );
      expect(failure).toBeInstanceOf(PgError);
      expect((failure as PgError).sqlState).toBe('23503'); // foreign_key_violation
    });

    it('referential integrity freezes an account currency once a record exists, and frees it when none does', async () => {
      // With records: refused by the database, independently of the use case.
      const frozen = await asApp(database, gucA1, (tx) =>
        tx
          .query(
            `UPDATE public.financial_accounts SET currency_code = 'KWD', version = version + 1 WHERE id = $1`,
            [accountId],
          )
          .then(
            () => null,
            (error: unknown) => error,
          ),
      );
      expect(frozen).toBeInstanceOf(PgError);
      expect((frozen as PgError).sqlState).toBe('23503');

      // Without records: permitted, because a person who picked the wrong
      // currency on an empty account should be able to fix it.
      const corrected = await asApp(database, gucA1, (tx) =>
        tx.query(
          `UPDATE public.financial_accounts SET currency_code = 'KWD', version = version + 1 WHERE id = $1`,
          [emptyAccountId],
        ),
      );
      expect(corrected.rowCount).toBe(1);
      const reread = await accounts.findOwnById(ACTOR_A1, emptyAccountId);
      expect(reread?.currency.code).toBe(KWD.code);
    });

    it('deleting an account cascades to its reported balances at the database layer', async () => {
      // The application deletes the snapshots explicitly; this proves the
      // foreign key would carry the erasure even if that statement vanished.
      const before = await snapshots.countForAccount(ACTOR_A1, accountId);
      expect(before).toBeGreaterThan(0);

      await asApp(database, gucA1, (tx) =>
        tx.query('DELETE FROM public.financial_accounts WHERE id = $1', [accountId]),
      );
      expect(await snapshots.countForAccount(ACTOR_A1, accountId)).toBe(0);
    });
  },
);
