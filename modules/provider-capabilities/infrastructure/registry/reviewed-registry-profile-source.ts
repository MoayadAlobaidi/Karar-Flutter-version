/**
 * `ReviewedRegistryProfileSource` — the only implementation of
 * `ReviewedProfileCataloguePort`, over the frozen in-repository registry.
 *
 * **It reads a constant. It opens no connection, makes no request, touches no
 * filesystem and holds no client**, and that is not an omission to be filled
 * in later: reviewed configuration is code (see `domain/profile-registry.ts`),
 * so the store it reads is the module itself. The class sits in
 * `infrastructure/` because it is an adapter satisfying a declared port, not
 * because it reaches anything.
 *
 * It answers `null` for every query today, because the registry is empty. That
 * is the truthful answer and the reason this class is worth having now: the
 * composition and the not-reviewed path are exercised before there is anything
 * to get wrong about them.
 *
 * The constructor takes the profile set so tests can drive the same code over
 * synthetic profiles. The DEFAULT is the shipped registry, so a composition
 * root that constructs it with no argument gets the reviewed set and cannot
 * accidentally get a fixture.
 */

import type { ProviderCapabilityProfile } from '../../domain/capability-profile.js';
import { capabilityProfileKey, profileSubjectKey } from '../../domain/capability-profile.js';
import { REVIEWED_CAPABILITY_PROFILES } from '../../domain/profile-registry.js';
import { assertValidCapabilityProfiles } from '../../domain/profile-validation.js';
import type {
  ReviewedProfileCataloguePort,
  ReviewedProfileQuery,
} from '../../application/ports/reviewed-profile-catalogue.js';

export class ReviewedRegistryProfileSource implements ReviewedProfileCataloguePort {
  private readonly byKey: ReadonlyMap<string, ProviderCapabilityProfile>;

  /**
   * Validates at construction. An invalid reviewed profile is a defect in the
   * repository, and a composition root failing at boot is strictly better than
   * a review tool rendering a profile whose rules nobody checked.
   */
  constructor(profiles: readonly ProviderCapabilityProfile[] = REVIEWED_CAPABILITY_PROFILES) {
    assertValidCapabilityProfiles(profiles);
    this.byKey = new Map(profiles.map((profile) => [capabilityProfileKey(profile), profile]));
  }

  findReviewedProfile(query: ReviewedProfileQuery): ProviderCapabilityProfile | null {
    return this.byKey.get(profileSubjectKey(query)) ?? null;
  }
}
