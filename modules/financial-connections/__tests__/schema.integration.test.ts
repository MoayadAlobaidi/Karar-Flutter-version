/**
 * The constraints, asserted against live PostgreSQL as `karar_app` — the role
 * the application actually runs as.
 *
 * Every assertion here is an attempted WRITE, not a catalogue read, because
 * the claim being made is "this cannot be written", and a constraint that
 * exists in `pg_constraint` but is `NOT VALID`, or is on the wrong column, or
 * is shadowed by a `BEFORE` trigger, still reads as present. The only
 * evidence that a row cannot exist is a refused insert.
 *
 * The one exception is the uniqueness suite, which reads `pg_indexes` — the
 * assertion there is about a constraint that must NOT exist, and an absence
 * has to be read rather than provoked.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';

import {
  ACTOR_A1,
  asApp,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  skipBanner,
  superuserMaintenanceProfile,
  withAdapter,
} from './fixtures.js';
import { CONNECTION_RAILS, IMPLEMENTED_CONNECTION_RAILS } from '../domain/rails.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'FINANCIAL-CONNECTIONS SCHEMA TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_connections_schema`;
const TENANT = TenantId.toString(ACTOR_A1.tenantId);
const USER = UserId.toString(ACTOR_A1.userId);

/**
 * Placeholder encryption columns. Deliberate nonsense bytes: these rows are
 * asserted to be REFUSED (or, where accepted, never decrypted), so a real
 * ciphertext would only obscure which boundary is under test.
 */
const HSF = {
  algorithm: 'AES-256-GCM',
  keyVersion: 'karar-ref:key-version:synthetic-test-connections@v1',
  ciphertext: `decode('506c616e746564', 'hex')`,
  nonce: `decode('000000000000000000000000', 'hex')`,
  authTag: `decode('00000000000000000000000000000000', 'hex')`,
};

let connectionSequence = 0;
function nextConnectionId(): string {
  connectionSequence += 1;
  return `0c0c0c0c-0000-4000-8000-${connectionSequence.toString(16).padStart(12, '0')}`;
}

let linkSequence = 0;
function nextLinkId(): string {
  linkSequence += 1;
  return `05050505-0000-4000-8000-${linkSequence.toString(16).padStart(12, '0')}`;
}

async function insertConnection(options: {
  id?: string;
  rail: string;
  status: string;
}): Promise<string> {
  const id = options.id ?? nextConnectionId();
  await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
    tx.query(
      `INSERT INTO public.financial_connections
         (id, tenant_id, user_id, rail, status, hsf_algorithm, hsf_key_version,
          display_label_ciphertext, display_label_nonce, display_label_auth_tag, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ${HSF.ciphertext}, ${HSF.nonce}, ${HSF.authTag}, now())`,
      [id, TENANT, USER, options.rail, options.status, HSF.algorithm, HSF.keyVersion],
    ),
  );
  return id;
}

async function insertLink(options: {
  id?: string;
  connectionId: string;
  connectionRail: string;
  accountId: string;
  fingerprint: string;
  matchBasis: string;
  status: string;
  subjectConfirmedAt?: string | null;
  authority?: string;
}): Promise<string> {
  const id = options.id ?? nextLinkId();
  await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
    tx.query(
      `INSERT INTO public.account_source_links
         (id, tenant_id, user_id, account_id, account_reference_type, connection_id,
          connection_rail, source_authority, hsf_algorithm, hsf_key_version,
          source_account_reference_ciphertext, source_account_reference_nonce,
          source_account_reference_auth_tag, source_account_fingerprint, source_account_fingerprint_version,
          match_basis, source_status, subject_confirmed_at, first_observed_at, last_observed_at,
          updated_at)
       VALUES ($1, $2, $3, $4, 'FINANCIAL_ACCOUNT', $5, $6, $7, $8, $9,
               ${HSF.ciphertext}, ${HSF.nonce}, ${HSF.authTag}, $10, 'v-test',
               $11, $12, $13, now(), now(), now())`,
      [
        id,
        TENANT,
        USER,
        options.accountId,
        options.connectionId,
        options.connectionRail,
        options.authority ?? 'UNVERIFIED',
        HSF.algorithm,
        HSF.keyVersion,
        options.fingerprint,
        options.matchBasis,
        options.status,
        options.subjectConfirmedAt ?? null,
      ],
    ),
  );
  return id;
}

