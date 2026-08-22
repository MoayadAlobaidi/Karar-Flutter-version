/**
 * ADVERSARIAL ISOLATION for `transfer_matches` against live PostgreSQL
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
 * **The claim this suite exists to prove is stronger than "one subject cannot
 * read another's rows".** It is that a match may never SPAN two subjects, and
 * that is enforced in three places at once:
 *
 *   1. the row carries ONE `tenant_id` and ONE `user_id`, so two subjects are
 *      not expressible;
 *   2. BOTH sides are resolved through `MatchableTransactionAccessPort` under
 *      the caller's own principal context, so another subject's transaction
 *      resolves as absent — the arm proved by the last two tests here, which
 *      is the one a caller holding a real foreign id would exercise;
 *   3. the RLS policy keys on both GUCs.
 *
 * A leak here is not one row. A confirmed transfer says which of a person's
 * accounts feed which — a map of how their money circulates — and inside one
 * household tenant the two people whose rows sit in this table are the two
 * most motivated readers of each other's.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, Currency, TenantId, UserId } from '@karar/shared-kernel';
import { PrincipalContextError } from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import { ListOwnTransferMatches } from '../application/use-cases/list-own-transfer-matches.js';
import { SuggestTransferMatch } from '../application/use-cases/suggest-transfer-match.js';
import type { MatchingPrincipal } from '../application/principal.js';
import { TransactionsMatchableTransactionAdapter } from '../infrastructure/adapters/transactions-matchable-transaction-access.js';
import { PrismaTransferMatchRepository } from '../infrastructure/persistence/prisma-transfer-match-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { TransferMatchId } from '../domain/refs.js';
import {
  ACTOR_A1,
  ACTOR_A2,
  ACTOR_B1,
  TENANT_A,
  TENANT_B,
  USER_A1,
  USER_A2,
  USER_B1,
  EVERY_MATCH_PAGE,
  asApp,
  buildHandle,
  dropDatabase,
  expectEveryVisibleMatch,
  money,
  probePostgres,
  provisionDatabase,
  seedAccount,
  seedTransaction,
  skipBanner,
  superuserMaintenanceProfile,
  testRetention,
  transactionSeeder,
  type SeededAccount,
  type TransactionSeeder,
} from './fixtures.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'TRANSFER-MATCHING ISOLATION TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_match_rls`;
const clock = new Clock.Fixed(new Date('2026-08-19T12:00:00.000Z'));
const QAR = Currency.get('QAR');

/** A1's identity presented with a session claiming tenant B. */
const actorA1inB: MatchingPrincipal = { tenantId: TENANT_B, userId: USER_A1 };

let handle: PrismaHandle;
let matches: PrismaTransferMatchRepository;
let suggest: SuggestTransferMatch;
let list: ListOwnTransferMatches;
let seeder: TransactionSeeder;

const seeded: Record<
  string,
  { matchId: string; outflowTransactionId: string; inflowTransactionId: string }
> = {};

