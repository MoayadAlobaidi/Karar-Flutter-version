/**
 * The write paths: authorization (declared-but-unseeded permissions deny),
 * the ABOVE_CEILING refusal with its audited DENIED event, id validation
 * against the PRODUCTION registry (synthetic ids can never reach a row),
 * optimistic versioning, and the audit trail on every successful change.
 */

import { describe, expect, it } from 'vitest';

import { CAPABILITY_REGISTRY, CAPABILITY_IDS } from '@karar/capability-registry';

import { SetCapabilityAvailability } from '../application/use-cases/manage-availability.js';
import {
  GrantTenantCapabilityEntitlement,
  RevokeTenantCapabilityEntitlement,
} from '../application/use-cases/manage-entitlements.js';
import { productionRegistryView, registryView } from '../application/registry-view.js';
import { InvalidCapabilityInputError } from '../application/errors.js';
import type { PolicyService } from '../application/ports/policy-service.js';
import {
  AllowAllPolicyService,
  DenyAllPolicyService,
  InMemoryAvailabilityRepository,
  InMemoryEntitlementRepository,
  SequentialIdSource,
  recordingAuditTrail,
} from './fakes/gate-fakes.js';
import { NOW, SCOPE, subject, synthDescriptor, type SynthId } from './fakes/synthetic-fixtures.js';

const operator = { principalRef: 'staff:test-operator', tenantRef: null };

function availabilityHarness(policy: PolicyService = new AllowAllPolicyService()) {
  const rows = new InMemoryAvailabilityRepository();
  const { trail, events } = recordingAuditTrail();
  const useCase = new SetCapabilityAvailability(
    productionRegistryView(),
    rows,
    policy,
    new SequentialIdSource(),
    trail,
  );
  return { useCase, rows, events };
}

