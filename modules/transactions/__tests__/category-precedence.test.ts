/**
 * Category precedence: a person's decision beats a rule, permanently.
 *
 * The failure under test is the one every rules engine eventually produces —
 * a user corrects a category, a re-classification runs, the correction
 * disappears with no trace and no notification, and the user stops trusting
 * every category on every screen.
 *
 * Also asserted here: the vocabulary is exactly two sources, and nothing in
 * the shape can carry a score. `ASSIGNMENT_SOURCES` having a third member
 * would be the entire Phase 6 argument smuggled in as an enum case.
 */

import { describe, expect, it } from 'vitest';

import {
  activeAssignment,
  ASSIGNMENT_SOURCES,
  canSupersede,
  createAssignment,
  hasUserDecision,
  InvalidAssignmentError,
  orderedChain,
  type AssignmentSource,
  type TransactionCategoryAssignment,
} from '../domain/category-assignment.js';
import {
  CategoryCode,
  createFinancialCategory,
  InvalidCategoryError,
  isAssignable,
} from '../domain/category-catalogue.js';
import { ActorRef, TransactionId } from '../domain/refs.js';
import { NOW } from './fakes/synthetic-fixtures.js';

const TENANT = '11111111-1111-7111-8111-111111111111';
const USER = '22222222-2222-7222-8222-222222222222';
const TXN = TransactionId.of('33333333-3333-7333-8333-333333333333');
const ACTOR = ActorRef.of(USER);

function assignment(
  id: string,
  source: AssignmentSource,
  options: {
    code?: string;
    at?: Date;
    status?: 'ACTIVE' | 'SUPERSEDED';
    supersededById?: string | null;
  } = {},
): TransactionCategoryAssignment {
  const status = options.status ?? 'ACTIVE';
  return createAssignment({
    id,
    transactionId: TXN,
    tenantId: TENANT,
    userId: USER,
    categoryCode: CategoryCode.of(options.code ?? 'FOOD'),
    assignmentSource: source,
    ruleVersion: source === 'RULE' ? 'rules/merchant/1' : null,
    assignedBy: ACTOR,
    assignedAt: options.at ?? NOW,
    status,
    supersededById: status === 'SUPERSEDED' ? (options.supersededById ?? 'next') : null,
    supersededAt: status === 'SUPERSEDED' ? (options.at ?? NOW) : null,
  });
}

describe('the precedence rule', () => {
  it('lets a rule assign when nothing is assigned', () => {
    expect(canSupersede(null, 'RULE')).toBe(true);
  });

  it('lets a rule replace another rule', () => {
    expect(canSupersede(assignment('a', 'RULE'), 'RULE')).toBe(true);
  });

  it('REFUSES a rule replacing a person', () => {
    // The assertion the whole module turns on.
    expect(canSupersede(assignment('a', 'USER'), 'RULE')).toBe(false);
  });

  it('lets a person replace a rule', () => {
    expect(canSupersede(assignment('a', 'RULE'), 'USER')).toBe(true);
  });

  it('lets a person replace their own earlier choice', () => {
    expect(canSupersede(assignment('a', 'USER'), 'USER')).toBe(true);
  });

  it('reports a user decision anywhere in the chain, even once superseded', () => {
    // The guarantee is not "the currently active row is the user's" — it is
    // "a person has decided about this transaction". A rule that superseded
    // itself after the user's choice was superseded by a later user choice
    // must still be refused.
    const chain = [
      assignment('a', 'USER', { status: 'SUPERSEDED', supersededById: 'b' }),
      assignment('b', 'USER'),
    ];
    expect(hasUserDecision(chain)).toBe(true);
  });

  it('reports no user decision for a rule-only chain', () => {
    const chain = [
      assignment('a', 'RULE', { status: 'SUPERSEDED', supersededById: 'b' }),
      assignment('b', 'RULE'),
    ];
    expect(hasUserDecision(chain)).toBe(false);
  });
});

