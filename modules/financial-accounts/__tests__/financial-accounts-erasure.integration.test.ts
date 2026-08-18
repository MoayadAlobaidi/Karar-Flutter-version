/**
 * Deleting an account leaves NO ORPHAN OF ANY KIND, proven against live
 * PostgreSQL and counted as the SUPERUSER.
 *
 * ## Why the superuser count is the whole point
 *
 * Every other read in this module runs as `karar_app` under a principal
 * context, where RLS makes another subject's rows invisible. That is the
 * right boundary for production and the wrong instrument for this question:
 * counting as `karar_app` after a delete proves rows are HIDDEN, not that
 * they are GONE, and "hidden" is exactly what an orphaned record looks like
 * from the application. So the assertions here connect as the bootstrap
 * superuser, with RLS bypassed, and count raw rows.
 *
 * ## The defect being proven fixed
 *
 * `DeleteOwnAccount` claimed to remove "everything scoped to" an account and
 * removed the account row and its balance snapshots. Transactions, revisions,
 * provenance and category assignments carry a raw `account_id` with no
 * foreign key back to `financial_accounts` — no FK crosses a module boundary
 * (data-model.md §2) — so every one of them survived while the person was
 * told the account was deleted.
 *
 * ## What is real here and what stands in
 *
 * The account, its snapshots, the delete path and the superuser counts are
 * real. `FinancialRecordEraserPort` is implemented in the transactions module
 * and is stood in for here by a raw-SQL adapter that does what that
 * implementation must do — because this suite's subject is THIS module's
 * contract: the ordering, the refusals, and the claim that nothing survives a
 * successful delete. The stand-in is deliberately capable of leaving orphans
 * (it deletes by account, exactly as the real one must) so the assertions can
 * fail if the sequencing is ever wrong.
 *
 * All fixtures are obviously synthetic.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, Money, TenantId, UserId } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  ACTOR_A1,
  ACTOR_A2,
  TENANT_A,
  USER_A1,
  USER_A2,
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
import type { AccountsPrincipal } from '../application/principal.js';
import type { AccountSourceLinkEraserPort } from '../application/ports/account-source-link-eraser.js';
import {
  ERASABLE_FINANCIAL_RECORD_KINDS,
  NO_RECORDS_ERASED,
  type ErasableFinancialRecordKind,
  type FinancialRecordEraserPort,
  type FinancialRecordErasureCounts,
  type FinancialRecordErasureOutcome,
} from '../application/ports/financial-record-eraser.js';
import { CreateManualAccount } from '../application/use-cases/create-manual-account.js';
import { DeleteOwnAccount } from '../application/use-cases/delete-own-account.js';
import { RecordReportedBalance } from '../application/use-cases/record-reported-balance.js';
import type { FinancialAccountId } from '../domain/refs.js';
import { PrismaBalanceSnapshotRepository } from '../infrastructure/persistence/prisma-balance-snapshot-repository.js';
import { PrismaFinancialAccountRepository } from '../infrastructure/persistence/prisma-financial-account-repository.js';
import { PrismaInstitutionCatalogueReader } from '../infrastructure/persistence/prisma-institution-catalogue-reader.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'FINANCIAL-ACCOUNTS ERASURE TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_financial_accounts_erasure`;
const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));

/** The tables an account-scoped record can hide in, by port vocabulary. */
const KIND_TO_TABLE: Readonly<Record<ErasableFinancialRecordKind, string>> = {
  FINANCIAL_RECORD: 'transactions',
  FINANCIAL_RECORD_REVISION: 'transaction_revisions',
  FINANCIAL_RECORD_PROVENANCE: 'transaction_provenance',
  FINANCIAL_RECORD_CATEGORY_ASSIGNMENT: 'transaction_category_assignments',
};

let handle: PrismaHandle;
let accounts: PrismaFinancialAccountRepository;
let snapshots: PrismaBalanceSnapshotRepository;
let createAccount: CreateManualAccount;
let recordBalance: RecordReportedBalance;

