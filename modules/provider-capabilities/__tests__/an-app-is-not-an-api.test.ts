/**
 * **The existence of a mobile app never implies an API.**
 *
 * The distinction is encoded as two separate types with no function between
 * them, and the assertion that they are separate is
 * `SURFACES_IMPLYING_A_DATA_RAIL` — a frozen EMPTY list, so that adding a
 * surface which implies a rail means adding a word where a reviewer sees the
 * argument against it.
 *
 * The case that matters is the one this file builds: an issuer with a verified
 * consumer app, a verified USSD channel and a verified agent network, whose
 * every data rail is `UNAVAILABLE`. That is not a contrived combination — it
 * is the ordinary shape of a telco financial arm in the launch market, and a
 * model that cannot express it will express something false instead.
 */

import { describe, expect, it } from 'vitest';

import { isVerified } from '../domain/capability-assertion.js';
import {
  CONSUMER_SURFACES,
  NO_SURFACE_REVIEWED,
  SURFACES_IMPLYING_A_DATA_RAIL,
  impliesDataRail,
} from '../domain/consumer-surfaces.js';
import { describedRails, railsDescribedAsAvailable } from '../domain/data-rails.js';
import { SYNTHETIC_TELCO_WALLET_PROFILE } from './fixtures.js';

describe('a customer channel is not a data rail', () => {
  it('lists no surface that implies a rail, and the empty list is the claim', () => {
    expect(SURFACES_IMPLYING_A_DATA_RAIL).toEqual([]);
    expect(Object.isFrozen(SURFACES_IMPLYING_A_DATA_RAIL)).toBe(true);

    for (const surface of CONSUMER_SURFACES) {
      expect(impliesDataRail(surface)).toBe(false);
    }
  });

  it('keeps the two vocabularies disjoint — no surface is a rail name', () => {
    const railNames = new Set<string>(
      describedRails(SYNTHETIC_TELCO_WALLET_PROFILE.dataRails).map((rail) => rail.rail),
    );

    for (const surface of CONSUMER_SURFACES) {
      expect(railNames.has(surface)).toBe(false);
    }
  });

  it('records an issuer with a verified consumer app and not one available rail', () => {
    const profile = SYNTHETIC_TELCO_WALLET_PROFILE;

    // The app exists, evidenced.
    expect(isVerified(profile.consumerSurfaces.CONSUMER_MOBILE_APP)).toBe(true);
    expect(isVerified(profile.consumerSurfaces.USSD_OR_SMS_CHANNEL)).toBe(true);
    expect(isVerified(profile.consumerSurfaces.BRANCH_OR_AGENT_NETWORK)).toBe(true);

    // ...and every single rail is UNAVAILABLE.
    const rails = describedRails(profile.dataRails);
    expect(rails).toHaveLength(13);
    for (const { assertion } of rails) {
      expect(assertion.state).toBe('UNAVAILABLE');
    }
    expect(railsDescribedAsAvailable(profile.dataRails)).toEqual([]);
  });

  it('starts every surface at UNVERIFIED — an unexamined channel is not a denied one', () => {
    for (const surface of CONSUMER_SURFACES) {
      expect(NO_SURFACE_REVIEWED[surface].state).toBe('UNVERIFIED');
    }
  });

  it('exposes no function that derives a rail from a surface, in either direction', () => {
    // Enumerated rather than asserted in prose: the surface module exports a
    // vocabulary, a default, the empty list, and one predicate that answers
    // false. There is nothing here that could turn an app into an interface.
    const surfaceModule = { CONSUMER_SURFACES, NO_SURFACE_REVIEWED, SURFACES_IMPLYING_A_DATA_RAIL };

    expect(Object.keys(surfaceModule).sort()).toEqual([
      'CONSUMER_SURFACES',
      'NO_SURFACE_REVIEWED',
      'SURFACES_IMPLYING_A_DATA_RAIL',
    ]);
    expect(impliesDataRail('CONSUMER_MOBILE_APP')).toBe(false);
    expect(impliesDataRail('CONSUMER_WEB_PORTAL')).toBe(false);
  });
});