describe('the chain', () => {
  it('has exactly one ACTIVE assignment', () => {
    const chain = [
      assignment('a', 'RULE', { status: 'SUPERSEDED', supersededById: 'b' }),
      assignment('b', 'USER'),
    ];
    expect(activeAssignment(chain)?.id).toBe('b');
  });

  it('refuses to answer when two rows claim to be ACTIVE', () => {
    // Two active categories is a state no read can explain; the partial
    // unique index in migration 0093 makes it unreachable, and this makes it
    // loud if it ever is reached.
    expect(() => activeAssignment([assignment('a', 'USER'), assignment('b', 'RULE')])).toThrow(
      InvalidAssignmentError,
    );
  });

  it('reports no active assignment for an empty chain', () => {
    expect(activeAssignment([])).toBeNull();
  });

  it('orders deterministically, breaking clock ties by id', () => {
    const sameInstant = [
      assignment('b', 'RULE', { at: NOW, status: 'SUPERSEDED', supersededById: 'c' }),
      assignment('a', 'RULE', { at: NOW, status: 'SUPERSEDED', supersededById: 'b' }),
      assignment('c', 'USER', { at: NOW }),
    ];
    expect(orderedChain(sameInstant).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('the shape refuses to describe a guess', () => {
  it('declares exactly two assignment sources', () => {
    expect([...ASSIGNMENT_SOURCES]).toEqual(['USER', 'RULE']);
  });

  it('requires a RULE assignment to name its reviewed rule version', () => {
    expect(() =>
      createAssignment({
        ...assignment('a', 'RULE'),
        ruleVersion: null,
      }),
    ).toThrow(InvalidAssignmentError);
  });

  it('refuses a USER assignment carrying a rule version', () => {
    expect(() =>
      createAssignment({
        ...assignment('a', 'USER'),
        ruleVersion: 'rules/merchant/1',
      }),
    ).toThrow(InvalidAssignmentError);
  });

  it('has no score, confidence, or ranking field', () => {
    for (const key of Object.keys(assignment('a', 'RULE'))) {
      expect(key).not.toMatch(/score|confidence|probability|weight|rank/i);
    }
  });

  it('keeps status and supersession instants in step', () => {
    expect(() =>
      createAssignment({ ...assignment('a', 'USER'), status: 'SUPERSEDED' }),
    ).toThrow(InvalidAssignmentError);
  });
});

describe('the catalogue', () => {
  it('requires both an English and an Arabic label', () => {
    expect(() =>
      createFinancialCategory({
        code: 'FOOD',
        labels: { en: 'Food', ar: '' },
        catalogueVersion: 'catalogue/1',
      }),
    ).toThrow(InvalidCategoryError);
    expect(() =>
      createFinancialCategory({
        code: 'FOOD',
        labels: { en: '', ar: 'طعام' },
        catalogueVersion: 'catalogue/1',
      }),
    ).toThrow(InvalidCategoryError);
  });

  it('derives the hierarchy from the code and refuses a disagreeing parent', () => {
    const child = createFinancialCategory({
      code: 'FOOD.GROCERIES',
      parentCode: 'FOOD',
      labels: { en: 'Groceries', ar: 'بقالة' },
      catalogueVersion: 'catalogue/1',
    });
    expect(child.parentCode).toBe('FOOD');
    expect(() =>
      createFinancialCategory({
        code: 'FOOD.GROCERIES',
        parentCode: 'TRANSPORT',
        labels: { en: 'Groceries', ar: 'بقالة' },
        catalogueVersion: 'catalogue/1',
      }),
    ).toThrow(InvalidCategoryError);
  });

  it('rejects codes outside the identifier grammar', () => {
    for (const bad of ['food', 'FOOD-GROCERIES', 'F', 'A.B.C.D', 'طعام', '']) {
      expect(CategoryCode.tryOf(bad), `'${bad}' should be rejected`).toBeNull();
    }
  });

  it('keeps a retired code readable but not newly assignable', () => {
    const retired = createFinancialCategory({
      code: 'HOUSING',
      labels: { en: 'Housing', ar: 'سكن' },
      catalogueVersion: 'catalogue/1',
      retiredAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(isAssignable(retired, NOW)).toBe(false);
    expect(isAssignable(retired, new Date('2025-06-01T00:00:00.000Z'))).toBe(true);
    // The row still resolves — assignments made before retirement stay
    // explainable, which is why retirement is a status and not a deletion.
    expect(retired.labels.ar).toBe('سكن');
  });
});
