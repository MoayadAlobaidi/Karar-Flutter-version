/**
 * Deleting an account through `@karar/financial-accounts`' OWN
 * `DeleteOwnAccount` takes the source links feeding it, proven against live
 * PostgreSQL and counted as the SUPERUSER.
 *
 * ## The defect being proven fixed
 *
 * `account_source_links.account_id` is a raw uuid with NO foreign key back to
 * `financial_accounts` — no FK crosses a module boundary (data-model.md §2) —
 * so nothing cascaded to these rows and `DeleteOwnAccount` left every one of
 * them behind while telling the person their account was gone. Each surviving
 * row names the deleted account and holds the encrypted external account
 * reference for the source account it was linked to: a protected external
 * identity, retained about a subject who had asked to be rid of it. A
 * surviving link is also a live route back — the next import through its
 * connection would have re-created the account that was just deleted.
 *
 * `AccountSourceLinkEraserPort` is declared by the accounts module and
 * satisfied here by `FinancialAccountsSourceLinkEraser`; this suite is what
 * makes the fix checkable rather than merely written down.
 *
 * ## Why the superuser count is the whole point
 *
 * Every other read in this module runs as `karar_app` under a principal
 * context, where RLS makes another subject's rows invisible. That is the right
 * boundary for production and the wrong instrument for this question: counting
 * as `karar_app` after a delete proves rows are HIDDEN, not that they are
 * GONE, and "hidden" is exactly what an orphaned link looks like from the
 * application. So the assertions here connect as the bootstrap superuser, with
 * RLS bypassed, and count raw rows.
 *
 * ## What is real here and what stands in
 *
 * Real: the account and its delete path (the accounts module's own use case
 * and repository), the connections, the links, the fingerprint and encryption
 * providers, the source-link repository, `EraseAccountSourceLinks`, the
 * adapter under test, and the superuser counts. Stood in: the financial-record
 * eraser, because no transaction exists in this database and this module has
 * no business writing one — that port's own behaviour is proven in
 * `modules/financial-accounts/__tests__/financial-accounts-erasure.integration.test.ts`.
 *
 * All fixtures are obviously synthetic.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  DeleteOwnAccount,
  NO_RECORDS_ERASED,
  type AccountsPrincipal,
  type FinancialAccountId,
  type FinancialRecordEraserPort,
} from '@karar/financial-accounts';

import { ConfirmProbableSourceLink } from '../application/use-cases/confirm-probable-source-link.js';
import { CreateManualConnection } from '../application/use-cases/create-manual-connection.js';
import { EraseAccountSourceLinks } from '../application/use-cases/erase-account-source-links.js';
import { ProposeAccountSourceLink } from '../application/use-cases/propose-account-source-link.js';
import type {
  AccountSourceLinkPage,
  AccountSourceLinkPageQuery,
  AccountSourceLinkRepository,
  SourceLinkCreateOutcome,
  SourceLinkUpdateOutcome,
} from '../application/ports/account-source-link-repository.js';
import type { ConnectionsPrincipal } from '../application/principal.js';
import type {
  AccountSourceLink,
  SourceAccountFingerprint,
} from '../domain/account-source-link.js';
import type { AccountSourceLinkId, FinancialConnectionId } from '../domain/refs.js';
import { FinancialAccountsCanonicalAccountAdapter } from '../infrastructure/adapters/financial-accounts-canonical-account-access.js';
import { FinancialAccountsSourceLinkEraser } from '../infrastructure/adapters/financial-accounts-source-link-eraser.js';
import { PrismaAccountSourceLinkRepository } from '../infrastructure/persistence/prisma-account-source-link-repository.js';
import { PrismaFinancialConnectionRepository } from '../infrastructure/persistence/prisma-financial-connection-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  ACTOR_A2,
  SYNTHETIC_SOURCE_REF_ONE,
  SYNTHETIC_SOURCE_REF_TWO,
  accountsRepository,
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  seedAccount,
  skipBanner,
  superuserMaintenanceProfile,
  testEncryption,
  testFingerprints,
  testRetention,
  withAdapter,
} from './fixtures.js';
import type { PaymentInstrumentEraserPort } from '@karar/financial-accounts';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'FINANCIAL-CONNECTIONS ACCOUNT-ERASURE TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_connections_account_erasure`;
const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));

/**
 * The synthetic driver throw the refusing repository raises. Every fragment
 * of it is something that must never reach a caller, so the redaction
 * assertion below has real needles to look for.
 */
