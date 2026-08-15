// Phase 1 placeholder: establishes the package boundary and the build.
// Policy resolution arrives in Phase 2 (docs/architecture/jurisdiction-policy.md).

/** Identifies a legal regime — the policy key, distinct from operating entity. */
export type JurisdictionId = string & { readonly __brand: 'JurisdictionId' };

export const jurisdictionId = (value: string): JurisdictionId => value as JurisdictionId;