describe('SetCapabilityAvailability', () => {
  it('denies when the permission is unseeded — absence denies', async () => {
    const { useCase, rows } = availabilityHarness(new DenyAllPolicyService());
    const result = await useCase.execute({
      principal: operator,
      environment: 'local',
      jurisdictionRef: null,
      capabilityId: 'TRANSACTIONS',
      state: 'DISABLED',
      reason: 'test',
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('AUTHORIZATION_DENIED');
      if (result.error.kind === 'AUTHORIZATION_DENIED') {
        expect(result.error.permission).toBe('capability.availability.manage');
      }
    }
    expect(rows.rows).toHaveLength(0);
  });

  it('refuses an allowing state for NOT_IMPLEMENTED code and audits the refusal as DENIED', async () => {
    const { useCase, rows, events } = availabilityHarness();
    const result = await useCase.execute({
      principal: operator,
      environment: 'local',
      jurisdictionRef: null,
      capabilityId: 'AMANAT',
      state: 'AVAILABLE',
      reason: 'attempted expansion',
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ABOVE_CEILING');
    expect(rows.rows).toHaveLength(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.outcome).toBe('DENIED');
    expect(events[0]?.action).toBe('capability.availability.set');
  });

  it('refuses an allowing state for EVERY production capability — none is built', async () => {
    for (const id of CAPABILITY_IDS) {
      const { useCase } = availabilityHarness();
      const result = await useCase.execute({
        principal: operator,
        environment: 'local',
        jurisdictionRef: null,
        capabilityId: id,
        state: 'AVAILABLE',
        reason: 'attempted expansion',
        now: NOW,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('ABOVE_CEILING');
      // The refusal holds for every capability, but NOT for the same reason.
      // TRANSACTIONS is built, so its ceiling breach comes from the deployment
      // arm rather than the implementation arm — and that is the point: being
      // built buys nothing. Asserting the ARM proves the refusal; restating the
      // registry would only prove the registry.
      expect({ id, deployed: Object.keys(CAPABILITY_REGISTRY[id].deployment) }).toEqual({
        id,
        deployed: [],
      });
    }
  });

  it('refuses TRANSACTIONS on the DEPLOYMENT arm, now that it is built', async () => {
    const { useCase } = availabilityHarness();
    const result = await useCase.execute({
      principal: operator,
      environment: 'local',
      jurisdictionRef: null,
      capabilityId: 'TRANSACTIONS',
      state: 'AVAILABLE',
      reason: 'attempted expansion',
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ABOVE_CEILING');
    expect(CAPABILITY_REGISTRY.TRANSACTIONS.implementation).toBe('IMPLEMENTED');
    expect(CAPABILITY_REGISTRY.TRANSACTIONS.deployment).toEqual({});
  });

  it('refuses an allowing state for an undeclared jurisdiction even when code is built', async () => {
    const rows = new InMemoryAvailabilityRepository();
    const { trail } = recordingAuditTrail();
    const built = registryView<SynthId>(['TEST_SYNTH', 'TEST_HIDDEN'], {
      TEST_SYNTH: synthDescriptor('TEST_SYNTH'),
      TEST_HIDDEN: synthDescriptor('TEST_HIDDEN'),
    });
    const useCase = new SetCapabilityAvailability(
      built,
      rows,
      new AllowAllPolicyService(),
      new SequentialIdSource(),
      trail,
    );
    const undeclared = await useCase.execute({
      principal: operator,
      environment: 'local',
      jurisdictionRef: 'jurisdiction:elsewhere',
      capabilityId: 'TEST_SYNTH',
      state: 'AVAILABLE',
      reason: 'attempted expansion beyond declaredJurisdictions',
      now: NOW,
    });
    expect(undeclared.ok).toBe(false);
    if (!undeclared.ok) expect(undeclared.error.kind).toBe('ABOVE_CEILING');

    const declared = await useCase.execute({
      principal: operator,
      environment: 'local',
      jurisdictionRef: SCOPE,
      capabilityId: 'TEST_SYNTH',
      state: 'AVAILABLE',
      reason: 'declared and deployed',
      now: NOW,
    });
    expect(declared.ok).toBe(true);
  });

  it('always permits RESTRICTIVE states — restricting needs no clearance', async () => {
    const { useCase, rows, events } = availabilityHarness();
    const result = await useCase.execute({
      principal: operator,
      environment: 'production',
      jurisdictionRef: SCOPE,
      capabilityId: 'ZAKAT',
      state: 'PENDING_LEGAL_REVIEW',
      reason: 'no Sharia review exists',
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.version).toBe(1);
    expect(rows.rows).toHaveLength(1);
    expect(events.filter((e) => e.outcome === 'SUCCESS')).toHaveLength(1);
  });

  it('rejects an unregistered id — synthetic ids never reach a row', async () => {
    const { useCase, rows } = availabilityHarness();
    const result = await useCase.execute({
      principal: operator,
      environment: 'local',
      jurisdictionRef: null,
      capabilityId: 'TEST_SYNTH',
      state: 'DISABLED',
      reason: 'test',
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('UNKNOWN_CAPABILITY');
    expect(rows.rows).toHaveLength(0);
  });

  it('rejects an unknown environment as a defect', async () => {
    const { useCase } = availabilityHarness();
    await expect(
      useCase.execute({
        principal: operator,
        environment: 'prod',
        jurisdictionRef: null,
        capabilityId: 'ZAKAT',
        state: 'DISABLED',
        reason: 'test',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(InvalidCapabilityInputError);
  });

  it('requires expectedVersion to change an existing row, and detects a stale one', async () => {
    const { useCase } = availabilityHarness();
    const base = {
      principal: operator,
      environment: 'local' as const,
      jurisdictionRef: null,
      capabilityId: 'GOALS',
      reason: 'test',
      now: NOW,
    };
    const created = await useCase.execute({ ...base, state: 'DISABLED' });
    expect(created.ok).toBe(true);

    const noVersion = await useCase.execute({ ...base, state: 'PENDING_PROVIDER' });
    expect(noVersion.ok).toBe(false);
    if (!noVersion.ok) expect(noVersion.error.kind).toBe('ALREADY_EXISTS');

    const stale = await useCase.execute({
      ...base,
      state: 'PENDING_PROVIDER',
      expectedVersion: 7,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.kind).toBe('VERSION_CONFLICT');

    const fresh = await useCase.execute({
      ...base,
      state: 'PENDING_PROVIDER',
      expectedVersion: 1,
    });
    expect(fresh.ok).toBe(true);
    if (fresh.ok) expect(fresh.value.version).toBe(2);
  });
});

describe('Grant/RevokeTenantCapabilityEntitlement', () => {
  function entitlementHarness(policy: PolicyService = new AllowAllPolicyService()) {
    const store = new InMemoryEntitlementRepository();
    const { trail, events } = recordingAuditTrail();
    const registry = productionRegistryView();
    return {
      grant: new GrantTenantCapabilityEntitlement(
        registry,
        store,
        policy,
        new SequentialIdSource(),
        trail,
      ),
      revoke: new RevokeTenantCapabilityEntitlement(registry, store, policy, trail),
      store,
      events,
    };
  }

  const who = subject();
  const context = { tenantId: who.tenantId, userId: who.userId };

  it('denies when the permission is unseeded', async () => {
    const { grant, store } = entitlementHarness(new DenyAllPolicyService());
    const result = await grant.execute({
      principal: operator,
      context,
      capabilityId: 'BUDGETS',
      sourceRef: 'operator:test',
      reason: 'test',
      effectiveFrom: NOW,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('AUTHORIZATION_DENIED');
    expect(store.rows).toHaveLength(0);
  });

  it('rejects a synthetic id — entitlements exist only for the production registry', async () => {
    const { grant, store } = entitlementHarness();
    const result = await grant.execute({
      principal: operator,
      context,
      capabilityId: 'TEST_SYNTH',
      sourceRef: 'operator:test',
      reason: 'test',
      effectiveFrom: NOW,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('UNKNOWN_CAPABILITY');
    expect(store.rows).toHaveLength(0);
  });

  it('grants, versions, and audits; a re-grant transitions the same row', async () => {
    const { grant, store, events } = entitlementHarness();
    const first = await grant.execute({
      principal: operator,
      context,
      capabilityId: 'INSIGHTS',
      sourceRef: 'operator:test',
      reason: 'initial grant',
      effectiveFrom: NOW,
      now: NOW,
    });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.version).toBe(1);

    const second = await grant.execute({
      principal: operator,
      context,
      capabilityId: 'INSIGHTS',
      sourceRef: 'operator:test-2',
      reason: 'extended',
      effectiveFrom: NOW,
      now: NOW,
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.version).toBe(2);
    expect(store.rows).toHaveLength(1);
    expect(events.filter((e) => e.action === 'capability.entitlement.grant')).toHaveLength(2);
  });

  it('revokes by status with a recorded end, never by deleting the row', async () => {
    const { grant, revoke, store, events } = entitlementHarness();
    await grant.execute({
      principal: operator,
      context,
      capabilityId: 'GOALS',
      sourceRef: 'operator:test',
      reason: 'initial grant',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      now: NOW,
    });
    const revoked = await revoke.execute({
      principal: operator,
      context,
      capabilityId: 'GOALS',
      reason: 'withdrawn',
      now: NOW,
    });
    expect(revoked.ok).toBe(true);
    if (revoked.ok) {
      expect(revoked.value.status).toBe('REVOKED');
      expect(revoked.value.effectiveTo).toEqual(NOW);
      expect(revoked.value.version).toBe(2);
    }
    expect(store.rows).toHaveLength(1);
    expect(events.filter((e) => e.action === 'capability.entitlement.revoke')).toHaveLength(1);
  });

  it('reports NOT_FOUND when revoking an entitlement that never existed', async () => {
    const { revoke } = entitlementHarness();
    const result = await revoke.execute({
      principal: operator,
      context,
      capabilityId: 'AI_ADVISOR',
      reason: 'withdrawn',
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NOT_FOUND');
  });

  it('rejects an inverted effective window as a defect', async () => {
    const { grant } = entitlementHarness();
    await expect(
      grant.execute({
        principal: operator,
        context,
        capabilityId: 'ZAKAT',
        sourceRef: 'operator:test',
        reason: 'test',
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-02-01T00:00:00.000Z'),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(InvalidCapabilityInputError);
  });
});