async function refusalFor(attempt: () => Promise<unknown>): Promise<string> {
  try {
    await attempt();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the database to refuse this write, and it did not');
}

describe.skipIf(unreachable !== null)('financial_connections constraints', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
  }, 120_000);

  afterAll(async () => {
    await dropDatabase(database);
  });

  it('accepts the two implemented rails', async () => {
    for (const rail of IMPLEMENTED_CONNECTION_RAILS) {
      await expect(insertConnection({ rail, status: 'ACTIVE' })).resolves.toBeTypeOf('string');
    }
  });

  it('REFUSES every one of the eleven unimplemented rails, even by direct SQL', async () => {
    const unimplemented = CONNECTION_RAILS.filter(
      (rail) => !(IMPLEMENTED_CONNECTION_RAILS as readonly string[]).includes(rail),
    );
    expect(unimplemented).toHaveLength(11);
    for (const rail of unimplemented) {
      // NOT_CONFIGURED rather than ACTIVE, so the refusal is the RAIL gate
      // rather than the ACTIVE gate — the two are separate constraints and
      // this suite proves each of them on its own.
      const message = await refusalFor(() =>
        insertConnection({ rail, status: 'NOT_CONFIGURED' }),
      );
      expect(message, rail).toContain('financial_connections_rail_implemented_check');
    }
  });

  it('REFUSES a rail outside the vocabulary entirely', async () => {
    const message = await refusalFor(() =>
      insertConnection({ rail: 'SCREEN_SCRAPE', status: 'NOT_CONFIGURED' }),
    );
    expect(message).toContain('financial_connections_rail_check');
  });

  it('REFUSES ACTIVE on an unimplemented rail, by its own constraint', async () => {
    const message = await refusalFor(() =>
      insertConnection({ rail: 'OPEN_FINANCE_API', status: 'ACTIVE' }),
    );
    expect(message).toContain('financial_connections_active_requires_implemented_rail');
  });

  it('REFUSES NOT_IMPLEMENTED on a rail that IS implemented', async () => {
    const message = await refusalFor(() =>
      insertConnection({ rail: 'MANUAL', status: 'NOT_IMPLEMENTED' }),
    );
    expect(message).toContain('financial_connections_not_implemented_status_matches_rail');
  });

  it('has no status meaning connected in the constraint itself', async () => {
    for (const status of ['CONNECTED', 'SYNCED', 'LINKED', 'AUTHORIZED', 'PAIRED']) {
      const message = await refusalFor(() => insertConnection({ rail: 'MANUAL', status }));
      expect(message, status).toContain('financial_connections_status_check');
    }
  });

  it('REFUSES an institution reference with no stated kind, and the reverse', async () => {
    const message = await refusalFor(() =>
      asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
        tx.query(
          `INSERT INTO public.financial_connections
             (id, tenant_id, user_id, institution_ref, rail, status, hsf_algorithm,
              hsf_key_version, display_label_ciphertext, display_label_nonce,
              display_label_auth_tag, updated_at)
           VALUES ($1, $2, $3, $4, 'MANUAL', 'ACTIVE', $5, $6,
                   ${HSF.ciphertext}, ${HSF.nonce}, ${HSF.authTag}, now())`,
          [
            nextConnectionId(),
            TENANT,
            USER,
            '11111111-0000-4000-8000-000000000011',
            HSF.algorithm,
            HSF.keyVersion,
          ],
        ),
      ),
    );
    expect(message).toContain('financial_connections_institution_reference_pair');
  });

  it('freezes the rail on UPDATE', async () => {
    const id = await insertConnection({ rail: 'MANUAL', status: 'ACTIVE' });
    const message = await refusalFor(() =>
      asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
        tx.query(
          `UPDATE public.financial_connections SET rail = 'USER_FILE_UPLOAD', version = version + 1 WHERE id = $1`,
          [id],
        ),
      ),
    );
    expect(message).toMatch(/identity and rail are immutable/);
  });

  it('requires version to advance by exactly one', async () => {
    const id = await insertConnection({ rail: 'MANUAL', status: 'ACTIVE' });
    const message = await refusalFor(() =>
      asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
        tx.query(
          `UPDATE public.financial_connections SET status = 'RETIRED', version = version + 5 WHERE id = $1`,
          [id],
        ),
      ),
    );
    expect(message).toMatch(/increment version by exactly one/);
  });

  it('has RLS ENABLEd and FORCEd with a policy', async () => {
    const rows = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean; policies: number }>(
        `SELECT c.relrowsecurity, c.relforcerowsecurity,
                (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'financial_connections'`,
      ),
    );
    expect(rows.rows[0]?.relrowsecurity).toBe(true);
    expect(rows.rows[0]?.relforcerowsecurity).toBe(true);
    expect(rows.rows[0]?.policies).toBeGreaterThan(0);
  });
});

