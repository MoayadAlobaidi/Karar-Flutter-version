/**
 * The linking rules, end to end against live PostgreSQL, through the REAL
 * repositories, the REAL encryption and fingerprint providers, and the REAL
 * adapter over `@karar/financial-accounts` — with canonical accounts created
 * by that module's own use case.
 *
 * The scenario ADR-0028 opens with is the first test: an account created from
 * a CSV import later starts receiving data from another route, and must not
 * become a second account. Everything else here is a way that could go wrong.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { ConfirmProbableSourceLink } from '../application/use-cases/confirm-probable-source-link.js';
import { CreateManualConnection } from '../application/use-cases/create-manual-connection.js';
import { DeclineProbableSourceLink } from '../application/use-cases/decline-probable-source-link.js';
import { DeleteOwnConnection } from '../application/use-cases/delete-own-connection.js';
import { EraseAccountSourceLinks } from '../application/use-cases/erase-account-source-links.js';
import { ListOwnAccountSourceLinks } from '../application/use-cases/list-own-account-source-links.js';
import { ListOwnConnections } from '../application/use-cases/list-own-connections.js';
import { ProposeAccountSourceLink } from '../application/use-cases/propose-account-source-link.js';
import type { ConnectionsPrincipal } from '../application/principal.js';
import type { FinancialConnectionId } from '../domain/refs.js';
import { FinancialAccountsCanonicalAccountAdapter } from '../infrastructure/adapters/financial-accounts-canonical-account-access.js';
import { PrismaAccountSourceLinkRepository } from '../infrastructure/persistence/prisma-account-source-link-repository.js';
import { PrismaFinancialConnectionRepository } from '../infrastructure/persistence/prisma-financial-connection-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  EVERY_CONNECTION_PAGE,
  EVERY_SOURCE_LINK_PAGE,
  SYNTHETIC_SOURCE_REF_ONE,
  SYNTHETIC_SOURCE_REF_TWO,
  accountsRepository,
  asApp,
  buildHandle,
  dropDatabase,
  everySourceLinkPageFor,
  probePostgres,
  provisionDatabase,
  seedAccount,
  skipBanner,
  superuserMaintenanceProfile,
  testEncryption,
  testFingerprints,
  testRetention,
} from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'FINANCIAL-CONNECTIONS LINKING TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_connections_linking`;
const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));

let handle: PrismaHandle;
let createConnection: CreateManualConnection;
let listConnections: ListOwnConnections;
let deleteConnection: DeleteOwnConnection;
let propose: ProposeAccountSourceLink;
let confirm: ConfirmProbableSourceLink;
let decline: DeclineProbableSourceLink;
let listLinks: ListOwnAccountSourceLinks;
let erase: EraseAccountSourceLinks;

let accountOne = '';
let accountTwo = '';

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
  if (!created.ok) throw new Error('unreachable');
  return created.value.id;
}

describe.skipIf(unreachable !== null)('linking rules against live PostgreSQL', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);

    const encryption = testEncryption();
    const links = new PrismaAccountSourceLinkRepository(handle, encryption);
    const connections = new PrismaFinancialConnectionRepository(handle, encryption);
    const accountAccess = new FinancialAccountsCanonicalAccountAdapter(
      accountsRepository(handle),
    );
    const retention = testRetention();

    createConnection = new CreateManualConnection(
      connections,
      retention,
      new Uuidv7IdSource(),
      clock,
    );
    listConnections = new ListOwnConnections(connections);
    deleteConnection = new DeleteOwnConnection(connections);
    propose = new ProposeAccountSourceLink(
      links,
      connections,
      accountAccess,
      testFingerprints(),
      retention,
      new Uuidv7IdSource(),
      clock,
    );
    confirm = new ConfirmProbableSourceLink(links, clock);
    decline = new DeclineProbableSourceLink(links, clock);
    listLinks = new ListOwnAccountSourceLinks(links);
    erase = new EraseAccountSourceLinks(links);

    accountOne = await seedAccount(handle, ACTOR_A1, 'Synthetic Test Account One', clock);
    accountTwo = await seedAccount(handle, ACTOR_A1, 'Synthetic Test Account Two', clock);
  }, 180_000);

  afterAll(async () => {
    await handle?.end().catch(() => {});
    await dropDatabase(database);
  });

  it('a CSV-created account later receives data from another route WITHOUT becoming a second account', async () => {
    const csv = await makeConnection(ACTOR_A1, 'USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');

    const first = await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: accountOne,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // A probable match asks. It does not link.
    expect(first.value.matchBasis).toBe('PROBABLE');
    expect(first.value.link.status).toBe('PENDING_CONFIRMATION');

    const confirmed = await confirm.execute(
      { linkId: first.value.link.id, expectedVersion: first.value.link.version },
      ACTOR_A1,
    );
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.value.status).toBe('LINKED');
    expect(confirmed.value.subjectConfirmedAt).not.toBeNull();

    // A second route reports the same source account. Exact match: it links
    // automatically, to the SAME account.
    const second = await makeConnection(
      ACTOR_A1,
      'MANUAL',
      'Synthetic Test Connection Second Route',
    );
    const auto = await propose.execute(
      { connectionId: second, externalAccountReference: SYNTHETIC_SOURCE_REF_ONE },
      ACTOR_A1,
    );
    expect(auto.ok).toBe(true);
    if (!auto.ok) return;
    expect(auto.value.matchBasis).toBe('EXACT_EXTERNAL_REFERENCE');
    expect(auto.value.link.status).toBe('LINKED');
    expect(auto.value.link.accountRef.accountId).toBe(accountOne);
    expect(auto.value.resolvedFromExistingLink).toBe(true);

    // ONE account, TWO connections. No second account was created here and
    // none could be: this module creates no account at all.
    const forAccount = await listLinks.execute(everySourceLinkPageFor(accountOne), ACTOR_A1);
    expect(forAccount.ok).toBe(true);
    if (!forAccount.ok) return;
    expect(forAccount.value.items).toHaveLength(2);
    expect(new Set(forAccount.value.items.map((link) => link.connectionId)).size).toBe(2);
  });

  it('refuses to point one source account at a second canonical account', async () => {
    const other = await makeConnection(
      ACTOR_A1,
      'MANUAL',
      'Synthetic Test Connection Conflicting',
    );
    const conflicting = await propose.execute(
      {
        connectionId: other,
        candidateAccountId: accountTwo,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(conflicting.ok).toBe(false);
    if (conflicting.ok) return;
    expect(conflicting.error.kind).toBe('source_account_already_linked_elsewhere');
    if (conflicting.error.kind !== 'source_account_already_linked_elsewhere') return;
    expect(conflicting.error.linkedAccountId).toBe(accountOne);
  });

  it('one connection feeds many accounts', async () => {
    const shared = await makeConnection(
      ACTOR_A1,
      'USER_FILE_UPLOAD',
      'Synthetic Test Connection Shared Statement',
    );
    const toTwo = await propose.execute(
      {
        connectionId: shared,
        candidateAccountId: accountTwo,
        externalAccountReference: SYNTHETIC_SOURCE_REF_TWO,
      },
      ACTOR_A1,
    );
    expect(toTwo.ok).toBe(true);
    if (!toTwo.ok) return;
    expect(toTwo.value.link.accountRef.accountId).toBe(accountTwo);

    const all = await listLinks.execute(EVERY_SOURCE_LINK_PAGE, ACTOR_A1);
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(new Set(all.value.items.map((link) => link.accountRef.accountId)).size).toBe(2);
  });

  it('never returns the external reference or the fingerprint from a read path', async () => {
    const all = await listLinks.execute(EVERY_SOURCE_LINK_PAGE, ACTOR_A1);
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.value.items.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(all.value.items);
    expect(serialized).not.toContain(SYNTHETIC_SOURCE_REF_ONE);
    expect(serialized).not.toContain(SYNTHETIC_SOURCE_REF_TWO);
    for (const view of all.value.items) {
      expect(Object.keys(view)).not.toContain('sourceAccountReference');
      expect(Object.keys(view)).not.toContain('fingerprint');
    }
  });

  it('stores the external reference only as ciphertext, and the fingerprint is not the plaintext', async () => {
    const result = await asApp(
      database,
      { tenantId: TenantId.toString(ACTOR_A1.tenantId), userId: UserId.toString(ACTOR_A1.userId) },
      (tx) =>
        tx.query<{
          source_account_reference_ciphertext: Uint8Array;
          source_account_fingerprint: string;
        }>(
          `SELECT source_account_reference_ciphertext, source_account_fingerprint
             FROM public.account_source_links`,
        ),
    );
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      const asText = Buffer.from(row.source_account_reference_ciphertext).toString('utf8');
      expect(asText).not.toContain('SYNTHETIC');
      expect(row.source_account_fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(row.source_account_fingerprint).not.toContain('SYNTHETIC');
    }
  });

  it('a declined suggestion is kept, and does not block a later proposal', async () => {
    const connection = await makeConnection(
      ACTOR_A1,
      'USER_FILE_UPLOAD',
      'Synthetic Test Connection Declining',
    );
    const proposed = await propose.execute(
      {
        connectionId: connection,
        candidateAccountId: accountTwo,
        externalAccountReference: 'SYNTHETIC-SRC-ACCT-GAMMA',
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const declined = await decline.execute(
      { linkId: proposed.value.link.id, expectedVersion: proposed.value.link.version },
      ACTOR_A1,
    );
    expect(declined.ok).toBe(true);
    if (!declined.ok) return;
    expect(declined.value.status).toBe('DECLINED');

    const elsewhere = await makeConnection(
      ACTOR_A1,
      'MANUAL',
      'Synthetic Test Connection After Decline',
    );
    const again = await propose.execute(
      {
        connectionId: elsewhere,
        candidateAccountId: accountOne,
        externalAccountReference: 'SYNTHETIC-SRC-ACCT-GAMMA',
      },
      ACTOR_A1,
    );
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.matchBasis).toBe('PROBABLE');
  });

  it('deleting a connection removes the links it fed and reports the exact count', async () => {
    const doomed = await makeConnection(
      ACTOR_A1,
      'USER_FILE_UPLOAD',
      'Synthetic Test Connection Doomed',
    );
    const proposed = await propose.execute(
      {
        connectionId: doomed,
        candidateAccountId: accountTwo,
        externalAccountReference: 'SYNTHETIC-SRC-ACCT-DELTA',
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(true);

    const listed = await listConnections.execute(EVERY_CONNECTION_PAGE, ACTOR_A1);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const row = listed.value.connections.find((connection) => connection.id === doomed);
    expect(row).toBeDefined();
    if (row === undefined) return;

    const deleted = await deleteConnection.execute(
      { connectionId: doomed, expectedVersion: row.version },
      ACTOR_A1,
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.value.sourceLinksDeleted).toBe(1);

    const remaining = await listLinks.execute(EVERY_SOURCE_LINK_PAGE, ACTOR_A1);
    expect(remaining.ok).toBe(true);
    if (remaining.ok) {
      expect(remaining.value.items.some((link) => link.connectionId === doomed)).toBe(false);
    }
  });

  it('erasing an account removes its links and is idempotent', async () => {
    const before = await listLinks.execute(everySourceLinkPageFor(accountTwo), ACTOR_A1);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const count = before.value.items.length;
    expect(count).toBeGreaterThan(0);

    const erased = await erase.execute({ accountId: accountTwo }, ACTOR_A1);
    expect(erased.ok).toBe(true);
    if (!erased.ok) return;
    expect(erased.value.accountSourceLinksDeleted).toBe(count);

    const again = await erase.execute({ accountId: accountTwo }, ACTOR_A1);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.accountSourceLinksDeleted).toBe(0);

    // Account one's links are untouched — erasure is scoped, not a purge.
    const other = await listLinks.execute(everySourceLinkPageFor(accountOne), ACTOR_A1);
    expect(other.ok).toBe(true);
    if (other.ok) expect(other.value.items.length).toBeGreaterThan(0);
  });

  it('refuses an account belonging to someone else, through the real accounts adapter', async () => {
    const connection = await makeConnection(
      ACTOR_A1,
      'MANUAL',
      'Synthetic Test Connection Foreign Account',
    );
    const proposed = await propose.execute(
      {
        connectionId: connection,
        candidateAccountId: 'ac000000-0000-4000-8000-0000000000ff',
        externalAccountReference: 'SYNTHETIC-SRC-ACCT-EPSILON',
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(false);
    if (!proposed.ok) expect(proposed.error.kind).toBe('account_not_found');
  });
});
