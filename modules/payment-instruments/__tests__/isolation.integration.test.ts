/**
 * ADVERSARIAL ISOLATION for `payment_instruments` against live PostgreSQL
 * (tenancy.md §2 layer 4; ADR-0022).
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
 * (with the wrong GUCs and with none), and the real Prisma repository. There
 * is no authorization layer in front of any of it on purpose: what these
 * tests prove is that RLS ALONE holds the boundary.
 *
 * A leak here is not one row. Which cards a person holds, and which accounts
 * they spend from, is a map of somebody's financial life — and inside one
 * household tenant, the two people whose rows sit in this table are the two
 * most motivated readers of each other's.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';
import { PrincipalContextError } from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { ListOwnPaymentInstruments } from '../application/use-cases/list-own-payment-instruments.js';
import { RecordPaymentInstrument } from '../application/use-cases/record-payment-instrument.js';
import type { InstrumentsPrincipal } from '../application/principal.js';
import { FinancialAccountsBalanceBearingAccountAdapter } from '../infrastructure/adapters/financial-accounts-balance-bearing-account-access.js';
import { PrismaPaymentInstrumentRepository } from '../infrastructure/persistence/prisma-payment-instrument-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { PaymentInstrumentId } from '../domain/refs.js';
import {
  ACTOR_A1,
  ACTOR_A2,
  ACTOR_B1,
  SYNTHETIC_MASK_ONE,
  TENANT_A,
  TENANT_B,
  USER_A1,
  USER_A2,
  USER_B1,
  accountsRepository,
  asApp,
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  seedWallet,
  skipBanner,
  superuserMaintenanceProfile,
  testEncryption,
  testRetention,
} from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'PAYMENT-INSTRUMENTS ISOLATION TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_instrument_rls`;
const clock = new Clock.Fixed(new Date('2026-08-19T12:00:00.000Z'));

/** A1's identity presented with a session claiming tenant B. */
const actorA1inB: InstrumentsPrincipal = { tenantId: TENANT_B, userId: USER_A1 };

let handle: PrismaHandle;
let instruments: PrismaPaymentInstrumentRepository;
let record: RecordPaymentInstrument;
let list: ListOwnPaymentInstruments;

const seeded: Record<string, { instrument: string; account: string }> = {};