const POISONED_CONNECTION_STRING = 'postgres://user:password@internal-host:5432/karar';
const POISONED_SQL = 'DELETE FROM public.account_source_links WHERE account_id = $1';

/**
 * The real repository with `eraseForAccount` replaced by an outage, and every
 * other method delegated untouched.
 *
 * A decorator rather than a hand-written fake port: the failure then travels
 * the REAL path — repository throw, `EraseAccountSourceLinks` wrapping it, the
 * adapter mapping it to `failed`, `DeleteOwnAccount` refusing on it — which is
 * the path whose redaction and ordering this suite is about. A fake port would
 * have proven only that a fake port works.
 */
class RefusingSourceLinkRepository implements AccountSourceLinkRepository {
  constructor(private readonly real: AccountSourceLinkRepository) {}

  pageOwn(
    actor: ConnectionsPrincipal,
    query: AccountSourceLinkPageQuery,
  ): Promise<AccountSourceLinkPage> {
    return this.real.pageOwn(actor, query);
  }

  listOwnForConnection(
    actor: ConnectionsPrincipal,
    connectionId: FinancialConnectionId,
  ): Promise<readonly AccountSourceLink[]> {
    return this.real.listOwnForConnection(actor, connectionId);
  }

  findOwnById(
    actor: ConnectionsPrincipal,
    id: AccountSourceLinkId,
  ): Promise<AccountSourceLink | null> {
    return this.real.findOwnById(actor, id);
  }

  findOwnByFingerprint(
    actor: ConnectionsPrincipal,
    fingerprint: SourceAccountFingerprint,
  ): Promise<readonly AccountSourceLink[]> {
    return this.real.findOwnByFingerprint(actor, fingerprint);
  }

  create(
    actor: ConnectionsPrincipal,
    link: AccountSourceLink,
  ): Promise<SourceLinkCreateOutcome> {
    return this.real.create(actor, link);
  }

  update(
    actor: ConnectionsPrincipal,
    expectedVersion: number,
    next: AccountSourceLink,
  ): Promise<SourceLinkUpdateOutcome> {
    return this.real.update(actor, expectedVersion, next);
  }

  eraseForAccount(): Promise<number> {
    return Promise.reject(
      new Error(
        `connection to ${POISONED_CONNECTION_STRING} failed while running ${POISONED_SQL}`,
      ),
    );
  }
}

/**
 * Stands in for the transactions module. This database holds no transaction
 * for these accounts and this module must not write one, so the honest answer
 * is that nothing was there and nothing went.
 */
/**
 * Explicit, because the argument is required rather than defaulted: a
 * composition root that binds payment-instruments and forgets the wiring would
 * otherwise skip instrument erasure in silence. This suite is about source
 * links, so it names the no-op instead of pretending to erase instruments.
 */
const ERASES_NO_INSTRUMENTS: PaymentInstrumentEraserPort = {
  erasePaymentInstruments: async () => ({ kind: 'erased', paymentInstrumentsDeleted: 0 }),
};

const ERASES_NO_RECORDS: FinancialRecordEraserPort = {
  eraseAccountScopedRecords: () =>
    Promise.resolve({ kind: 'erased', deleted: NO_RECORDS_ERASED }),
};

let handle: PrismaHandle;
let createConnection: CreateManualConnection;
let propose: ProposeAccountSourceLink;
let confirm: ConfirmProbableSourceLink;
let deleteAccount: DeleteOwnAccount;
/** The same delete path, wired to an eraser whose store refuses. */
let deleteAccountWithRefusingLinks: DeleteOwnAccount;

