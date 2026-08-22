/**
 * The constraints, asserted against live PostgreSQL as `karar_app` — the role
 * the application actually runs as.
 *
 * Almost every assertion here is an attempted WRITE, not a catalogue read,
 * because the claim being made is "this cannot be written", and a constraint
 * that exists in `pg_constraint` but is `NOT VALID`, or is on the wrong
 * column, or is shadowed by a `BEFORE` trigger, still reads as present. The
 * only evidence that a row cannot exist is a refused insert.
 *
 * The two exceptions are assertions about ABSENCE — the exhaustive column
 * lists and the RLS flags — which have to be read rather than provoked.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';

import {
  IMPORT_STATES,
  isLegalTransition,
  type ImportState,
} from '../domain/import-state.js';
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
// The marker is IMPORTED, never typed. `tsc` emits these tests into the same
// dist/ a deployment ships, so a fixture value written here travels exactly as
// far as one written in source — which the retention closure test proves by
// scanning every dist/ in the production closure.
import { SYNTHETIC_RETENTION_MARKER } from '@karar/financial-retention-local-fixtures';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'STATEMENT-IMPORTS SCHEMA TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_imports_schema`;
const TENANT = TenantId.toString(ACTOR_A1.tenantId);
const USER = UserId.toString(ACTOR_A1.userId);
const ACCOUNT = 'acc00000-0000-4000-8000-00000000000a';

/**
 * Placeholder encryption columns. Deliberate nonsense bytes: these rows are
 * asserted to be REFUSED (or, where accepted, never decrypted), so a real
 * ciphertext would only obscure which boundary is under test.
 */
const BYTES = {
  nonce: `decode('000000000000000000000000', 'hex')`,
  authTag: `decode('00000000000000000000000000000000', 'hex')`,
  checksum: `decode('${'00'.repeat(32)}', 'hex')`,
};

