/**
 * The schema-level rules of `transfer_matches`, against live PostgreSQL.
 *
 * Every assertion here is about what the DATABASE refuses, as `karar_app` with
 * a real principal bound — not what a use case declines to attempt. The
 * distinction is the whole point: a rule that only the application layer holds
 * is a rule an ingestion path, a backfill or a fixture can walk past.
 *
 * Five groups, and each is a headline guarantee of the module:
 *
 *   1. **A CONFIRMED match cannot exist without a recorded subject decision.**
 *      Proved by a direct `UPDATE` as `karar_app` — the exact move a
 *      well-meaning backfill would make.
 *   2. **Cross-currency cannot be written at all**, in either direction.
 *   3. **The two sides must be different transactions on different accounts.**
 *   4. **One transaction, at most one live match** — the same-side case
 *      (partial unique index) and the crossed-side case (SQLSTATE KAR42).
 *   5. **The identity is frozen and the state machine is enforced** (KAR40,
 *      KAR41, KAR43).
 *
 * The column set is asserted EXHAUSTIVELY here too: there is no amount, no
 * net, no total and no category column, and the only integer is `version`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';
import type { PgError } from '@karar/platform/dist/db/errors.js';

import {
  TENANT_A,
  USER_A1,
  asApp,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  skipBanner,
  superuserMaintenanceProfile,
  withAdapter,
} from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'TRANSFER-MATCHING SCHEMA TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_match_schema`;
const TENANT = TenantId.toString(TENANT_A);
const USER = UserId.toString(USER_A1);

const ACCOUNT_ONE = 'a0000000-0000-4000-8000-00000000000a';
const ACCOUNT_TWO = 'b0000000-0000-4000-8000-00000000000b';
const TX_OUT = 'd0000000-0000-4000-8000-000000000001';
const TX_IN = 'e0000000-0000-4000-8000-000000000001';
const TX_THIRD = 'f0000000-0000-4000-8000-000000000001';

/** Migration 0099, exhaustively. */
const MATCH_COLUMNS = [
  'created_at',
  'first_suggested_at',
  'id',
  'inflow_account_id',
  'inflow_currency_code',
  'inflow_transaction_id',
  'inflow_transaction_reference_type',
  'match_state',
  'outflow_account_id',
  'outflow_currency_code',
  'outflow_transaction_id',
  'outflow_transaction_reference_type',
  'subject_decided_at',
  'suggestion_basis',
  'suggestion_window',
  'tenant_id',
  'updated_at',
  'user_id',
  'version',
];

const INSERT_SQL = `INSERT INTO public.transfer_matches
   (id, tenant_id, user_id,
    outflow_transaction_id, outflow_transaction_reference_type, outflow_account_id, outflow_currency_code,
    inflow_transaction_id, inflow_transaction_reference_type, inflow_account_id, inflow_currency_code,
    match_state, suggestion_basis, suggestion_window, subject_decided_at,
    first_suggested_at, updated_at)
 VALUES ($1, $2, $3,
         $4, 'TRANSACTION', $5, $6,
         $7, 'TRANSACTION', $8, $9,
         $10, 'EQUAL_AND_OPPOSITE_SAME_CURRENCY_WITHIN_WINDOW',
         'equal-and-opposite/same-currency/P3D/v1', $11,
         now(), now())`;

interface InsertOptions {
  readonly id: string;
  readonly outflowTransactionId?: string;
  readonly outflowAccountId?: string;
  readonly outflowCurrencyCode?: string;
  readonly inflowTransactionId?: string;
  readonly inflowAccountId?: string;
  readonly inflowCurrencyCode?: string;
  readonly matchState?: string;
  readonly subjectDecidedAt?: Date | null;
}

