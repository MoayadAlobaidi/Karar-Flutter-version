/**
 * MULTIPLICITY, proved against live PostgreSQL — the invariant that is
 * enforced by what is NOT in the schema, and is therefore the easiest one to
 * lose (ADR-0028).
 *
 * ## What this suite exists to catch
 *
 * An account is identified by its id and by nothing else. Institution,
 * account type, currency and wallet kind are ATTRIBUTES. A uniqueness
 * constraint over any combination of them looks like tidiness and is in fact a
 * refusal to represent what people hold: two current accounts at one bank in
 * one currency is ordinary, two credit cards from one issuer is ordinary, and
 * two mobile-money wallets from one issuer is ordinary.
 *
 * A missing constraint cannot fail a test by being absent, so the absence is
 * asserted two ways: the whole awkward portfolio is CREATED through the real
 * use case and the real repository, and the live catalogue is then read to
 * confirm that no unique index or unique constraint over those columns exists
 * at all. The second half is what survives someone "fixing" a duplicate-
 * looking row by adding an index.
 *
 * ## And the boundary still holds
 *
 * The same portfolio is then attacked from two other principals: a second
 * person inside the SAME tenant — the case a tenant-only policy gets wrong —
 * and a person in another tenant. Multiplicity must not have been bought by
 * loosening anything, so both must see zero rows through the repository, the
 * use case, and direct SQL as `karar_app`.
 *
 * ## Every issuer name here is synthetic, deliberately
 *
 * No real bank, telco, wallet, or exchange house is named in this file or
 * anywhere in this module's fixtures, and none may be. The model must express
 * a mobile-money wallet from a telco without naming one; a test corpus that
 * names real institutions is both a leak and an implicit claim about which
 * ones this platform can reach — and it can reach none.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';

import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  ACTOR_A1,
  ACTOR_A2,
  ACTOR_B1,
  EVERY_ACCOUNT_PAGE,
  INSTITUTION_ACTIVE,
  INSTITUTION_SECOND_ACTIVE,
  TENANT_A,
  TENANT_B,
  USER_A1,
  USER_A2,
  USER_B1,
  asApp,
  buildHandle,
  dropDatabase,
  expectEveryVisibleAccount,
  probePostgres,
  provisionDatabase,
  skipBanner,
  superuserMaintenanceProfile,
  testEncryption,
  testRetention,
} from './fixtures.js';
import { CreateManualAccount } from '../application/use-cases/create-manual-account.js';
import { ListOwnAccounts } from '../application/use-cases/list-own-accounts.js';
import type { CreateManualAccountInput } from '../application/use-cases/create-manual-account.js';
import type { AccountsPrincipal } from '../application/principal.js';
import { PrismaFinancialAccountRepository } from '../infrastructure/persistence/prisma-financial-account-repository.js';
import { PrismaInstitutionCatalogueReader } from '../infrastructure/persistence/prisma-institution-catalogue-reader.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'FINANCIAL-ACCOUNTS MULTIPLICITY TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_financial_accounts_multiplicity`;
const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));

let handle: PrismaHandle;
let accounts: PrismaFinancialAccountRepository;
let create: CreateManualAccount;
let list: ListOwnAccounts;

const gucA1 = { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) };
const gucA2 = { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) };
const gucB1 = { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(USER_B1) };

/**
 * ONE PERSON'S ORDINARY PORTFOLIO. Every entry here is something a real person
 * in this market holds, and every one of the forbidden uniqueness constraints
 * would refuse at least one of them.
 *
 * The pairs that matter, and which constraint each would break:
 *   1+2   two CURRENT / QAR accounts at ONE issuer  — institution + user,
 *         institution + type, institution + currency, institution + type +
 *         currency all forbid this;
 *   3     a USD SAVINGS account at the SAME issuer;
 *   4+5   two CREDIT_CARDs at the same issuer;
 *   6+7   accounts at a SECOND issuer, so an issuer is plainly an attribute;
 *   8+9   two MOBILE_MONEY wallets at ONE issuer — issuer + wallet kind
 *         forbids this, and a person with a personal and a business wallet
 *         from the same operator is unremarkable;
 *   10    a PAYROLL wallet at that same issuer;
 *   11    an E_MONEY wallet at another issuer;
 *   12    cash, which names no institution at all;
 *   13    another manual account naming an unlisted institution by label.
 */
