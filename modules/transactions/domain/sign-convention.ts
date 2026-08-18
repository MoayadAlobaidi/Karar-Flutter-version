/**
 * ============================================================================
 * THE CANONICAL SIGN CONVENTION
 * ============================================================================
 *
 * **A stored transaction amount is signed from the ACCOUNT HOLDER's point of
 * view: money leaving the account is NEGATIVE, money entering it is
 * POSITIVE.** There is exactly one convention, it applies to every stored
 * transaction in every account and every currency, and nothing anywhere may
 * store an unsigned magnitude alongside a direction flag.
 *
 * ## Why a single signed amount, and not magnitude + type
 *
 * The alternative — an always-positive `amount` plus a `type` column reading
 * DEBIT or CREDIT — is the shape that produces wrong totals. Every consumer
 * that sums transactions must then join two columns correctly, forever, in
 * every query, projection, export, and screen. One consumer that forgets the
 * type column produces a plausible number that is silently wrong, and a
 * plausible wrong number in a financial product is worse than a crash. With
 * one signed amount, `SUM(amount_minor)` is the net change in the account and
 * cannot be computed incorrectly by omission. A caller that genuinely wants a
 * magnitude asks for `.abs()`, which is visible at the call site.
 *
 * ## Why the ACCOUNT HOLDER's perspective, not the bank's ledger
 *
 * The two vocabularies invert, and this is the single most common source of
 * sign bugs in statement processing. In double-entry bookkeeping AT THE BANK,
 * a customer's current account is a LIABILITY of the bank: a deposit
 * (customer receives money) CREDITS that liability, and a withdrawal DEBITS
 * it. Retail statements printed for customers usually flip this to the
 * customer's own frame, so "debit" means money out of the customer's pocket.
 * Different institutions, different CSV exports, and different column headers
 * disagree about which frame they are speaking in — sometimes within one file.
 *
 * So this module never adopts the source's frame. It stores its own sign
 * under its own rule, and keeps what the source literally said in provenance
 * (`sourceDirection`, plus the `directionMapping` that records HOW it was
 * interpreted). A later discovery that one institution's export uses the bank
 * frame is then a re-derivation from preserved facts, not an archaeological
 * dig through lost semantics.
 *
 * ## Why not simply "expenses positive"
 *
 * A personal-finance product is tempted to store spending as a positive
 * number because that is how it reads on a screen. That convention cannot
 * express an account's net movement without a second rule for income, needs a
 * third rule for transfers, and inverts again for liability accounts such as
 * credit cards. Signing by direction of money relative to the account needs
 * no per-category, per-account-type, or per-screen exception. Presentation
 * may render `-45.00 QAR` however it likes; storage stays one rule.
 *
 * ## Zero
 *
 * A zero amount is permitted (fee reversals and corrections genuinely produce
 * it) and is neither a debit nor a credit. The source's own marker is still
 * preserved in provenance, because "the statement said DR and the amount was
 * zero" is a real fact about the statement.
 *
 * ## What this file is NOT
 *
 * It is not a currency conversion, not a balance calculation, and not a
 * budgeting rule. It maps a source's stated direction onto one sign, and it
 * is pure: no clock, no randomness, no I/O.
 */

import type { Money } from '@karar/shared-kernel';

/**
 * What the SOURCE itself said about direction, preserved verbatim in
 * meaning (not in wording — the wording is the parser's business).
 *
 * `NOT_STATED` is a real and common case: many exports carry a single signed
 * amount column and no direction word at all.
 */
export const SOURCE_DIRECTIONS = ['DEBIT', 'CREDIT', 'NOT_STATED'] as const;
export type SourceDirection = (typeof SOURCE_DIRECTIONS)[number];

/**
 * How this module arrived at the stored sign from what the source provided.
 * Stored on provenance so the derivation is replayable years later.
 *
 * - `MANUAL_ENTRY` — a person stated the direction in the product's own
 *   vocabulary; no source frame was involved.
 * - `SOURCE_DIRECTION_WORD` — the source named DEBIT or CREDIT and it was
 *   read in the ACCOUNT-HOLDER frame (debit = money out).
 * - `SOURCE_SIGNED_AMOUNT` — the source carried its own sign and already used
 *   the account-holder frame; the sign was taken as given.
 * - `SOURCE_SIGNED_AMOUNT_INVERTED` — the source carried its own sign in the
 *   BANK-LEDGER frame; the sign was inverted. Recording this separately is
 *   the whole point: an inverted import is visible as an inversion rather
 *   than indistinguishable from a correctly-signed one.
 */
