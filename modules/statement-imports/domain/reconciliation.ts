/**
 * Reconciliation — comparing what the source SAID its balance was against
 * what the source's own rows add up to.
 *
 * ## The one thing this must never do
 *
 * **It must never fabricate a source-reported balance by summing the
 * transactions.** That is the tempting implementation and it is worthless:
 * summing the rows and then comparing the sum to itself always matches, so
 * the product reports a reconciled statement for every file including the
 * ones it read wrongly. A control that cannot fail is not a control; it is a
 * green light with no wiring behind it.
 *
 * So both ends of every comparison here are figures the FILE stated. When the
 * file states none, the answer is `NOT_AVAILABLE` — a real and common answer
 * that does not block a commit, because a statement that carries no balance
 * column is not a defective statement.
 *
 * ## What is actually compared
 *
 * A net movement is not a balance. `Σ(amounts)` says how much the account
 * changed, and comparing that to a stated closing balance is comparing two
 * different kinds of number. A comparison is therefore only possible when the
 * file gives a second anchor:
 *
 * - **Running balances on the rows.** Each line states the balance after it.
 *   Continuity is then checkable line by line — `running[i] - running[i-1]`
 *   must equal `amount[i]` exactly — which is what catches a dropped line, a
 *   mis-read decimal separator, or a sign read in the wrong frame. The last
 *   running balance must then equal the file's stated closing balance.
 * - **A stated OPENING balance.** It anchors the first line, so the same
 *   continuity walk starts one step earlier.
 *
 * With neither, `NOT_AVAILABLE` is the truthful verdict and the import
 * proceeds to review with reconciliation unstated rather than fabricated.
 *
 * ## Exact, same currency, no tolerance
 *
 * Comparison is `Money.equals` over exact minor units. There is no epsilon,
 * no rounding allowance and no "within one minor unit" — a tolerance is a
 * decision that some wrongness is acceptable, taken on behalf of somebody
 * whose money it is. Two figures in different currencies are not compared at
 * all: converting one would require a rate this platform did not observe, so
 * the verdict is `NOT_AVAILABLE` with the reason stated.
 *
 * **A `MISMATCHED` verdict blocks the commit.** Not a warning, not a badge:
 * the file says the account ended at one figure and its own lines say it
 * ended at another, so at least one of the two is being read wrongly, and
 * committing either way writes records that are wrong in a way nobody can see
 * afterwards.
 *
 * Pure: no clock, no randomness, no I/O.
 */

import { Money } from '@karar/shared-kernel';
import type { Currency } from '@karar/shared-kernel';

import type { SourceBalanceKind, StatementBalanceKind } from './column-mapping.js';

