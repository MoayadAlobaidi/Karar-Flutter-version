/**
 * The canonical sign convention, tested as a rule rather than as a helper.
 *
 * The claim under test: money leaving the account is negative, money entering
 * it is positive, one convention for every account and every currency, and
 * the source's own debit/credit wording is preserved separately instead of
 * being dissolved into the sign.
 *
 * The properties matter more than the examples, so both are here: worked
 * cases for readability, and a seeded sweep proving the invariants hold
 * across amounts, currencies, and directions.
 */

import { describe, expect, it } from 'vitest';

import { Currency, Money } from '@karar/shared-kernel';

import {
  directionOf,
  signAgreesWithSource,
  signedAmountFor,
  SignConventionError,
  sourceDirectionOf,
  type DirectionMapping,
  type MoneyDirection,
  type SourceDirection,
} from '../domain/sign-convention.js';
import { seededRandom, QAR, KWD } from './fakes/synthetic-fixtures.js';

describe('the convention itself', () => {
  it('signs money out of the account negative', () => {
    expect(signedAmountFor(Money.of(4500n, QAR), 'MONEY_OUT').minorUnits).toBe(-4500n);
  });

  it('signs money into the account positive', () => {
    expect(signedAmountFor(Money.of(4500n, QAR), 'MONEY_IN').minorUnits).toBe(4500n);
  });

  it('applies the same rule to a three-decimal currency', () => {
    // The convention is about direction, not about the exponent: 1.234 KWD
    // out is -1234 minor units, exactly as 12.34 QAR out is -1234.
    expect(signedAmountFor(Money.of(1234n, KWD), 'MONEY_OUT').minorUnits).toBe(-1234n);
    expect(signedAmountFor(Money.of(1234n, QAR), 'MONEY_OUT').minorUnits).toBe(-1234n);
  });

  it('refuses a magnitude that already carries a sign', () => {
    // Contradictory input. Guessing which of the two the caller meant is
    // exactly the silent wrongness the convention exists to remove.
    expect(() => signedAmountFor(Money.of(-4500n, QAR), 'MONEY_IN')).toThrow(SignConventionError);
    expect(() => signedAmountFor(Money.of(-4500n, QAR), 'MONEY_OUT')).toThrow(SignConventionError);
  });

  it('treats zero as neither direction rather than defaulting to one', () => {
    expect(directionOf(Money.zero(QAR))).toBe('ZERO');
    expect(sourceDirectionOf(Money.zero(QAR))).toBe('NOT_STATED');
  });

  it('reads the direction back off a stored amount', () => {
    expect(directionOf(Money.of(-1n, QAR))).toBe('MONEY_OUT');
    expect(directionOf(Money.of(1n, QAR))).toBe('MONEY_IN');
  });
});

describe('a signed total is the net movement, with no second column to forget', () => {
  it('sums a mixed list to the net change in the account', () => {
    // This is the whole argument for one signed column. With magnitude + a
    // type flag, this sum needs a join every consumer must get right.
    const rows = [
      signedAmountFor(Money.of(10_000n, QAR), 'MONEY_IN'),
      signedAmountFor(Money.of(4500n, QAR), 'MONEY_OUT'),
      signedAmountFor(Money.of(2500n, QAR), 'MONEY_OUT'),
    ];
    const net = rows.reduce((total, row) => total.add(row), Money.zero(QAR));
    expect(net.minorUnits).toBe(3000n);
  });
});

