/**
 * ============================================================================
 * THE ONLY ARITHMETIC IN THIS MODULE
 * ============================================================================
 *
 * This file holds every numeric operation the module performs, deliberately
 * concentrated in one place so that the claim "nothing here computes a total,
 * a net figure, an insight or a category" is checkable rather than asserted.
 * `__tests__/no-money-arithmetic.test.ts` PINS this file: it asserts that the
 * negation below is the only one in the module, and that no other production
 * file contains an addition, a subtraction, a sum, a reduce or an aggregate
 * over money at all.
 *
 * The pinning style is `modules/financial-accounts/__tests__/
 * balance-kind-not-inferred.test.ts`, which pins its single `reduce` for the
 * same reason: a blanket ban that the code has to violate somewhere is a
 * blanket ban that gets deleted, and a pinned exception is one a reviewer sees.
 *
 * ## What a suggestion actually needs, and nothing more
 *
 * Two transactions are two sides of ONE movement of the person's own money
 * when one is exactly the negative of the other. That is a COMPARISON, not a
 * calculation: no total is produced, no figure is stored, nothing is
 * summed, and the answer is a boolean.
 *
 *   `outflow === -inflow`
 *
 * One unary negation. It could be written `outflow + inflow === 0n`, which
 * would be an addition producing an intermediate figure, and the intermediate
 * figure is exactly the thing this module must never have — the moment a net
 * amount exists as a value, something will want to keep it.
 *
 * ## Why minor units, and why bigint
 *
 * Minor units are integers, so equality is exact. A floating-point comparison
 * of major units would make two movements of the same money differ by
 * 0.0000000001 and a suggestion silently stop appearing. `bigint` because a
 * minor-unit amount has no safe upper bound in `number` and this module must
 * not be the place where one is discovered.
 *
 * **The two amounts are compared ONLY after their currencies are known to
 * match.** Comparing minor units across currencies would treat 100 of one and
 * 100 of another as equal-and-opposite, which is a fabricated exchange rate of
 * exactly 1.0 — the precise error `transfer_matches_same_currency_only` exists
 * to make unwritable. The currency check is a separate, earlier step and this
 * function does not perform it; `checkEqualAndOpposite` in
 * `transfer-match.ts` is where the order is enforced.
 *
 * ## Zero
 *
 * A zero-amount transaction is neither an outflow nor an inflow, so it is
 * never half of a movement. `0n === -0n` is `true`, so without the explicit
 * refusal below two zero-amount corrections would suggest as a transfer —
 * pairing two things that moved no money and telling the person they moved
 * some.
 *
 * ## Purity
 *
 * No clock, no randomness, no I/O (architecture test 11).
 */

/**
 * True when the two signed minor-unit amounts are exactly equal and opposite,
 * with the first leaving and the second arriving.
 *
 * The sign convention is `modules/transactions`': **money leaving the account
 * holder is NEGATIVE, money entering is POSITIVE**. The parameter names carry
 * that convention, and the checks below enforce it rather than trusting it —
 * a caller that passed the two sides the wrong way round gets `false`, not a
 * match with its sides reversed.
 */
export function isEqualAndOpposite(
  outflowMinorUnits: bigint,
  inflowMinorUnits: bigint,
): boolean {
  // Neither side may be zero: a zero movement is not half of a transfer, and
  // `0n === -0n` would otherwise pair two corrections as one.
  if (outflowMinorUnits === 0n || inflowMinorUnits === 0n) return false;
  // The directions must be the ones the names claim. Two outflows are not a
  // transfer between the person's own accounts; they are two payments.
  if (outflowMinorUnits > 0n || inflowMinorUnits < 0n) return false;
  // The whole calculation. One unary negation, no intermediate figure.
  return outflowMinorUnits === -inflowMinorUnits;
}

/**
 * Which of the two amounts is the outflow, or `null` when neither ordering
 * works.
 *
 * Exported so a caller holding two transactions in arbitrary order can ask
 * once instead of trying both and hoping. It performs no arithmetic of its
 * own — it calls the predicate above twice — which is why the pinning test
 * still sees exactly one negation in this module.
 */
export function orientEqualAndOpposite(
  firstMinorUnits: bigint,
  secondMinorUnits: bigint,
): 'FIRST_IS_OUTFLOW' | 'SECOND_IS_OUTFLOW' | null {
  if (isEqualAndOpposite(firstMinorUnits, secondMinorUnits)) return 'FIRST_IS_OUTFLOW';
  if (isEqualAndOpposite(secondMinorUnits, firstMinorUnits)) return 'SECOND_IS_OUTFLOW';
  return null;
}
