/**
 * CapabilityRegistryView — the registry as the resolver consumes it,
 * generic over the id type. Tests construct views over their own synthetic
 * id types ('TEST_SYNTH' etc.) to exercise POSITIVE paths; production code
 * uses `productionRegistryView()`, which binds the reviewed
 * CAPABILITY_REGISTRY and validates it at construction.
 *
 * The synthetic/production separation is enforced where it matters: the
 * WRITE use cases validate every capability id against the view they were
 * constructed with — and the composition root constructs them with the
 * production view only — while the canonical migrations CHECK-constrain the
 * same closed production set, so a synthetic id can never reach a database
 * row regardless of construction mistakes.
 */

import {
  CAPABILITY_IDS,
  CAPABILITY_REGISTRY,
  assertValidRegistry,
  type CapabilityDescriptor,
  type CapabilityId,
  type KararEnvironment,
} from '@karar/capability-registry';

import type { DescriptorFacts } from '../domain/resolution.js';
import type { ClientExposureFacts } from '../domain/client-view.js';

export interface CapabilityRegistryView<Id extends string> {
  readonly ids: readonly Id[];
  readonly descriptors: Readonly<Record<Id, CapabilityDescriptor<Id>>>;
}

export function registryView<Id extends string>(
  ids: readonly Id[],
  descriptors: Readonly<Record<Id, CapabilityDescriptor<Id>>>,
): CapabilityRegistryView<Id> {
  assertValidRegistry(ids, descriptors);
  return { ids, descriptors };
}

/** The production registry, validated. The only view composition roots use. */
export function productionRegistryView(): CapabilityRegistryView<CapabilityId> {
  return registryView(CAPABILITY_IDS, CAPABILITY_REGISTRY);
}

export function descriptorFactsFor<Id extends string>(
  descriptor: CapabilityDescriptor<Id>,
  environment: KararEnvironment,
): DescriptorFacts {
  return {
    implemented: descriptor.implementation === 'IMPLEMENTED',
    deployedInEnvironment: descriptor.deployment[environment] === 'DEPLOYED',
    declaredScopeRefs: descriptor.declaredJurisdictions,
  };
}

export function clientExposureFactsFor<Id extends string>(
  descriptor: CapabilityDescriptor<Id>,
): ClientExposureFacts {
  return {
    hidden: descriptor.clientExposure === 'HIDDEN',
    providerPendingExplainable: descriptor.providerPendingExplainable === true,
  };
}
