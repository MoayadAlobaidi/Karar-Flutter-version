/**
 * Synthetic registry, pack-ceiling, and entitlement fixtures. The ids
 * ('TEST_SYNTH', 'TEST_HIDDEN') exist ONLY inside tests: the production
 * union, the production registry, client output, and database rows never
 * carry them (the write use cases validate against the production registry
 * and the migrations CHECK-constrain the closed set). Positive availability
 * is exercised HERE, over these fixtures — never over a real capability,
 * every one of which is honestly NOT_IMPLEMENTED.
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import { jurisdictionId } from '@karar/jurisdiction-policy';
import type { CapabilityDescriptor } from '@karar/capability-registry';

import type { TenantCapabilityEntitlement } from '../../domain/entitlement.js';
import type {
  CeilingFacts,
  ClearedCapabilityFacts,
} from '../../domain/resolution.js';
import type { CapabilityAvailabilityRecord } from '../../domain/availability-state.js';
import { registryView, type CapabilityRegistryView } from '../../application/registry-view.js';
import type { ResolutionSubject } from '../../application/use-cases/resolve-capability-availability.js';

export type SynthId = 'TEST_SYNTH' | 'TEST_HIDDEN';

export const SCOPE = 'jurisdiction:qa';
export const OTHER_SCOPE = 'jurisdiction:elsewhere';
export const NOW = new Date('2026-08-16T12:00:00.000Z');

export function synthDescriptor(
  id: SynthId,
  overrides: Partial<CapabilityDescriptor<SynthId>> = {},
): CapabilityDescriptor<SynthId> {
  return {
    id,
    lifecycle: 'BETA',
    implementation: 'IMPLEMENTED',
    deployment: { local: 'DEPLOYED' },
    declaredJurisdictions: [jurisdictionId(SCOPE)],
    disclosureBearing: false,
    clientExposure: id === 'TEST_HIDDEN' ? 'HIDDEN' : 'ACTIONABLE',
    ...overrides,
  };
}

export function synthRegistry(
  overrides: Partial<Record<SynthId, Partial<CapabilityDescriptor<SynthId>>>> = {},
): CapabilityRegistryView<SynthId> {
  return registryView<SynthId>(
    ['TEST_SYNTH', 'TEST_HIDDEN'],
    {
      TEST_SYNTH: synthDescriptor('TEST_SYNTH', overrides.TEST_SYNTH ?? {}),
      TEST_HIDDEN: synthDescriptor('TEST_HIDDEN', overrides.TEST_HIDDEN ?? {}),
    },
  );
}

export function clearedFacts(
  capabilityId: string,
  overrides: Partial<ClearedCapabilityFacts> = {},
): ClearedCapabilityFacts {
  return {
    capabilityId,
    resolutionStrategyRef: 'strategy:platform-default',
    requiresVerifiedAssignment: false,
    processingBasis: { kind: 'DECLARED_BASIS', basisRef: 'basis:contract-performance' },
    requiredLicenceTypeRefs: [],
    requiredProviderKinds: [],
    ...overrides,
  };
}

export function resolvedCeiling(
  cleared: readonly ClearedCapabilityFacts[],
  overrides: Partial<Extract<CeilingFacts, { kind: 'RESOLVED' }>> = {},
): CeilingFacts {
  return {
    kind: 'RESOLVED',
    scopeRef: SCOPE,
    assignmentVerified: true,
    packVersionRef: 'pack:test-qa/1.0.0',
    cleared,
    ...overrides,
  };
}

export function availabilityRow(
  overrides: Partial<CapabilityAvailabilityRecord> = {},
): CapabilityAvailabilityRecord {
  return {
    id: '00000000-0000-7000-8000-00000000a001',
    environment: 'local',
    jurisdictionRef: SCOPE,
    capabilityId: 'TEST_SYNTH',
    state: 'AVAILABLE',
    reason: 'test fixture',
    actorRef: 'staff:test-operator',
    version: 1,
    ...overrides,
  };
}

export function subject(): ResolutionSubject & { userId: UserId } {
  return {
    tenantId: TenantId.of('11111111-1111-4111-8111-111111111111'),
    userId: UserId.of('22222222-2222-4222-8222-222222222222'),
  };
}

export function entitlementRow(
  tenantId: TenantId,
  overrides: Partial<TenantCapabilityEntitlement> = {},
): TenantCapabilityEntitlement {
  return {
    id: '00000000-0000-7000-8000-00000000e001',
    tenantId,
    capabilityId: 'TEST_SYNTH',
    status: 'ACTIVE',
    sourceRef: 'operator:test',
    reason: 'test fixture',
    actorRef: 'staff:test-operator',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    version: 1,
    ...overrides,
  };
}
