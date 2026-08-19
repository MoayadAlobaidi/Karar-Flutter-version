/**
 * `DescribeProviderCapabilities` — read one reviewed profile and answer with a
 * DESCRIPTION.
 *
 * ## What the answer deliberately does not contain
 *
 * There is no executable rail on `ProviderCapabilityDescription`, no
 * connection, no connection input, no token, no credential, no endpoint, no
 * base URL and no field of any type that a caller could hand to
 * `createFinancialConnection`. The rails it reports are typed `DataRail` — the
 * WIDE vocabulary of names this module declares for itself — which is not
 * assignable to the `ImplementedConnectionRail` that module's factory demands,
 * so the compiler refuses the step even before the runtime gate and the
 * database CHECK do. `__tests__/mirrored-vocabularies.test.ts` proves the
 * non-assignability at compile time, from the one place allowed to name both.
 *
 * That is the whole of rule 3 in one sentence: this module answers what a
 * document said, `modules/financial-connections` decides what may exist, and
 * there is no expression in TypeScript that turns the first into the second
 * without a cast a reviewer would see.
 *
 * ## Why this is a use case at all
 *
 * Because the read has a rule: `PROFILE_NOT_REVIEWED` is a distinct outcome
 * from an unavailable catalogue, and conflating them would let "we could not
 * look" be rendered the same way as "we looked and nobody has written this
 * down". The retention gate makes the same distinction between
 * `PENDING_LEGAL_REVIEW` and `UNAVAILABLE`, and for the same reason: the
 * remedies differ and an operator needs to tell them apart.
 *
 * No principal, no tenant: see the port's header. Reviewed configuration about
 * an organisation has no subject.
 */

import { Result } from '@karar/shared-kernel';

import type { ProviderCapabilityProfile } from '../../domain/capability-profile.js';
import type { DataRail, RailDescription } from '../../domain/data-rails.js';
import { describedRails, railsDescribedAsAvailable } from '../../domain/data-rails.js';
import type {
  ReviewedProfileCataloguePort,
  ReviewedProfileQuery,
} from '../ports/reviewed-profile-catalogue.js';
import type { DescribeProviderCapabilitiesError } from '../errors.js';
import { PROFILE_NOT_REVIEWED, catalogueUnavailable } from '../errors.js';

export type DescribeProviderCapabilitiesInput = ReviewedProfileQuery;

/**
 * What a reviewer or a support surface gets back.
 *
 * `railsDescribedAsAvailable` is a convenience over the profile, not a second
 * source of truth — it is recomputed from `profile.dataRails` on every call so
 * the two can never disagree.
 */
export interface ProviderCapabilityDescription {
  readonly profile: ProviderCapabilityProfile;
  /** Every rail with what the review found. Names and findings, never permission. */
  readonly rails: readonly RailDescription[];
  /** The subset a review EVIDENCED as on offer. Still names, still not permission. */
  readonly railsDescribedAsAvailable: readonly DataRail[];
}

export class DescribeProviderCapabilities {
  constructor(private readonly catalogue: ReviewedProfileCataloguePort) {}

  execute(
    input: DescribeProviderCapabilitiesInput,
  ): Result<ProviderCapabilityDescription, DescribeProviderCapabilitiesError> {
    let profile: ProviderCapabilityProfile | null;
    try {
      profile = this.catalogue.findReviewedProfile(input);
    } catch (error) {
      // The throw is unexpected — the intended implementations cannot fail —
      // so it is wrapped rather than described. See application/errors.ts.
      return Result.err(catalogueUnavailable(error));
    }

    if (profile === null) {
      return Result.err(PROFILE_NOT_REVIEWED);
    }

    return Result.ok(
      Object.freeze({
        profile,
        rails: describedRails(profile.dataRails),
        railsDescribedAsAvailable: railsDescribedAsAvailable(profile.dataRails),
      }),
    );
  }
}
