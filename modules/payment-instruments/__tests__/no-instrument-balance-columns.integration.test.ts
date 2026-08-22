/**
 * THERE IS NO BALANCE COLUMN, AND NO PAYMENT CREDENTIAL COLUMN — proved
 * against the live schema.
 *
 * A `CHECK` constraint cannot assert the absence of a column, so this suite
 * is the guarantee. It works four ways, and each covers a hole the others
 * leave:
 *
 *   1. **An EXHAUSTIVE column list.** Every column of the table is named
 *      below. Any column added fails this test until someone changes the list
 *      deliberately — money-shaped or not. A test that only looked for
 *      forbidden NAMES would pass on `head_room`, `float_minor`, or a `jsonb`
 *      column called `attributes`, and each of those is where a second
 *      balance ends up.
 *   2. **A forbidden-name scan**, so a column that arrived with the list
 *      updated in the same commit still has to get past a reviewer reading a
 *      deletion of this assertion.
 *   3. **A TYPE scan.** No `numeric`, `money`, `double precision`, `real` or
 *      `bigint` column exists at all, and the only `integer` is `version`. A
 *      balance would have to be one of those types, or a string — and a
 *      string balance is caught by (1) and (2).
 *   4. **The mask bound.** `instrument_mask_ciphertext` is bounded at EIGHT
 *      bytes, which under a length-preserving cipher is eight characters. No
 *      PAN fits. Asserted against the live constraint, not against the
 *      migration text, because what protects the data is the constraint the
 *      database actually installed.
 *
 * The fifth assertion is the quiet one: **no `json`, `jsonb`, `hstore`, `xml`
 * or array column exists**, because a free-form column is a balance store —
 * and a credential store — with better manners.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
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
      'PAYMENT-INSTRUMENTS COLUMN-SET TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_instrument_columns`;

/**
 * Migration 0098, exhaustively.
 *
 * **Read this list as the guarantee.** Adding `balance_minor` here is the
 * deliberate act the design requires somebody to perform in a reviewed diff,
 * next to a comment in the migration saying it must never exist — which is
 * exactly the friction the absence is worth.
 */
const INSTRUMENT_COLUMNS = [
  'account_id',
  'account_reference_type',
  'created_at',
  'display_label_auth_tag',
  'display_label_ciphertext',
  'display_label_nonce',
  'hsf_algorithm',
  'hsf_key_version',
  'id',
  'instrument_mask_auth_tag',
  'instrument_mask_ciphertext',
  'instrument_mask_nonce',
  'instrument_type',
  'status',
  'tenant_id',
  'updated_at',
  'user_id',
  'version',
];

/**
 * The vocabulary of a stored figure, in every spelling a well-meaning
 * engineer reaches for. Matched as a substring against the column name.
 */
const MONEY_WORDS = [
  'balance',
  'amount',
  'minor',
  'major',
  'limit',
  'available',
  'headroom',
  'head_room',
  'currency',
  'total',
  'net_',
  '_net',
  'sum',
  'spent',
  'spend',
  'remaining',
  'float',
  'ledger',
  'funds',
  'credit_',
  'value',
];

/**
 * The vocabulary of a payment credential. A tokenized card is an instrument
 * TYPE — the fact that a token exists in the world — and never a stored
 * token.
 */
const CREDENTIAL_WORDS = [
  'pan',
  'cvv',
  'cvc',
  'csc',
  'expiry',
  'expires',
  'exp_month',
  'exp_year',
  'track',
  'magstripe',
  'chip',
  'token',
  'cryptogram',
  'dpan',
  'provision',
  'secret',
  'credential',
  'password',
  'pin_',
  '_pin',
  'otp',
  'key_material',
];