const PORTFOLIO: readonly CreateManualAccountInput[] = [
  {
    accountType: 'CURRENT',
    currencyCode: 'QAR',
    displayName: 'Synthetic Test Current One',
    institutionRef: INSTITUTION_ACTIVE,
    userSuppliedInstitutionLabel: null,
    mask: '*0001',
    nature: 'ASSET',
  },
  {
    accountType: 'CURRENT',
    currencyCode: 'QAR',
    displayName: 'Synthetic Test Current Two',
    institutionRef: INSTITUTION_ACTIVE,
    userSuppliedInstitutionLabel: null,
    mask: '*0002',
    nature: 'ASSET',
  },
  {
    accountType: 'SAVINGS',
    currencyCode: 'USD',
    displayName: 'Synthetic Test Savings USD',
    institutionRef: INSTITUTION_ACTIVE,
    userSuppliedInstitutionLabel: null,
    mask: '*0003',
    nature: 'ASSET',
  },
  {
    accountType: 'CREDIT_CARD',
    currencyCode: 'QAR',
    displayName: 'Synthetic Test Card One',
    institutionRef: INSTITUTION_ACTIVE,
    userSuppliedInstitutionLabel: null,
    mask: '*0004',
    nature: 'LIABILITY',
  },
  {
    accountType: 'CREDIT_CARD',
    currencyCode: 'QAR',
    displayName: 'Synthetic Test Card Two',
    institutionRef: INSTITUTION_ACTIVE,
    userSuppliedInstitutionLabel: null,
    mask: '*0005',
    nature: 'LIABILITY',
  },
  {
    accountType: 'CURRENT',
    currencyCode: 'QAR',
    displayName: 'Synthetic Test Current At Second Issuer',
    institutionRef: INSTITUTION_SECOND_ACTIVE,
    userSuppliedInstitutionLabel: null,
    mask: '*0006',
    nature: 'ASSET',
  },
  {
    accountType: 'SAVINGS',
    currencyCode: 'QAR',
    displayName: 'Synthetic Test Savings At Second Issuer',
    institutionRef: INSTITUTION_SECOND_ACTIVE,
    userSuppliedInstitutionLabel: null,
    mask: '*0007',
    nature: 'ASSET',
  },
  {
    accountType: 'WALLET',
    walletKind: 'MOBILE_MONEY',
    currencyCode: 'QAR',
    displayName: 'Synthetic Test Mobile Wallet Personal',
    institutionRef: INSTITUTION_ACTIVE,
    userSuppliedInstitutionLabel: null,
    mask: null,
    nature: 'ASSET',
  },
  {
    accountType: 'WALLET',
    walletKind: 'MOBILE_MONEY',
    currencyCode: 'QAR',
    displayName: 'Synthetic Test Mobile Wallet Second',
    institutionRef: INSTITUTION_ACTIVE,
    userSuppliedInstitutionLabel: null,
    mask: null,
    nature: 'ASSET',
  },
  {
    accountType: 'WALLET',
    walletKind: 'PAYROLL',
    currencyCode: 'QAR',
    displayName: 'Synthetic Test Payroll Wallet',
    institutionRef: INSTITUTION_ACTIVE,
    userSuppliedInstitutionLabel: null,
    mask: null,
    nature: 'ASSET',
  },
  {
    accountType: 'WALLET',
    walletKind: 'E_MONEY',
    currencyCode: 'QAR',
    displayName: 'Synthetic Test E-Money Wallet',
    institutionRef: INSTITUTION_SECOND_ACTIVE,
    userSuppliedInstitutionLabel: null,
    mask: null,
    nature: 'ASSET',
  },
  {
    accountType: 'CASH',
    currencyCode: 'QAR',
    displayName: 'Synthetic Test Cash',
    institutionRef: null,
    userSuppliedInstitutionLabel: null,
    mask: null,
    nature: 'ASSET',
  },
  {
    accountType: 'OTHER',
    currencyCode: 'QAR',
    displayName: 'Synthetic Test Unlisted Institution Account',
    institutionRef: null,
    userSuppliedInstitutionLabel: 'Synthetic Unlisted Test Institution',
    mask: null,
    nature: 'UNKNOWN',
  },
];

/** Unique indexes and constraints on one table, from the live catalogue. */
async function uniqueDefsOf(
  guc: { tenantId: string; userId: string },
  table: string,
): Promise<string[]> {
  const rows = await asApp(database, guc, (tx) =>
    tx.query<{ def: string }>(
      `SELECT pg_get_indexdef(i.indexrelid) AS def
         FROM pg_index i
        WHERE i.indrelid = ('public.' || $1)::regclass AND i.indisunique`,
      [table],
    ),
  );
  return rows.rows.map((row) => row.def);
}