describe.skipIf(unreachable !== null)('account_source_links constraints', () => {
  const ACCOUNT_ONE = 'ac000000-0000-4000-8000-0000000000a1';
  const ACCOUNT_TWO = 'ac000000-0000-4000-8000-0000000000a2';
  let connection = '';
  let otherConnection = '';

  beforeAll(async () => {
    await provisionDatabase(database);
    connection = await insertConnection({ rail: 'USER_FILE_UPLOAD', status: 'ACTIVE' });
    otherConnection = await insertConnection({ rail: 'MANUAL', status: 'ACTIVE' });
  }, 120_000);

  afterAll(async () => {
    await dropDatabase(database);
  });

  it('REFUSES a PROBABLE match in a LINKED state with no subject confirmation', async () => {
    const message = await refusalFor(() =>
      insertLink({
        connectionId: connection,
        connectionRail: 'USER_FILE_UPLOAD',
        accountId: ACCOUNT_ONE,
        fingerprint: 'fp-probable-linked',
        matchBasis: 'PROBABLE',
        status: 'LINKED',
      }),
    );
    expect(message).toContain('account_source_links_probable_requires_confirmation');
  });

  it('REFUSES a PROBABLE match in a DORMANT state with no confirmation either', async () => {
    const message = await refusalFor(() =>
      insertLink({
        connectionId: connection,
        connectionRail: 'USER_FILE_UPLOAD',
        accountId: ACCOUNT_ONE,
        fingerprint: 'fp-probable-dormant',
        matchBasis: 'PROBABLE',
        status: 'DORMANT',
      }),
    );
    expect(message).toContain('account_source_links_probable_requires_confirmation');
  });

  it('ACCEPTS a PROBABLE match that carries the subject confirmation', async () => {
    await expect(
      insertLink({
        connectionId: connection,
        connectionRail: 'USER_FILE_UPLOAD',
        accountId: ACCOUNT_ONE,
        fingerprint: 'fp-probable-confirmed',
        matchBasis: 'PROBABLE',
        status: 'LINKED',
        subjectConfirmedAt: '2026-08-18T12:00:00.000Z',
      }),
    ).resolves.toBeTypeOf('string');
  });

  it('ACCEPTS an EXACT match linked with no confirmation — that is the auto-link path', async () => {
    await expect(
      insertLink({
        connectionId: connection,
        connectionRail: 'USER_FILE_UPLOAD',
        accountId: ACCOUNT_ONE,
        fingerprint: 'fp-exact-auto',
        matchBasis: 'EXACT_EXTERNAL_REFERENCE',
        status: 'LINKED',
      }),
    ).resolves.toBeTypeOf('string');
  });

  it('REFUSES a pending or declined link that carries a confirmation instant', async () => {
    const message = await refusalFor(() =>
      insertLink({
        connectionId: connection,
        connectionRail: 'USER_FILE_UPLOAD',
        accountId: ACCOUNT_ONE,
        fingerprint: 'fp-pending-confirmed',
        matchBasis: 'PROBABLE',
        status: 'PENDING_CONFIRMATION',
        subjectConfirmedAt: '2026-08-18T12:00:00.000Z',
      }),
    );
    expect(message).toContain(
      'account_source_links_unconfirmed_states_carry_no_confirmation',
    );
  });

  it('REFUSES a second link for one source account through one connection', async () => {
    await insertLink({
      connectionId: connection,
      connectionRail: 'USER_FILE_UPLOAD',
      accountId: ACCOUNT_ONE,
      fingerprint: 'fp-unique',
      matchBasis: 'PROBABLE',
      status: 'PENDING_CONFIRMATION',
    });
    const message = await refusalFor(() =>
      insertLink({
        connectionId: connection,
        connectionRail: 'USER_FILE_UPLOAD',
        accountId: ACCOUNT_ONE,
        fingerprint: 'fp-unique',
        matchBasis: 'PROBABLE',
        status: 'PENDING_CONFIRMATION',
      }),
    );
    expect(message).toContain('account_source_links_source_account_key');
  });

  it('REFUSES one source account mapping to two accounts, ACROSS connections', async () => {
    await insertLink({
      connectionId: connection,
      connectionRail: 'USER_FILE_UPLOAD',
      accountId: ACCOUNT_ONE,
      fingerprint: 'fp-cross-connection',
      matchBasis: 'PROBABLE',
      status: 'PENDING_CONFIRMATION',
    });
    const message = await refusalFor(() =>
      insertLink({
        connectionId: otherConnection,
        connectionRail: 'MANUAL',
        accountId: ACCOUNT_TWO,
        fingerprint: 'fp-cross-connection',
        matchBasis: 'PROBABLE',
        status: 'PENDING_CONFIRMATION',
      }),
    );
    expect(message).toMatch(/one source account maps to at most one canonical account/);
  });

  it('ALLOWS one source account through two connections to the SAME account', async () => {
    // The mechanism the redesign exists for: a second route feeding the
    // account that already exists, rather than a second account.
    await insertLink({
      connectionId: connection,
      connectionRail: 'USER_FILE_UPLOAD',
      accountId: ACCOUNT_ONE,
      fingerprint: 'fp-two-routes',
      matchBasis: 'PROBABLE',
      status: 'PENDING_CONFIRMATION',
    });
    await expect(
      insertLink({
        connectionId: otherConnection,
        connectionRail: 'MANUAL',
        accountId: ACCOUNT_ONE,
        fingerprint: 'fp-two-routes',
        matchBasis: 'EXACT_EXTERNAL_REFERENCE',
        status: 'LINKED',
      }),
    ).resolves.toBeTypeOf('string');
  });

  it('ALLOWS a declined link beside a live one for another account', async () => {
    await insertLink({
      connectionId: connection,
      connectionRail: 'USER_FILE_UPLOAD',
      accountId: ACCOUNT_ONE,
      fingerprint: 'fp-declined',
      matchBasis: 'PROBABLE',
      status: 'DECLINED',
    });
    await expect(
      insertLink({
        connectionId: otherConnection,
        connectionRail: 'MANUAL',
        accountId: ACCOUNT_TWO,
        fingerprint: 'fp-declined',
        matchBasis: 'PROBABLE',
        status: 'PENDING_CONFIRMATION',
      }),
    ).resolves.toBeTypeOf('string');
  });

  it('REFUSES re-pointing a settled link at another account', async () => {
    const id = await insertLink({
      connectionId: connection,
      connectionRail: 'USER_FILE_UPLOAD',
      accountId: ACCOUNT_ONE,
      fingerprint: 'fp-settled',
      matchBasis: 'EXACT_EXTERNAL_REFERENCE',
      status: 'LINKED',
    });
    const message = await refusalFor(() =>
      asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
        tx.query(
          `UPDATE public.account_source_links SET account_id = $2, version = version + 1 WHERE id = $1`,
          [id, ACCOUNT_TWO],
        ),
      ),
    );
    expect(message).toMatch(/settled and immutable/);
  });

  it('REFUSES rewriting the source identity of any link', async () => {
    const id = await insertLink({
      connectionId: connection,
      connectionRail: 'USER_FILE_UPLOAD',
      accountId: ACCOUNT_ONE,
      fingerprint: 'fp-identity',
      matchBasis: 'PROBABLE',
      status: 'PENDING_CONFIRMATION',
    });
    const message = await refusalFor(() =>
      asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
        tx.query(
          `UPDATE public.account_source_links SET source_account_fingerprint = 'fp-rewritten', version = version + 1 WHERE id = $1`,
          [id],
        ),
      ),
    );
    expect(message).toMatch(/source identity rewritten/);
  });

  it('REFUSES a link whose rail contradicts its connection', async () => {
    const message = await refusalFor(() =>
      insertLink({
        connectionId: connection, // USER_FILE_UPLOAD
        connectionRail: 'MANUAL',
        accountId: ACCOUNT_ONE,
        fingerprint: 'fp-rail-mismatch',
        matchBasis: 'PROBABLE',
        status: 'PENDING_CONFIRMATION',
      }),
    );
    expect(message).toContain('account_source_links_connection_fkey');
  });

  it('REFUSES an AUTHORITATIVE device signal — unreachable today, and still enforced', async () => {
    // The rail cannot exist yet, so the composite FK refuses first. What this
    // asserts is that the row is unreachable by BOTH doors: no connection to
    // hang it on, and a CHECK waiting if one ever appears.
    const message = await refusalFor(() =>
      insertLink({
        connectionId: connection,
        connectionRail: 'DEVICE_SIGNAL',
        accountId: ACCOUNT_ONE,
        fingerprint: 'fp-device',
        matchBasis: 'PROBABLE',
        status: 'PENDING_CONFIRMATION',
        authority: 'AUTHORITATIVE',
      }),
    );
    expect(message).toMatch(
      /account_source_links_device_signal_never_authoritative|account_source_links_connection_fkey/,
    );
  });

  it('REFUSES a half-stated coverage range and one that ends before it begins', async () => {
    const half = await refusalFor(() =>
      asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
        tx.query(
          `INSERT INTO public.account_source_links
             (id, tenant_id, user_id, account_id, account_reference_type, connection_id,
              connection_rail, source_authority, hsf_algorithm, hsf_key_version,
              source_account_reference_ciphertext, source_account_reference_nonce,
              source_account_reference_auth_tag, source_account_fingerprint, source_account_fingerprint_version,
              match_basis, source_status, history_coverage_start, first_observed_at,
              last_observed_at, updated_at)
           VALUES ($1, $2, $3, $4, 'FINANCIAL_ACCOUNT', $5, 'USER_FILE_UPLOAD', 'UNVERIFIED',
                   $6, $7, ${HSF.ciphertext}, ${HSF.nonce}, ${HSF.authTag}, 'fp-half-coverage',
                   'v-test', 'PROBABLE', 'PENDING_CONFIRMATION', DATE '2026-01-01', now(), now(), now())`,
          [nextLinkId(), TENANT, USER, ACCOUNT_ONE, connection, HSF.algorithm, HSF.keyVersion],
        ),
      ),
    );
    expect(half).toContain('account_source_links_history_coverage_pair');
  });

  it('has RLS ENABLEd and FORCEd with a policy', async () => {
    const rows = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean; policies: number }>(
        `SELECT c.relrowsecurity, c.relforcerowsecurity,
                (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'account_source_links'`,
      ),
    );
    expect(rows.rows[0]?.relrowsecurity).toBe(true);
    expect(rows.rows[0]?.relforcerowsecurity).toBe(true);
    expect(rows.rows[0]?.policies).toBeGreaterThan(0);
  });
});