async function columnsOf(
  table: string,
): Promise<Array<{ name: string; type: string; nullable: string }>> {
  return withAdapter(database, 'superuser', async (adapter) => {
    const rows = await adapter.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY column_name`,
      [table],
    );
    return rows.rows.map((row) => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable,
    }));
  });
}

describe.skipIf(unreachable !== null)('no instrument balance column exists', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
  }, 120_000);

  afterAll(async () => {
    await dropDatabase(database);
  });

  it('payment_instruments has EXACTLY the declared columns and no others', async () => {
    const found = (await columnsOf('payment_instruments')).map((column) => column.name);
    expect(found).toEqual(INSTRUMENT_COLUMNS);
  });

  it('no column is named for a balance, an amount, a limit or a denomination', async () => {
    for (const column of await columnsOf('payment_instruments')) {
      for (const word of MONEY_WORDS) {
        expect(
          column.name.includes(word),
          `payment_instruments.${column.name} matches the money vocabulary ('${word}') — two ` +
            'virtual cards on one wallet must not read as two more balances (ADR-0028)',
        ).toBe(false);
      }
    }
  });

  it('no column is named for a PAN, a CVV, an expiry or a token', async () => {
    for (const column of await columnsOf('payment_instruments')) {
      for (const word of CREDENTIAL_WORDS) {
        expect(
          column.name.includes(word),
          `payment_instruments.${column.name} matches the payment-credential vocabulary ('${word}')`,
        ).toBe(false);
      }
    }
  });

  it('has no numeric, money or floating-point column, and one integer only', async () => {
    // A balance would have to be one of these types. `version` is the single
    // integer and it counts writes.
    const found = await columnsOf('payment_instruments');
    for (const column of found) {
      expect(
        ['numeric', 'money', 'double precision', 'real', 'bigint', 'smallint'].includes(
          column.type,
        ),
        `payment_instruments.${column.name} is ${column.type} — no figure is stored on an instrument`,
      ).toBe(false);
    }
    const integers = found.filter((column) => column.type === 'integer').map((c) => c.name);
    expect(integers).toEqual(['version']);
  });

  it('has no json, jsonb, hstore, xml or array column to hide one in', async () => {
    for (const column of await columnsOf('payment_instruments')) {
      expect(
        ['json', 'jsonb', 'ARRAY', 'xml', 'USER-DEFINED'].includes(column.type),
        `payment_instruments.${column.name} is ${column.type} — a free-form column is a balance ` +
          'store, and a credential store, with better manners',
      ).toBe(false);
    }
  });

  it('has no plaintext column beside either encrypted field', async () => {
    const names = (await columnsOf('payment_instruments')).map((c) => c.name);
    expect(names).not.toContain('instrument_mask');
    expect(names).not.toContain('display_label');
    // And the encrypted triple is complete on both — a ciphertext with no auth
    // tag is unverifiable, which is its own kind of missing column.
    for (const suffix of ['ciphertext', 'nonce', 'auth_tag']) {
      expect(names).toContain(`instrument_mask_${suffix}`);
      expect(names).toContain(`display_label_${suffix}`);
    }
  });

  it('the mask ciphertext is bounded at EIGHT bytes by the LIVE constraint', async () => {
    // Not by the migration text: what protects the data is the constraint the
    // database actually installed. Eight bytes under a length-preserving
    // cipher is eight characters, and no card number fits in eight characters.
    const rows = await withAdapter(database, 'superuser', (adapter) =>
      adapter.query<{ conname: string; definition: string }>(
        `SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'payment_instruments' AND c.contype = 'c'
          ORDER BY c.conname`,
      ),
    );
    const bound = rows.rows.find((r) => r.conname === 'payment_instruments_mask_bound_check');
    expect(bound?.definition).toContain('octet_length(instrument_mask_ciphertext) <= 8');
  });

  it('the account reference is singular: one account column and one kind column', async () => {
    // "Exactly ONE balance-bearing financial account" as a schema property.
    // A second account column is how "one account" quietly becomes "a
    // funding chain".
    const names = (await columnsOf('payment_instruments')).map((c) => c.name);
    const accountColumns = names.filter((name) => name.includes('account'));
    expect(accountColumns).toEqual(['account_id', 'account_reference_type']);
    const notNull = (await columnsOf('payment_instruments')).find(
      (c) => c.name === 'account_id',
    );
    expect(notNull?.nullable).toBe('NO');
    // And no column points at another instrument, which is the other way a
    // funding chain arrives.
    expect(names.filter((name) => name.includes('instrument_id'))).toEqual([]);
    expect(names).not.toContain('parent_instrument_id');
    expect(names).not.toContain('funding_instrument_id');
  });
});
