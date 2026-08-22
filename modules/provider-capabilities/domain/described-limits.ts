/**
 * The quantitative parts of a description — history depth, refresh and rate
 * quotas, and where data would be required to live.
 *
 * ## Why each of these is a union with an UNSTATED arm
 *
 * A number is the easiest place in a configuration model to write down a
 * guess, because a number always looks like a fact. "90 days" in a field
 * called `historyDays` reads as something a provider said; it is just as
 * likely to be something a reviewer assumed from the last provider they read
 * about. So none of these fields is a bare number with a zero default: each is
 * a discriminated union whose ground state is `UNSTATED`, and a figure exists
 * only where somebody deliberately constructed the `DESCRIBED` arm.
 *
 * This is the same reasoning `modules/financial-accounts` applies to a balance
 * kind: the kind is never defaulted, because a default is a guess written on
 * the caller's behalf and the guess is invisible in the stored value.
 *
 * ## Nothing here is money
 *
 * A count of days and a count of requests are counts, not amounts. There is no
 * `Money` in this module, no currency-bearing figure, no fee, no price and no
 * limit expressed in minor units — a provider's commercial terms are a
 * contract, and a contract is evidence to be referenced, not a number to be
 * copied into a type where something might later add it up.
 */

import type { CountryCode } from './refs.js';
import type { RateWindow } from './vocabularies.js';

/**
 * How much transaction history an interface is described as covering.
 *
 * `days` rather than a period string, because a period is arithmetic waiting
 * to happen and nothing here does arithmetic. A reviewer records what the
 * document said.
 */
export type DescribedHistoryDepth =
  | { readonly kind: 'UNSTATED' }
  | { readonly kind: 'DESCRIBED_DAYS'; readonly days: number };

/** Nobody has established a history depth. The ground state. */
export const HISTORY_DEPTH_UNSTATED: DescribedHistoryDepth = Object.freeze({
  kind: 'UNSTATED' as const,
});

/**
 * A described quota — how often, or how many, per window.
 *
 * Used for both the refresh limit (how often a person's data could be pulled)
 * and the rate limit (how many calls an interface tolerates). They are
 * separate fields because they are separate facts with separate consequences:
 * the first shapes what a product can promise a person, the second shapes what
 * an implementation must not do.
 */
export type DescribedQuota =
  | { readonly kind: 'UNSTATED' }
  | { readonly kind: 'DESCRIBED'; readonly count: number; readonly per: RateWindow };

/** Nobody has established a quota. The ground state. */
export const QUOTA_UNSTATED: DescribedQuota = Object.freeze({ kind: 'UNSTATED' as const });

/**
 * Where an arrangement would require the data to live.
 *
 * Four arms, and the difference between the first two is the one that matters:
 * `UNSTATED` means nobody asked, `NONE_STATED` means somebody asked and the
 * answer was that there is no requirement. Collapsing them would turn an
 * unasked question into a cleared one, which is precisely the class of error
 * this whole module is shaped against.
 *
 * `REQUIRED_IN_MARKET` needs no territory of its own: it means the profile's
 * own market, and repeating the code would create two places for one fact.
 */
export type DataResidencyRequirement =
  | { readonly kind: 'UNSTATED' }
  | { readonly kind: 'NONE_STATED' }
  | { readonly kind: 'REQUIRED_IN_MARKET' }
  | { readonly kind: 'REQUIRED_IN_NAMED_TERRITORY'; readonly territory: CountryCode };

/** Nobody has asked about residency. The ground state. */
export const RESIDENCY_UNSTATED: DataResidencyRequirement = Object.freeze({
  kind: 'UNSTATED' as const,
});

/** A whole, positive count. Shared by the two arms that carry a figure. */
export function isPositiveWholeCount(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}