describe.skipIf(unreachable !== null)('uniqueness, and what is deliberately absent', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
  }, 120_000);

  afterAll(async () => {
    await dropDatabase(database);
  });

  async function uniqueIndexes(table: string): Promise<string[]> {
    return withAdapter(database, 'superuser', async (adapter) => {
      const rows = await adapter.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = $1 AND indexdef LIKE '%UNIQUE%'
          ORDER BY indexname`,
        [table],
      );
      return rows.rows.map((row) => row.indexdef);
    });
  }

  it('has exactly one uniqueness rule on the link table, and it is over the fingerprint', async () => {
    const defs = (await uniqueIndexes('account_source_links')).filter(
      (def) => !def.includes('_pkey'),
    );
    expect(defs).toHaveLength(1);
    const [only] = defs;
    expect(only).toContain('tenant_id');
    expect(only).toContain('user_id');
    expect(only).toContain('connection_id');
    expect(only).toContain('source_account_fingerprint_version');
    expect(only).toContain('source_account_fingerprint');
  });

  it('has no uniqueness over institution, account type or currency anywhere', async () => {
    for (const table of ['account_source_links', 'financial_connections']) {
      for (const def of await uniqueIndexes(table)) {
        expect(def, `${table}: ${def}`).not.toMatch(/institution|account_type|currency|wallet/i);
      }
    }
  });

  it('has no uniqueness on the connection table beyond the primary key and (id, rail)', async () => {
    const defs = (await uniqueIndexes('financial_connections')).filter(
      (def) => !def.includes('_pkey'),
    );
    expect(defs).toHaveLength(1);
    expect(defs[0]).toContain('id, rail');
    // Two connections to one institution on one rail must stay ordinary.
    expect(defs[0]).not.toContain('user_id');
  });
});
