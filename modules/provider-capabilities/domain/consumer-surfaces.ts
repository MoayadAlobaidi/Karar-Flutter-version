/**
 * The surfaces a PERSON uses to reach their own money, kept in a separate type
 * from the rails KARAR uses to receive data — because they are separate facts
 * and the product's worst available mistake is to treat one as the other.
 *
 * ## The existence of a mobile app never implies an API
 *
 * This is the distinction the whole file exists to name. An issuer with a
 * polished consumer app, a web portal, a USSD channel and two thousand agents
 * may expose nothing at all to Karar, and that is the ORDINARY case in the
 * launch market rather than an edge case: a telco financial arm typically has
 * a very good app and no third-party data interface whatsoever.
 *
 * The failure this prevents is concrete and was made before. The legacy
 * product's connect-a-bank screen inserted a fabricated account row with an
 * invented masked number and a Synced badge — its own audit called it the
 * single most misleading surface in the product. That screen existed because
 * somebody reasoned from "this bank has an app" to "this bank can be
 * connected". Nothing in this model permits that step:
 *
 *  - the two facts live in two different types (`ConsumerSurfaceProfile` here,
 *    `DataRailProfile` in `data-rails.ts`), so neither is a field of the other;
 *  - no function derives one from the other, in either direction;
 *  - `impliesDataRail` answers `false` for every surface in the vocabulary,
 *    and the list it consults is EMPTY and frozen — the empty list is the
 *    claim, written where a reviewer adding a surface would see it.
 *
 * A test builds a profile that records a consumer app as `VERIFIED` while
 * every one of the thirteen data rails is `UNAVAILABLE`, because that
 * combination is the one this module has to be able to say out loud.
 *
 * ## What a surface assertion is for
 *
 * It is reviewer-facing context, and nothing else consumes it: knowing that an
 * issuer's only customer channel is USSD tells a reviewer what an eventual
 * statement upload will look like, and tells a support agent what to expect
 * when a person says they cannot find their balance. It never feeds a
 * connection, a rail, a status, or a screen that says Connected.
 */

import type { CapabilityAssertion } from './capability-assertion.js';
import { UNVERIFIED } from './capability-assertion.js';

/**
 * Channels an issuer offers its own customers. **Categories, never a named
 * product**: no value here is a brand, an app store listing, or a provider,
 * and no code in this module may branch on which issuer a profile describes
 * (ADR-0028).
 */
export const CONSUMER_SURFACES = [
  /** A consumer mobile application. Says nothing about data access to Karar. */
  'CONSUMER_MOBILE_APP',
  'CONSUMER_WEB_PORTAL',
  /** Menu-driven mobile channels, which several wallet products use as the primary one. */
  'USSD_OR_SMS_CHANNEL',
  'BRANCH_OR_AGENT_NETWORK',
  'CALL_CENTRE',
] as const;
export type ConsumerSurface = (typeof CONSUMER_SURFACES)[number];

export function isConsumerSurface(value: string): value is ConsumerSurface {
  return (CONSUMER_SURFACES as readonly string[]).includes(value);
}

/**
 * Every surface, always. A total record rather than a list, so a profile
 * cannot be silent about a surface: silence and "nobody has looked" are
 * different claims, and only the second one is a state.
 */
export type ConsumerSurfaceProfile = Readonly<Record<ConsumerSurface, CapabilityAssertion>>;

/** The honest starting point: nobody has looked at any channel. */
export const NO_SURFACE_REVIEWED: ConsumerSurfaceProfile = Object.freeze({
  CONSUMER_MOBILE_APP: UNVERIFIED,
  CONSUMER_WEB_PORTAL: UNVERIFIED,
  USSD_OR_SMS_CHANNEL: UNVERIFIED,
  BRANCH_OR_AGENT_NETWORK: UNVERIFIED,
  CALL_CENTRE: UNVERIFIED,
});

/**
 * The surfaces whose existence implies a data rail.
 *
 * **It is EMPTY, and the emptiness is the assertion.** Written as an
 * explicitly empty frozen list rather than as a bare `return false` inside the
 * predicate below, because a reviewer who wants to make an app imply an API
 * has to add a word to a list that sits under this paragraph — where the
 * argument against it is. The test over `impliesDataRail` fails the moment the
 * list gains a member.
 *
 * This is the idiom `modules/financial-connections` uses for
 * `STATUSES_IMPLYING_A_LIVE_INSTITUTION_LINK`, applied to the other half of
 * the same lie.
 */
export const SURFACES_IMPLYING_A_DATA_RAIL: readonly ConsumerSurface[] = Object.freeze([]);

/**
 * Whether a customer channel implies that Karar can receive data. Answers
 * `false` for every surface, including the two that most look like they
 * should: an app is software a person runs on their own phone, and a portal is
 * a page a person logs into. Neither is an interface offered to this platform,
 * and neither becomes one because a screen would be easier to build if it were.
 */
export function impliesDataRail(surface: ConsumerSurface): boolean {
  return SURFACES_IMPLYING_A_DATA_RAIL.includes(surface);
}
