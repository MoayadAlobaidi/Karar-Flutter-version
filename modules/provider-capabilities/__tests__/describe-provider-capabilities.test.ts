/**
 * The one use case, against the real adapter and against a fake that
 * misbehaves.
 *
 * Two rules are under test and neither is bookkeeping:
 *
 *  - **"nobody has written this down" is not "we could not look".**
 *    `PROFILE_NOT_REVIEWED` and `CATALOGUE_UNAVAILABLE` are distinct outcomes
 *    with distinct remedies, the same distinction the retention gate makes
 *    between `PENDING_LEGAL_REVIEW` and `UNAVAILABLE`.
 *  - **an unexpected throw never reaches a caller as text.** The reason is
 *    fixed prose chosen by the refusal's kind; the original rides along
 *    non-enumerably for the boundary logger and is invisible to every
 *    serializer.
 */

import { describe, expect, it } from 'vitest';

import type { ProviderCapabilityProfile } from '../domain/capability-profile.js';
import { railsDescribedAsAvailable } from '../domain/data-rails.js';
import type {
  ReviewedProfileCataloguePort,
  ReviewedProfileQuery,
} from '../application/ports/reviewed-profile-catalogue.js';
import { DescribeProviderCapabilities } from '../application/use-cases/describe-provider-capabilities.js';
import { ReviewedRegistryProfileSource } from '../infrastructure/registry/reviewed-registry-profile-source.js';
import {
  SYNTHETIC_MARKET,
  SYNTHETIC_TELCO_ALPHA,
  SYNTHETIC_TELCO_WALLET_PROFILE,
} from './fixtures.js';

const QUERY: ReviewedProfileQuery = {
  institutionRef: SYNTHETIC_TELCO_ALPHA,
  marketCountry: SYNTHETIC_MARKET,
  customerSegment: 'RETAIL',
};

/** A catalogue that always fails. Deliberately dumb — anything cleverer would
 * be a second implementation of the rule under test. */
class ThrowingCatalogue implements ReviewedProfileCataloguePort {
  findReviewedProfile(): ProviderCapabilityProfile | null {
    throw new Error('postgres://reviewer:hunter2@db.internal:5432 refused the connection');
  }
}

describe('DescribeProviderCapabilities', () => {
  it('answers profile_not_reviewed against the shipped, empty registry', () => {
    const useCase = new DescribeProviderCapabilities(new ReviewedRegistryProfileSource());

    const outcome = useCase.execute(QUERY);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe('profile_not_reviewed');
      // It is a statement about this platform, not about the issuer.
      expect(outcome.error.message).toContain('nobody has written a description down');
    }
  });

  it('describes a reviewed profile without granting anything', () => {
    const useCase = new DescribeProviderCapabilities(
      new ReviewedRegistryProfileSource([SYNTHETIC_TELCO_WALLET_PROFILE]),
    );

    const outcome = useCase.execute(QUERY);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.profile).toBe(SYNTHETIC_TELCO_WALLET_PROFILE);
      expect(outcome.value.rails).toHaveLength(13);
      expect(outcome.value.railsDescribedAsAvailable).toEqual([]);

      // The whole answer, enumerated: a profile, the rail findings, and the
      // evidenced subset. No connection, no input to one, no endpoint, no
      // token, and no field that a caller could open anything with.
      expect(Object.keys(outcome.value).sort()).toEqual([
        'profile',
        'rails',
        'railsDescribedAsAvailable',
      ]);
    }
  });

  it('recomputes the available subset from the profile rather than storing it twice', () => {
    const useCase = new DescribeProviderCapabilities(
      new ReviewedRegistryProfileSource([SYNTHETIC_TELCO_WALLET_PROFILE]),
    );

    const outcome = useCase.execute(QUERY);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.railsDescribedAsAvailable).toEqual(
        railsDescribedAsAvailable(SYNTHETIC_TELCO_WALLET_PROFILE.dataRails),
      );
    }
  });

  it('tells "nobody looked" apart from "we could not look"', () => {
    const failing = new DescribeProviderCapabilities(new ThrowingCatalogue());

    const outcome = failing.execute(QUERY);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe('catalogue_unavailable');
    }
  });

  it('never carries the throw text outward, and never serializes the cause', () => {
    const failing = new DescribeProviderCapabilities(new ThrowingCatalogue());

    const outcome = failing.execute(QUERY);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.message).not.toContain('postgres://');
      expect(outcome.error.message).not.toContain('hunter2');
      expect(outcome.error.message).not.toContain('db.internal');

      // The cause is reachable by name for the boundary logger...
      expect((outcome.error as { cause?: unknown }).cause).toBeInstanceOf(Error);
      // ...and invisible to every serializer, without anyone remembering to.
      expect(Object.keys(outcome.error)).not.toContain('cause');
      expect(JSON.stringify(outcome.error)).not.toContain('hunter2');
      expect(JSON.stringify({ ...outcome.error })).not.toContain('hunter2');
    }
  });

  it('takes no principal, no tenant and no user — reviewed configuration has no subject', () => {
    expect(Object.keys(QUERY).sort()).toEqual([
      'customerSegment',
      'institutionRef',
      'marketCountry',
    ]);
    // One parameter, and it is the query.
    expect(DescribeProviderCapabilities.prototype.execute.length).toBe(1);
  });
});