async function insertMatch(options: InsertOptions): Promise<void> {
  await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
    tx.query(INSERT_SQL, [
      options.id,
      TENANT,
      USER,
      options.outflowTransactionId ?? TX_OUT,
      options.outflowAccountId ?? ACCOUNT_ONE,
      options.outflowCurrencyCode ?? 'QAR',
      options.inflowTransactionId ?? TX_IN,
      options.inflowAccountId ?? ACCOUNT_TWO,
      options.inflowCurrencyCode ?? 'QAR',
      options.matchState ?? 'SUGGESTED',
      options.subjectDecidedAt ?? null,
    ]),
  );
}

/** Runs a statement and returns whatever it raised, or null. */
async function raisedBy(sql: string, params: readonly unknown[] = []): Promise<unknown> {
  return asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
    tx.query(sql, params).then(
      () => null,
      (error: unknown) => error,
    ),
  );
}

describe.skipIf(unreachable !== null)('transfer_matches schema rules', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
  }, 120_000);

  afterAll(async () => {
    await dropDatabase(database);
  });

  it('has EXACTLY the declared columns, with no amount, net or category', async () => {
    const rows = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'transfer_matches'
          ORDER BY column_name`,
      ),
    );
    expect(rows.rows.map((r) => r.column_name)).toEqual(MATCH_COLUMNS);
    // A conclusion would have to be one of these types, or a string — and a
    // string total is caught by the exhaustive list above.
    for (const row of rows.rows) {
      expect(
        ['numeric', 'money', 'double precision', 'real', 'bigint', 'smallint'].includes(
          row.data_type,
        ),
        `transfer_matches.${row.column_name} is ${row.data_type} — this table stores no figure`,
      ).toBe(false);
      expect(
        ['json', 'jsonb', 'ARRAY', 'xml', 'USER-DEFINED'].includes(row.data_type),
        `transfer_matches.${row.column_name} is ${row.data_type} — a free-form column is a total with better manners`,
      ).toBe(false);
    }
    const integers = rows.rows.filter((r) => r.data_type === 'integer').map((r) => r.column_name);
    expect(integers).toEqual(['version']);
  });

  it('a SUGGESTED match may be inserted, and carries no decision', async () => {
    await insertMatch({ id: '11111111-0000-4000-8000-000000000001' });
    const rows = await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
      tx.query<{ match_state: string; subject_decided_at: Date | null }>(
        `SELECT match_state, subject_decided_at FROM public.transfer_matches WHERE id = $1`,
        ['11111111-0000-4000-8000-000000000001'],
      ),
    );
    expect(rows.rows[0]).toEqual({ match_state: 'SUGGESTED', subject_decided_at: null });
  });

  it('CONFIRMED with no subject decision is refused — the headline CHECK', async () => {
    // The exact move a well-meaning backfill would make: flip the state and
    // leave the instant alone. The row does not exist.
    const raised = await raisedBy(
      `UPDATE public.transfer_matches SET match_state = 'CONFIRMED', version = version + 1 WHERE id = $1`,
      ['11111111-0000-4000-8000-000000000001'],
    );
    expect(String(raised)).toMatch(/transfer_matches_confirmed_requires_subject_decision/);

    // And it cannot be inserted that way either.
    const onInsert = await raisedBy(INSERT_SQL, [
      '11111111-0000-4000-8000-0000000000ff',
      TENANT,
      USER,
      'd0000000-0000-4000-8000-0000000000ff',
      ACCOUNT_ONE,
      'QAR',
      'e0000000-0000-4000-8000-0000000000ff',
      ACCOUNT_TWO,
      'QAR',
      'CONFIRMED',
      null,
    ]);
    expect(String(onInsert)).toMatch(/transfer_matches_confirmed_requires_subject_decision/);
  });

  it('a SUGGESTED match carrying a decision instant is refused too', async () => {
    // The converse: writing the instant without the state would pre-load a
    // confirmation the person never gave.
    const raised = await raisedBy(
      `UPDATE public.transfer_matches SET subject_decided_at = now(), version = version + 1 WHERE id = $1`,
      ['11111111-0000-4000-8000-000000000001'],
    );
    expect(String(raised)).toMatch(/transfer_matches_decision_instant_matches_state/);
  });

  it('CONFIRMED WITH a decision instant is accepted', async () => {
    await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
      tx.query(
        `UPDATE public.transfer_matches
            SET match_state = 'CONFIRMED', subject_decided_at = now(), version = version + 1
          WHERE id = $1`,
        ['11111111-0000-4000-8000-000000000001'],
      ),
    );
    const rows = await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
      tx.query<{ match_state: string; subject_decided_at: Date | null }>(
        `SELECT match_state, subject_decided_at FROM public.transfer_matches WHERE id = $1`,
        ['11111111-0000-4000-8000-000000000001'],
      ),
    );
    expect(rows.rows[0]?.match_state).toBe('CONFIRMED');
    expect(rows.rows[0]?.subject_decided_at).not.toBeNull();
  });

  it('CROSS-CURRENCY cannot be written, in either direction', async () => {
    for (const [outflow, inflow] of [
      ['QAR', 'USD'],
      ['USD', 'QAR'],
    ]) {
      const raised = await raisedBy(INSERT_SQL, [
        '22222222-0000-4000-8000-000000000001',
        TENANT,
        USER,
        'd0000000-0000-4000-8000-000000000002',
        ACCOUNT_ONE,
        outflow,
        'e0000000-0000-4000-8000-000000000002',
        ACCOUNT_TWO,
        inflow,
        'SUGGESTED',
        null,
      ]);
      expect(String(raised)).toMatch(/transfer_matches_same_currency_only/);
    }
  });

  it('a currency code that is not ISO 4217 alphabetic is refused', async () => {
    const raised = await raisedBy(INSERT_SQL, [
      '22222222-0000-4000-8000-000000000002',
      TENANT,
      USER,
      'd0000000-0000-4000-8000-000000000003',
      ACCOUNT_ONE,
      'qar',
      'e0000000-0000-4000-8000-000000000003',
      ACCOUNT_TWO,
      'qar',
      'SUGGESTED',
      null,
    ]);
    // Either arm may fire first; PostgreSQL does not order CHECK evaluation.
    expect(String(raised)).toMatch(/transfer_matches_(outflow|inflow)_currency_check/);
  });

  it('a transaction matched to itself is refused', async () => {
    const raised = await raisedBy(INSERT_SQL, [
      '33333333-0000-4000-8000-000000000001',
      TENANT,
      USER,
      TX_THIRD,
      ACCOUNT_ONE,
      'QAR',
      TX_THIRD,
      ACCOUNT_TWO,
      'QAR',
      'SUGGESTED',
      null,
    ]);
    expect(String(raised)).toMatch(/transfer_matches_two_distinct_transactions/);
  });

  it('two movements on ONE account are refused — a refund is not a transfer', async () => {
    const raised = await raisedBy(INSERT_SQL, [
      '33333333-0000-4000-8000-000000000002',
      TENANT,
      USER,
      'd0000000-0000-4000-8000-000000000004',
      ACCOUNT_ONE,
      'QAR',
      'e0000000-0000-4000-8000-000000000004',
      ACCOUNT_ONE,
      'QAR',
      'SUGGESTED',
      null,
    ]);
    expect(String(raised)).toMatch(/transfer_matches_two_distinct_accounts/);
  });

  it('a suggestion basis or state outside the closed vocabulary is refused', async () => {
    const badState = await raisedBy(INSERT_SQL, [
      '44444444-0000-4000-8000-000000000001',
      TENANT,
      USER,
      'd0000000-0000-4000-8000-000000000005',
      ACCOUNT_ONE,
      'QAR',
      'e0000000-0000-4000-8000-000000000005',
      ACCOUNT_TWO,
      'QAR',
      'AUTO_MATCHED',
      // A decision instant, so the state/instant pairing rule is satisfied and
      // the vocabulary CHECK is the one that fires. Without it the pairing
      // rule fires first and this test would pass for the wrong reason.
      new Date('2026-08-19T10:00:00.000Z'),
    ]);
    expect(String(badState)).toMatch(/transfer_matches_match_state_check/);

    const badBasis = await raisedBy(
      INSERT_SQL.replace(
        `'EQUAL_AND_OPPOSITE_SAME_CURRENCY_WITHIN_WINDOW'`,
        `'APPROXIMATE_AMOUNT_HEURISTIC'`,
      ),
      [
        '44444444-0000-4000-8000-000000000002',
        TENANT,
        USER,
        'd0000000-0000-4000-8000-000000000006',
        ACCOUNT_ONE,
        'QAR',
        'e0000000-0000-4000-8000-000000000006',
        ACCOUNT_TWO,
        'QAR',
        'SUGGESTED',
        null,
      ],
    );
    expect(String(badBasis)).toMatch(/transfer_matches_suggestion_basis_check/);
  });

  it('one transaction cannot be the same SIDE of two live matches', async () => {
    // Refused — and the guard gets there first, because it is a BEFORE INSERT
    // trigger and the unique index is checked at row insertion. That ordering
    // is stated rather than worked around: the trigger gives the caller a
    // structured KAR42 instead of a 23505 whose index name it would have to
    // parse, and the partial unique index is still what settles a CONCURRENT
    // race, which no trigger doing a SELECT can. Its existence and its
    // partiality are asserted structurally below.
    const raised = await raisedBy(INSERT_SQL, [
      '55555555-0000-4000-8000-000000000001',
      TENANT,
      USER,
      TX_OUT, // already the outflow of the CONFIRMED match above
      ACCOUNT_ONE,
      'QAR',
      'e0000000-0000-4000-8000-000000000007',
      ACCOUNT_TWO,
      'QAR',
      'SUGGESTED',
      null,
    ]);
    expect((raised as PgError).sqlState).toBe('KAR42');
  });

  it('one transaction cannot CROSS sides between two live matches — KAR42', async () => {
    // The case no index can express: TX_OUT is the outflow of one match and
    // would be the inflow of another. This is the trigger's job.
    const raised = await raisedBy(INSERT_SQL, [
      '55555555-0000-4000-8000-000000000002',
      TENANT,
      USER,
      'd0000000-0000-4000-8000-000000000008',
      ACCOUNT_ONE,
      'QAR',
      TX_OUT,
      ACCOUNT_TWO,
      'QAR',
      'SUGGESTED',
      null,
    ]);
    expect((raised as PgError).sqlState).toBe('KAR42');
  });

  it('a REJECTED match frees both transactions again', async () => {
    // A rejection is history: the partial indexes and the guard all exclude
    // it, so a person may reject one pairing and later accept another.
    await insertMatch({
      id: '66666666-0000-4000-8000-000000000001',
      outflowTransactionId: 'd0000000-0000-4000-8000-000000000009',
      inflowTransactionId: 'e0000000-0000-4000-8000-000000000009',
    });
    await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
      tx.query(
        `UPDATE public.transfer_matches
            SET match_state = 'REJECTED', subject_decided_at = now(), version = version + 1
          WHERE id = $1`,
        ['66666666-0000-4000-8000-000000000001'],
      ),
    );
    // The same transaction, in a new pairing, is now accepted.
    await insertMatch({
      id: '66666666-0000-4000-8000-000000000002',
      outflowTransactionId: 'd0000000-0000-4000-8000-000000000009',
      inflowTransactionId: 'e0000000-0000-4000-8000-00000000000a',
    });
    const rows = await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
      tx.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.transfer_matches
          WHERE outflow_transaction_id = $1`,
        ['d0000000-0000-4000-8000-000000000009'],
      ),
    );
    expect(rows.rows[0]?.count).toBe('2');
  });

  it('rewriting either side of a match raises KAR40', async () => {
    for (const column of [
      'outflow_transaction_id',
      'inflow_transaction_id',
      'outflow_account_id',
      'inflow_account_id',
      'outflow_currency_code',
      'inflow_currency_code',
    ]) {
      const value = column.endsWith('currency_code')
        ? `'SAR'`
        : `'aaaaaaaa-0000-4000-8000-0000000000ee'`;
      const raised = await raisedBy(
        `UPDATE public.transfer_matches SET ${column} = ${value}, version = version + 1 WHERE id = $1`,
        ['66666666-0000-4000-8000-000000000002'],
      );
      expect({ column, sqlState: (raised as PgError | null)?.sqlState }).toEqual({
        column,
        sqlState: 'KAR40',
      });
    }
  });

  it('an update that does not advance the version by exactly one raises KAR41', async () => {
    const raised = await raisedBy(
      `UPDATE public.transfer_matches SET match_state = 'REJECTED', subject_decided_at = now() WHERE id = $1`,
      ['66666666-0000-4000-8000-000000000002'],
    );
    expect((raised as PgError).sqlState).toBe('KAR41');
  });

  it('reopening a REJECTED match raises KAR43', async () => {
    const raised = await raisedBy(
      `UPDATE public.transfer_matches
          SET match_state = 'CONFIRMED', subject_decided_at = now(), version = version + 1
        WHERE id = $1`,
      ['66666666-0000-4000-8000-000000000001'],
    );
    expect((raised as PgError).sqlState).toBe('KAR43');
  });

  it('returning a decided match to SUGGESTED raises KAR43', async () => {
    const raised = await raisedBy(
      `UPDATE public.transfer_matches
          SET match_state = 'SUGGESTED', subject_decided_at = NULL, version = version + 1
        WHERE id = $1`,
      ['11111111-0000-4000-8000-000000000001'],
    );
    expect((raised as PgError).sqlState).toBe('KAR43');
  });

  it('RLS is ENABLEd and FORCEd, with one policy on both principal GUCs', async () => {
    const flags = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'transfer_matches'`,
      ),
    );
    expect(flags.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const policies = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ policyname: string; qual: string; with_check: string }>(
        `SELECT policyname, qual, with_check FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'transfer_matches'`,
      ),
    );
    expect(policies.rows).toHaveLength(1);
    for (const clause of [policies.rows[0]?.qual ?? '', policies.rows[0]?.with_check ?? '']) {
      expect(clause).toContain('app.tenant_id');
      expect(clause).toContain('app.user_id');
    }
  });

  it('the two live-state unique indexes are PARTIAL, excluding rejections', async () => {
    const rows = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'transfer_matches'
          ORDER BY indexname`,
      ),
    );
    const unique = rows.rows.filter((r) => r.indexdef.includes('UNIQUE'));
    expect(unique.map((r) => r.indexname).sort()).toEqual([
      'transfer_matches_live_inflow_key',
      'transfer_matches_live_outflow_key',
      'transfer_matches_pkey',
    ]);
    for (const index of unique) {
      if (index.indexname === 'transfer_matches_pkey') continue;
      // WHERE match_state <> 'REJECTED' — without the predicate a rejection
      // would occupy a transaction forever.
      expect(index.indexdef).toContain("WHERE (match_state <> 'REJECTED'");
    }
  });

  it('karar_app holds exactly the four DML grants and nothing else', async () => {
    const grants = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND table_name = 'transfer_matches' AND grantee = 'karar_app'
          ORDER BY privilege_type`,
      ),
    );
    // DELETE is granted because the declared erasure strategy is
    // CASCADE_DELETE: erasing a transaction or an account must take the
    // matches that name it, or a relationship survives pointing at a movement
    // that no longer exists.
    expect(grants.rows.map((r) => r.privilege_type)).toEqual([
      'DELETE',
      'INSERT',
      'SELECT',
      'UPDATE',
    ]);
  });
});