export const DIRECTION_MAPPINGS = [
  'MANUAL_ENTRY',
  'SOURCE_DIRECTION_WORD',
  'SOURCE_SIGNED_AMOUNT',
  'SOURCE_SIGNED_AMOUNT_INVERTED',
] as const;
export type DirectionMapping = (typeof DIRECTION_MAPPINGS)[number];

/**
 * The product's own direction vocabulary, used by the manual-entry path.
 * `MONEY_OUT` / `MONEY_IN` are deliberately not called debit/credit: naming
 * them after the bank's words would re-import the ambiguity this convention
 * exists to remove.
 */
export const MONEY_DIRECTIONS = ['MONEY_OUT', 'MONEY_IN'] as const;
export type MoneyDirection = (typeof MONEY_DIRECTIONS)[number];

export class SignConventionError extends Error {
  override readonly name = 'SignConventionError';
}

/**
 * Applies the canonical convention to a magnitude a person stated with a
 * direction. `magnitude` must not be negative — a negative magnitude with an
 * explicit direction is contradictory input, and guessing which of the two
 * the caller meant is exactly the silent-wrongness this module refuses.
 */
export function signedAmountFor(magnitude: Money, direction: MoneyDirection): Money {
  if (magnitude.isNegative()) {
    throw new SignConventionError(
      `a magnitude paired with an explicit direction must not carry its own sign (got ${magnitude.toString()} with ${direction}); ` +
        'the direction decides the sign, and a signed magnitude makes the intent ambiguous',
    );
  }
  return direction === 'MONEY_OUT' ? magnitude.negate() : magnitude;
}

/**
 * Reads the canonical convention back off a stored amount. Zero is neither
 * direction, which callers must handle rather than defaulting.
 */
export function directionOf(amount: Money): MoneyDirection | 'ZERO' {
  if (amount.isZero()) return 'ZERO';
  return amount.isNegative() ? 'MONEY_OUT' : 'MONEY_IN';
}

/**
 * The source direction implied by a stored amount, in the ACCOUNT-HOLDER
 * frame. Used when writing provenance for a manual entry, where the "source"
 * is the person and the frame is the product's own.
 */
export function sourceDirectionOf(amount: Money): SourceDirection {
  const direction = directionOf(amount);
  if (direction === 'ZERO') return 'NOT_STATED';
  return direction === 'MONEY_OUT' ? 'DEBIT' : 'CREDIT';
}

/**
 * Consistency check between a stored amount and the direction the source
 * stated, given how the mapping was made. Returns `true` when the pair is
 * coherent under the recorded mapping.
 *
 * This is what makes preserved provenance load-bearing rather than
 * decorative: a stored positive amount whose provenance says the source
 * called it a DEBIT and the mapping was `SOURCE_DIRECTION_WORD` is a
 * contradiction, and a contradiction that can be detected is a contradiction
 * that cannot quietly become a wrong total.
 */
export function signAgreesWithSource(
  amount: Money,
  sourceDirection: SourceDirection,
  mapping: DirectionMapping,
): boolean {
  if (sourceDirection === 'NOT_STATED') return true;
  if (amount.isZero()) return true;
  const impliedOut = amount.isNegative();
  switch (mapping) {
    case 'MANUAL_ENTRY':
    case 'SOURCE_DIRECTION_WORD':
    case 'SOURCE_SIGNED_AMOUNT':
      // Account-holder frame: DEBIT means money out means negative.
      return impliedOut === (sourceDirection === 'DEBIT');
    case 'SOURCE_SIGNED_AMOUNT_INVERTED':
      // Bank-ledger frame: the source's DEBIT is money IN for the holder.
      return impliedOut === (sourceDirection === 'CREDIT');
  }
}