async function seedFor(
  actor: InstrumentsPrincipal,
  key: string,
  label: string,
): Promise<void> {
  const account = await seedWallet(handle, actor, `Synthetic Test Account ${label}`, clock);
  const created = await record.execute(
    {
      accountId: account,
      instrumentType: 'VIRTUAL_CARD',
      mask: SYNTHETIC_MASK_ONE,
      displayLabel: `Synthetic Test Instrument ${label}`,
    },
    actor,
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('unreachable');
  seeded[key] = { instrument: created.value.id, account };
}

describe.skipIf(unreachable !== null)('cross-subject and cross-tenant invisibility', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);
    instruments = new PrismaPaymentInstrumentRepository(handle, testEncryption());
    record = new RecordPaymentInstrument(
      instruments,
      new FinancialAccountsBalanceBearingAccountAdapter(accountsRepository(handle)),
      testRetention(),
      new Uuidv7IdSource(),
      clock,
    );
    list = new ListOwnPaymentInstruments(instruments);

    // BOTH sides seeded, through the real write paths. The same mask for all
    // three on purpose: a mask is a four-character fragment, and nothing in
    // the design may let one be used to correlate two subjects.
    await seedFor(ACTOR_A1, 'a1', 'A1');
    await seedFor(ACTOR_A2, 'a2', 'A2');
    await seedFor(ACTOR_B1, 'b1', 'B1');
  }, 180_000);

  afterAll(async () => {
    await handle?.end().catch(() => {});
    await dropDatabase(database);
  });

  it('the legitimate read is non-empty — without which nothing below proves anything', async () => {
    const own = await list.execute({}, ACTOR_A1);
    expect(own.ok).toBe(true);
    if (own.ok) {
      expect(own.value).toHaveLength(1);
      expect(own.value[0]?.mask.reveal()).toBe(SYNTHETIC_MASK_ONE);
    }
  });

  it('one tenant member cannot see another member instruments through the repository', async () => {
    const a1 = await instruments.listOwn(ACTOR_A1);
    const a2 = await instruments.listOwn(ACTOR_A2);
    expect(a1).toHaveLength(1);
    expect(a2).toHaveLength(1);
    expect(a1[0]?.id).not.toBe(a2[0]?.id);

    // And a direct read of the neighbour's row answers nothing.
    expect(
      await instruments.findOwnById(ACTOR_A1, PaymentInstrumentId.of(seeded['a2']!.instrument)),
    ).toBeNull();
    expect(
      await instruments.findOwnById(ACTOR_A2, PaymentInstrumentId.of(seeded['a1']!.instrument)),
    ).toBeNull();
  });

  it('a neighbour account produces an EMPTY instrument list, not their cards', async () => {
    // The account filter is the one path that takes an identifier the caller
    // could have guessed. It must answer nothing rather than another
    // subject's instruments.
    const listed = await list.execute({ accountId: seeded['a2']!.account }, ACTOR_A1);
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value).toHaveLength(0);
  });

  it('a cross-tenant read sees nothing', async () => {
    expect(
      await instruments.findOwnById(ACTOR_B1, PaymentInstrumentId.of(seeded['a1']!.instrument)),
    ).toBeNull();
    expect(
      await instruments.findOwnById(ACTOR_A1, PaymentInstrumentId.of(seeded['b1']!.instrument)),
    ).toBeNull();
    const b1 = await instruments.listOwn(ACTOR_B1);
    expect(b1).toHaveLength(1);
    expect(b1[0]?.id).not.toBe((await instruments.listOwn(ACTOR_A1))[0]?.id);
  });

  it('a valid user id presented under the wrong tenant sees nothing', async () => {
    expect(await instruments.listOwn(actorA1inB)).toHaveLength(0);
    expect(
      await instruments.findOwnById(actorA1inB, PaymentInstrumentId.of(seeded['a1']!.instrument)),
    ).toBeNull();
  });

  it('a raw SELECT as karar_app with the neighbour GUCs returns no rows', async () => {
    const rows = await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) },
      (tx) =>
        tx.query<{ id: string }>(`SELECT id FROM public.payment_instruments WHERE id = $1`, [
          seeded['a1']!.instrument,
        ]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('a raw SELECT as karar_app with NO GUCs returns no rows at all', async () => {
    const rows = await asApp(database, {}, (tx) =>
      tx.query<{ id: string }>(`SELECT id FROM public.payment_instruments`),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('a raw UPDATE as karar_app against a neighbour row affects nothing', async () => {
    await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) },
      (tx) =>
        tx.query(
          `UPDATE public.payment_instruments SET status = 'CANCELLED', version = version + 1 WHERE id = $1`,
          [seeded['a1']!.instrument],
        ),
    );
    const still = await instruments.findOwnById(
      ACTOR_A1,
      PaymentInstrumentId.of(seeded['a1']!.instrument),
    );
    expect(still).not.toBeNull();
    expect(still?.status).toBe('ACTIVE');
  });

  it('a raw DELETE as karar_app against a neighbour row removes nothing', async () => {
    const before = await instruments.listOwn(ACTOR_A1);
    await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(USER_B1) },
      (tx) => tx.query(`DELETE FROM public.payment_instruments WHERE id = $1`, [before[0]!.id]),
    );
    expect(await instruments.listOwn(ACTOR_A1)).toHaveLength(before.length);
  });

  it('an INSERT as karar_app claiming another subject is refused by WITH CHECK', async () => {
    await expect(
      asApp(
        database,
        { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) },
        (tx) =>
          tx.query(
            `INSERT INTO public.payment_instruments
               (id, tenant_id, user_id, account_id, account_reference_type, instrument_type,
                status, hsf_algorithm, hsf_key_version,
                instrument_mask_ciphertext, instrument_mask_nonce, instrument_mask_auth_tag,
                display_label_ciphertext, display_label_nonce, display_label_auth_tag, updated_at)
             VALUES ($1, $2, $3, $4, 'FINANCIAL_ACCOUNT', 'VIRTUAL_CARD', 'ACTIVE',
                     'AES-256-GCM', 'synthetic-v1',
                     decode('30303030','hex'),
                     decode('000000000000000000000000','hex'),
                     decode('00000000000000000000000000000000','hex'),
                     decode('506c616e746564','hex'),
                     decode('000000000000000000000000','hex'),
                     decode('00000000000000000000000000000000','hex'), now())`,
            [
              '0c0c0c0c-0000-4000-8000-0000000000ff',
              TenantId.toString(TENANT_A),
              UserId.toString(USER_A1),
              seeded['a1']!.account,
            ],
          ),
      ),
    ).rejects.toThrow(/row-level security|violates row-level security policy/i);
  });

  it('the repository refuses a partial principal rather than reading widely', async () => {
    await expect(
      instruments.listOwn({ tenantId: TENANT_A } as unknown as InstrumentsPrincipal),
    ).rejects.toBeInstanceOf(PrincipalContextError);
    await expect(
      instruments.listOwn({ userId: USER_A1 } as unknown as InstrumentsPrincipal),
    ).rejects.toBeInstanceOf(PrincipalContextError);
  });

  it('a use case refuses without a principal instead of answering emptily', async () => {
    const listed = await list.execute({}, null as unknown as InstrumentsPrincipal);
    expect(listed.ok).toBe(false);
    if (!listed.ok) expect(listed.error.kind).toBe('missing_principal_context');
  });

  it('a neighbour account cannot receive an instrument, and the refusal is not-found', async () => {
    const created = await record.execute(
      {
        accountId: seeded['a2']!.account,
        instrumentType: 'PHYSICAL_CARD',
        mask: '**22',
        displayLabel: 'Synthetic Test Instrument Intruder',
      },
      ACTOR_A1,
    );
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error.kind).toBe('account_not_found');
  });

  it("a neighbour's ciphertext does not decrypt under this subject's context", async () => {
    // The cryptographic boundary beside the row-level one. Even a reader who
    // somehow saw the bytes could not turn them into a mask: tenant and user
    // are bound as associated data, so the row authenticates only under the
    // subject it belongs to.
    const row = await withRawRow(seeded['a2']!.instrument);
    const encryption = testEncryption();
    await expect(
      encryption.decryptField(
        ACTOR_A1,
        {
          ciphertext: row.ciphertext,
          nonce: row.nonce,
          authTag: row.authTag,
          algorithm: 'AES-256-GCM',
          keyVersion: 'karar-ref:key-version:synthetic-test-instruments@v1',
        },
        {
          table: 'payment_instruments',
          rowId: seeded['a2']!.instrument,
          field: 'instrumentMask',
        },
      ),
    ).rejects.toThrow(/authenticated decryption failed/);
    // And under its own subject it does decrypt, so the assertion above is
    // about the SUBJECT and not about a broken fixture.
    const mask = await encryption.decryptField(
      ACTOR_A2,
      {
        ciphertext: row.ciphertext,
        nonce: row.nonce,
        authTag: row.authTag,
        algorithm: 'AES-256-GCM',
        keyVersion: 'karar-ref:key-version:synthetic-test-instruments@v1',
      },
      { table: 'payment_instruments', rowId: seeded['a2']!.instrument, field: 'instrumentMask' },
    );
    expect(mask.reveal()).toBe(SYNTHETIC_MASK_ONE);
  });
});

/** Reads one row's mask ciphertext as the superuser, bypassing RLS on purpose. */
async function withRawRow(
  id: string,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array; authTag: Uint8Array }> {
  const { withAdapter } = await import('./fixtures.js');
  return withAdapter(database, 'superuser', async (adapter) => {
    const rows = await adapter.query<{
      instrument_mask_ciphertext: Buffer;
      instrument_mask_nonce: Buffer;
      instrument_mask_auth_tag: Buffer;
    }>(
      `SELECT instrument_mask_ciphertext, instrument_mask_nonce, instrument_mask_auth_tag
         FROM public.payment_instruments WHERE id = $1`,
      [id],
    );
    const row = rows.rows[0];
    if (row === undefined) throw new Error('fixture row missing');
    return {
      ciphertext: new Uint8Array(row.instrument_mask_ciphertext),
      nonce: new Uint8Array(row.instrument_mask_nonce),
      authTag: new Uint8Array(row.instrument_mask_auth_tag),
    };
  });
}
