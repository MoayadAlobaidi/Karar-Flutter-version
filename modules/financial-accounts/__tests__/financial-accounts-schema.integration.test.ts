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
  testEncryption,
  testRetention,
  withAdapter,
  SYNTHETIC_SOURCE_REFERENCE,
} from './fixtures.js';
import { HsfFieldEncryptionError } from '../application/ports/hsf-field-encryption.js';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  SOURCE_KINDS,
} from '../domain/financial-account.js';
import type { BalanceSnapshotId, FinancialAccountId } from '../domain/refs.js';
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

/**
 * The NOT NULL encryption columns every raw adversarial insert below has to
 * supply. The byte values are deliberate nonsense — these rows are asserted
 * to be REFUSED, so nothing ever decrypts them, and inventing a real
 * ciphertext would only obscure which constraint is under test.
 */
const HSF_COLUMNS =
  'hsf_algorithm, hsf_key_version, display_name_ciphertext, display_name_nonce, display_name_auth_tag';
const HSF_VALUES = [
  `'AES-256-GCM'`,
  `'karar-ref:key-version:synthetic-test-accounts@v1'`,
  `decode('53796e7468657469632052656675736564', 'hex')`,
  `decode('000000000000000000000000', 'hex')`,
  `decode('00000000000000000000000000000000', 'hex')`,
].join(', ');

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
      accounts = new PrismaFinancialAccountRepository(handle, testEncryption());
      snapshots = new PrismaBalanceSnapshotRepository(handle);
      const create = new CreateManualAccount(
        accounts,
        new PrismaInstitutionCatalogueReader(handle),
        testRetention(),
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

    it('NO PLAINTEXT COLUMN exists for the display name, the institution label, or the mask', async () => {
      // The defect this asserts against: three HIGHLY_SENSITIVE_FINANCIAL
      // fields stored as `text` on a table classified HSF, while the
      // transactions module encrypted its equivalents from its first line.
      // Asserted against the LIVE catalogue, because a migration comment
      // claiming ciphertext is worth exactly as much as the column behind it.
      const columns = await columnsOf('financial_accounts');
      for (const plaintext of [
        'display_name',
        'user_supplied_institution_label',
        'mask',
      ]) {
        expect({ column: plaintext, present: columns.has(plaintext) }).toEqual({
          column: plaintext,
          present: false,
        });
      }

      // And what IS there: a ciphertext / nonce / auth-tag triple per field,
      // with the algorithm and key version per row.
      for (const [column, type] of [
        ['display_name_ciphertext', 'bytea'],
        ['display_name_nonce', 'bytea'],
        ['display_name_auth_tag', 'bytea'],
        ['user_supplied_institution_label_ciphertext', 'bytea'],
        ['user_supplied_institution_label_nonce', 'bytea'],
        ['user_supplied_institution_label_auth_tag', 'bytea'],
        ['mask_ciphertext', 'bytea'],
        ['mask_nonce', 'bytea'],
        ['mask_auth_tag', 'bytea'],
        ['hsf_algorithm', 'text'],
        ['hsf_key_version', 'text'],
      ] as const) {
        expect({ column, type: columns.get(column) }).toEqual({ column, type });
      }

      // Nothing else on the table carries free text a subject supplied. The
      // survivors are operational metadata a query has to be able to read.
      const textColumns = [...columns]
        .filter(([, type]) => type === 'text')
        .map(([column]) => column)
        .sort();
      expect(textColumns).toEqual([
        'account_type',
        'currency_code',
        'hsf_algorithm',
        'hsf_key_version',
        'provider_connection_ref',
        'source_kind',
        'status',
      ]);
    });

    it('the mask column still cannot hold a card number, now by BYTE bound', async () => {
      // The shape CHECK could not survive encryption — a CHECK cannot read a
      // ciphertext — so it was removed rather than kept as a rule that never
      // fires. AES-256-GCM is length-preserving, so the eight-byte bound is
      // the domain pattern's own maximum, and a 16-digit PAN does not fit.
      const definition =
        (await checkDefsOf('financial_accounts')).get('financial_accounts_mask_bound_check') ?? '';
      expect(definition).toContain('octet_length(mask_ciphertext) <= 8');

      // The old constraint is gone, and no constraint anywhere on the table
      // still claims to inspect mask characters.
      const checks = await checkDefsOf('financial_accounts');
      expect(checks.has('financial_accounts_mask_check')).toBe(false);
      for (const def of checks.values()) {
        expect(def).not.toContain('[0-9]{2,4}');
      }

      const failure = await asApp(database, gucA1, (tx) =>
        tx
          .query(
            `INSERT INTO public.financial_accounts
               (id, tenant_id, user_id, account_type, currency_code, status, source_kind,
                ${HSF_COLUMNS}, mask_ciphertext, mask_nonce, mask_auth_tag, updated_at)
             VALUES ('99999999-0000-4000-8000-000000000081', $1, $2, 'CREDIT_CARD', 'QAR',
                     'ACTIVE', 'MANUAL', ${HSF_VALUES},
                     -- sixteen bytes: the length of a card number, encrypted
                     decode('41111111111111114111111111111111', 'hex'),
                     decode('000000000000000000000000', 'hex'),
                     decode('00000000000000000000000000000000', 'hex'),
                     now())`,
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

    it('a half-written encrypted field is unrepresentable, in either direction', async () => {
      // A ciphertext without its nonce or its tag is unreadable AND
      // unverifiable; letting one exist would turn a write bug into a
      // permanently unreadable account nobody notices until a page load.
      for (const [label, columns, values] of [
        [
          'mask ciphertext with no tag',
          'mask_ciphertext, mask_nonce',
          `decode('30303030', 'hex'), decode('000000000000000000000000', 'hex')`,
        ],
        [
          'label nonce with no ciphertext',
          'user_supplied_institution_label_nonce',
          `decode('000000000000000000000000', 'hex')`,
        ],
      ] as const) {
        const failure = await asApp(database, gucA1, (tx) =>
          tx
            .query(
              `INSERT INTO public.financial_accounts
                 (id, tenant_id, user_id, account_type, currency_code, status, source_kind,
                  ${HSF_COLUMNS}, ${columns}, updated_at)
               VALUES ('99999999-0000-4000-8000-00000000008a', $1, $2, 'CURRENT', 'QAR',
                       'ACTIVE', 'MANUAL', ${HSF_VALUES}, ${values}, now())`,
              [TenantId.toString(TENANT_A), UserId.toString(USER_A1)],
            )
            .then(
              () => null,
              (error: unknown) => error,
            ),
        );
        expect({ label, sqlState: (failure as PgError).sqlState }).toEqual({
          label,
          sqlState: '23514',
        });
      }
    });

    it('the database refuses a manual account that claims a provider connection', async () => {
      const failure = await asApp(database, gucA1, (tx) =>
        tx
          .query(
            `INSERT INTO public.financial_accounts
               (id, tenant_id, user_id, account_type, currency_code, status,
                source_kind, provider_connection_ref, ${HSF_COLUMNS}, updated_at)
             VALUES ('99999999-0000-4000-8000-000000000082', $1, $2, 'CURRENT', 'QAR',
                     'ACTIVE', 'MANUAL', 'pretend-connection', ${HSF_VALUES}, now())`,
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
               (id, tenant_id, user_id, account_type, currency_code, status,
                source_kind, ${HSF_COLUMNS}, updated_at)
             VALUES ('99999999-0000-4000-8000-000000000083', $1, $2, 'CURRENT', 'QAR',
                     'ACTIVE', 'EXTERNAL_PROVIDER', ${HSF_VALUES}, now())`,
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
               (id, tenant_id, user_id, institution_ref,
                user_supplied_institution_label_ciphertext,
                user_supplied_institution_label_nonce,
                user_supplied_institution_label_auth_tag,
                account_type, currency_code, status, source_kind, ${HSF_COLUMNS}, updated_at)
             VALUES ('99999999-0000-4000-8000-000000000084', $1, $2,
                     '11111111-0000-4000-8000-000000000011',
                     decode('4142', 'hex'),
                     decode('000000000000000000000000', 'hex'),
                     decode('00000000000000000000000000000000', 'hex'),
                     'CURRENT', 'QAR', 'ACTIVE', 'MANUAL', ${HSF_VALUES}, now())`,
            [TenantId.toString(TENANT_A), UserId.toString(USER_A1)],
          )
          .then(
            () => null,
            (error: unknown) => error,
          ),
      );
      expect((failure as PgError).sqlState).toBe('23514');
    });

    it('a ciphertext transplanted BETWEEN ROWS in the real table fails to read back', async () => {
      // The database-level version of the associated-data guarantee. Someone
      // with write access to the table — a compromised backup restore, a bad
      // migration, an operator — copies one account's encrypted name onto
      // another row. The read must FAIL rather than render the wrong person's
      // account name, which is what a row-level checksum would miss.
      const planted = '99999999-0000-4000-8000-0000000000f0' as FinancialAccountId;
      await withAdapter(database, 'superuser', (adapter) =>
        adapter.query(
          `INSERT INTO public.financial_accounts
             (id, tenant_id, user_id, account_type, currency_code, status, source_kind,
              hsf_algorithm, hsf_key_version,
              display_name_ciphertext, display_name_nonce, display_name_auth_tag, updated_at)
           SELECT $1, tenant_id, user_id, account_type, currency_code, status, source_kind,
                  hsf_algorithm, hsf_key_version,
                  display_name_ciphertext, display_name_nonce, display_name_auth_tag, now()
             FROM public.financial_accounts WHERE id = $2`,
          [planted, accountId],
        ),
      );

      const failure = await accounts.findOwnById(ACTOR_A1, planted).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(HsfFieldEncryptionError);
      expect((failure as HsfFieldEncryptionError).kind).toBe('decryption_failed');
      // No plaintext in the failure, and no hint about whose row it came from.
      expect((failure as Error).message).not.toContain('Synthetic');

      // The row it was copied FROM is still perfectly readable: the failure is
      // the transplant, not a broken adapter.
      const original = await accounts.findOwnById(ACTOR_A1, accountId);
      expect(original?.displayName.reveal()).toBe('Synthetic Test Account With Records');

      await withAdapter(database, 'superuser', (adapter) =>
        adapter.query('DELETE FROM public.financial_accounts WHERE id = $1', [planted]),
      );
    });

    it('a ciphertext transplanted BETWEEN FIELDS on one row fails to read back', async () => {
      // A mask presented as an account name, or the reverse: both would
      // decrypt into something a reader would believe, if the field were not
      // bound as associated data.
      const planted = '99999999-0000-4000-8000-0000000000f1' as FinancialAccountId;
      await withAdapter(database, 'superuser', (adapter) =>
        adapter.query(
          `INSERT INTO public.financial_accounts
             (id, tenant_id, user_id, account_type, currency_code, status, source_kind,
              hsf_algorithm, hsf_key_version,
              display_name_ciphertext, display_name_nonce, display_name_auth_tag, updated_at)
           SELECT $1, tenant_id, user_id, account_type, currency_code, status, source_kind,
                  hsf_algorithm, hsf_key_version,
                  -- the MASK ciphertext, written into the display-name columns
                  mask_ciphertext, mask_nonce, mask_auth_tag, now()
             FROM public.financial_accounts WHERE id = $2`,
          [planted, accountId],
        ),
      );

      const failure = await accounts.findOwnById(ACTOR_A1, planted).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(HsfFieldEncryptionError);
      expect((failure as HsfFieldEncryptionError).kind).toBe('decryption_failed');

      await withAdapter(database, 'superuser', (adapter) =>
        adapter.query('DELETE FROM public.financial_accounts WHERE id = $1', [planted]),
      );
    });

    it('the stored bytes contain no plaintext, and the row still carries its key provenance', async () => {
      const row = await asApp(database, gucA1, (tx) =>
        tx.query<{
          name_bytes: string;
          mask_len: number;
          algorithm: string;
          key_version: string;
        }>(
          `SELECT encode(display_name_ciphertext, 'escape') AS name_bytes,
                  octet_length(mask_ciphertext)             AS mask_len,
                  hsf_algorithm                             AS algorithm,
                  hsf_key_version                           AS key_version
             FROM public.financial_accounts WHERE id = $1`,
          [accountId],
        ),
      );
      const stored = row.rows[0];
      expect(stored?.name_bytes).not.toContain('Synthetic');
      expect(stored?.name_bytes).not.toContain('Account');
      // Length-preserving, so the mask ciphertext is exactly the mask length.
      expect(stored?.mask_len).toBe('*0000'.length);
      expect(stored?.algorithm).toBe('AES-256-GCM');
      expect(stored?.key_version).not.toBe('');
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
        sourceReference: SYNTHETIC_SOURCE_REFERENCE,
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
        sourceReference: SYNTHETIC_SOURCE_REFERENCE,
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
                     'MANUAL', $4, now())`,
            [
              TenantId.toString(TENANT_A),
              UserId.toString(USER_A1),
              accountId,
              SYNTHETIC_SOURCE_REFERENCE,
            ],
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