describe.skipIf(unreachable !== null)(
  'financial accounts — one person, many accounts, one issuer (live PostgreSQL)',
  () => {
    beforeAll(async () => {
      await provisionDatabase(database);
      handle = buildHandle(database);
      accounts = new PrismaFinancialAccountRepository(handle, testEncryption());
      create = new CreateManualAccount(
        accounts,
        new PrismaInstitutionCatalogueReader(handle),
        testRetention(),
        new Uuidv7IdSource(),
        clock,
      );
      list = new ListOwnAccounts(accounts);

      for (const input of PORTFOLIO) {
        const created = await create.execute(input, ACTOR_A1);
        if (!created.ok) {
          throw new Error(
            `portfolio fixture refused for '${input.displayName}': ${created.error.kind} — ` +
              `${created.error.message}`,
          );
        }
      }
    }, 90_000);

    afterAll(async () => {
      await handle?.end();
      await dropDatabase(database);
    });

    it('one person holds the whole awkward portfolio, and every account is its own row', async () => {
      const own = await list.execute(EVERY_ACCOUNT_PAGE, ACTOR_A1);
      expect(own.ok).toBe(true);
      if (!own.ok) return;
      expect(own.value.accounts).toHaveLength(PORTFOLIO.length);
      // The whole portfolio fit in one page, so every count below is a count
      // of ROWS rather than of however many the page happened to hold.
      expect(own.value.hasMore).toBe(false);

      // Identity is the id: thirteen accounts, thirteen distinct ids, and no
      // two of them collapsed into one another by any attribute they share.
      const ids = new Set(own.value.accounts.map((account) => account.id));
      expect(ids.size).toBe(PORTFOLIO.length);

      const names = own.value.accounts.map((account) => account.displayName.reveal()).sort();
      expect(names).toEqual([...PORTFOLIO].map((input) => input.displayName).sort());
    });

    it('two CURRENT accounts in one currency at ONE issuer both exist', async () => {
      const own = await list.execute(EVERY_ACCOUNT_PAGE, ACTOR_A1);
      if (!own.ok) throw new Error('listing failed');
      const pair = own.value.accounts.filter(
        (account) =>
          account.institutionRef === INSTITUTION_ACTIVE &&
          account.accountType === 'CURRENT' &&
          account.currency.code === 'QAR',
      );
      // Any of institution+user, institution+type, institution+currency, or
      // institution+type+currency would have refused the second of these.
      expect(pair).toHaveLength(2);
      expect(new Set(pair.map((account) => account.id)).size).toBe(2);
    });

    it('two credit cards from one issuer, and a foreign-currency savings account beside them', async () => {
      const own = await list.execute(EVERY_ACCOUNT_PAGE, ACTOR_A1);
      if (!own.ok) throw new Error('listing failed');
      const atFirstIssuer = own.value.accounts.filter(
        (account) => account.institutionRef === INSTITUTION_ACTIVE,
      );
      expect(
        atFirstIssuer.filter((account) => account.accountType === 'CREDIT_CARD'),
      ).toHaveLength(2);
      expect(
        atFirstIssuer.filter(
          (account) => account.accountType === 'SAVINGS' && account.currency.code === 'USD',
        ),
      ).toHaveLength(1);
      // A credit card is a liability and says so; nothing here adds it to
      // anything, and nothing in this module computes a total at all.
      for (const card of atFirstIssuer.filter((a) => a.accountType === 'CREDIT_CARD')) {
        expect(card.nature).toBe('LIABILITY');
      }
    });

    it('two mobile-money wallets and a payroll wallet at ONE issuer all coexist', async () => {
      const own = await list.execute(EVERY_ACCOUNT_PAGE, ACTOR_A1);
      if (!own.ok) throw new Error('listing failed');
      const wallets = own.value.accounts.filter(
        (account) =>
          account.accountType === 'WALLET' && account.institutionRef === INSTITUTION_ACTIVE,
      );
      expect(wallets).toHaveLength(3);
      // issuer + wallet kind is the constraint that would refuse the second
      // MOBILE_MONEY wallet, and a personal plus a business wallet from one
      // operator is unremarkable.
      expect(wallets.filter((account) => account.walletKind === 'MOBILE_MONEY')).toHaveLength(2);
      expect(wallets.filter((account) => account.walletKind === 'PAYROLL')).toHaveLength(1);
      // And every wallet states its kind, because the biconditional demands it.
      for (const wallet of wallets) expect(wallet.walletKind).not.toBeNull();
    });

    it('accounts at a second issuer, cash, and an unlisted institution complete the set', async () => {
      const own = await list.execute(EVERY_ACCOUNT_PAGE, ACTOR_A1);
      if (!own.ok) throw new Error('listing failed');
      expect(
        own.value.accounts.filter((account) => account.institutionRef === INSTITUTION_SECOND_ACTIVE),
      ).toHaveLength(3);
      const cash = own.value.accounts.filter((account) => account.accountType === 'CASH');
      expect(cash).toHaveLength(1);
      expect(cash[0]?.institutionRef).toBeNull();
      expect(cash[0]?.walletKind).toBeNull();

      // The unlisted institution stays on the subject's own row as ciphertext
      // and never enters the global catalogue.
      const unlisted = own.value.accounts.filter(
        (account) => account.userSuppliedInstitutionLabel !== null,
      );
      expect(unlisted).toHaveLength(1);
      expect(unlisted[0]?.institutionRef).toBeNull();
    });

    it('NO uniqueness over institution, type, currency or wallet kind exists in the catalogue', async () => {
      // The portfolio above proves the constraints are not there TODAY. This
      // proves nobody can quietly add one back while the tests still pass,
      // which is the realistic failure: a duplicate-looking row invites an
      // index, and the index forbids a real person's real accounts.
      const uniques = await uniqueDefsOf(gucA1, 'financial_accounts');

      // Exactly two, and both are the primary key and the composite-FK target.
      expect(uniques).toHaveLength(2);
      const columnLists = uniques
        .map((def) => def.slice(def.lastIndexOf('(') + 1, def.lastIndexOf(')')))
        .map((columns) => columns.replace(/\s+/g, ''))
        .sort();
      expect(columnLists).toEqual(['id', 'id,currency_code']);

      // Stated a second way, by attribute rather than by count: no unique
      // index mentions any of the columns identity must not be built from.
      for (const def of uniques) {
        for (const forbidden of ['institution_ref', 'account_type', 'wallet_kind', 'user_id']) {
          expect({ def, forbidden, mentions: def.includes(forbidden) }).toEqual({
            def,
            forbidden,
            mentions: false,
          });
        }
      }
      // currency_code appears only in the (id, currency_code) pair, whose
      // leading column is already unique on its own, so it restricts nothing.
      const currencyIndexes = uniques.filter((def) => def.includes('currency_code'));
      expect(currencyIndexes).toHaveLength(1);
      expect(currencyIndexes[0]).toContain('id, currency_code');
    });

    it('a second person in the SAME tenant sees none of it, through every path', async () => {
      // The failure a tenant-only predicate would produce: two members of one
      // household tenant reading each other's accounts.
      const neighbour: AccountsPrincipal = ACTOR_A2;
      const listed = await list.execute(EVERY_ACCOUNT_PAGE, neighbour);
      expect(listed.ok).toBe(true);
      if (listed.ok) expect(listed.value.accounts).toEqual([]);

      expect(await expectEveryVisibleAccount(accounts, neighbour)).toEqual([]);

      const raw = await asApp(database, gucA2, (tx) =>
        tx.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM public.financial_accounts`,
        ),
      );
      expect(raw.rows[0]?.count).toBe('0');
    });

    it('a person in another tenant sees none of it either, through every path', async () => {
      const outsider: AccountsPrincipal = ACTOR_B1;
      const listed = await list.execute(EVERY_ACCOUNT_PAGE, outsider);
      expect(listed.ok).toBe(true);
      if (listed.ok) expect(listed.value.accounts).toEqual([]);

      expect(await expectEveryVisibleAccount(accounts, outsider)).toEqual([]);

      const raw = await asApp(database, gucB1, (tx) =>
        tx.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM public.financial_accounts`,
        ),
      );
      expect(raw.rows[0]?.count).toBe('0');
    });

    it('the owner still sees everything — the positive control the two denials need', async () => {
      // An isolation assertion over an empty table proves the table is empty.
      const raw = await asApp(database, gucA1, (tx) =>
        tx.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM public.financial_accounts`,
        ),
      );
      expect(raw.rows[0]?.count).toBe(String(PORTFOLIO.length));
    });
  },
);
