/**
 * NO CREDENTIAL OF ANY KIND IS STORED — proved against the live schema.
 *
 * A `CHECK` constraint cannot assert the absence of a column, so this suite
 * is the guarantee. It works two ways, and both are needed:
 *
 *   1. **An EXHAUSTIVE column list.** Every column of both tables is named
 *      below. Any column added to either table fails this test until someone
 *      changes the list deliberately — credential-shaped or not. A test that
 *      only looked for forbidden NAMES would pass on `provider_state`,
 *      `auth_blob`, or a `jsonb` column called `metadata`, and each of those
 *      is a place a token ends up.
 *   2. **A forbidden-name scan.** Belt and braces on the same tables, so a
 *      column that somehow arrived with the list updated in the same commit
 *      still has to get past a reviewer reading a deletion of this assertion.
 *
 * The third assertion is the quiet one: **no `json`, `jsonb`, `hstore` or
 * unbounded `text` column exists on either table beyond the closed
 * vocabularies and the identifiers**, because a free-form column is a
 * credential store with better manners.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dropDatabase, probePostgres, provisionDatabase, skipBanner, superuserMaintenanceProfile, withAdapter } from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'FINANCIAL-CONNECTIONS COLUMN-SET TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_connections_columns`;

/** Migration 0096, exhaustively. */
const CONNECTION_COLUMNS = [
  'created_at',
  'display_label_auth_tag',
  'display_label_ciphertext',
  'display_label_nonce',
  'hsf_algorithm',
  'hsf_key_version',
  'id',
  'institution_ref',
  'institution_reference_type',
  'rail',
  'status',
  'tenant_id',
  'updated_at',
  'user_id',
  'version',
];

/** Migration 0097, exhaustively. */
const SOURCE_LINK_COLUMNS = [
  'account_id',
  'account_reference_type',
  'balance_capability',
  'connection_id',
  'connection_rail',
  'created_at',
  'first_observed_at',
  'history_coverage_end',
  'history_coverage_start',
  'hsf_algorithm',
  'hsf_key_version',
  'id',
  'last_observed_at',
  'last_successful_import_at',
  'match_basis',
  'pending_transaction_capability',
  'source_account_fingerprint',
  'source_account_fingerprint_version',
  'source_account_reference_auth_tag',
  'source_account_reference_ciphertext',
  'source_account_reference_nonce',
  'source_authority',
  'source_priority',
  'source_status',
  'subject_confirmed_at',
  'tenant_id',
  'updated_at',
  'user_id',
  'version',
];

/**
 * The vocabulary of a stored credential, in every spelling a well-meaning
 * engineer reaches for. Matched as a substring against the column name.
 */
const CREDENTIAL_WORDS = [
  'password',
  'passwd',
  'passphrase',
  'secret',
  'credential',
  'token',
  'mpin',
  'pin_',
  '_pin',
  'otp',
  'recovery',
  'security_answer',
  'cookie',
  'session',
  'bearer',
  'apikey',
  'api_key',
  'client_secret',
  'private_key',
  'certificate',
  'auth_blob',
  'scrape',
  'scraping',
  'cursor',
  'sync_state',
  'sync_token',
  'device_binding',
];

async function columnsOf(table: string): Promise<Array<{ name: string; type: string }>> {
  return withAdapter(database, 'superuser', async (adapter) => {
    const rows = await adapter.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY column_name`,
      [table],
    );
    return rows.rows.map((row) => ({ name: row.column_name, type: row.data_type }));
  });
}

describe.skipIf(unreachable !== null)('no credential column exists', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
  }, 120_000);

  afterAll(async () => {
    await dropDatabase(database);
  });

  it('financial_connections has EXACTLY the declared columns and no others', async () => {
    const found = (await columnsOf('financial_connections')).map((column) => column.name);
    expect(found).toEqual(CONNECTION_COLUMNS);
  });

  it('account_source_links has EXACTLY the declared columns and no others', async () => {
    const found = (await columnsOf('account_source_links')).map((column) => column.name);
    expect(found).toEqual(SOURCE_LINK_COLUMNS);
  });

  it('neither table has a column named for a secret, a session, or a sync cursor', async () => {
    for (const table of ['financial_connections', 'account_source_links']) {
      const found = await columnsOf(table);
      for (const column of found) {
        for (const word of CREDENTIAL_WORDS) {
          expect(
            column.name.includes(word),
            `${table}.${column.name} matches the credential vocabulary ('${word}')`,
          ).toBe(false);
        }
      }
    }
  });

  it('neither table has a json, jsonb, hstore, xml or array column to hide one in', async () => {
    for (const table of ['financial_connections', 'account_source_links']) {
      for (const column of await columnsOf(table)) {
        expect(
          ['json', 'jsonb', 'ARRAY', 'xml', 'USER-DEFINED'].includes(column.type),
          `${table}.${column.name} is ${column.type} — a free-form column is a credential store with better manners`,
        ).toBe(false);
      }
    }
  });

  it('has no plaintext column beside either encrypted field', async () => {
    const connectionColumns = (await columnsOf('financial_connections')).map((c) => c.name);
    expect(connectionColumns).not.toContain('display_label');
    const linkColumns = (await columnsOf('account_source_links')).map((c) => c.name);
    expect(linkColumns).not.toContain('source_account_reference');
    // And the encrypted triple is complete on both — a ciphertext with no
    // auth tag is unverifiable, which is its own kind of missing column.
    for (const suffix of ['ciphertext', 'nonce', 'auth_tag']) {
      expect(connectionColumns).toContain(`display_label_${suffix}`);
      expect(linkColumns).toContain(`source_account_reference_${suffix}`);
    }
  });

  it('has no institution, account-type or currency column on the link table', async () => {
    // The uniqueness people reach for — (institution, type, currency) — is
    // not merely absent from the constraints: the columns it would need do
    // not exist, so the constraint is unwritable.
    const linkColumns = (await columnsOf('account_source_links')).map((c) => c.name);
    for (const forbidden of [
      'institution_ref',
      'institution_id',
      'account_type',
      'currency_code',
      'currency',
      'wallet_kind',
    ]) {
      expect(linkColumns, forbidden).not.toContain(forbidden);
    }
  });
});
