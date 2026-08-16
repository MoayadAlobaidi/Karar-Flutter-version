/**
 * The pack-permitted option set this module validates elections against —
 * REFERENCES ONLY. The set names which capability-owned profiles (and which
 * versions of them) the jurisdiction's PolicyPack permits; the profiles'
 * CONTENT stays in the owning capability's bounded context and never flows
 * through this module (jurisdiction-policy.md §7).
 *
 * Restrict-only (§2 invariant, applied to the fourth dimension): a
 * selection may only NARROW — elect one member of this set. Nothing a
 * subject records can add an option the pack did not permit; recording
 * validates membership and refuses everything else.
 */

import type { JurisdictionRef, ProfileRef } from './refs.js';

export interface PermittedProfileOption {
  /** Opaque reference to a capability-owned profile. */
  readonly profileRef: ProfileRef;
  /** The profile versions the pack permits electing, non-empty. */
  readonly profileVersions: ReadonlyArray<string>;
}

export interface SubjectOptionSet<Id extends string = string> {
  readonly capabilityId: Id;
  readonly jurisdictionRef: JurisdictionRef;
  /** The PolicyPack version DECLARING this set — what a selection pins. */
  readonly policyPackVersion: string;
  readonly permittedOptions: ReadonlyArray<PermittedProfileOption>;
}

/** Membership test: is (profileRef, profileVersion) inside the permitted set? */
export function optionPermitted<Id extends string>(
  optionSet: SubjectOptionSet<Id>,
  profileRef: ProfileRef,
  profileVersion: string,
): boolean {
  return optionSet.permittedOptions.some(
    (option) =>
      option.profileRef === profileRef && option.profileVersions.includes(profileVersion),
  );
}
