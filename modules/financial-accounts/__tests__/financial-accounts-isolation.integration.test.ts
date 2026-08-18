/**
 * ADVERSARIAL ISOLATION for `financial_accounts` and
 * `financial_account_balance_snapshots` against live PostgreSQL
 * (tenancy.md §2 layer 4; ADR-0022; legacy AZ2).
 *
 * The shape of every test here follows one rule: **seed BOTH sides, assert
 * the legitimate read is NON-EMPTY first, then attack.** An isolation test
 * over an empty table proves the table is empty and nothing else, and this
 * repository rejects them.
 *
 * Three principals, chosen so the interesting failure is covered:
 *   A1 and A2 are two people in ONE tenant — the case a tenant-only policy
 *       would get wrong, and the reason both GUCs are in the policy;
 *   B1 is in a different tenant.
 *
 * Every attack path is exercised at three layers: direct SQL as `karar_app`
 * (with the wrong GUCs and with none), the real Prisma repositories, and the
 * use cases. There is no authorization layer in front of any of it on
 * purpose: what these tests prove is that RLS ALONE holds the boundary.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, Currency, Money, TenantId, UserId } from '@karar/shared-kernel';
import { PgError } from '@karar/platform/dist/db/index.js';
import { PrincipalContextError } from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  ACTOR_A1,
  ACTOR_A2,
  ACTOR_B1,
  BIND_GUCS,
  INSTITUTION_ACTIVE,
  TENANT_A,
  TENANT_B,
  USER_A1,
  USER_A2,
  USER_B1,
  asApp,
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  skipBanner,
  testEncryption,
  testRetention,
  SYNTHETIC_SOURCE_REFERENCE,
  superuserMaintenanceProfile,
  withAdapter,
} from './fixtures.js';
import { CreateManualAccount } from '../application/use-cases/create-manual-account.js';
import { DeleteOwnAccount } from '../application/use-cases/delete-own-account.js';
import { ListOwnAccounts } from '../application/use-cases/list-own-accounts.js';
import { ListOwnBalanceSnapshots } from '../application/use-cases/list-own-balance-snapshots.js';
import { ReadOwnAccount } from '../application/use-cases/read-own-account.js';
import { UpdateOwnAccount } from '../application/use-cases/update-own-account.js';
import {
  NO_RECORDS_ERASED,
  type FinancialRecordEraserPort,
} from '../application/ports/financial-record-eraser.js';
import type { FinancialRecordPresencePort } from '../application/ports/financial-record-presence.js';
import type { AccountsPrincipal } from '../application/principal.js';
import type { BalanceSnapshotId, FinancialAccountId } from '../domain/refs.js';
import { PrismaBalanceSnapshotRepository } from '../infrastructure/persistence/prisma-balance-snapshot-repository.js';
import { PrismaFinancialAccountRepository } from '../infrastructure/persistence/prisma-financial-account-repository.js';
import { PrismaInstitutionCatalogueReader } from '../infrastructure/persistence/prisma-institution-catalogue-reader.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'FINANCIAL-ACCOUNTS ISOLATION TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_financial_accounts_rls`;
const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));
const QAR = Currency.get('QAR');

/** A1's identity presented with a session claiming tenant B. */
const actorA1inB: AccountsPrincipal = { tenantId: TENANT_B, userId: USER_A1 };

let handle: PrismaHandle;
let accounts: PrismaFinancialAccountRepository;
let snapshots: PrismaBalanceSnapshotRepository;
let institutions: PrismaInstitutionCatalogueReader;
let createAccount: CreateManualAccount;
let listAccounts: ListOwnAccounts;
let readAccount: ReadOwnAccount;
let updateAccount: UpdateOwnAccount;
let deleteAccount: DeleteOwnAccount;
let listSnapshots: ListOwnBalanceSnapshots;

/**
 * The NOT NULL encryption columns every raw adversarial insert here has to
 * supply. Deliberate nonsense bytes: these rows are asserted to be REFUSED by
 * RLS, so nothing decrypts them, and a real ciphertext would only obscure
 * which boundary is under test.
 */
const HSF_COLUMNS =
  'hsf_algorithm, hsf_key_version, display_name_ciphertext, display_name_nonce, display_name_auth_tag';
const HSF_VALUES = [
  `'AES-256-GCM'`,
  `'karar-ref:key-version:synthetic-test-accounts@v1'`,
  `decode('506c616e746564', 'hex')`,
  `decode('000000000000000000000000', 'hex')`,
  `decode('00000000000000000000000000000000', 'hex')`,
].join(', ');