/** The accounts module's principal, restated from this module's. */
function asAccountsPrincipal(actor: ConnectionsPrincipal): AccountsPrincipal {
  return { tenantId: actor.tenantId, userId: actor.userId };
}

/** Raw counts with RLS bypassed: proof of "gone", not of "hidden". */
async function countAsSuperuser(accountId: string): Promise<Record<string, number>> {
  return withAdapter(database, 'superuser', async (adapter) => {
    const counts: Record<string, number> = {};
    counts['financial_accounts'] = (
      await adapter.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM public.financial_accounts WHERE id = $1',
        [accountId],
      )
    ).rows[0]?.n as number;
    counts['account_source_links'] = (
      await adapter.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM public.account_source_links WHERE account_id = $1',
        [accountId],
      )
    ).rows[0]?.n as number;
    return counts;
  });
}

async function makeConnection(
  actor: ConnectionsPrincipal,
  rail: 'MANUAL' | 'USER_FILE_UPLOAD',
  label: string,
): Promise<FinancialConnectionId> {
  const created = await createConnection.execute(
    { rail, displayLabel: label, institutionRef: null },
    actor,
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('fixture could not create a synthetic connection');
  return created.value.id;
}

/**
 * Links one source account to `accountId` through a NEW connection, by the
 * route a person actually takes: a probable match is proposed and then
 * CONFIRMED by the subject. The database refuses a `PENDING_CONFIRMATION` row
 * to become `LINKED` without that confirmation, so there is no shortcut.
 */
async function confirmedLink(
  actor: ConnectionsPrincipal,
  accountId: string,
  externalReference: string,
  label: string,
): Promise<void> {
  const connection = await makeConnection(actor, 'USER_FILE_UPLOAD', label);
  const proposed = await propose.execute(
    { connectionId: connection, candidateAccountId: accountId, externalAccountReference: externalReference },
    actor,
  );
  expect(proposed.ok).toBe(true);
  if (!proposed.ok) throw new Error('fixture could not propose a synthetic link');
  expect(proposed.value.matchBasis).toBe('PROBABLE');
  const confirmed = await confirm.execute(
    { linkId: proposed.value.link.id, expectedVersion: proposed.value.link.version },
    actor,
  );
  expect(confirmed.ok).toBe(true);
  if (!confirmed.ok) throw new Error('fixture could not confirm a synthetic link');
  expect(confirmed.value.status).toBe('LINKED');
}

/**
 * Links the SAME source account through a second connection. The fingerprint
 * already exists, so this one matches exactly and links automatically — the
 * second of the two link shapes an erasure has to reach.
 */
async function exactLink(
  actor: ConnectionsPrincipal,
  accountId: string,
  externalReference: string,
  label: string,
): Promise<void> {
  const connection = await makeConnection(actor, 'MANUAL', label);
  const auto = await propose.execute(
    { connectionId: connection, externalAccountReference: externalReference },
    actor,
  );
  expect(auto.ok).toBe(true);
  if (!auto.ok) throw new Error('fixture could not link a synthetic exact match');
  expect(auto.value.matchBasis).toBe('EXACT_EXTERNAL_REFERENCE');
  expect(auto.value.link.status).toBe('LINKED');
  expect(auto.value.link.accountRef.accountId).toBe(accountId);
}

describe.skipIf(unreachable !== null)(
  'deleting an account takes its source links with it (live PostgreSQL, counted as superuser)',
  () => {
    beforeAll(async () => {
      await provisionDatabase(database);
      handle = buildHandle(database);

      const encryption = testEncryption();
      const links = new PrismaAccountSourceLinkRepository(handle, encryption);
      const connections = new PrismaFinancialConnectionRepository(handle, encryption);
      const accounts = accountsRepository(handle);
      const retention = testRetention();

      createConnection = new CreateManualConnection(
        connections,
        retention,
        new Uuidv7IdSource(),
        clock,
      );
      propose = new ProposeAccountSourceLink(
        links,
        connections,
        new FinancialAccountsCanonicalAccountAdapter(accounts),
        testFingerprints(),
        retention,
        new Uuidv7IdSource(),
        clock,
      );
      confirm = new ConfirmProbableSourceLink(links, clock);

      // The wiring a composition root performs: the accounts module's delete
      // path, holding this module's adapter through the port it declares.
      deleteAccount = new DeleteOwnAccount(
        accounts,
        ERASES_NO_RECORDS,
        new FinancialAccountsSourceLinkEraser(new EraseAccountSourceLinks(links)),
        ERASES_NO_INSTRUMENTS,
      );
      deleteAccountWithRefusingLinks = new DeleteOwnAccount(
        accounts,
        ERASES_NO_RECORDS,
        new FinancialAccountsSourceLinkEraser(
          new EraseAccountSourceLinks(new RefusingSourceLinkRepository(links)),
        ),
        ERASES_NO_INSTRUMENTS,
      );
    }, 180_000);

    afterAll(async () => {
      await handle?.end().catch(() => {});
      await dropDatabase(database);
    });

    it('erases BOTH links feeding the account — the exact one and the confirmed probable one', async () => {
      const accountId = await seedAccount(
        handle,
        ACTOR_A1,
        'Synthetic Test Account With Two Sources',
        clock,
      );
      await confirmedLink(
        ACTOR_A1,
        accountId,
        SYNTHETIC_SOURCE_REF_ONE,
        'Synthetic Test Connection Confirmed Probable',
      );
      await exactLink(
        ACTOR_A1,
        accountId,
        SYNTHETIC_SOURCE_REF_ONE,
        'Synthetic Test Connection Exact Match',
      );

      // NON-EMPTY FIRST: an erasure test over an account nothing feeds proves
      // nothing at all.
      expect(await countAsSuperuser(accountId)).toEqual({
        financial_accounts: 1,
        account_source_links: 2,
      });

      const deleted = await deleteAccount.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        asAccountsPrincipal(ACTOR_A1),
      );
      expect(deleted.ok).toBe(true);
      if (!deleted.ok) return;
      // Counted, not assumed. Both links, reported by the module that removed
      // them, through the port the accounts module declared.
      expect(deleted.value.accountSourceLinksDeleted).toBe(2);

      // Counted with RLS bypassed: gone, not hidden.
      expect(await countAsSuperuser(accountId)).toEqual({
        financial_accounts: 0,
        account_source_links: 0,
      });
    });

    it('a second delete of the same account is idempotent and erases nothing more', async () => {
      const accountId = await seedAccount(
        handle,
        ACTOR_A1,
        'Synthetic Test Account Deleted Twice',
        clock,
      );
      await confirmedLink(
        ACTOR_A1,
        accountId,
        'SYNTHETIC-SRC-ACCT-ZETA',
        'Synthetic Test Connection Deleted Twice',
      );

      const first = await deleteAccount.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        asAccountsPrincipal(ACTOR_A1),
      );
      expect(first.ok).toBe(true);
      if (first.ok) expect(first.value.accountSourceLinksDeleted).toBe(1);

      // The second call finds nothing on either side. It answers the same
      // oracle-free not-found a guessed id gets, and — the point of the
      // idempotence contract — it does NOT report a partial deletion, because
      // the eraser answered zero rather than raising.
      const second = await deleteAccount.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        asAccountsPrincipal(ACTOR_A1),
      );
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.kind).toBe('account_not_found');

      expect(await countAsSuperuser(accountId)).toEqual({
        financial_accounts: 0,
        account_source_links: 0,
      });
    });

    it('a failing source-link eraser leaves the ACCOUNT and its links intact, and says so', async () => {
      const accountId = await seedAccount(
        handle,
        ACTOR_A1,
        'Synthetic Test Account Erasure Refused',
        clock,
      );
      await confirmedLink(
        ACTOR_A1,
        accountId,
        SYNTHETIC_SOURCE_REF_TWO,
        'Synthetic Test Connection Erasure Refused',
      );

      const refused = await deleteAccountWithRefusingLinks.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        asAccountsPrincipal(ACTOR_A1),
      );
      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      expect(refused.error.kind).toBe('source_link_erasure_incomplete');
      if (refused.error.kind === 'source_link_erasure_incomplete') {
        expect(refused.error.outcome).toBe('failed');
        // A raised transaction rolled back: nothing is known to have gone.
        expect(refused.error.accountSourceLinksDeleted).toBe(0);
      }

      // THE ASSERTION THIS SUITE EXISTS FOR: a partial state is never reported
      // as completion. The account row SURVIVES, so the link still has its
      // anchor and a retry can finish the job.
      expect(await countAsSuperuser(accountId)).toEqual({
        financial_accounts: 1,
        account_source_links: 1,
      });

      // The driver's words never reach the caller, in any rendering, while the
      // cause stays reachable by name for the one boundary allowed to log it.
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
      expect(Object.getOwnPropertyDescriptor(refused.error, 'cause')?.enumerable).toBe(false);
      expect((refused.error as { cause?: unknown }).cause).toBeInstanceOf(Error);

      // And the retry converges, because the erasure is idempotent.
      const retried = await deleteAccount.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        asAccountsPrincipal(ACTOR_A1),
      );
      expect(retried.ok).toBe(true);
      if (retried.ok) expect(retried.value.accountSourceLinksDeleted).toBe(1);
      expect(await countAsSuperuser(accountId)).toEqual({
        financial_accounts: 0,
        account_source_links: 0,
      });
    });

    it("a neighbour's delete erases neither the account nor a single link", async () => {
      const accountId = await seedAccount(
        handle,
        ACTOR_A1,
        'Synthetic Test Account Not Yours',
        clock,
      );
      await confirmedLink(
        ACTOR_A1,
        accountId,
        'SYNTHETIC-SRC-ACCT-ETA',
        'Synthetic Test Connection Not Yours',
      );

      const refused = await deleteAccount.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        asAccountsPrincipal(ACTOR_A2),
      );
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.kind).toBe('account_not_found');

      expect(await countAsSuperuser(accountId)).toEqual({
        financial_accounts: 1,
        account_source_links: 1,
      });
    });

    it("the eraser cannot reach another subject's links even when handed their account id", async () => {
      // Principal-scoped by construction: the adapter runs the erasure inside
      // the CALLER's own context, so A2 asking to erase A1's links erases
      // nothing — and the owner can still erase them, which is what makes this
      // a statement about scoping rather than about the eraser not working.
      const accountId = await seedAccount(
        handle,
        ACTOR_A1,
        'Synthetic Test Account Cross Subject',
        clock,
      );
      await confirmedLink(
        ACTOR_A1,
        accountId,
        'SYNTHETIC-SRC-ACCT-THETA',
        'Synthetic Test Connection Cross Subject',
      );

      const eraser = new FinancialAccountsSourceLinkEraser(
        new EraseAccountSourceLinks(
          new PrismaAccountSourceLinkRepository(handle, testEncryption()),
        ),
      );
      const outcome = await eraser.eraseAccountSourceLinks(
        asAccountsPrincipal(ACTOR_A2),
        accountId as FinancialAccountId,
      );
      expect(outcome.kind).toBe('erased');
      if (outcome.kind === 'erased') expect(outcome.accountSourceLinksDeleted).toBe(0);
      expect((await countAsSuperuser(accountId))['account_source_links']).toBe(1);

      const deleted = await deleteAccount.execute(
        { accountId: accountId as FinancialAccountId, expectedVersion: 1 },
        asAccountsPrincipal(ACTOR_A1),
      );
      expect(deleted.ok).toBe(true);
      if (deleted.ok) expect(deleted.value.accountSourceLinksDeleted).toBe(1);
      expect((await countAsSuperuser(accountId))['account_source_links']).toBe(0);
    });
  },
);
