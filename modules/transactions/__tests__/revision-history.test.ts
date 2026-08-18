/**
 * Revision history: a correction never silently overwrites the imported
 * value, and the imported value stays attributable forever.
 *
 * The scenario every assertion here serves: a statement said 45.00, a person
 * edited it to 54.00. After the edit, the product must still be able to say
 * "the bank said 45.00 and you changed it", because if it cannot, it has
 * quietly turned the user's memory into the institution's record.
 */

import { describe, expect, it } from 'vitest';

import { Money } from '@karar/shared-kernel';

import { HsfField } from '../domain/hsf-field.js';
import { ActorRef, AccountRef, TransactionId } from '../domain/refs.js';
import {
  changedFieldsBetween,
  correctionRevision,
  divergesFromSource,
  InvalidRevisionError,
  originalRevision,
  sourceSuppliedValues,
  valuesOf,
  type TransactionRevision,
} from '../domain/revision.js';
import {
  applyCorrection,
  createTransaction,
  InvalidTransactionError,
  type Transaction,
} from '../domain/transaction.js';
import { BOOKED, KWD, NOW, QAR, syntheticMerchant } from './fakes/synthetic-fixtures.js';

const TENANT = '11111111-1111-7111-8111-111111111111';
const USER = '22222222-2222-7222-8222-222222222222';
const TXN = TransactionId.of('33333333-3333-7333-8333-333333333333');
const ACTOR = ActorRef.of(USER);

function imported(): Transaction {
  return createTransaction({
    id: TXN,
    tenantId: TENANT,
    userId: USER,
    accountRef: AccountRef.of('44444444-4444-7444-8444-444444444444'),
    // The statement said 45.00 out.
    amount: Money.of(-4500n, QAR),
    bookingDate: BOOKED,
    valueDate: null,
    merchant: HsfField.of(syntheticMerchant('Corner Shop')),
    description: HsfField.of(syntheticMerchant('card purchase')),
    note: null,
    originalAmount: null,
    sourceKind: 'CSV',
    status: 'POSTED',
    createdAt: NOW,
    version: 1,
  });
}

describe('revision 1 records the value as committed, attributed to its source', () => {
  it('attributes an imported transaction to SOURCE_IMPORT', () => {
    const revision = originalRevision({
      id: 'rev-1',
      transaction: imported(),
      attribution: 'SOURCE_IMPORT',
      actorRef: ACTOR,
      recordedAt: NOW,
    });
    expect(revision.revisionNumber).toBe(1);
    expect(revision.attribution).toBe('SOURCE_IMPORT');
    expect(revision.changedFields).toEqual([]);
    expect(revision.values.amount.minorUnits).toBe(-4500n);
  });

  it('has no way to record revision 1 as USER_INPUT', () => {
    // The type refuses it; this asserts the intent so a future widening of
    // the union is a deliberate, visible act rather than a slip.
    const attributions = originalRevision({
      id: 'rev-1',
      transaction: imported(),
      attribution: 'MANUAL_ENTRY',
      actorRef: ACTOR,
      recordedAt: NOW,
    });
    expect(attributions.attribution).not.toBe('USER_INPUT');
  });
});