export const RECONCILIATION_STATUSES = ['NOT_AVAILABLE', 'MATCHED', 'MISMATCHED'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

/** Why no comparison was possible. Never a substitute for a figure. */
export const RECONCILIATION_UNAVAILABLE_REASONS = [
  /** The file stated no balance at all. The ordinary case. */
  'SOURCE_STATED_NO_BALANCE',
  /** A closing figure with nothing to walk from: no opening, no running balances. */
  'NO_ANCHOR_TO_COMPARE_AGAINST',
  /** The stated balance is in a different currency, and nothing here converts. */
  'SOURCE_BALANCE_CURRENCY_DIFFERS',
  /** Some rows state a running balance and some do not; a partial walk proves nothing. */
  'RUNNING_BALANCES_INCOMPLETE',
  /** Nothing valid was parsed, so there is nothing to reconcile. */
  'NO_VALID_ROWS',
] as const;
export type ReconciliationUnavailableReason =
  (typeof RECONCILIATION_UNAVAILABLE_REASONS)[number];

/** The balance the FILE stated for the statement as a whole. */
export interface StatedStatementBalance {
  readonly minorUnits: bigint;
  readonly kind: StatementBalanceKind;
  readonly currencyCode: string;
}

/** What one line contributes to the walk. */
export interface ReconcilableRow {
  readonly rowNumber: number;
  readonly amountMinorUnits: bigint;
  readonly currencyCode: string;
  readonly sourceBalanceMinorUnits: bigint | null;
  readonly sourceBalanceKind: SourceBalanceKind | null;
}

export type ReconciliationOutcome =
  | {
      readonly status: 'NOT_AVAILABLE';
      readonly reason: ReconciliationUnavailableReason;
    }
  | { readonly status: 'MATCHED' }
  | {
      readonly status: 'MISMATCHED';
      /**
       * The first line whose stated running balance does not follow from the
       * previous one, or `null` when the divergence is the file total rather
       * than a line. A line number is safe; the figures are not reported.
       */
      readonly firstDivergentRowNumber: number | null;
    };

/**
 * Reconciles one import.
 *
 * `rows` must be the VALID rows in file order. Invalid rows are excluded by
 * the caller and their exclusion is itself a reason the walk can fail — a
 * statement with an unreadable line has a gap in it, and the continuity check
 * will say so rather than skipping over it.
 */
export function reconcile(input: {
  readonly stated: StatedStatementBalance | null;
  readonly rows: readonly ReconcilableRow[];
  readonly currency: Currency;
}): ReconciliationOutcome {
  const { stated, rows, currency } = input;

  if (stated === null) {
    return { status: 'NOT_AVAILABLE', reason: 'SOURCE_STATED_NO_BALANCE' };
  }
  if (stated.currencyCode !== currency.code) {
    return { status: 'NOT_AVAILABLE', reason: 'SOURCE_BALANCE_CURRENCY_DIFFERS' };
  }
  if (rows.length === 0) {
    return { status: 'NOT_AVAILABLE', reason: 'NO_VALID_ROWS' };
  }
  for (const row of rows) {
    if (row.currencyCode !== currency.code) {
      return { status: 'NOT_AVAILABLE', reason: 'SOURCE_BALANCE_CURRENCY_DIFFERS' };
    }
  }

  const withBalance = rows.filter((row) => row.sourceBalanceMinorUnits !== null);
  const hasRunningBalances = withBalance.length > 0;
  if (hasRunningBalances && withBalance.length !== rows.length) {
    // Half a walk is not a weaker check; it is a check over a different set of
    // rows than the one being committed, and reporting it as MATCHED would
    // vouch for lines nobody compared.
    return { status: 'NOT_AVAILABLE', reason: 'RUNNING_BALANCES_INCOMPLETE' };
  }

  const openingStated = stated.kind === 'OPENING' ? Money.of(stated.minorUnits, currency) : null;

  if (!hasRunningBalances) {
    if (openingStated === null) {
      // A closing figure and a pile of movements. Σ(amounts) is a net
      // movement, not a balance; comparing the two would be comparing two
      // different kinds of number and calling the result a control.
      return { status: 'NOT_AVAILABLE', reason: 'NO_ANCHOR_TO_COMPARE_AGAINST' };
    }
    // An opening figure and nothing to close against: the same gap, from the
    // other end.
    return { status: 'NOT_AVAILABLE', reason: 'NO_ANCHOR_TO_COMPARE_AGAINST' };
  }

  // The continuity walk. Exact Money throughout: `add` refuses a currency
  // mismatch by construction, so "same currency" is enforced rather than
  // asserted, and there is no epsilon anywhere.
  let previous: Money | null = openingStated;
  let last: Money | null = null;
  for (const row of rows) {
    const running = Money.of(row.sourceBalanceMinorUnits ?? 0n, currency);
    if (previous !== null) {
      const expected = previous.add(Money.of(row.amountMinorUnits, currency));
      if (!expected.equals(running)) {
        return { status: 'MISMATCHED', firstDivergentRowNumber: row.rowNumber };
      }
    }
    previous = running;
    last = running;
  }

  if (stated.kind === 'OPENING') {
    // The opening anchored the walk and every line followed from it. There is
    // no stated closing figure to check the end against, and inventing one
    // from the walk would be the fabrication this file exists to refuse.
    return { status: 'MATCHED' };
  }

  if (last === null) return { status: 'NOT_AVAILABLE', reason: 'NO_VALID_ROWS' };
  return last.equals(Money.of(stated.minorUnits, currency))
    ? { status: 'MATCHED' }
    : { status: 'MISMATCHED', firstDivergentRowNumber: null };
}

/**
 * Whether a verdict permits a commit.
 *
 * `NOT_AVAILABLE` does: a statement with no balance column is not defective,
 * and refusing it would make reconciliation a requirement the source has to
 * satisfy rather than a check this platform performs when it can.
 * `MISMATCHED` does not, for the reason in the header.
 */
export function permitsCommit(outcome: ReconciliationOutcome): boolean {
  return outcome.status !== 'MISMATCHED';
}
