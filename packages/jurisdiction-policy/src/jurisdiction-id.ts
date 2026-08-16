// The jurisdiction brand established in Phase 1. Everything else in this
// package (and @karar/capability-registry, which imports the brand) keys on
// it, so the export is stable: the brand shape and the constructor name do
// not change.

/** Identifies a legal regime — the policy key, distinct from operating entity. */
export type JurisdictionId = string & { readonly __brand: 'JurisdictionId' };

export const jurisdictionId = (value: string): JurisdictionId => value as JurisdictionId;