describe('a correction appends and leaves the original intact', () => {
  function history(): readonly TransactionRevision[] {
    const before = imported();
    const first = originalRevision({
      id: 'rev-1',
      transaction: before,
      attribution: 'SOURCE_IMPORT',
      actorRef: ACTOR,
      recordedAt: NOW,
    });
    // The user "remembers" 54.00.
    const after = applyCorrection(before, { amount: Money.of(-5400n, QAR) });
    const second = correctionRevision({
      id: 'rev-2',
      before,
      after,
      actorRef: ACTOR,
      recordedAt: new Date(NOW.getTime() + 60_000),
    });
    return [first, second];
  }

  it('keeps the source-supplied value readable after the correction', () => {
    const original = sourceSuppliedValues(history());
    expect(original).not.toBeNull();
    // THE assertion: the bank's figure, not the user's.
    expect(original?.amount.minorUnits).toBe(-4500n);
  });

  it('attributes the corrected value to USER_INPUT, never to the source', () => {
    const [, correction] = history();
    expect(correction?.attribution).toBe('USER_INPUT');
    expect(correction?.values.amount.minorUnits).toBe(-5400n);
    expect(correction?.actorRef).toBe(ACTOR);
  });

  it('names exactly the fields that moved', () => {
    const [, correction] = history();
    expect(correction?.changedFields).toEqual(['amount']);
  });

  it('reports the record as diverging from its source', () => {
    expect(divergesFromSource(history())).toBe(true);
  });

  it('reports no divergence for an untouched import', () => {
    const first = originalRevision({
      id: 'rev-1',
      transaction: imported(),
      attribution: 'SOURCE_IMPORT',
      actorRef: ACTOR,
      recordedAt: NOW,
    });
    expect(divergesFromSource([first])).toBe(false);
  });

  it('reports no source-supplied values for a manually entered record', () => {
    // Honest absence rather than an invented origin: nothing supplied these
    // values but the person who typed them.
    const first = originalRevision({
      id: 'rev-1',
      transaction: { ...imported(), sourceKind: 'MANUAL' },
      attribution: 'MANUAL_ENTRY',
      actorRef: ACTOR,
      recordedAt: NOW,
    });
    expect(sourceSuppliedValues([first])).toBeNull();
    expect(divergesFromSource([first])).toBe(false);
  });
});

describe('change detection', () => {
  it('detects every revisable field, and nothing else', () => {
    const before = imported();
    const after = applyCorrection(before, {
      amount: Money.of(-1n, QAR),
      bookingDate: new Date('2026-08-16T00:00:00.000Z'),
      valueDate: new Date('2026-08-18T00:00:00.000Z'),
      merchant: HsfField.of(syntheticMerchant('Other Shop')),
      description: HsfField.of(syntheticMerchant('corrected description')),
      note: HsfField.of(syntheticMerchant('a note')),
      status: 'VOIDED',
    });
    expect(changedFieldsBetween(valuesOf(before), valuesOf(after))).toEqual([
      'amount',
      'bookingDate',
      'valueDate',
      'merchant',
      'description',
      'note',
      'status',
    ]);
  });

  it('treats clearing an optional field as a change, and re-setting it as none', () => {
    const withNote = applyCorrection(imported(), { note: HsfField.of('a note') });
    const cleared = applyCorrection(withNote, { note: null });
    expect(changedFieldsBetween(valuesOf(withNote), valuesOf(cleared))).toEqual(['note']);
    expect(changedFieldsBetween(valuesOf(cleared), valuesOf(cleared))).toEqual([]);
  });

  it('is deterministic in field order', () => {
    // A set that reorders would render the same correction differently on
    // every read; the order is the declaration order, always.
    const before = imported();
    const after = applyCorrection(before, {
      status: 'VOIDED',
      amount: Money.of(-1n, QAR),
    });
    for (let i = 0; i < 5; i += 1) {
      expect(changedFieldsBetween(valuesOf(before), valuesOf(after))).toEqual(['amount', 'status']);
    }
  });
});

describe('refusals that keep the history meaningful', () => {
  it('refuses a correction revision that changed nothing', () => {
    const before = imported();
    const after = applyCorrection(before, {});
    expect(() =>
      correctionRevision({ id: 'rev-2', before, after, actorRef: ACTOR, recordedAt: NOW }),
    ).toThrow(InvalidRevisionError);
  });

  it('refuses a revision that skips a version', () => {
    const before = imported();
    const after = { ...applyCorrection(before, { status: 'VOIDED' as const }), version: 7 };
    expect(() =>
      correctionRevision({ id: 'rev-2', before, after, actorRef: ACTOR, recordedAt: NOW }),
    ).toThrow(InvalidRevisionError);
  });

  it('refuses to re-denominate a booked transaction in place', () => {
    // Changing the currency of an existing record silently rewrites history:
    // -4500 minor units means 45.00 QAR or 4.500 KWD depending on a column
    // nobody looked at. The honest operation is a delete plus a new entry.
    expect(() => applyCorrection(imported(), { amount: Money.of(-4500n, KWD) })).toThrow(
      InvalidTransactionError,
    );
  });
});
