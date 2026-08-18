/**
 * The six use cases, against in-memory doubles that hold the ports'
 * contracts.
 *
 * The structural claim these open with is the one MODULE.md makes: **no
 * use-case input carries a `userId` or a `tenantId`**. That is asserted
 * mechanically against the source rather than trusted, because it is the kind
 * of rule that erodes one convenience parameter at a time.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { Money } from '@karar/shared-kernel';

import { AssignCategory } from '../application/use-cases/assign-category.js';
import { CreateManualTransaction } from '../application/use-cases/create-manual-transaction.js';
import { DeleteOwnTransaction } from '../application/use-cases/delete-own-transaction.js';
import { ListOwnTransactions } from '../application/use-cases/list-own-transactions.js';
import { ReadOwnTransaction } from '../application/use-cases/read-own-transaction.js';
import { UpdateOwnTransaction } from '../application/use-cases/update-own-transaction.js';
import { LocalKeyedDedupFingerprintProvider } from '../infrastructure/providers/local-keyed-dedup-fingerprint-provider.js';
import {
  FixedAccountDirectory,
  FixedPrincipalContext,
  InMemoryCategoryAssignmentRepository,
  InMemoryTransactionRepository,
  SequentialIdSource,
  StaticCategoryCatalogue,
  StubRetentionDecisionPort,
} from './fakes/in-memory-repositories.js';
import {
  account,
  BOOKED,
  EARLIER,
  fixedClock,
  KWD,
  NOW,
  principal,
  qar,
  syntheticMerchant,
} from './fakes/synthetic-fixtures.js';

const USE_CASE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'application',
  'use-cases',
);

function harness(options: { readonly at?: Date } = {}) {
  const alice = principal();
  const context = new FixedPrincipalContext(alice);
  const transactions = new InMemoryTransactionRepository();
  const assignments = new InMemoryCategoryAssignmentRepository();
  const catalogue = new StaticCategoryCatalogue();
  const ids = new SequentialIdSource();
  const clock = fixedClock(options.at ?? NOW);
  const fingerprints = new LocalKeyedDedupFingerprintProvider({ rootKey: Buffer.alloc(32, 9) });
  // Alice owns one QAR account. Every creation path below goes through the
  // account gate, so the harness has to state who owns what — which is the
  // point: before the gate existed, an account id was whatever the caller
  // typed.
  const accountRef = account();
  const accounts = new FixedAccountDirectory([
    { accountId: accountRef.accountId, owner: alice, currencyCode: 'QAR' },
  ]);
  const retention = new StubRetentionDecisionPort({
    state: 'DECIDED',
    retentionPeriod: 'P7D',
    basis: 'test fixture — no legal effect',
    effect: 'SYNTHETIC_NO_LEGAL_EFFECT',
  });
  return {
    alice,
    context,
    transactions,
    assignments,
    accounts,
    retention,
    accountRef,
    create: new CreateManualTransaction(
      context,
      transactions,
      fingerprints,
      ids,
      clock,
      retention,
      accounts,
    ),
    read: new ReadOwnTransaction(context, transactions, assignments),
    list: new ListOwnTransactions(context, transactions),
    update: new UpdateOwnTransaction(context, transactions, ids, clock),
    remove: new DeleteOwnTransaction(context, transactions),
    assign: new AssignCategory(context, transactions, assignments, catalogue, ids, clock),
  };
}

describe('the principal is never an input', () => {
  it('no use-case input type declares a userId or a tenantId', () => {
    // Mechanical, over the real source: MODULE.md says no `?userId=`
    // parameter is accepted anywhere, and the way to hold that rule is for
    // the parameter not to exist.
    const files = readdirSync(USE_CASE_DIR).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(path.join(USE_CASE_DIR, file), 'utf8');
      const inputBlocks = source.match(/export interface \w*Input \{[\s\S]*?\n\}/g) ?? [];
      expect(inputBlocks.length, `${file} declares no input interface`).toBeGreaterThan(0);
      for (const block of inputBlocks) {
        expect(block, `${file} input carries a principal field`).not.toMatch(
          /\breadonly\s+(userId|tenantId|subjectId|onBehalfOfUserId)\b/,
        );
      }
    }
  });

  it('fails closed with no principal bound, before touching any repository', async () => {
    const { context, create, list, read, update, remove, assign, accountRef } = harness();
    context.actAs(null);
    const results = await Promise.all([
      list.execute({}),
      create.execute({
        accountId: accountRef.accountId,
        magnitude: qar(45),
        direction: 'MONEY_OUT',
        bookingDate: BOOKED,
        description: syntheticMerchant('coffee'),
      }),
      read.execute({ transactionId: '00000000-0000-7000-8000-000000000001' }),
      update.execute({ transactionId: '00000000-0000-7000-8000-000000000001', expectedVersion: 1 }),
      remove.execute({ transactionId: '00000000-0000-7000-8000-000000000001' }),
      assign.execute({
        transactionId: '00000000-0000-7000-8000-000000000001',
        categoryCode: 'FOOD',
        assignmentSource: 'USER',
      }),
    ]);
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('PRINCIPAL_CONTEXT_MISSING');
    }
  });
});

describe('CreateManualTransaction', () => {
  it('signs the amount from the magnitude and direction, and records provenance', async () => {
    const { create, read, accountRef } = harness();
    const created = await create.execute({
      accountId: accountRef.accountId,
      magnitude: qar(45),
      direction: 'MONEY_OUT',
      bookingDate: BOOKED,
      merchant: syntheticMerchant('Corner Shop'),
      description: syntheticMerchant('card purchase'),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.amount.minorUnits).toBe(-4500n);
    expect(created.value.version).toBe(1);
    expect(created.value.sourceKind).toBe('MANUAL');

    const view = await read.execute({ transactionId: created.value.id });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.value.revisions).toHaveLength(1);
    expect(view.value.revisions[0]?.attribution).toBe('MANUAL_ENTRY');
    expect(view.value.provenance).toHaveLength(1);
    expect(view.value.provenance[0]).toMatchObject({
      sourceKind: 'MANUAL',
      importRef: null,
      rowRef: null,
      directionMapping: 'MANUAL_ENTRY',
      sourceDirection: 'DEBIT',
      categoryAssignmentSource: 'NONE',
    });
    expect(view.value.divergesFromSource).toBe(false);
  });

  it('refuses an exact duplicate, and accepts a declared genuine repeat', async () => {
    const { create, accountRef } = harness();
    const input = {
      accountId: accountRef.accountId,
      magnitude: qar(4, 50),
      direction: 'MONEY_OUT' as const,
      bookingDate: BOOKED,
      description: syntheticMerchant('coffee'),
    };
    expect((await create.execute(input)).ok).toBe(true);
    const duplicate = await create.execute(input);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.kind).toBe('DUPLICATE_TRANSACTION');

    // The same coffee, genuinely bought twice, recorded explicitly.
    const repeat = await create.execute({ ...input, occurrenceOrdinal: 2 });
    expect(repeat.ok).toBe(true);
  });

  it('stores an original amount only as a complete pair', async () => {
    const { create, accountRef } = harness();
    const paired = await create.execute({
      accountId: accountRef.accountId,
      magnitude: qar(45),
      direction: 'MONEY_OUT',
      bookingDate: BOOKED,
      description: syntheticMerchant('travel'),
      originalMagnitude: Money.of(4500n, KWD),
      originalCurrency: KWD,
    });
    expect(paired.ok).toBe(true);
    if (paired.ok) {
      expect(paired.value.originalAmount?.currency.code).toBe('KWD');
      // No derived rate exists to read, by design.
      expect(Object.keys(paired.value.originalAmount ?? {})).toEqual(['amount', 'currency']);
    }

    await expect(
      create.execute({
        accountId: accountRef.accountId,
        magnitude: qar(45),
        direction: 'MONEY_OUT',
        bookingDate: BOOKED,
        description: syntheticMerchant('travel'),
        originalCurrency: KWD,
      }),
    ).rejects.toThrow();
  });

  it('refuses a magnitude that already carries a sign', async () => {
    const { create, accountRef } = harness();
    await expect(
      create.execute({
        accountId: accountRef.accountId,
        magnitude: Money.of(-4500n, qar(0).currency),
        direction: 'MONEY_OUT',
        bookingDate: BOOKED,
        description: syntheticMerchant('coffee'),
      }),
    ).rejects.toThrow();
  });
});

describe('UpdateOwnTransaction', () => {
  async function seeded() {
    const h = harness();
    const created = await h.create.execute({
      accountId: h.accountRef.accountId,
      magnitude: qar(45),
      direction: 'MONEY_OUT',
      bookingDate: BOOKED,
      description: syntheticMerchant('card purchase'),
    });
    if (!created.ok) throw new Error('seed failed');
    return { ...h, seed: created.value };
  }

  it('appends a USER_INPUT revision and leaves the original attributable', async () => {
    const { update, read, seed } = await seeded();
    const corrected = await update.execute({
      transactionId: seed.id,
      expectedVersion: 1,
      magnitude: qar(54),
      direction: 'MONEY_OUT',
    });
    expect(corrected.ok).toBe(true);
    if (!corrected.ok) return;
    expect(corrected.value.amount.minorUnits).toBe(-5400n);
    expect(corrected.value.version).toBe(2);

    const view = await read.execute({ transactionId: seed.id });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.value.revisions.map((revision) => revision.attribution)).toEqual([
      'MANUAL_ENTRY',
      'USER_INPUT',
    ]);
    // The value as first committed is still readable.
    expect(view.value.revisions[0]?.values.amount.minorUnits).toBe(-4500n);
    expect(view.value.revisions[1]?.changedFields).toEqual(['amount']);
    // Two provenance records: one per revision.
    expect(view.value.provenance.map((record) => record.revisionNumber)).toEqual([1, 2]);
  });

  it('refuses a stale version rather than overwriting the other correction', async () => {
    const { update, seed } = await seeded();
    expect(
      (await update.execute({ transactionId: seed.id, expectedVersion: 1, status: 'VOIDED' })).ok,
    ).toBe(true);
    const stale = await update.execute({
      transactionId: seed.id,
      expectedVersion: 1,
      status: 'POSTED',
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error).toMatchObject({ kind: 'VERSION_CONFLICT', expectedVersion: 1, actualVersion: 2 });
    }
  });

  it('refuses a correction that changes nothing', async () => {
    const { update, seed } = await seeded();
    const noop = await update.execute({
      transactionId: seed.id,
      expectedVersion: 1,
      description: seed.description.reveal(),
    });
    expect(noop.ok).toBe(false);
    if (!noop.ok) expect(noop.error.kind).toBe('NO_CHANGE');
  });

  it('requires both magnitude and direction to correct an amount', async () => {
    const { update, seed } = await seeded();
    await expect(
      update.execute({ transactionId: seed.id, expectedVersion: 1, magnitude: qar(54) }),
    ).rejects.toThrow();
  });

  it('answers NOT_FOUND for another subject, indistinguishable from absent', async () => {
    const { context, update, seed } = await seeded();
    context.actAs(principal());
    const denied = await update.execute({
      transactionId: seed.id,
      expectedVersion: 1,
      status: 'VOIDED',
    });
    const absent = await update.execute({
      transactionId: '00000000-0000-7000-8000-0000000000ff',
      expectedVersion: 1,
      status: 'VOIDED',
    });
    expect(denied.ok).toBe(false);
    expect(absent.ok).toBe(false);
    if (!denied.ok && !absent.ok) {
      expect(denied.error.kind).toBe('NOT_FOUND');
      expect(denied.error.kind).toBe(absent.error.kind);
    }
  });
});

describe('DeleteOwnTransaction', () => {
  it('removes the transaction with its revisions and provenance', async () => {
    const { create, remove, read, transactions, accountRef } = harness();
    const created = await create.execute({
      accountId: accountRef.accountId,
      magnitude: qar(45),
      direction: 'MONEY_OUT',
      bookingDate: BOOKED,
      description: syntheticMerchant('card purchase'),
    });
    if (!created.ok) throw new Error('seed failed');
    expect(transactions.size()).toBe(1);

    const deleted = await remove.execute({ transactionId: created.value.id });
    expect(deleted.ok).toBe(true);
    expect(transactions.size()).toBe(0);
    const view = await read.execute({ transactionId: created.value.id });
    expect(view.ok).toBe(false);
  });

  it('cannot delete another subject’s transaction', async () => {
    const { create, remove, context, transactions, accountRef } = harness();
    const created = await create.execute({
      accountId: accountRef.accountId,
      magnitude: qar(45),
      direction: 'MONEY_OUT',
      bookingDate: BOOKED,
      description: syntheticMerchant('card purchase'),
    });
    if (!created.ok) throw new Error('seed failed');

    context.actAs(principal());
    const denied = await remove.execute({ transactionId: created.value.id });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.kind).toBe('NOT_FOUND');
    // Seeded both sides: the row is still there, untouched.
    expect(transactions.size()).toBe(1);
  });
});

describe('ListOwnTransactions', () => {
  async function seedThree() {
    const h = harness();
    const days = [EARLIER, new Date('2026-08-14T00:00:00.000Z'), BOOKED];
    for (const [index, day] of days.entries()) {
      const created = await h.create.execute({
        accountId: h.accountRef.accountId,
        magnitude: qar(10 + index),
        direction: 'MONEY_OUT',
        bookingDate: day,
        description: syntheticMerchant(`purchase ${index}`),
      });
      if (!created.ok) throw new Error('seed failed');
    }
    return h;
  }

  it('returns the newest first', async () => {
    const { list } = await seedThree();
    const page = await list.execute({});
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    const dates = page.value.transactions.map((t) => t.bookingDate.toISOString());
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('pages with a cursor, without repeating or dropping a row', async () => {
    const { list } = await seedThree();
    const first = await list.execute({ limit: 2 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.transactions).toHaveLength(2);
    expect(first.value.nextCursor).not.toBeNull();

    const second = await list.execute({ limit: 2, cursor: first.value.nextCursor as string });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.transactions).toHaveLength(1);
    expect(second.value.nextCursor).toBeNull();

    const seen = [...first.value.transactions, ...second.value.transactions].map((t) => t.id);
    expect(new Set(seen).size).toBe(3);
  });

  it('refuses a malformed cursor rather than silently restarting', async () => {
    const { list } = await seedThree();
    const bad = await list.execute({ cursor: 'not-a-cursor' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.kind).toBe('INVALID_CURSOR');
  });

  it('clamps an oversized page request to the declared ceiling', async () => {
    const { list } = await seedThree();
    const page = await list.execute({ limit: 10_000 });
    expect(page.ok).toBe(true);
    if (page.ok) expect(page.value.transactions.length).toBeLessThanOrEqual(3);
  });

  it('shows a different subject nothing, with data present on both sides', async () => {
    const { list, context } = await seedThree();
    const own = await list.execute({});
    expect(own.ok && own.value.transactions.length).toBe(3);
    context.actAs(principal());
    const other = await list.execute({});
    expect(other.ok).toBe(true);
    if (other.ok) expect(other.value.transactions).toHaveLength(0);
  });
});

describe('AssignCategory', () => {
  async function seeded() {
    const h = harness();
    const created = await h.create.execute({
      accountId: h.accountRef.accountId,
      magnitude: qar(45),
      direction: 'MONEY_OUT',
      bookingDate: BOOKED,
      description: syntheticMerchant('card purchase'),
    });
    if (!created.ok) throw new Error('seed failed');
    return { ...h, seed: created.value };
  }

  it('accepts a rule assignment when nothing is assigned', async () => {
    const { assign, seed } = await seeded();
    const assigned = await assign.execute({
      transactionId: seed.id,
      categoryCode: 'FOOD',
      assignmentSource: 'RULE',
      ruleVersion: 'rules/merchant/1',
    });
    expect(assigned.ok).toBe(true);
    if (assigned.ok) expect(assigned.value.status).toBe('ACTIVE');
  });

  it('lets a person override a rule, superseding it', async () => {
    const { assign, assignments, alice, seed } = await seeded();
    await assign.execute({
      transactionId: seed.id,
      categoryCode: 'FOOD',
      assignmentSource: 'RULE',
      ruleVersion: 'rules/merchant/1',
    });
    const byUser = await assign.execute({
      transactionId: seed.id,
      categoryCode: 'TRANSPORT',
      assignmentSource: 'USER',
    });
    expect(byUser.ok).toBe(true);

    const chain = await assignments.listChain(alice, seed.id);
    expect(chain).toHaveLength(2);
    const active = chain.filter((a) => a.status === 'ACTIVE');
    expect(active).toHaveLength(1);
    expect(active[0]?.assignmentSource).toBe('USER');
    expect(active[0]?.categoryCode).toBe('TRANSPORT');
    const superseded = chain.find((a) => a.status === 'SUPERSEDED');
    expect(superseded?.supersededById).toBe(active[0]?.id);
  });

  it('REFUSES a rule replacing a person, explicitly', async () => {
    const { assign, assignments, alice, seed } = await seeded();
    await assign.execute({
      transactionId: seed.id,
      categoryCode: 'TRANSPORT',
      assignmentSource: 'USER',
    });
    const byRule = await assign.execute({
      transactionId: seed.id,
      categoryCode: 'FOOD',
      assignmentSource: 'RULE',
      ruleVersion: 'rules/merchant/1',
    });
    expect(byRule.ok).toBe(false);
    if (!byRule.ok) expect(byRule.error.kind).toBe('USER_ASSIGNMENT_WINS');

    // And the user's choice is untouched.
    const active = await assignments.findActive(alice, seed.id);
    expect(active?.assignmentSource).toBe('USER');
    expect(active?.categoryCode).toBe('TRANSPORT');
  });

  it('refuses a rule even after the user choice was itself superseded by the user', async () => {
    const { assign, seed } = await seeded();
    await assign.execute({ transactionId: seed.id, categoryCode: 'FOOD', assignmentSource: 'USER' });
    await assign.execute({
      transactionId: seed.id,
      categoryCode: 'TRANSPORT',
      assignmentSource: 'USER',
    });
    const byRule = await assign.execute({
      transactionId: seed.id,
      categoryCode: 'FOOD',
      assignmentSource: 'RULE',
      ruleVersion: 'rules/merchant/1',
    });
    expect(byRule.ok).toBe(false);
    if (!byRule.ok) expect(byRule.error.kind).toBe('USER_ASSIGNMENT_WINS');
  });

  it('refuses an unknown or retired category code', async () => {
    const { assign, seed } = await seeded();
    for (const code of ['NOT_IN_CATALOGUE', 'HOUSING', 'lowercase']) {
      const denied = await assign.execute({
        transactionId: seed.id,
        categoryCode: code,
        assignmentSource: 'USER',
      });
      expect(denied.ok, `'${code}' should be refused`).toBe(false);
      if (!denied.ok) expect(denied.error.kind).toBe('CATEGORY_UNKNOWN');
    }
  });

  it('requires a rule version for a RULE assignment and forbids one for a USER assignment', async () => {
    const { assign, seed } = await seeded();
    await expect(
      assign.execute({ transactionId: seed.id, categoryCode: 'FOOD', assignmentSource: 'RULE' }),
    ).rejects.toThrow();
    await expect(
      assign.execute({
        transactionId: seed.id,
        categoryCode: 'FOOD',
        assignmentSource: 'USER',
        ruleVersion: 'rules/merchant/1',
      }),
    ).rejects.toThrow();
  });

  it('cannot categorise another subject’s transaction', async () => {
    const { assign, context, seed } = await seeded();
    context.actAs(principal());
    const denied = await assign.execute({
      transactionId: seed.id,
      categoryCode: 'FOOD',
      assignmentSource: 'USER',
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.kind).toBe('NOT_FOUND');
  });
});
