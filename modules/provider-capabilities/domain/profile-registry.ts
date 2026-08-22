/**
 * The reviewed profile registry. **It is empty, and it ships empty.**
 *
 * ## Zero real providers, and none VERIFIED
 *
 * No profile in this repository describes a real institution. Not one that is
 * `UNVERIFIED`, not one that is `PENDING_PROVIDER_CONFIRMATION`, and above all
 * not one that is `VERIFIED`. The reason is the one migration 0087 and
 * migration 0094 both record for seeding their tables empty: naming an issuer
 * is a commercial and legal act, saying what its interface offers is a larger
 * one, and the review has not happened.
 *
 * ADR-0028 states the requirement directly — the model must express a
 * mobile-money wallet from a telco *without naming one*, and it must do so
 * **without implying that any such provider exposes an API to Karar**. None
 * does, none is integrated, and no capability profile is `VERIFIED` without
 * evidence.
 *
 * The product is fully functional with zero profiles: a person records the
 * accounts they hold, types their figures or uploads a CSV, and nothing in
 * that path consults this registry. A profile would tell a REVIEWER what an
 * interface might one day offer. It has never told a user anything and must
 * not start.
 *
 * ## The frozen empty array is not a placeholder
 *
 * It is the accurate current state, and it is asserted by test rather than
 * left to be noticed. When the first reviewed profile arrives it arrives as a
 * code change with a review reference attached, validated at module load by
 * `assertValidReviewedProfiles`, exactly as a capability descriptor arrives in
 * `packages/capability-registry`. It never arrives as a row somebody inserted.
 *
 * ## Synthetic profiles live in tests and nowhere else
 *
 * The test fixtures construct profiles over obviously synthetic issuer
 * references, and they exercise the shape — including the mobile-money wallet
 * case ADR-0028 names. They are not exported from this module and cannot be
 * imported by an application: `__tests__/` is outside `public-api.ts`, which
 * is the only legal import surface (architecture test 3).
 */

import type { ProviderCapabilityProfile } from './capability-profile.js';
import { assertValidCapabilityProfiles } from './profile-validation.js';

/**
 * Every reviewed profile this repository ships. Empty. See the header.
 *
 * Frozen so that "the registry is empty" is a property of the value rather
 * than a claim about who calls `push`.
 */
export const REVIEWED_CAPABILITY_PROFILES: readonly ProviderCapabilityProfile[] = Object.freeze(
  [] as readonly ProviderCapabilityProfile[],
);

/**
 * Validate the shipped registry.
 *
 * Called by a composition root at boot so an invalid reviewed profile fails
 * where an operator sees it, rather than at whichever read happens first. It
 * passes vacuously today, which is the correct behaviour for an empty
 * registry and is the reason the call is worth wiring now: the day a profile
 * is added, the gate is already in the path.
 */
export function assertValidReviewedProfiles(): void {
  assertValidCapabilityProfiles(REVIEWED_CAPABILITY_PROFILES);
}