/**
 * The stand-in for the transactions module's implementation.
 *
 * Counts first, then deletes the transactions; the three dependent tables go
 * with them by `ON DELETE CASCADE` from `transactions.id` (migrations 0091,
 * 0093). That ordering is not incidental — `karar_app` holds no DELETE grant
 * on revisions, provenance, or category assignments, so the cascade is the
 * only route to them, and an implementation that tried to delete them
 * directly would fail on privileges. The counts are read BEFORE the delete
 * because after it there is nothing left to count, and the port promises
 * exact numbers rather than an assumption.
 */
class SqlFinancialRecordEraser implements FinancialRecordEraserPort {
  #failure: Error | null = null;
  #leaveBehind = false;

  failWith(error: Error | null): void {
    this.#failure = error;
  }

  /** Reports success while leaving rows behind — the defect, simulated. */
  leaveOrphans(on: boolean): void {
    this.#leaveBehind = on;
  }

  async eraseAccountScopedRecords(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<FinancialRecordErasureOutcome> {
    if (this.#failure !== null) throw this.#failure;
    const guc = {
      tenantId: TenantId.toString(actor.tenantId),
      userId: UserId.toString(actor.userId),
    };
    const deleted = await asApp(database, guc, async (tx) => {
      const counts: Record<ErasableFinancialRecordKind, number> = { ...NO_RECORDS_ERASED };
      for (const kind of ERASABLE_FINANCIAL_RECORD_KINDS) {
        const table = KIND_TO_TABLE[kind];
        const scoped =
          kind === 'FINANCIAL_RECORD'
            ? `SELECT count(*)::int AS n FROM public.${table}
                 WHERE account_id = $1 AND tenant_id = $2 AND user_id = $3`
            : `SELECT count(*)::int AS n FROM public.${table}
                 WHERE tenant_id = $2 AND user_id = $3 AND transaction_id IN (
                   SELECT id FROM public.transactions
                    WHERE account_id = $1 AND tenant_id = $2 AND user_id = $3)`;
        const row = await tx.query<{ n: number }>(scoped, [
          accountId,
          guc.tenantId,
          guc.userId,
        ]);
        counts[kind] = row.rows[0]?.n ?? 0;
      }
      if (!this.#leaveBehind) {
        await tx.query(
          `DELETE FROM public.transactions
             WHERE account_id = $1 AND tenant_id = $2 AND user_id = $3`,
          [accountId, guc.tenantId, guc.userId],
        );
      }
      return counts as FinancialRecordErasureCounts;
    });
    return { kind: 'erased', deleted };
  }
}

const eraser = new SqlFinancialRecordEraser();

/**
 * No connection store exists in this suite, so the source-link eraser answers
 * the only honest thing available: nothing was there and nothing went. The
 * end-to-end proof that deleting an account really removes the source links
 * naming it lives in `modules/financial-connections`, where the real adapter,
 * the real use case and real rows exist. This module cannot import that one —
 * the dependency runs the other way — and a richer stand-in here would assert
 * only that the stand-in works.
 */
const ERASES_NO_SOURCE_LINKS: AccountSourceLinkEraserPort = {
  eraseAccountSourceLinks: () =>
    Promise.resolve({ kind: 'erased', accountSourceLinksDeleted: 0 }),
};

/** Raw counts with RLS bypassed: proof of "gone", not of "hidden". */
async function countAsSuperuser(accountId: FinancialAccountId): Promise<
  Record<string, number>
> {
  return withAdapter(database, 'superuser', async (adapter) => {
    const counts: Record<string, number> = {};
    counts['financial_accounts'] = (
      await adapter.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM public.financial_accounts WHERE id = $1',
        [accountId],
      )
    ).rows[0]?.n as number;
    counts['financial_account_balance_snapshots'] = (
      await adapter.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM public.financial_account_balance_snapshots WHERE account_id = $1',
        [accountId],
      )
    ).rows[0]?.n as number;
    counts['transactions'] = (
      await adapter.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM public.transactions WHERE account_id = $1',
        [accountId],
      )
    ).rows[0]?.n as number;
    // The dependents are reached through the transaction, exactly as an
    // orphan would be: a row whose parent is gone is still a row.
    for (const table of [
      'transaction_revisions',
      'transaction_provenance',
      'transaction_category_assignments',
    ]) {
      counts[table] = (
        await adapter.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM public.${table}
             WHERE transaction_id IN (SELECT id FROM public.transactions WHERE account_id = $1)
                OR transaction_id NOT IN (SELECT id FROM public.transactions)`,
          [accountId],
        )
      ).rows[0]?.n as number;
    }
    return counts;
  });
}

/**
 * Seeds one transaction with a revision, provenance, and a category
 * assignment — every kind the port has to account for — as the superuser,
 * because this module has no write path into another module's tables.
 */
async function seedFinancialRecords(
  actor: AccountsPrincipal,
  accountId: FinancialAccountId,
  suffix: string,
): Promise<string> {
  const transactionId = `7a000000-0000-4000-8000-0000000000${suffix}`;
  const tenantId = TenantId.toString(actor.tenantId);
  const userId = UserId.toString(actor.userId);
  const bytes = {
    ciphertext: `decode('53796e746865746963', 'hex')`,
    nonce: `decode('000000000000000000000000', 'hex')`,
    tag: `decode('00000000000000000000000000000000', 'hex')`,
  };
  await withAdapter(database, 'superuser', async (adapter) => {
    await adapter.query(
      `INSERT INTO public.transactions
         (id, tenant_id, user_id, account_id, account_reference_type, amount_minor, currency_code,
          booking_date, hsf_algorithm, hsf_key_version,
          description_ciphertext, description_nonce, description_auth_tag,
          source_kind, status, dedup_fingerprint, fingerprint_version)
       VALUES ($1, $2, $3, $4, 'FINANCIAL_ACCOUNT', -1000, 'QAR', now(),
               'AES-256-GCM', 'karar-ref:key-version:synthetic-test-accounts@v1',
               ${bytes.ciphertext}, ${bytes.nonce}, ${bytes.tag},
               'MANUAL', 'POSTED', $5, 'fingerprint/1')`,
      [transactionId, tenantId, userId, accountId, `synthetic-fingerprint-${suffix}`],
    );
    await adapter.query(
      `INSERT INTO public.transaction_revisions
         (id, transaction_id, tenant_id, user_id, revision_number, attribution, actor_ref,
          amount_minor, currency_code, booking_date, status, hsf_algorithm, hsf_key_version,
          description_ciphertext, description_nonce, description_auth_tag, recorded_at)
       VALUES ($1, $2, $3, $4, 1, 'MANUAL_ENTRY', $4, -1000, 'QAR', now(), 'POSTED',
               'AES-256-GCM', 'karar-ref:key-version:synthetic-test-accounts@v1',
               ${bytes.ciphertext}, ${bytes.nonce}, ${bytes.tag}, now())`,
      [`7b000000-0000-4000-8000-0000000000${suffix}`, transactionId, tenantId, userId],
    );
    await adapter.query(
      `INSERT INTO public.transaction_provenance
         (id, transaction_id, tenant_id, user_id, revision_number, source_kind, actor_ref,
          account_id, account_reference_type, parser_version, mapping_version,
          normalization_version, fingerprint_version, source_direction, direction_mapping,
          category_assignment_source)
       VALUES ($1, $2, $3, $4, 1, 'MANUAL', $4, $5, 'FINANCIAL_ACCOUNT',
               'manual-entry/1', 'manual-entry/1', 'manual-entry/1', 'fingerprint/1',
               'NOT_STATED', 'MANUAL_ENTRY', 'USER')`,
      [
        `7c000000-0000-4000-8000-0000000000${suffix}`,
        transactionId,
        tenantId,
        userId,
        accountId,
      ],
    );
    await adapter.query(
      `INSERT INTO public.transaction_category_assignments
         (id, transaction_id, tenant_id, user_id, category_code, assignment_source,
          assigned_by, assigned_at, status)
       VALUES ($1, $2, $3, $4, 'FOOD.GROCERIES', 'USER', $4, now(), 'ACTIVE')`,
      [`7d000000-0000-4000-8000-0000000000${suffix}`, transactionId, tenantId, userId],
    );
  });
  return transactionId;
}

async function newAccount(
  actor: AccountsPrincipal,
  displayName: string,
): Promise<FinancialAccountId> {
  const created = await createAccount.execute(
    {
      accountType: 'CURRENT',
      currencyCode: 'QAR',
      displayName,
      institutionRef: null,
      userSuppliedInstitutionLabel: null,
      mask: '*0000',
    },
    actor,
  );
  if (!created.ok) throw new Error(`fixture create failed: ${created.error.kind}`);
  return created.value.id;
}

describe.skipIf(unreachable !== null)(
  'deleting an account leaves no orphan of any kind (live PostgreSQL, counted as superuser)',
  () => {
    beforeAll(async () => {
      await provisionDatabase(database);
      handle = buildHandle(database);
      accounts = new PrismaFinancialAccountRepository(handle, testEncryption());
      snapshots = new PrismaBalanceSnapshotRepository(handle);
      createAccount = new CreateManualAccount(
        accounts,
        new PrismaInstitutionCatalogueReader(handle),
        testRetention(),
        new Uuidv7IdSource(),
        clock,
      );
      recordBalance = new RecordReportedBalance(
        accounts,
        snapshots,
        testRetention(),
        new Uuidv7IdSource(),
        clock,
      );
    }, 90_000);

    afterAll(async () => {
      await handle?.end();
      await dropDatabase(database);
    });

    it('erases the account, its snapshots, and EVERY account-scoped record', async () => {
      eraser.failWith(null);
      eraser.leaveOrphans(false);
      const accountId = await newAccount(ACTOR_A1, 'Synthetic Test Account To Delete');
      await recordBalance.execute(
        {
          accountId,
          amount: Money.of(100_00n, (await accounts.findOwnById(ACTOR_A1, accountId))!.currency),
          asOf: clock.now(),
          balanceKind: 'BOOKED',
          sourceReference: SYNTHETIC_SOURCE_REFERENCE,
        },
        ACTOR_A1,
      );
      await seedFinancialRecords(ACTOR_A1, accountId, 'a1');

      // NON-EMPTY FIRST: an erasure test over an empty account proves nothing.
      const before = await countAsSuperuser(accountId);
      expect(before).toEqual({
        financial_accounts: 1,
        financial_account_balance_snapshots: 1,
        transactions: 1,
        transaction_revisions: 1,
        transaction_provenance: 1,
        transaction_category_assignments: 1,
      });

      const deleted = await new DeleteOwnAccount(accounts, eraser, ERASES_NO_SOURCE_LINKS).execute(
        { accountId, expectedVersion: 1 },
        ACTOR_A1,
      );
      expect(deleted.ok).toBe(true);
      if (deleted.ok) {
        expect(deleted.value.snapshotsDeleted).toBe(1);
        expect(deleted.value.recordsDeleted).toEqual({
          FINANCIAL_RECORD: 1,
          FINANCIAL_RECORD_REVISION: 1,
          FINANCIAL_RECORD_PROVENANCE: 1,
          FINANCIAL_RECORD_CATEGORY_ASSIGNMENT: 1,
        });
      }

      // Counted with RLS bypassed: gone, not hidden.
      expect(await countAsSuperuser(accountId)).toEqual({
        financial_accounts: 0,
        financial_account_balance_snapshots: 0,
        transactions: 0,
        transaction_revisions: 0,
        transaction_provenance: 0,
        transaction_category_assignments: 0,
      });
    });

    it('the assertion can FAIL: an eraser that reports success while leaving rows is caught', async () => {
      // The counter-test. Without it, "no orphans" could pass because nothing
      // was ever seeded, or because the count was scoped so nothing showed.
      eraser.failWith(null);
      eraser.leaveOrphans(true);
      const accountId = await newAccount(ACTOR_A1, 'Synthetic Test Account With Orphans');
      await seedFinancialRecords(ACTOR_A1, accountId, 'a2');

      await new DeleteOwnAccount(accounts, eraser, ERASES_NO_SOURCE_LINKS).execute(
        { accountId, expectedVersion: 1 },
        ACTOR_A1,
      );

      const after = await countAsSuperuser(accountId);
      expect(after['financial_accounts']).toBe(0);
      // Exactly the orphaning the old implementation produced silently.
      expect(after['transactions']).toBe(1);
      expect(after['transaction_revisions']).toBe(1);
      expect(after['transaction_provenance']).toBe(1);
      expect(after['transaction_category_assignments']).toBe(1);

      eraser.leaveOrphans(false);
      await withAdapter(database, 'superuser', (adapter) =>
        adapter.query('DELETE FROM public.transactions WHERE account_id = $1', [accountId]),
      );
    });

    it('a failing eraser leaves the account AND its records intact, and reports no success', async () => {
      eraser.leaveOrphans(false);
      const accountId = await newAccount(ACTOR_A1, 'Synthetic Test Account Erasure Failed');
      await seedFinancialRecords(ACTOR_A1, accountId, 'a3');
      eraser.failWith(new Error('synthetic record-store outage'));

      const refused = await new DeleteOwnAccount(accounts, eraser, ERASES_NO_SOURCE_LINKS).execute(
        { accountId, expectedVersion: 1 },
        ACTOR_A1,
      );
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.kind).toBe('erasure_incomplete');

      // A coherent world to retry into: the anchor is still there, and so are
      // the records that point at it.
      expect(await countAsSuperuser(accountId)).toEqual({
        financial_accounts: 1,
        financial_account_balance_snapshots: 0,
        transactions: 1,
        transaction_revisions: 1,
        transaction_provenance: 1,
        transaction_category_assignments: 1,
      });

      // And the retry converges, because the erasure is idempotent.
      eraser.failWith(null);
      const retried = await new DeleteOwnAccount(accounts, eraser, ERASES_NO_SOURCE_LINKS).execute(
        { accountId, expectedVersion: 1 },
        ACTOR_A1,
      );
      expect(retried.ok).toBe(true);
      expect(await countAsSuperuser(accountId)).toEqual({
        financial_accounts: 0,
        financial_account_balance_snapshots: 0,
        transactions: 0,
        transaction_revisions: 0,
        transaction_provenance: 0,
        transaction_category_assignments: 0,
      });
    });

    it("a neighbour's delete erases nothing, in either module", async () => {
      eraser.failWith(null);
      eraser.leaveOrphans(false);
      const accountId = await newAccount(ACTOR_A1, 'Synthetic Test Account Not Yours');
      await seedFinancialRecords(ACTOR_A1, accountId, 'a4');

      const refused = await new DeleteOwnAccount(accounts, eraser, ERASES_NO_SOURCE_LINKS).execute(
        { accountId, expectedVersion: 1 },
        ACTOR_A2,
      );
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.kind).toBe('account_not_found');

      expect(await countAsSuperuser(accountId)).toEqual({
        financial_accounts: 1,
        financial_account_balance_snapshots: 0,
        transactions: 1,
        transaction_revisions: 1,
        transaction_provenance: 1,
        transaction_category_assignments: 1,
      });
    });

    it("the eraser cannot reach another subject's records even when handed their account id", async () => {
      // Principal-scoped by construction: the stand-in runs every statement
      // inside the caller's own GUC context, exactly as the real one must, so
      // A2 asking to erase A1's account erases nothing at all.
      eraser.failWith(null);
      eraser.leaveOrphans(false);
      const accountId = await newAccount(ACTOR_A1, 'Synthetic Test Account Cross Subject');
      await seedFinancialRecords(ACTOR_A1, accountId, 'a5');

      const outcome = await eraser.eraseAccountScopedRecords(
        { tenantId: TENANT_A, userId: USER_A2 },
        accountId,
      );
      expect(outcome.kind).toBe('erased');
      if (outcome.kind === 'erased') expect(outcome.deleted).toEqual(NO_RECORDS_ERASED);

      const after = await countAsSuperuser(accountId);
      expect(after['transactions']).toBe(1);
      expect(after['transaction_revisions']).toBe(1);

      // The owner can still erase them, which is what makes the point above
      // about scoping rather than about the eraser simply not working.
      const deleted = await new DeleteOwnAccount(accounts, eraser, ERASES_NO_SOURCE_LINKS).execute(
        { accountId, expectedVersion: 1 },
        ACTOR_A1,
      );
      expect(deleted.ok).toBe(true);
      expect((await countAsSuperuser(accountId))['transactions']).toBe(0);
      expect(USER_A1).not.toBe(USER_A2);
    });
  },
);
