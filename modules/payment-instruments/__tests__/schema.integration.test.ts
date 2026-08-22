/**
 * The schema-level rules of `payment_instruments`, against live PostgreSQL.
 *
 * Every assertion here is about what the DATABASE refuses, as `karar_app`
 * with a real principal bound — not what a use case declines to attempt. The
 * distinction is the whole point: a rule that only the application layer
 * holds is a rule an ingestion path, a backfill or a fixture can walk past.
 *
 * Four groups:
 *
 *   1. **MANY instruments, ONE account** — and no constraint that forbids it.
 *      The primary key is the only unique index on the table, asserted as an
 *      exact set rather than by checking that the tempting ones are absent.
 *   2. **The identity is frozen** — including which account an instrument
 *      spends from (SQLSTATE KAR30), which is the rule the module is shaped
 *      around.
 *   3. **The vocabularies are closed** — an unimplemented instrument type or
 *      status does not exist as a row, including for direct SQL.
 *   4. **The ciphertext bounds** — a mask that would be a card number cannot
 *      be written even by a writer that skipped the domain rule.
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
      'PAYMENT-INSTRUMENTS SCHEMA TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_instrument_schema`;
const TENANT = TenantId.toString(TENANT_A);
const USER = UserId.toString(USER_A1);
const WALLET = 'dddddddd-0000-4000-8000-00000000000d';
const OTHER_ACCOUNT = 'eeeeeeee-0000-4000-8000-00000000000e';

/**
 * Raw INSERT as `karar_app`. The ciphertexts are fixed placeholder bytes: this
 * suite is about the SCHEMA, and going through the repository would prove the
 * repository instead. `mask` is four bytes, inside the eight-byte bound.
 */
function insertSql(columns: { mask?: string } = {}): string {
  const mask = columns.mask ?? `decode('30303030','hex')`;
  return `INSERT INTO public.payment_instruments
     (id, tenant_id, user_id, account_id, account_reference_type, instrument_type, status,
      hsf_algorithm, hsf_key_version,
      instrument_mask_ciphertext, instrument_mask_nonce, instrument_mask_auth_tag,
      display_label_ciphertext, display_label_nonce, display_label_auth_tag, updated_at)
   VALUES ($1, $2, $3, $4, 'FINANCIAL_ACCOUNT', $5, $6, 'AES-256-GCM', 'synthetic-v1',
           ${mask},
           decode('000000000000000000000000','hex'),
           decode('00000000000000000000000000000000','hex'),
           decode('506c616365686f6c646572','hex'),
           decode('000000000000000000000000','hex'),
           decode('00000000000000000000000000000000','hex'), now())`;
}

async function insertInstrument(
  id: string,
  accountId: string,
  instrumentType = 'VIRTUAL_CARD',
  status = 'ACTIVE',
): Promise<void> {
  await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
    tx.query(insertSql(), [id, TENANT, USER, accountId, instrumentType, status]),
  );
}