describe.skipIf(unreachable !== null)('cross-subject and cross-tenant invisibility', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);

    // Two accounts per principal — a transfer needs two — created through the
    // accounts module's own use case, so the ids are real rows.
    const accounts: SeededAccount[] = [];
    const owned: Record<string, [string, string]> = {};
    for (const [key, actor] of [
      ['a1', ACTOR_A1],
      ['a2', ACTOR_A2],
      ['b1', ACTOR_B1],
    ] as const) {
      const from = await seedAccount(
        handle,
        actor,
        `Synthetic Test Account ${key.toUpperCase()} Source`,
        clock,
      );
      const to = await seedAccount(
        handle,
        actor,
        `Synthetic Test Account ${key.toUpperCase()} Destination`,
        clock,
      );
      owned[key] = [from, to];
      accounts.push(
        { accountId: from, owner: actor, currencyCode: 'QAR' },
        { accountId: to, owner: actor, currencyCode: 'QAR' },
      );
    }

    seeder = transactionSeeder(handle, accounts, clock);
    matches = new PrismaTransferMatchRepository(handle);
    suggest = new SuggestTransferMatch(
      matches,
      new TransactionsMatchableTransactionAdapter(seeder.repository),
      testRetention(),
      new Uuidv7IdSource(),
      clock,
    );
    list = new ListOwnTransferMatches(matches);

    // BOTH sides seeded, through the real write paths. The same amount for
    // all three on purpose: nothing in the design may let a figure be used to
    // correlate two subjects.
    for (const [key, actor] of [
      ['a1', ACTOR_A1],
      ['a2', ACTOR_A2],
      ['b1', ACTOR_B1],
    ] as const) {
      const [from, to] = owned[key] as [string, string];
      const outflowTransactionId = await seedTransaction(seeder, actor, {
        accountId: from,
        magnitude: money(100, QAR),
        direction: 'MONEY_OUT',
        description: `Synthetic Test Transfer Out ${key.toUpperCase()}`,
      });
      const inflowTransactionId = await seedTransaction(seeder, actor, {
        accountId: to,
        magnitude: money(100, QAR),
        direction: 'MONEY_IN',
        description: `Synthetic Test Transfer In ${key.toUpperCase()}`,
      });
      const suggested = await suggest.execute(
        { firstTransactionId: outflowTransactionId, secondTransactionId: inflowTransactionId },
        actor,
      );
      expect(suggested.ok).toBe(true);
      if (!suggested.ok) throw new Error(JSON.stringify(suggested.error));
      seeded[key] = {
        matchId: suggested.value.id,
        outflowTransactionId,
        inflowTransactionId,
      };
    }
  }, 180_000);

  afterAll(async () => {
    await handle?.end().catch(() => {});
    await dropDatabase(database);
  });

  it('the legitimate read is non-empty — without which nothing below proves anything', async () => {
    const own = await list.execute(EVERY_MATCH_PAGE, ACTOR_A1);
    expect(own.ok).toBe(true);
    if (own.ok) {
      expect(own.value.matches).toHaveLength(1);
      expect(own.value.matches[0]?.state).toBe('SUGGESTED');
    }
  });

  it('one tenant member cannot see another member matches through the repository', async () => {
    const a1 = await expectEveryVisibleMatch(matches, ACTOR_A1);
    const a2 = await expectEveryVisibleMatch(matches, ACTOR_A2);
    expect(a1).toHaveLength(1);
    expect(a2).toHaveLength(1);
    expect(a1[0]?.id).not.toBe(a2[0]?.id);

    expect(await matches.findOwnById(ACTOR_A1, TransferMatchId.of(seeded['a2']!.matchId))).toBeNull();
    expect(await matches.findOwnById(ACTOR_A2, TransferMatchId.of(seeded['a1']!.matchId))).toBeNull();
  });

  it('a cross-tenant read sees nothing', async () => {
    expect(await matches.findOwnById(ACTOR_B1, TransferMatchId.of(seeded['a1']!.matchId))).toBeNull();
    expect(await matches.findOwnById(ACTOR_A1, TransferMatchId.of(seeded['b1']!.matchId))).toBeNull();
    const b1 = await expectEveryVisibleMatch(matches, ACTOR_B1);
    expect(b1).toHaveLength(1);
    expect(b1[0]?.id).not.toBe((await expectEveryVisibleMatch(matches, ACTOR_A1))[0]?.id);
  });

  it('a valid user id presented under the wrong tenant sees nothing', async () => {
    expect(await expectEveryVisibleMatch(matches, actorA1inB)).toHaveLength(0);
    expect(
      await matches.findOwnById(actorA1inB, TransferMatchId.of(seeded['a1']!.matchId)),
    ).toBeNull();
  });

  it("a neighbour's transaction produces an EMPTY match list, not their transfers", async () => {
    // The lookup that takes an identifier a caller could have guessed.
    const found = await matches.findOwnForTransaction(ACTOR_A1, {
      referenceType: 'TRANSACTION',
      transactionId: seeded['a2']!.outflowTransactionId,
    });
    expect(found).toHaveLength(0);
  });

  it('a raw SELECT as karar_app with the neighbour GUCs returns no rows', async () => {
    const rows = await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) },
      (tx) =>
        tx.query<{ id: string }>(`SELECT id FROM public.transfer_matches WHERE id = $1`, [
          seeded['a1']!.matchId,
        ]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('a raw SELECT as karar_app with NO GUCs returns no rows at all', async () => {
    const rows = await asApp(database, {}, (tx) =>
      tx.query<{ id: string }>(`SELECT id FROM public.transfer_matches`),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('a raw UPDATE as karar_app against a neighbour row affects nothing', async () => {
    // The most damaging cross-subject write available: confirming somebody
    // else's suggestion on their behalf.
    await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) },
      (tx) =>
        tx.query(
          `UPDATE public.transfer_matches
              SET match_state = 'CONFIRMED', subject_decided_at = now(), version = version + 1
            WHERE id = $1`,
          [seeded['a1']!.matchId],
        ),
    );
    const still = await matches.findOwnById(ACTOR_A1, TransferMatchId.of(seeded['a1']!.matchId));
    expect(still).not.toBeNull();
    expect(still?.state).toBe('SUGGESTED');
    expect(still?.subjectDecidedAt).toBeNull();
  });

  it('a raw DELETE as karar_app against a neighbour row removes nothing', async () => {
    const before = await expectEveryVisibleMatch(matches, ACTOR_A1);
    await asApp(
      database,
      { tenantId: TenantId.toString(TENANT_B), userId: UserId.toString(USER_B1) },
      (tx) => tx.query(`DELETE FROM public.transfer_matches WHERE id = $1`, [before[0]!.id]),
    );
    expect(await expectEveryVisibleMatch(matches, ACTOR_A1)).toHaveLength(before.length);
  });

  it('an INSERT as karar_app claiming another subject is refused by WITH CHECK', async () => {
    await expect(
      asApp(
        database,
        { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A2) },
        (tx) =>
          tx.query(
            `INSERT INTO public.transfer_matches
               (id, tenant_id, user_id,
                outflow_transaction_id, outflow_transaction_reference_type, outflow_account_id, outflow_currency_code,
                inflow_transaction_id, inflow_transaction_reference_type, inflow_account_id, inflow_currency_code,
                match_state, suggestion_basis, suggestion_window, first_suggested_at, updated_at)
             VALUES ($1, $2, $3,
                     'd0000000-0000-4000-8000-0000000000aa', 'TRANSACTION', 'a0000000-0000-4000-8000-0000000000aa', 'QAR',
                     'e0000000-0000-4000-8000-0000000000aa', 'TRANSACTION', 'b0000000-0000-4000-8000-0000000000aa', 'QAR',
                     'SUGGESTED', 'EQUAL_AND_OPPOSITE_SAME_CURRENCY_WITHIN_WINDOW',
                     'equal-and-opposite/same-currency/P3D/v1', now(), now())`,
            [
              '0c0c0c0c-0000-4000-8000-0000000000ff',
              TenantId.toString(TENANT_A),
              UserId.toString(USER_A1),
            ],
          ),
      ),
    ).rejects.toThrow(/row-level security|violates row-level security policy/i);
  });

  it('the repository refuses a partial principal rather than reading widely', async () => {
    await expect(
      matches.pageOwn({ tenantId: TENANT_A } as unknown as MatchingPrincipal, {
        state: null,
        ...EVERY_MATCH_PAGE,
      }),
    ).rejects.toBeInstanceOf(PrincipalContextError);
    await expect(
      matches.pageOwn({ userId: USER_A1 } as unknown as MatchingPrincipal, {
        state: null,
        ...EVERY_MATCH_PAGE,
      }),
    ).rejects.toBeInstanceOf(PrincipalContextError);
  });

  it('a use case refuses without a principal instead of answering emptily', async () => {
    const listed = await list.execute(
      EVERY_MATCH_PAGE,
      null as unknown as MatchingPrincipal,
    );
    expect(listed.ok).toBe(false);
    if (!listed.ok) expect(listed.error.kind).toBe('missing_principal_context');
  });

  it('A MATCH CANNOT SPAN TWO SUBJECTS — one side belonging to a neighbour', async () => {
    // The arm the row-level policy alone would NOT catch, because the row
    // being written carries the CALLER's subject. What refuses it is that the
    // neighbour's transaction does not resolve under this principal.
    const attempted = await suggest.execute(
      {
        firstTransactionId: seeded['a1']!.outflowTransactionId,
        secondTransactionId: seeded['a2']!.inflowTransactionId,
      },
      ACTOR_A1,
    );
    expect(attempted.ok).toBe(false);
    if (!attempted.ok) {
      expect(attempted.error.kind).toBe('transaction_not_found');
      if (attempted.error.kind === 'transaction_not_found') {
        expect(attempted.error.side).toBe('SECOND');
      }
    }
  });

  it('A MATCH CANNOT SPAN TWO TENANTS either', async () => {
    const attempted = await suggest.execute(
      {
        firstTransactionId: seeded['a1']!.outflowTransactionId,
        secondTransactionId: seeded['b1']!.inflowTransactionId,
      },
      ACTOR_A1,
    );
    expect(attempted.ok).toBe(false);
    if (!attempted.ok) expect(attempted.error.kind).toBe('transaction_not_found');
    // And the refusal is the same one an id nobody minted produces, so a
    // caller learns nothing from the difference.
    const invented = await suggest.execute(
      {
        firstTransactionId: seeded['a1']!.outflowTransactionId,
        secondTransactionId: '0f0f0f0f-0000-4000-8000-00000000000f',
      },
      ACTOR_A1,
    );
    expect(invented.ok).toBe(false);
    if (!invented.ok && !attempted.ok) {
      expect(invented.error.kind).toBe(attempted.error.kind);
      expect(invented.error.message).toBe(attempted.error.message);
    }
  });
});