/**
 * This suite holds no transaction store, so the two cross-module ports answer
 * the only honest thing available: nothing exists, and nothing was erased.
 * The behaviour that depends on them is covered where it can be observed —
 * the use-case suite and the erasure suite — rather than simulated here.
 */
const NO_FINANCIAL_RECORDS: FinancialRecordPresencePort = {
  hasAnyRecordForAccount: (_actor, accountId) =>
    Promise.resolve({ accountId, hasAnyRecord: false }),
};
const ERASES_NOTHING: FinancialRecordEraserPort = {
  eraseAccountScopedRecords: () =>
    Promise.resolve({ kind: 'erased', deleted: NO_RECORDS_ERASED }),
};

/** Seeded, one per principal, so both sides of every assertion are populated. */
let accountA1 = '' as FinancialAccountId;
let accountA2 = '' as FinancialAccountId;
let accountB1 = '' as FinancialAccountId;

function manualInput(displayName: string) {
  return {
    accountType: 'CURRENT' as const,
    currencyCode: 'QAR',
    displayName,
    institutionRef: null,
    userSuppliedInstitutionLabel: null,
    mask: '0000',
  };
}

async function seedSnapshot(
  actor: AccountsPrincipal,
  accountId: FinancialAccountId,
  id: string,
  minorUnits: bigint,
): Promise<void> {
  await snapshots.append(actor, {
    id: id as BalanceSnapshotId,
    tenantId: actor.tenantId,
    userId: actor.userId,
    accountId,
    amount: Money.of(minorUnits, QAR),
    asOf: clock.now(),
    sourceKind: 'MANUAL',
    balanceKind: 'BOOKED',
    sourceReference: SYNTHETIC_SOURCE_REFERENCE,
    capturedAt: clock.now(),
    createdAt: clock.now(),
  });
}

