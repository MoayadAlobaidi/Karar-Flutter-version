// The deployment environments policy resolution distinguishes. Structurally
// identical to @karar/capability-registry's KararEnvironment — declared here
// as well because that package imports JurisdictionId from this one, and a
// reverse import would create a package cycle. The unions are assignment-
// compatible in both directions.

export const POLICY_ENVIRONMENTS = ['local', 'dev', 'staging', 'production'] as const;

export type PolicyEnvironment = (typeof POLICY_ENVIRONMENTS)[number];

export function isPolicyEnvironment(value: string): value is PolicyEnvironment {
  return (POLICY_ENVIRONMENTS as readonly string[]).includes(value);
}
