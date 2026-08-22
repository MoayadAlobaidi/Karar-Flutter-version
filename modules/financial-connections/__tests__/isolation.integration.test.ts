/**
 * ADVERSARIAL ISOLATION for `financial_connections` and
 * `account_source_links` against live PostgreSQL (tenancy.md §2 layer 4;
 * ADR-0022).
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
 * Every attack path is exercised at two layers: direct SQL as `karar_app`
 * (with the wrong GUCs and with none), and the real Prisma repositories.
 * There is no authorization layer in front of any of it on purpose: what
 * these tests prove is that RLS ALONE holds the boundary.
 *
 * A leak here is not one row. A source link says which institutions a person
 * deals with, and its fingerprint says which of their accounts are the same
 * account — so a cross-subject read here is a correlation across a household,
 * not a single disclosure.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';
import { PrincipalContextError } from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { ProposeAccountSourceLink } from '../application/use-cases/propose-account-source-link.js';
import { CreateManualConnection } from '../application/use-cases/create-manual-connection.js';
import { ListOwnAccountSourceLinks } from '../application/use-cases/list-own-account-source-links.js';
import { ListOwnConnections } from '../application/use-cases/list-own-connections.js';
import type { ConnectionsPrincipal } from '../application/principal.js';
import { FinancialAccountsCanonicalAccountAdapter } from '../infrastructure/adapters/financial-accounts-canonical-account-access.js';
import { PrismaAccountSourceLinkRepository } from '../infrastructure/persistence/prisma-account-source-link-repository.js';
import { PrismaFinancialConnectionRepository } from '../infrastructure/persistence/prisma-financial-connection-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import {
  ACTOR_A1,
  ACTOR_A2,
  ACTOR_B1,
  EVERY_CONNECTION_PAGE,
  EVERY_SOURCE_LINK_PAGE,
  SYNTHETIC_SOURCE_REF_ONE,
  TENANT_A,
  TENANT_B,
  USER_A1,
  USER_A2,
  USER_B1,
  accountsRepository,
  asApp,
  buildHandle,
  dropDatabase,
  expectEveryVisibleConnection,
  expectEveryVisibleSourceLink,
  probePostgres,
  provisionDatabase,
  seedAccount,
  skipBanner,
  superuserMaintenanceProfile,
  testEncryption,
  testFingerprints,
  testRetention,
} from './fixtures.js';
import type { FinancialConnectionId } from '../domain/refs.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'FINANCIAL-CONNECTIONS ISOLATION TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_connections_rls`;
const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));

/** A1's identity presented with a session claiming tenant B. */
const actorA1inB: ConnectionsPrincipal = { tenantId: TENANT_B, userId: USER_A1 };

let handle: PrismaHandle;
let connections: PrismaFinancialConnectionRepository;
let links: PrismaAccountSourceLinkRepository;
let createConnection: CreateManualConnection;
let propose: ProposeAccountSourceLink;
let listConnections: ListOwnConnections;
let listLinks: ListOwnAccountSourceLinks;

const seeded: Record<string, { connection: FinancialConnectionId; account: string }> = {};