describe.skipIf(unreachable !== null)(
  'financial-account tables — adversarial isolation (live PostgreSQL)',
  () => {
    beforeAll(async () => {
      await provisionDatabase(database);
      handle = buildHandle(database);
      accounts = new PrismaFinancialAccountRepository(handle, testEncryption());
      snapshots = new PrismaBalanceSnapshotRepository(handle);
      institutions = new PrismaInstitutionCatalogueReader(handle);
      const ids = new Uuidv7IdSource();
      createAccount = new CreateManualAccount(
        accounts,
        institutions,
        testRetention(),
        ids,
        clock,
      );
      listAccounts = new ListOwnAccounts(accounts);
      readAccount = new ReadOwnAccount(accounts);
      // No transaction store exists in this suite, so the presence port answers
      // "no records" — the currency rule's other half is covered by the
      // use-case suite and by the erasure suite, and a fake that lied here
      // would only hide which layer this file is testing.
      updateAccount = new UpdateOwnAccount(
        accounts,
        snapshots,
        NO_FINANCIAL_RECORDS,
        institutions,
        clock,
      );
      deleteAccount = new DeleteOwnAccount(accounts, ERASES_NOTHING);
      listSnapshots = new ListOwnBalanceSnapshots(accounts, snapshots);

      // BOTH SIDES SEEDED, through the real write path.
      for (const [actor, name, sink] of [
        [ACTOR_A1, 'Synthetic Test Account A1', 'a1'],
        [ACTOR_A2, 'Synthetic Test Account A2', 'a2'],
        [ACTOR_B1, 'Synthetic Test Account B1', 'b1'],
      ] as const) {
        const created = await createAccount.execute(manualInput(name), actor);
        if (!created.ok) throw new Error(`fixture create failed: ${created.error.kind}`);
        if (sink === 'a1') accountA1 = created.value.id;
        if (sink === 'a2') accountA2 = created.value.id;
        if (sink === 'b1') accountB1 = created.value.id;
      }
      await seedSnapshot(ACTOR_A1, accountA1, 'b5000000-0000-4000-8000-0000000000a1', 100_00n);
      await seedSnapshot(ACTOR_A2, accountA2, 'b5000000-0000-4000-8000-0000000000a2', 200_00n);
      await seedSnapshot(ACTOR_B1, accountB1, 'b5000000-0000-4000-8000-0000000000b1', 300_00n);
    }, 90_000);

    afterAll(async () => {
      await handle?.end();
      await dropDatabase(database);
    });

    it('AZ2, NON-EMPTY FIRST: every principal sees exactly its own account at every layer', async () => {
      // Direct SQL under each principal's own context.
      for (const [tenantId, userId, expected] of [
        [TenantId.toString(TENANT_A), UserId.toString(USER_A1), '1'],
        [TenantId.toString(TENANT_A), UserId.toString(USER_A2), '1'],
        [TenantId.toString(TENANT_B), UserId.toString(USER_B1), '1'],
      ] as const) {
        const count = await asApp(database, { tenantId, userId }, async (tx) =>
          (
            await tx.query<{ n: string }>(
              'SELECT count(*)::text AS n FROM public.financial_accounts',
            )
          ).rows[0]?.n,
        );
        expect({ userId, count }).toEqual({ userId, count: expected });
      }

      // Repository and use case agree, and the content is the caller's own.
      const own = await accounts.listOwn(ACTOR_A1);
      expect(own).toHaveLength(1);
      expect(own[0]?.displayName.reveal()).toBe('Synthetic Test Account A1');

      const listed = await listAccounts.execute(ACTOR_A2);
      expect(listed.ok).toBe(true);
      if (listed.ok) {
        expect(listed.value).toHaveLength(1);
        expect(listed.value[0]?.displayName.reveal()).toBe('Synthetic Test Account A2');
      }
    });

    it('SAME TENANT, DIFFERENT USER: A2 cannot see, read, or list A1 accounts', async () => {
      // This is the case a tenant-only policy gets wrong, and the reason the
      // policy carries the user arm.
      await asApp(
        database,
        { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) },
        async (tx) => {
          const rows = await tx.query<{ id: string }>('SELECT id FROM public.financial_accounts');
          expect(rows.rows.map((row) => row.id)).toEqual([accountA2]);
          const targeted = await tx.query('SELECT * FROM public.financial_accounts WHERE id = $1', [
            accountA1,
          ]);
          expect(targeted.rowCount).toBe(0);
        },
      );

      expect(await accounts.findOwnById(ACTOR_A2, accountA1)).toBeNull();

      const read = await readAccount.execute({ accountId: accountA1 }, ACTOR_A2);
      expect(read.ok).toBe(false);
      if (!read.ok) expect(read.error.kind).toBe('account_not_found');
    });

    it('a guessed account id is indistinguishable from a real one belonging to someone else', async () => {
      const guessed = await readAccount.execute(
        { accountId: '00000000-0000-4000-8000-000000000000' as FinancialAccountId },
        ACTOR_A1,
      );
      const neighbour = await readAccount.execute({ accountId: accountA2 }, ACTOR_A1);
      const otherTenant = await readAccount.execute({ accountId: accountB1 }, ACTOR_A1);

      const answers = [guessed, neighbour, otherTenant].map((outcome) =>
        outcome.ok ? 'ok' : `${outcome.error.kind}|${outcome.error.message}`,
      );
      expect(new Set(answers).size).toBe(1);
      expect(answers[0]).toContain('account_not_found');
    });

    it('cross-tenant: a tenant-B session sees nothing of tenant A, and A stays non-empty', async () => {
      expect(await accounts.findOwnById(actorA1inB, accountA1)).toBeNull();
      expect(await accounts.listOwn(ACTOR_B1)).toHaveLength(1);

      await asApp(
        database,
        { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(USER_B1) },
        async (tx) => {
          const select = await tx.query(
            'SELECT * FROM public.financial_accounts WHERE tenant_id = $1',
            [TenantId.toString(TENANT_A)],
          );
          expect(select.rowCount).toBe(0);
          const update = await tx.query(
            `UPDATE public.financial_accounts SET status = 'CLOSED', version = version + 1
             WHERE tenant_id = $1`,
            [TenantId.toString(TENANT_A)],
          );
          expect(update.rowCount).toBe(0);
          const removed = await tx.query(
            'DELETE FROM public.financial_accounts WHERE tenant_id = $1',
            [TenantId.toString(TENANT_A)],
          );
          expect(removed.rowCount).toBe(0);
        },
      );

      // Untouched.
      const survivor = await accounts.findOwnById(ACTOR_A1, accountA1);
      expect(survivor?.displayName.reveal()).toBe('Synthetic Test Account A1');
      expect(survivor?.version).toBe(1);
    });

    it('missing GUCs: no account and no snapshot exists at all', async () => {
      await asApp(database, {}, async (tx) => {
        for (const table of [
          'financial_accounts',
          'financial_account_balance_snapshots',
        ] as const) {
          const rows = await tx.query(`SELECT * FROM public.${table}`);
          expect({ table, count: rows.rowCount }).toEqual({ table, count: 0 });
        }
      });
    });

    it('INSERT is bound to the acting principal by WITH CHECK (42501 for anyone else)', async () => {
      const gucA1 = {
        tenantId: TenantId.toString(TENANT_A),
        userId: UserId.toString(USER_A1),
      };
      // Same tenant, someone else's user id.
      const forNeighbour = await asApp(database, gucA1, (tx) =>
        tx
          .query(
            `INSERT INTO public.financial_accounts
               (id, tenant_id, user_id, account_type, currency_code, status, origin_kind,
                ${HSF_COLUMNS}, updated_at)
             VALUES ('99999999-0000-4000-8000-000000000091', $1, $2, 'CURRENT', 'QAR',
                     'ACTIVE', 'MANUAL', ${HSF_VALUES}, now())`,
            [TenantId.toString(TENANT_A), UserId.toString(USER_A2)],
          )
          .then(
            () => null,
            (error: unknown) => error,
          ),
      );
      expect(forNeighbour).toBeInstanceOf(PgError);
      expect((forNeighbour as PgError).sqlState).toBe('42501');

      // Another tenant entirely.
      const forOtherTenant = await asApp(database, gucA1, (tx) =>
        tx
          .query(
            `INSERT INTO public.financial_accounts
               (id, tenant_id, user_id, account_type, currency_code, status, origin_kind,
                ${HSF_COLUMNS}, updated_at)
             VALUES ('99999999-0000-4000-8000-000000000092', $1, $2, 'CURRENT', 'QAR',
                     'ACTIVE', 'MANUAL', ${HSF_VALUES}, now())`,
            [TenantId.toString(TENANT_B), UserId.toString(USER_A1)],
          )
          .then(
            () => null,
            (error: unknown) => error,
          ),
      );
      expect((forOtherTenant as PgError).sqlState).toBe('42501');
    });

    it('the ALLOWED insert shape (own tenant AND own user) works — proven and rolled back', async () => {
      // Positive control for the two denials above: the check is not "every
      // insert fails". Rolled back so the seeded counts stay exact.
      await withAdapter(database, 'app', async (adapter) => {
        const marker = new Error('rollback-after-proof');
        const failure = await adapter
          .withTransaction(async (tx) => {
            await tx.query(BIND_GUCS, [
              TenantId.toString(TENANT_A),
              UserId.toString(USER_A1),
            ]);
            const inserted = await tx.query(
              `INSERT INTO public.financial_accounts
                 (id, tenant_id, user_id, account_type, currency_code, status, origin_kind,
                  ${HSF_COLUMNS}, updated_at)
               VALUES ('99999999-0000-4000-8000-000000000093', $1, $2, 'CASH', 'QAR',
                       'ACTIVE', 'MANUAL', ${HSF_VALUES}, now())`,
              [TenantId.toString(TENANT_A), UserId.toString(USER_A1)],
            );
            expect(inserted.rowCount).toBe(1);
            throw marker;
          })
          .then(
            () => null,
            (error: unknown) => error,
          );
        expect(failure).toBe(marker);
      });
      expect(await accounts.listOwn(ACTOR_A1)).toHaveLength(1); // no residue
    });

    it('snapshots: each owner sees only their own, and cross-principal writes are refused', async () => {
      // NON-EMPTY FIRST at the use-case layer.
      const ownA1 = await listSnapshots.execute({ accountId: accountA1 }, ACTOR_A1);
      expect(ownA1.ok).toBe(true);
      if (ownA1.ok) {
        expect(ownA1.value).toHaveLength(1);
        expect(ownA1.value[0]?.amount.minorUnits).toBe(100_00n);
      }

      // A neighbour asking about A1's account is answered not-found, not empty.
      const neighbour = await listSnapshots.execute({ accountId: accountA1 }, ACTOR_A2);
      expect(neighbour.ok).toBe(false);
      if (!neighbour.ok) expect(neighbour.error.kind).toBe('account_not_found');

      // Direct SQL from tenant B sees nothing of A and cannot plant a row.
      await asApp(
        database,
        { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(USER_B1) },
        async (tx) => {
          const visible = await tx.query<{ account_id: string }>(
            'SELECT account_id FROM public.financial_account_balance_snapshots',
          );
          expect(visible.rows.map((row) => row.account_id)).toEqual([accountB1]);

          const planted = await tx
            .query(
              `INSERT INTO public.financial_account_balance_snapshots
                 (id, tenant_id, user_id, account_id, amount_minor_units, currency_code, as_of,
                  source_kind, source_reference, captured_at)
               VALUES ('99999999-0000-4000-8000-000000000094', $1, $2, $3, 1, 'QAR', now(),
                       'MANUAL', $4, now())`,
              [
                TenantId.toString(TENANT_A),
                UserId.toString(USER_A1),
                accountA1,
                SYNTHETIC_SOURCE_REFERENCE,
              ],
            )
            .then(
              () => null,
              (error: unknown) => error,
            );
          expect((planted as PgError).sqlState).toBe('42501');
        },
      );
    });

    it('snapshots are append-only: no UPDATE grant, and the trigger raises besides', async () => {
      const failure = await asApp(
        database,
        { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
        (tx) =>
          tx
            .query(
              `UPDATE public.financial_account_balance_snapshots SET amount_minor_units = 1 WHERE id = $1`,
              ['b5000000-0000-4000-8000-0000000000a1'],
            )
            .then(
              () => null,
              (error: unknown) => error,
            ),
      );
      expect(failure).toBeInstanceOf(PgError);
      expect((failure as PgError).sqlState).toBe('42501'); // grant refuses first

      // The owner cannot edit one either: the trigger raises for karar_migrator.
      const ownerAttempt = await withAdapter(database, 'migrator', (adapter) =>
        adapter
          .withTransaction(async (tx) => {
            await tx.query(BIND_GUCS, [
              TenantId.toString(TENANT_A),
              UserId.toString(USER_A1),
            ]);
            return tx.query(
              `UPDATE public.financial_account_balance_snapshots SET amount_minor_units = 1`,
            );
          })
          .then(
            () => null,
            (error: unknown) => error,
          ),
      );
      expect(ownerAttempt).toBeInstanceOf(Error);
      expect(String((ownerAttempt as Error).message)).toContain('reported facts');
    });

    it('delete cannot cross a user, and the rightful owner CAN delete — with the cascade', async () => {
      // A neighbour and another tenant both fail, and the account survives.
      for (const intruder of [ACTOR_A2, ACTOR_B1]) {
        const refused = await deleteAccount.execute(
          { accountId: accountA1, expectedVersion: 1 },
          intruder,
        );
        expect(refused.ok).toBe(false);
        if (!refused.ok) expect(refused.error.kind).toBe('account_not_found');
      }
      expect(await accounts.findOwnById(ACTOR_A1, accountA1)).not.toBeNull();

      // Direct SQL as the neighbour cannot remove it either.
      await asApp(
        database,
        { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) },
        async (tx) => {
          const removed = await tx.query('DELETE FROM public.financial_accounts WHERE id = $1', [
            accountA1,
          ]);
          expect(removed.rowCount).toBe(0);
        },
      );
      expect(await accounts.findOwnById(ACTOR_A1, accountA1)).not.toBeNull();

      // The owner can, and the snapshot goes with it (declared CASCADE_DELETE).
      const deleted = await deleteAccount.execute(
        { accountId: accountA1, expectedVersion: 1 },
        ACTOR_A1,
      );
      expect(deleted.ok).toBe(true);
      if (deleted.ok) expect(deleted.value.snapshotsDeleted).toBe(1);

      expect(await accounts.findOwnById(ACTOR_A1, accountA1)).toBeNull();
      expect(await snapshots.countForAccount(ACTOR_A1, accountA1)).toBe(0);
      // And the OTHER principals' data is untouched — erasure is scoped.
      expect(await accounts.listOwn(ACTOR_A2)).toHaveLength(1);
      expect(await snapshots.countForAccount(ACTOR_B1, accountB1)).toBe(1);
    });

    it('FORCE vs owner: karar_migrator owns both tables and still sees nothing without a GUC', async () => {
      await withAdapter(database, 'migrator', async (adapter) => {
        await adapter.withTransaction(async (tx) => {
          for (const table of [
            'financial_accounts',
            'financial_account_balance_snapshots',
          ] as const) {
            const rows = await tx.query(`SELECT * FROM public.${table}`);
            expect({ table, count: rows.rowCount }).toEqual({ table, count: 0 });
          }
        });
        // With a bound principal the owner sees exactly that principal's rows:
        // FORCE keeps the owner inside the policy rather than above it.
        await adapter.withTransaction(async (tx) => {
          await tx.query(BIND_GUCS, [
            TenantId.toString(TENANT_B),
            UserId.toString(USER_B1),
          ]);
          const rows = await tx.query<{ id: string }>(
            'SELECT id FROM public.financial_accounts',
          );
          expect(rows.rows.map((row) => row.id)).toEqual([accountB1]);
        });
      });
    });

    it('repositories fail closed BEFORE any query on an incomplete principal', async () => {
      const failure = await accounts
        .listOwn({ tenantId: TENANT_A } as unknown as AccountsPrincipal)
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(failure).toBeInstanceOf(PrincipalContextError);
    });

    it('pooled-connection hygiene: after repository work the session carries no GUC and sees nothing', async () => {
      await accounts.listOwn(ACTOR_B1);
      const probe = await handle.client.$queryRawUnsafe<
        { tenant_guc: string | null; accounts: bigint; snapshots: bigint }[]
      >(
        `SELECT current_setting('app.tenant_id', true) AS tenant_guc,
                (SELECT count(*) FROM public.financial_accounts) AS accounts,
                (SELECT count(*) FROM public.financial_account_balance_snapshots) AS snapshots`,
      );
      const row = probe[0];
      expect(row?.tenant_guc === null || row?.tenant_guc === '').toBe(true);
      expect(String(row?.accounts)).toBe('0');
      expect(String(row?.snapshots)).toBe('0');
    });

    it('the institution catalogue is readable by every principal and with no principal at all', async () => {
      // Allow-listed reference data: the same rows for everyone, which is what
      // makes a tenant predicate meaningless here.
      const selectable = await institutions.listSelectable();
      // Two ACTIVE synthetic issuers and one RETIRED one: only ACTIVE entries
      // are selectable for a NEW account, and the codes carry no country
      // prefix because an issuer's countries are market rows (0094).
      expect(selectable.map((row) => row.code)).toEqual([
        'SYNTHETIC_TEST_ISSUER_ONE',
        'SYNTHETIC_TEST_ISSUER_THREE',
      ]);
      expect(selectable.map((row) => row.kind)).toEqual(['BANK', 'E_MONEY_ISSUER']);
      const retired = await institutions.findByRef(INSTITUTION_ACTIVE);
      expect(retired?.displayNameAr).not.toBe('');

      for (const guc of [
        { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
        { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(USER_B1) },
        {},
      ]) {
        const count = await asApp(database, guc, async (tx) =>
          (await tx.query<{ n: string }>('SELECT count(*)::text AS n FROM public.institutions'))
            .rows[0]?.n,
        );
        expect(count).toBe('3');
      }
    });

    it('the institution catalogue has no runtime write path: karar_app holds SELECT only', async () => {
      for (const sql of [
        `INSERT INTO public.institutions (id, code, display_name_en, display_name_ar, status, updated_at)
           VALUES ('99999999-0000-4000-8000-000000000095', 'QA_PLANTED', 'Planted', 'Planted', 'ACTIVE', now())`,
        `UPDATE public.institutions SET display_name_en = 'renamed'`,
        `DELETE FROM public.institutions`,
      ]) {
        const failure = await asApp(
          database,
          { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
          (tx) =>
            tx.query(sql).then(
              () => null,
              (error: unknown) => error,
            ),
        );
        expect(failure).toBeInstanceOf(PgError);
        expect((failure as PgError).sqlState).toBe('42501');
      }
    });

    it('a concurrent edit loses visibly, and the guard trigger refuses a skipped version', async () => {
      const first = await updateAccount.execute(
        { accountId: accountA2, expectedVersion: 1, displayName: 'Synthetic Renamed A2' },
        ACTOR_A2,
      );
      expect(first.ok).toBe(true);
      if (first.ok) expect(first.value.version).toBe(2);

      const stale = await updateAccount.execute(
        { accountId: accountA2, expectedVersion: 1, displayName: 'Second Device Edit' },
        ACTOR_A2,
      );
      expect(stale.ok).toBe(false);
      if (!stale.ok) expect(stale.error.kind).toBe('version_conflict');

      // Direct SQL cannot skip the version either: the trigger raises.
      const skipped = await asApp(
        database,
        { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) },
        (tx) =>
          tx
            .query(
              `UPDATE public.financial_accounts SET status = 'ARCHIVED' WHERE id = $1`,
              [accountA2],
            )
            .then(
              () => null,
              (error: unknown) => error,
            ),
      );
      expect(skipped).toBeInstanceOf(Error);
      expect(String((skipped as Error).message)).toContain('increment version by exactly one');
    });
  },
);