describe('the source frame is preserved, not dissolved into the sign', () => {
  const cases: ReadonlyArray<{
    label: string;
    amount: Money;
    sourceDirection: SourceDirection;
    mapping: DirectionMapping;
    agrees: boolean;
  }> = [
    {
      label: 'a retail statement in the account-holder frame: DEBIT means money out',
      amount: Money.of(-4500n, QAR),
      sourceDirection: 'DEBIT',
      mapping: 'SOURCE_DIRECTION_WORD',
      agrees: true,
    },
    {
      label: 'the same wording with the wrong sign is a detectable contradiction',
      amount: Money.of(4500n, QAR),
      sourceDirection: 'DEBIT',
      mapping: 'SOURCE_DIRECTION_WORD',
      agrees: false,
    },
    {
      label: 'a bank-ledger export: the bank DEBITS the liability when money reaches the customer',
      amount: Money.of(4500n, QAR),
      sourceDirection: 'DEBIT',
      mapping: 'SOURCE_SIGNED_AMOUNT_INVERTED',
      agrees: true,
    },
    {
      label: 'an export with no direction word constrains nothing',
      amount: Money.of(-4500n, QAR),
      sourceDirection: 'NOT_STATED',
      mapping: 'SOURCE_SIGNED_AMOUNT',
      agrees: true,
    },
    {
      label: 'a manual entry states direction in the product frame',
      amount: Money.of(-4500n, QAR),
      sourceDirection: 'DEBIT',
      mapping: 'MANUAL_ENTRY',
      agrees: true,
    },
  ];

  for (const testCase of cases) {
    it(testCase.label, () => {
      expect(
        signAgreesWithSource(testCase.amount, testCase.sourceDirection, testCase.mapping),
      ).toBe(testCase.agrees);
    });
  }

  it('distinguishes the two frames for the same source word and the same sign', () => {
    // If the frames were not recorded separately, these two rows would be
    // indistinguishable — and one of them would be wrong by twice the amount.
    const moneyIn = Money.of(4500n, QAR);
    expect(signAgreesWithSource(moneyIn, 'DEBIT', 'SOURCE_DIRECTION_WORD')).toBe(false);
    expect(signAgreesWithSource(moneyIn, 'DEBIT', 'SOURCE_SIGNED_AMOUNT_INVERTED')).toBe(true);
  });
});

describe('properties (seeded sweep, 2000 cases)', () => {
  const DIRECTIONS: readonly MoneyDirection[] = ['MONEY_OUT', 'MONEY_IN'];

  it('holds P1 sign, P2 magnitude preservation, P3 round trip, P4 determinism', () => {
    const random = seededRandom(0x5f3a_11c7);
    const codes = Currency.codes();
    const covered = { out: 0, in: 0, zero: 0 };

    for (let i = 0; i < 2000; i += 1) {
      const currency = Currency.get(codes[Math.floor(random() * codes.length)] as string);
      // Magnitudes spanning small values, the minor-unit boundary, and values
      // past the exact float range. The large multiplier is written as a
      // bigint literal: as a number literal it would lose precision at the
      // very boundary this sweep exists to cross.
      const magnitudeUnits =
        BigInt(Math.floor(random() * 1_000_000)) *
        (Math.floor(random() * 3) === 0 ? 9_007_199_254_740_993n : 1n);
      const magnitude = Money.of(magnitudeUnits, currency);
      const direction = DIRECTIONS[Math.floor(random() * DIRECTIONS.length)] as MoneyDirection;
      const signed = signedAmountFor(magnitude, direction);

      // P1: the sign is decided by the direction, always.
      if (magnitude.isZero()) {
        expect(signed.isZero()).toBe(true);
        covered.zero += 1;
      } else if (direction === 'MONEY_OUT') {
        expect(signed.isNegative()).toBe(true);
        covered.out += 1;
      } else {
        expect(signed.isPositive()).toBe(true);
        covered.in += 1;
      }

      // P2: the magnitude survives unchanged — signing never rescales.
      expect(signed.abs().minorUnits).toBe(magnitude.minorUnits);
      // …and the currency never moves.
      expect(signed.currency.code).toBe(currency.code);

      // P3: direction round-trips through the stored sign for non-zero values.
      if (!magnitude.isZero()) {
        expect(directionOf(signed)).toBe(direction);
        expect(signAgreesWithSource(signed, sourceDirectionOf(signed), 'MANUAL_ENTRY')).toBe(true);
      }

      // P4: the same input always produces the same output.
      expect(signedAmountFor(magnitude, direction).minorUnits).toBe(signed.minorUnits);
    }

    // Non-vacuity: a sweep that only ever generated one direction would pass
    // every assertion above while proving a third of what it claims.
    expect(covered.out).toBeGreaterThan(100);
    expect(covered.in).toBeGreaterThan(100);
  });
});