describe.skipIf(unreachable !== null)('payment_instruments schema rules', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
  }, 120_000);

  afterAll(async () => {
    await dropDatabase(database);
  });

  it('the ONLY unique index is the primary key', async () => {
    // Asserted as an exact set. Every uniqueness anybody would reach for here
    // — (account, type), (account, mask), (user, mask) — forbids something a
    // real person actually has, so the absence has to be checked as a whole
    // rather than one candidate at a time.
    const rows = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'payment_instruments'
          ORDER BY indexname`,
      ),
    );
    const unique = rows.rows
      .filter((r) => r.indexdef.includes('UNIQUE'))
      .map((r) => r.indexname);
    expect(unique).toEqual(['payment_instruments_pkey']);
    expect(rows.rows.map((r) => r.indexname)).toEqual([
      'payment_instruments_account_idx',
      'payment_instruments_owner_idx',
      'payment_instruments_pkey',
    ]);
  });

  it('TWO virtual cards on ONE account are two rows, and the database allows it', async () => {
    // The ADR-0028 headline case, at the schema level.
    await insertInstrument('11111111-0000-4000-8000-000000000001', WALLET);
    await insertInstrument('11111111-0000-4000-8000-000000000002', WALLET);
    const rows = await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
      tx.query<{ id: string; account_id: string }>(
        `SELECT id, account_id FROM public.payment_instruments WHERE account_id = $1 ORDER BY id`,
        [WALLET],
      ),
    );
    expect(rows.rows).toHaveLength(2);
    expect(new Set(rows.rows.map((r) => r.account_id)).size).toBe(1);
  });

  it('re-pointing an instrument at another account raises KAR30', async () => {
    // The SQLSTATE, not the message: a message is prose that a later edit
    // rewrites, and a caller distinguishing the arms structurally is the
    // reason the custom code exists at all.
    const raised = await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
      tx
        .query(
          `UPDATE public.payment_instruments SET account_id = $1, version = version + 1 WHERE id = $2`,
          [OTHER_ACCOUNT, '11111111-0000-4000-8000-000000000001'],
        )
        .then(
          () => null,
          (error: unknown) => error,
        ),
    );
    expect((raised as PgError | null)?.sqlState).toBe('KAR30');
  });

  it('changing what KIND of instrument a row is raises KAR30', async () => {
    const raised = await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
      tx
        .query(
          `UPDATE public.payment_instruments SET instrument_type = 'QR_PAYMENT_IDENTITY', version = version + 1 WHERE id = $1`,
          ['11111111-0000-4000-8000-000000000001'],
        )
        .then(
          () => null,
          (error: unknown) => error,
        ),
    );
    expect((raised as PgError | null)?.sqlState).toBe('KAR30');
  });

  it('an update that does not advance the version by exactly one raises KAR31', async () => {
    const raised = await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
      tx
        .query(`UPDATE public.payment_instruments SET status = 'SUSPENDED' WHERE id = $1`, [
          '11111111-0000-4000-8000-000000000001',
        ])
        .then(
          () => null,
          (error: unknown) => error,
        ),
    );
    expect((raised as PgError | null)?.sqlState).toBe('KAR31');
  });

  it('a legitimate edit succeeds and updated_at is advanced by the trigger', async () => {
    const before = await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
      tx.query<{ updated_at: Date; version: number }>(
        `SELECT updated_at, version FROM public.payment_instruments WHERE id = $1`,
        ['11111111-0000-4000-8000-000000000001'],
      ),
    );
    await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
      tx.query(
        `UPDATE public.payment_instruments SET status = 'SUSPENDED', version = version + 1 WHERE id = $1`,
        ['11111111-0000-4000-8000-000000000001'],
      ),
    );
    const after = await asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
      tx.query<{ status: string; updated_at: Date; version: number }>(
        `SELECT status, updated_at, version FROM public.payment_instruments WHERE id = $1`,
        ['11111111-0000-4000-8000-000000000001'],
      ),
    );
    expect(after.rows[0]?.status).toBe('SUSPENDED');
    expect(after.rows[0]?.version).toBe((before.rows[0]?.version ?? 0) + 1);
    expect(after.rows[0]?.updated_at.getTime()).toBeGreaterThanOrEqual(
      before.rows[0]?.updated_at.getTime() ?? 0,
    );
  });

  it('an instrument type outside the closed vocabulary does not exist as a row', async () => {
    await expect(
      insertInstrument('11111111-0000-4000-8000-000000000003', WALLET, 'CRYPTO_WALLET_CARD'),
    ).rejects.toThrow(/payment_instruments_instrument_type_check/);
  });

  it('a status meaning connected does not exist as a row', async () => {
    for (const status of ['CONNECTED', 'PROVISIONED', 'SYNCED', 'AUTHORIZED']) {
      await expect(
        insertInstrument(
          '11111111-0000-4000-8000-000000000004',
          WALLET,
          'VIRTUAL_CARD',
          status,
        ),
      ).rejects.toThrow(/payment_instruments_status_check/);
    }
  });

  it('an account reference type outside the closed set does not exist as a row', async () => {
    await expect(
      asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
        tx.query(
          insertSql().replace(`'FINANCIAL_ACCOUNT'`, `'PAYMENT_INSTRUMENT'`),
          [
            '11111111-0000-4000-8000-000000000005',
            TENANT,
            USER,
            WALLET,
            'VIRTUAL_CARD',
            'ACTIVE',
          ],
        ),
      ),
    ).rejects.toThrow(/payment_instruments_account_reference_type_check/);
  });

  it('a mask ciphertext longer than eight bytes is refused by the database', async () => {
    // Nine bytes. A writer that skipped the domain rule still cannot store
    // anything a card number could fit in.
    await expect(
      asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
        tx.query(insertSql({ mask: `decode('303030303030303030','hex')` }), [
          '11111111-0000-4000-8000-000000000006',
          TENANT,
          USER,
          WALLET,
          'VIRTUAL_CARD',
          'ACTIVE',
        ]),
      ),
    ).rejects.toThrow(/payment_instruments_mask_bound_check/);
  });

  it('a malformed nonce or auth tag is refused', async () => {
    await expect(
      asApp(database, { tenantId: TENANT, userId: USER }, (tx) =>
        tx.query(
          insertSql().replace(
            `decode('000000000000000000000000','hex'),\n           decode('00000000000000000000000000000000','hex'),\n           decode('506c616365686f6c646572','hex')`,
            `decode('0000','hex'),\n           decode('00000000000000000000000000000000','hex'),\n           decode('506c616365686f6c646572','hex')`,
          ),
          [
            '11111111-0000-4000-8000-000000000007',
            TENANT,
            USER,
            WALLET,
            'VIRTUAL_CARD',
            'ACTIVE',
          ],
        ),
      ),
    ).rejects.toThrow(/nonce_check/);
  });

  it('RLS is ENABLEd and FORCEd, with one policy on both principal GUCs', async () => {
    const flags = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'payment_instruments'`,
      ),
    );
    expect(flags.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const policies = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ policyname: string; qual: string; with_check: string }>(
        `SELECT policyname, qual, with_check FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'payment_instruments'`,
      ),
    );
    expect(policies.rows).toHaveLength(1);
    const policy = policies.rows[0];
    for (const clause of [policy?.qual ?? '', policy?.with_check ?? '']) {
      expect(clause).toContain('app.tenant_id');
      expect(clause).toContain('app.user_id');
    }
  });

  it('karar_app holds exactly the four DML grants and nothing else', async () => {
    const grants = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND table_name = 'payment_instruments' AND grantee = 'karar_app'
          ORDER BY privilege_type`,
      ),
    );
    // DELETE is granted because the declared erasure strategy is
    // CASCADE_DELETE and erasing an account must take its instruments.
    expect(grants.rows.map((r) => r.privilege_type)).toEqual([
      'DELETE',
      'INSERT',
      'SELECT',
      'UPDATE',
    ]);
  });
});
