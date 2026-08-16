/**
 * Registry validation — the descriptor invariants as data, checkable over ANY
 * registry shape (capability-registry.md; ADR-0016).
 *
 * Generic over `Id extends string` on purpose: test suites construct their own
 * registries over their own synthetic id types ('TEST_SYNTH' etc.) to exercise
 * the resolver's POSITIVE paths without a synthetic capability ever entering
 * the production union, the production registry, client output, or database
 * rows. The capability module's write paths validate ids against the
 * PRODUCTION registry (and the canonical migrations CHECK-constrain the same
 * closed set), so a synthetic registry stays a test-local construction.
 *
 * Pure by construction: data in, violations out, no I/O, no clock, no
 * randomness (architecture test 17's discipline).
 */

import type { CapabilityDescriptor, KararEnvironment } from './index';

/** Runtime mirror of the KararEnvironment union, for validating open input. */
export const KARAR_ENVIRONMENTS = ['local', 'dev', 'staging', 'production'] as const;

// Compile-time proof the runtime list and the type stay one thing.
type EnvironmentsMatch = (typeof KARAR_ENVIRONMENTS)[number] extends KararEnvironment
  ? KararEnvironment extends (typeof KARAR_ENVIRONMENTS)[number]
    ? true
    : never
  : never;
const environmentsMatch: EnvironmentsMatch = true;
void environmentsMatch;

export function isKararEnvironment(value: string): value is KararEnvironment {
  return (KARAR_ENVIRONMENTS as readonly string[]).includes(value);
}

/** One violated invariant, machine-readable and specific. */
export interface RegistryViolation {
  readonly capabilityId: string | null;
  readonly rule: RegistryRule;
  readonly message: string;
}

export type RegistryRule =
  | 'DUPLICATE_ID'
  | 'ID_KEY_MISMATCH'
  | 'MISSING_DESCRIPTOR'
  | 'UNDECLARED_DESCRIPTOR'
  | 'DEPLOYED_WHILE_NOT_IMPLEMENTED'
  | 'UNKNOWN_DEPLOYMENT_ENVIRONMENT'
  | 'DUPLICATE_DECLARED_JURISDICTION'
  | 'UNDISCLOSED_EXPOSURE';

/**
 * Structural validation of a registry against the descriptor invariants:
 *
 *  - ids are unique, and every id maps to a descriptor whose `id` matches
 *    its key (no aliasing, no orphans in either direction);
 *  - no descriptor claims DEPLOYED anywhere while NOT_IMPLEMENTED — deployment
 *    of missing code is a contradiction, not configuration;
 *  - deployment keys are real environments;
 *  - declaredJurisdictions carries no duplicates (a ceiling input must be a
 *    set);
 *  - a disclosure-bearing descriptor with an EMPTY declaredJurisdictions list
 *    must be HIDDEN: no jurisdiction has cleared its disclosures, so no client
 *    surface may advertise it in any state (the Amanat rule, held generally).
 */
export function validateRegistry<Id extends string>(
  ids: readonly Id[],
  descriptors: Readonly<Record<Id, CapabilityDescriptor<Id>>>,
): readonly RegistryViolation[] {
  const violations: RegistryViolation[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      violations.push({
        capabilityId: id,
        rule: 'DUPLICATE_ID',
        message: `capability id '${id}' appears more than once in the id list`,
      });
      continue;
    }
    seen.add(id);

    const descriptor: CapabilityDescriptor<Id> | undefined = descriptors[id];
    if (descriptor === undefined) {
      violations.push({
        capabilityId: id,
        rule: 'MISSING_DESCRIPTOR',
        message: `capability id '${id}' has no descriptor in the registry`,
      });
      continue;
    }
    violations.push(...validateDescriptor(id, descriptor));
  }

  for (const key of Object.keys(descriptors)) {
    if (!seen.has(key)) {
      violations.push({
        capabilityId: key,
        rule: 'UNDECLARED_DESCRIPTOR',
        message: `registry carries a descriptor for '${key}', which is not in the id list`,
      });
    }
  }

  return violations;
}

function validateDescriptor<Id extends string>(
  id: Id,
  descriptor: CapabilityDescriptor<Id>,
): readonly RegistryViolation[] {
  const violations: RegistryViolation[] = [];

  if (descriptor.id !== id) {
    violations.push({
      capabilityId: id,
      rule: 'ID_KEY_MISMATCH',
      message: `descriptor keyed '${id}' declares id '${descriptor.id}' — keys and ids are one fact`,
    });
  }

  const deployedEnvironments = Object.entries(descriptor.deployment)
    .filter(([, state]) => state === 'DEPLOYED')
    .map(([environment]) => environment);

  if (descriptor.implementation === 'NOT_IMPLEMENTED' && deployedEnvironments.length > 0) {
    violations.push({
      capabilityId: id,
      rule: 'DEPLOYED_WHILE_NOT_IMPLEMENTED',
      message:
        `descriptor '${id}' is NOT_IMPLEMENTED yet claims DEPLOYED in ` +
        `[${deployedEnvironments.join(', ')}] — missing code cannot be deployed`,
    });
  }

  for (const environment of Object.keys(descriptor.deployment)) {
    if (!isKararEnvironment(environment)) {
      violations.push({
        capabilityId: id,
        rule: 'UNKNOWN_DEPLOYMENT_ENVIRONMENT',
        message: `descriptor '${id}' declares deployment for unknown environment '${environment}'`,
      });
    }
  }

  const jurisdictionSet = new Set(descriptor.declaredJurisdictions);
  if (jurisdictionSet.size !== descriptor.declaredJurisdictions.length) {
    violations.push({
      capabilityId: id,
      rule: 'DUPLICATE_DECLARED_JURISDICTION',
      message: `descriptor '${id}' repeats a declared jurisdiction — the ceiling input is a set`,
    });
  }

  if (
    descriptor.disclosureBearing &&
    descriptor.declaredJurisdictions.length === 0 &&
    descriptor.clientExposure !== 'HIDDEN'
  ) {
    violations.push({
      capabilityId: id,
      rule: 'UNDISCLOSED_EXPOSURE',
      message:
        `descriptor '${id}' is disclosure-bearing with no declared jurisdiction but is not ` +
        `HIDDEN — an uncleared disclosure-bearing capability must not be advertisable`,
    });
  }

  return violations;
}

/** Throwing form for construction-time use: an invalid registry is a defect. */
export function assertValidRegistry<Id extends string>(
  ids: readonly Id[],
  descriptors: Readonly<Record<Id, CapabilityDescriptor<Id>>>,
): void {
  const violations = validateRegistry(ids, descriptors);
  if (violations.length > 0) {
    const lines = violations.map((v) => `  - [${v.rule}] ${v.message}`);
    throw new Error(`capability registry is invalid:\n${lines.join('\n')}`);
  }
}
