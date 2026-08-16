/**
 * SubjectOptionSource — the port through which this module learns which
 * options a jurisdiction's PolicyPack permits for a capability (declared
 * inward, architecture test 5). The REAL implementation is the
 * jurisdiction-policy workstream's pack resolution, bound by the
 * composition root; this module ships the port and test fakes only.
 *
 * The port speaks REFERENCES: option sets carry profile refs and permitted
 * versions, never profile content — content is capability-owned and does
 * not flow through subject-policy (jurisdiction-policy.md §7).
 *
 * Contract: the returned set is the APPLICABLE one for (capability,
 * jurisdiction) at `at`, and `policyPackVersion` names the pack version
 * declaring it — the version a recording pins. `NO_SUBJECT_POLICY` is a
 * definitive answer (the capability declares no elective options there);
 * `UNRESOLVED` is the typed fail-closed arm for "the pack could not be
 * resolved" — callers treat it as a denial, never as an empty set.
 */

import type { CapabilityId } from '@karar/capability-registry';

import type { SubjectOptionSet } from '../../domain/option-set.js';
import type { JurisdictionRef } from '../../domain/refs.js';

export type OptionSetResolution<Id extends string = CapabilityId> =
  | { readonly kind: 'OPTION_SET'; readonly optionSet: SubjectOptionSet<Id> }
  | { readonly kind: 'NO_SUBJECT_POLICY' }
  | { readonly kind: 'UNRESOLVED'; readonly reason: string };

export interface SubjectOptionSource<Id extends string = CapabilityId> {
  optionSetFor(
    capabilityId: Id,
    jurisdictionRef: JurisdictionRef,
    at: Date,
  ): Promise<OptionSetResolution<Id>>;
}