let sequence = 0;
function nextImportId(): string {
  sequence += 1;
  return `11111111-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}
let rowSequence = 0;
function nextRowId(): string {
  rowSequence += 1;
  return `22222222-0000-4000-8000-${rowSequence.toString(16).padStart(12, '0')}`;
}

/** The columns a row in a given state must carry to satisfy the CHECKs. */
function stateColumns(state: ImportState): { refusalCode: string | null; timestamps: string } {
  const refusalCode = state === 'FAILED' || state === 'DUPLICATE' ? 'SOURCE_TOO_LARGE' : null;
  const committedAt = state === 'COMMITTED' ? 'now()' : 'NULL';
  const erasedAt = state === 'ERASED' ? 'now()' : 'NULL';
  return { refusalCode, timestamps: `${committedAt}, ${erasedAt}` };
}

async function insertImport(
  state: ImportState,
  options: { retentionDecided?: boolean; id?: string } = {},
): Promise<string> {
  const id = options.id ?? nextImportId();
  const decided = options.retentionDecided ?? true;
  const { refusalCode, timestamps } = stateColumns(state);
  const versionsNeeded = ['REVIEW_REQUIRED', 'COMMITTING', 'COMMITTED'].includes(state);
  await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
    tx.query(
      `INSERT INTO public.statement_imports
         (id, tenant_id, user_id, account_id, account_reference_type, state, state_changed_at,
          media_type, retention_state, retention_decided_at, retention_period, retention_basis,
          retention_pack_version, parser_version, mapping_version, normalization_version,
          staged_row_fingerprint_version, refusal_code, committed_at, erased_at, updated_at)
       VALUES ($1, $2, $3, $4, 'FINANCIAL_ACCOUNT', $5, now(), 'text/csv',
               ${decided ? `'DECIDED', now(), 'P0D', '${SYNTHETIC_RETENTION_MARKER}', 'synthetic'` : `'UNDECIDED', NULL, NULL, NULL, NULL`},
               ${versionsNeeded ? `'p/1', 'm/1', 'n/1', 'f/1'` : 'NULL, NULL, NULL, NULL'},
               $6, ${timestamps}, now())`,
      [id, TENANT, USER, ACCOUNT, state, refusalCode],
    ),
  );
  return id;
}

async function insertSource(importId: string, id = nextRowId()): Promise<void> {
  await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
    tx.query(
      `INSERT INTO public.statement_import_sources
         (id, tenant_id, user_id, import_id, media_type, byte_length, store_kind, object_ref,
          encryption_algorithm, encryption_key_version, encryption_nonce, encryption_auth_tag,
          integrity_checksum_algorithm, integrity_checksum, file_fingerprint,
          file_fingerprint_version, stored_at)
       VALUES ($1, $2, $3, $4, 'text/csv', 100, 'LOCAL_ENCRYPTED_BUFFER', $5,
               'AES-256-GCM', 'kv1', ${BYTES.nonce}, ${BYTES.authTag}, 'SHA-256',
               ${BYTES.checksum}, 'fp-synthetic', 'v1', now())`,
      [id, TENANT, USER, importId, `local-src-${id}`],
    ),
  );
}

/**
 * The SQLSTATE a refused write carried, or `ACCEPTED`.
 *
 * Read from the platform adapter's `PgError.sqlState` — the raw PostgreSQL
 * code — rather than from the message. A message is prose that a later edit
 * rewrites; a SQLSTATE is the structural fact these tests are about, and it
 * is what production code branches on too.
 */
async function sqlStateOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'ACCEPTED';
  } catch (error) {
    const state = (error as { sqlState?: unknown }).sqlState;
    if (typeof state === 'string') return state;
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : 'UNKNOWN';
  }
}

describe.skipIf(unreachable !== null)('statement-imports schema', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
  }, 180_000);

  afterAll(async () => {
    await dropDatabase(database);
  }, 60_000);

  describe('the retention gate — KAR54', () => {
    it('REFUSES a source row while the parent import has not decided retention', async () => {
      const importId = await insertImport('DRAFT', { retentionDecided: false });
      expect(await sqlStateOf(() => insertSource(importId))).toBe('KAR54');
    });

    it('accepts one once the decision is recorded', async () => {
      const importId = await insertImport('DRAFT');
      expect(await sqlStateOf(() => insertSource(importId))).toBe('ACCEPTED');
    });

    it('REFUSES a source row for an import this principal cannot see', async () => {
      // Not "not found": the guard cannot see the parent under the caller's
      // own RLS, so there is nothing to govern the bytes.
      expect(
        await sqlStateOf(() => insertSource('33333333-0000-4000-8000-000000000099')),
      ).toBe('KAR54');
    });
  });

  describe('the retention decision is write-once — KAR53', () => {
    it('REFUSES a rewritten period, basis or pack version', async () => {
      const importId = await insertImport('DRAFT');
      expect(
        await sqlStateOf(() =>
          asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
            tx.query(
              `UPDATE public.statement_imports SET retention_period = 'P9999D', version = version + 1 WHERE id = $1`,
              [importId],
            ),
          ),
        ),
      ).toBe('KAR53');
    });
  });

  describe('the state machine — KAR51', () => {
    it('matches the domain’s legal-transition list, pair for pair', async () => {
      // The full cross product. The claim is that the TypeScript list and the
      // trigger's list are the same list, and the only way to prove that is to
      // attempt every move and compare the two answers.
      const disagreements: string[] = [];
      for (const from of IMPORT_STATES) {
        for (const to of IMPORT_STATES) {
          if (from === to) continue;
          const importId = await insertImport(from);
          const { refusalCode, timestamps } = stateColumns(to);
          const versionsNeeded = ['REVIEW_REQUIRED', 'COMMITTING', 'COMMITTED'].includes(to);
          const outcome = await sqlStateOf(() =>
            asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
              tx.query(
                `UPDATE public.statement_imports
                    SET state = $2,
                        refusal_code = $3,
                        committed_at = ${timestamps.split(', ')[0] ?? 'NULL'},
                        erased_at = ${timestamps.split(', ')[1] ?? 'NULL'},
                        parser_version = ${versionsNeeded ? `'p/1'` : 'parser_version'},
                        mapping_version = ${versionsNeeded ? `'m/1'` : 'mapping_version'},
                        normalization_version = ${versionsNeeded ? `'n/1'` : 'normalization_version'},
                        staged_row_fingerprint_version = ${versionsNeeded ? `'f/1'` : 'staged_row_fingerprint_version'},
                        version = version + 1
                  WHERE id = $1`,
                [importId, to, refusalCode],
              ),
            ),
          );
          const databaseAllows = outcome === 'ACCEPTED';
          const domainAllows = isLegalTransition(from, to);
          if (databaseAllows !== domainAllows) {
            disagreements.push(`${from} -> ${to}: database=${outcome}, domain=${domainAllows}`);
          }
        }
      }
      expect(disagreements).toEqual([]);
    }, 180_000);

    it('REFUSES the transitions that skip review, with KAR51 specifically', async () => {
      for (const [from, to] of [
        ['PARSING', 'COMMITTED'],
        ['SOURCE_STORED', 'COMMITTING'],
      ] as const) {
        const importId = await insertImport(from);
        expect(
          await sqlStateOf(() =>
            asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
              tx.query(
                `UPDATE public.statement_imports
                    SET state = $2, committed_at = ${to === 'COMMITTED' ? 'now()' : 'NULL'},
                        parser_version = 'p/1', mapping_version = 'm/1',
                        normalization_version = 'n/1', staged_row_fingerprint_version = 'f/1',
                        version = version + 1
                  WHERE id = $1`,
                [importId, to],
              ),
            ),
          ),
        ).toBe('KAR51');
      }
    });
  });

  describe('identity and concurrency — KAR50, KAR52', () => {
    it('REFUSES re-pointing an import at a different account', async () => {
      const importId = await insertImport('DRAFT');
      expect(
        await sqlStateOf(() =>
          asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
            tx.query(
              `UPDATE public.statement_imports SET account_id = $2, version = version + 1 WHERE id = $1`,
              [importId, 'acc00000-0000-4000-8000-00000000000b'],
            ),
          ),
        ),
      ).toBe('KAR50');
    });

    it('REFUSES a version that does not advance by exactly one', async () => {
      const importId = await insertImport('DRAFT');
      expect(
        await sqlStateOf(() =>
          asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
            tx.query(
              `UPDATE public.statement_imports SET state = 'SOURCE_STORED', version = version + 5 WHERE id = $1`,
              [importId],
            ),
          ),
        ),
      ).toBe('KAR52');
    });
  });

  describe('staged rows appear only during PARSING — KAR57', () => {
    async function insertRow(importId: string): Promise<unknown> {
      return asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
        tx.query(
          `INSERT INTO public.statement_import_rows
             (id, tenant_id, user_id, import_id, row_number, row_state, updated_at)
           VALUES ($1, $2, $3, $4, 1, 'INVALID', now())`,
          [nextRowId(), TENANT, USER, importId],
        ),
      );
    }

    it('accepts a row while the import is PARSING', async () => {
      const importId = await insertImport('PARSING');
      expect(await sqlStateOf(() => insertRow(importId))).toBe('ACCEPTED');
    });

    it.each(['DRAFT', 'SOURCE_STORED', 'REVIEW_REQUIRED', 'COMMITTED'] as const)(
      'REFUSES a row while the import is %s',
      async (state) => {
        const importId = await insertImport(state);
        expect(await sqlStateOf(() => insertRow(importId))).toBe('KAR57');
      },
    );
  });

  describe('an unreadable amount is NULL, never zero', () => {
    it('REFUSES an INVALID row that carries an amount at all', async () => {
      const importId = await insertImport('PARSING');
      expect(
        await sqlStateOf(() =>
          asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
            tx.query(
              `INSERT INTO public.statement_import_rows
                 (id, tenant_id, user_id, import_id, row_number, row_state, amount_minor, updated_at)
               VALUES ($1, $2, $3, $4, 90, 'INVALID', 0, now())`,
              [nextRowId(), TENANT, USER, importId],
            ),
          ),
        ),
      ).toBe('23514'); // check_violation
    });

    it('REFUSES a VALID row that is missing any fact a transaction needs', async () => {
      const importId = await insertImport('PARSING');
      expect(
        await sqlStateOf(() =>
          asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
            tx.query(
              `INSERT INTO public.statement_import_rows
                 (id, tenant_id, user_id, import_id, row_number, row_state, booking_date, updated_at)
               VALUES ($1, $2, $3, $4, 91, 'VALID', DATE '2026-08-12', now())`,
              [nextRowId(), TENANT, USER, importId],
            ),
          ),
        ),
      ).toBe('23514');
    });
  });

  describe('no committed transaction before review', () => {
    it('REFUSES a non-zero committed count outside the committing states', async () => {
      const importId = await insertImport('REVIEW_REQUIRED');
      expect(
        await sqlStateOf(() =>
          asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
            tx.query(
              `UPDATE public.statement_imports SET committed_transaction_count = 3, version = version + 1 WHERE id = $1`,
              [importId],
            ),
          ),
        ),
      ).toBe('23514');
    });
  });

  describe('the object reference is opaque, never a URI', () => {
    it('REFUSES a scheme separator', async () => {
      const importId = await insertImport('DRAFT');
      expect(
        await sqlStateOf(() =>
          asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
            tx.query(
              `INSERT INTO public.statement_import_sources
                 (id, tenant_id, user_id, import_id, media_type, byte_length, store_kind, object_ref,
                  encryption_algorithm, encryption_key_version, encryption_nonce, encryption_auth_tag,
                  integrity_checksum_algorithm, integrity_checksum, file_fingerprint,
                  file_fingerprint_version, stored_at)
               VALUES ($1, $2, $3, $4, 'text/csv', 100, 'EXTERNAL_ENCRYPTED_OBJECT',
                       's3://bucket/statements/key', 'AES-256-GCM', 'kv1', ${BYTES.nonce},
                       ${BYTES.authTag}, 'SHA-256', ${BYTES.checksum}, 'fp', 'v1', now())`,
              [nextRowId(), TENANT, USER, importId],
            ),
          ),
        ),
      ).toBe('23514');
    });
  });

  describe('reconciliation cannot be reported without a source-stated balance', () => {
    it('REFUSES MATCHED with no stated figure', async () => {
      const importId = await insertImport('REVIEW_REQUIRED');
      expect(
        await sqlStateOf(() =>
          asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
            tx.query(
              `UPDATE public.statement_imports SET reconciliation_status = 'MATCHED', version = version + 1 WHERE id = $1`,
              [importId],
            ),
          ),
        ),
      ).toBe('23514');
    });
  });

  describe('the error table cannot hold the offending value', () => {
    it('has EXACTLY these columns, and any addition fails this test', async () => {
      // A CHECK cannot assert the absence of a column. This is the only way
      // the guarantee can be made: a `detail`, `message`, `raw_value`,
      // `context` or jsonb column added by anyone fails here until somebody
      // changes this list deliberately.
      const columns = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'statement_import_row_errors'
            ORDER BY column_name`,
        ),
      );
      expect(columns.rows.map((row) => row.column_name)).toEqual([
        'created_at',
        'id',
        'import_id',
        'reason_code',
        'row_id',
        'row_number',
        'safe_field',
        'tenant_id',
        'user_id',
      ]);
    });

    it('carries no column whose name suggests free text', async () => {
      const suspicious = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name IN ('statement_import_row_errors', 'statement_imports')
              AND (column_name ~ '(detail|message|context|payload|note|raw|value|text|body|excerpt|snippet)'
                   OR data_type IN ('json', 'jsonb'))`,
        ),
      );
      expect(suspicious.rows.map((row) => row.column_name)).toEqual([]);
    });
  });

  describe('no plaintext statement column exists', () => {
    it('has no plaintext description, merchant, source reference or instrument mask', async () => {
      const columns = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ column_name: string; data_type: string }>(
          `SELECT column_name, data_type FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'statement_import_rows'
              AND column_name ~ '(description|merchant|source_reference|instrument_mask)'
            ORDER BY column_name`,
        ),
      );
      // Every one is bytea: ciphertext, nonce, auth tag. No text column.
      expect(columns.rows.every((row) => row.data_type === 'bytea')).toBe(true);
      expect(columns.rows.length).toBeGreaterThan(0);
    });

    it('has no column anywhere holding statement bytes', async () => {
      const columns = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'statement_import_sources'
              AND data_type IN ('text', 'character varying')
              AND column_name NOT IN ('media_type', 'store_kind', 'object_ref',
                                      'encryption_algorithm', 'encryption_key_version',
                                      'integrity_checksum_algorithm', 'file_fingerprint',
                                      'file_fingerprint_version')`,
        ),
      );
      expect(columns.rows).toEqual([]);
    });
  });

  describe('RLS', () => {
    it('is ENABLEd and FORCEd on all four tables, each with a policy', async () => {
      const flags = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
          `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
            WHERE relnamespace = 'public'::regnamespace
              AND relname IN ('statement_imports', 'statement_import_sources',
                              'statement_import_rows', 'statement_import_row_errors')
            ORDER BY relname`,
        ),
      );
      expect(flags.rows).toHaveLength(4);
      for (const row of flags.rows) {
        expect(row.relrowsecurity).toBe(true);
        expect(row.relforcerowsecurity).toBe(true);
      }

      const policies = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ tablename: string; qual: string; with_check: string }>(
          `SELECT tablename, qual, with_check FROM pg_policies
            WHERE schemaname = 'public' AND tablename LIKE 'statement_import%'
            ORDER BY tablename`,
        ),
      );
      expect(policies.rows).toHaveLength(4);
      for (const policy of policies.rows) {
        // Both arms, on BOTH GUCs. The user arm is load-bearing: two members
        // of one household tenant must not see each other's statements.
        for (const clause of [policy.qual, policy.with_check]) {
          expect(clause).toContain('app.tenant_id');
          expect(clause).toContain('app.user_id');
        }
      }
    });
  });

  describe('money columns', () => {
    it('are bigint or date, never numeric, float or double precision', async () => {
      const money = await withAdapter(database, 'superuser', (adapter) =>
        adapter.query<{ table_name: string; column_name: string; data_type: string }>(
          `SELECT table_name, column_name, data_type FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name LIKE 'statement_import%'
              AND data_type IN ('numeric', 'double precision', 'real')`,
        ),
      );
      expect(money.rows).toEqual([]);
    });
  });
});