async function seedFor(
  actor: ConnectionsPrincipal,
  key: string,
  label: string,
  reference: string,
): Promise<void> {
  const account = await seedAccount(handle, actor, `Synthetic Test Account ${label}`, clock);
  const created = await createConnection.execute(
    { rail: 'USER_FILE_UPLOAD', displayLabel: `Synthetic Test Connection ${label}`, institutionRef: null },
    actor,
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('unreachable');
  const proposed = await propose.execute(
    {
      connectionId: created.value.id,
      candidateAccountId: account,
      externalAccountReference: reference,
    },
    actor,
  );
  expect(proposed.ok).toBe(true);
  seeded[key] = { connection: created.value.id, account };
}

describe.skipIf(unreachable !== null)('cross-subject and cross-tenant invisibility', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);
    const encryption = testEncryption();
    connections = new PrismaFinancialConnectionRepository(handle, encryption);
    links = new PrismaAccountSourceLinkRepository(handle, encryption);
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
      new FinancialAccountsCanonicalAccountAdapter(accountsRepository(handle)),
      testFingerprints(),
      retention,
      new Uuidv7IdSource(),
      clock,
    );
    listConnections = new ListOwnConnections(connections);
    listLinks = new ListOwnAccountSourceLinks(links);

    // BOTH sides seeded, through the real write paths. The same external
    // reference for A1 and A2 on purpose: it is the value whose fingerprints
    // must not correlate.
    await seedFor(ACTOR_A1, 'a1', 'A1', SYNTHETIC_SOURCE_REF_ONE);
    await seedFor(ACTOR_A2, 'a2', 'A2', SYNTHETIC_SOURCE_REF_ONE);
    await seedFor(ACTOR_B1, 'b1', 'B1', SYNTHETIC_SOURCE_REF_ONE);
  }, 180_000);

  afterAll(async () => {
    await handle?.end().catch(() => {});
    await dropDatabase(database);
  });

  it('the legitimate read is non-empty — without which nothing below proves anything', async () => {
    const own = await listConnections.execute(EVERY_CONNECTION_PAGE, ACTOR_A1);
    expect(own.ok).toBe(true);
    if (own.ok) expect(own.value.connections).toHaveLength(1);

    const ownLinks = await listLinks.execute(EVERY_SOURCE_LINK_PAGE, ACTOR_A1);
    expect(ownLinks.ok).toBe(true);
    if (ownLinks.ok) expect(ownLinks.value.items).toHaveLength(1);
  });

  it('one tenant member cannot see another member connections through the repository', async () => {
    const a1 = await expectEveryVisibleConnection(connections, ACTOR_A1);
    const a2 = await expectEveryVisibleConnection(connections, ACTOR_A2);
    expect(a1).toHaveLength(1);
    expect(a2).toHaveLength(1);
    expect(a1[0]?.id).not.toBe(a2[0]?.id);

    // And a direct read of the neighbour's row answers nothing.
    expect(await connections.findOwnById(ACTOR_A1, seeded['a2']!.connection)).toBeNull();
    expect(await connections.findOwnById(ACTOR_A2, seeded['a1']!.connection)).toBeNull();
  });

  it('one tenant member cannot see another member source links', async () => {
    const a1 = await expectEveryVisibleSourceLink(links, ACTOR_A1);
    const a2 = await expectEveryVisibleSourceLink(links, ACTOR_A2);
    expect(a1).toHaveLength(1);
    expect(a2).toHaveLength(1);
    expect(a1[0]?.id).not.toBe(a2[0]?.id);
  });

  it('two members of one tenant fingerprint the same source reference DIFFERENTLY', async () => {
    // The row-level boundary and the cryptographic one, together: even if a
    // reader saw both rows, the column could not correlate them.
    const a1 = await expectEveryVisibleSourceLink(links, ACTOR_A1);
    const a2 = await expectEveryVisibleSourceLink(links, ACTOR_A2);
    expect(a1[0]?.fingerprint.value).toBeDefined();
    expect(a2[0]?.fingerprint.value).toBeDefined();
    expect(a1[0]?.fingerprint.value).not.toBe(a2[0]?.fingerprint.value);
  });

  it('a cross-tenant read sees nothing', async () => {
    expect(await connections.findOwnById(ACTOR_B1, seeded['a1']!.connection)).toBeNull();
    expect(await connections.findOwnById(ACTOR_A1, seeded['b1']!.connection)).toBeNull();
    const b1 = await expectEveryVisibleSourceLink(links, ACTOR_B1);
    expect(b1).toHaveLength(1);
    expect(b1[0]?.id).not.toBe((await expectEveryVisibleSourceLink(links, ACTOR_A1))[0]?.id);
  });

  it('a valid user id presented under the wrong tenant sees nothing', async () => {
    const listed = await expectEveryVisibleConnection(connections, actorA1inB);
    expect(listed).toHaveLength(0);
    expect(await connections.findOwnById(actorA1inB, seeded['a1']!.connection)).toBeNull();
  });

  it('a raw SELECT as karar_app with the neighbour GUCs returns no rows', async () => {
    const rows = await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) },
      (tx) =>
        tx.query<{ id: string }>(`SELECT id FROM public.financial_connections WHERE id = $1`, [
          seeded['a1']!.connection,
        ]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('a raw SELECT as karar_app with NO GUCs returns no rows at all', async () => {
    const connectionRows = await asApp(database, {}, (tx) =>
      tx.query<{ id: string }>(`SELECT id FROM public.financial_connections`),
    );
    expect(connectionRows.rows).toHaveLength(0);
    const linkRows = await asApp(database, {}, (tx) =>
      tx.query<{ id: string }>(`SELECT id FROM public.account_source_links`),
    );
    expect(linkRows.rows).toHaveLength(0);
  });

  it('a raw UPDATE as karar_app against a neighbour row affects nothing', async () => {
    await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) },
      (tx) =>
        tx.query(
          `UPDATE public.financial_connections SET status = 'RETIRED', version = version + 1 WHERE id = $1`,
          [seeded['a1']!.connection],
        ),
    );
    const still = await connections.findOwnById(ACTOR_A1, seeded['a1']!.connection);
    expect(still).not.toBeNull();
    expect(still?.status).toBe('ACTIVE');
  });

  it('a raw DELETE as karar_app against a neighbour source link removes nothing', async () => {
    const before = await expectEveryVisibleSourceLink(links, ACTOR_A1);
    await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(USER_B1) },
      (tx) =>
        tx.query(`DELETE FROM public.account_source_links WHERE id = $1`, [before[0]!.id]),
    );
    expect(await expectEveryVisibleSourceLink(links, ACTOR_A1)).toHaveLength(before.length);
  });

  it('an INSERT as karar_app claiming another subject is refused by WITH CHECK', async () => {
    await expect(
      asApp(
        database,
        { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) },
        (tx) =>
          tx.query(
            `INSERT INTO public.financial_connections
               (id, tenant_id, user_id, rail, status, hsf_algorithm, hsf_key_version,
                display_label_ciphertext, display_label_nonce, display_label_auth_tag, updated_at)
             VALUES ($1, $2, $3, 'MANUAL', 'ACTIVE', 'AES-256-GCM', 'v1',
                     decode('506c616e746564','hex'),
                     decode('000000000000000000000000','hex'),
                     decode('00000000000000000000000000000000','hex'), now())`,
            [
              '0c0c0c0c-0000-4000-8000-0000000000ff',
              TenantId.toString(TENANT_A),
              UserId.toString(USER_A1),
            ],
          ),
      ),
    ).rejects.toThrow(/row-level security|violates row-level security policy/i);
  });

  it('a repository called with a partial principal refuses rather than reading widely', async () => {
    await expect(
      connections.pageOwn(
        { tenantId: TENANT_A } as unknown as ConnectionsPrincipal,
        EVERY_CONNECTION_PAGE,
      ),
    ).rejects.toBeInstanceOf(PrincipalContextError);
    await expect(
      links.pageOwn({ userId: USER_A1 } as unknown as ConnectionsPrincipal, {
        accountRef: null,
        ...EVERY_SOURCE_LINK_PAGE,
      }),
    ).rejects.toBeInstanceOf(PrincipalContextError);
  });

  it('a use case refuses without a principal instead of answering emptily', async () => {
    const listed = await listConnections.execute(
      EVERY_CONNECTION_PAGE,
      null as unknown as ConnectionsPrincipal,
    );
    expect(listed.ok).toBe(false);
    if (!listed.ok) expect(listed.error.kind).toBe('missing_principal_context');
  });

  it('a neighbour connection cannot be used as the anchor for a link', async () => {
    const proposed = await propose.execute(
      {
        connectionId: seeded['a2']!.connection,
        candidateAccountId: seeded['a1']!.account,
        externalAccountReference: 'SYNTHETIC-SRC-ACCT-ZETA',
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(false);
    if (!proposed.ok) expect(proposed.error.kind).toBe('connection_not_found');
  });

  it('a neighbour account cannot be linked, and the refusal is the not-found one', async () => {
    const proposed = await propose.execute(
      {
        connectionId: seeded['a1']!.connection,
        candidateAccountId: seeded['a2']!.account,
        externalAccountReference: 'SYNTHETIC-SRC-ACCT-ETA',
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(false);
    if (!proposed.ok) expect(proposed.error.kind).toBe('account_not_found');
  });
});
