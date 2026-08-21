/**
 * The production registry's binding facts, and the validator's behaviour on
 * both the real registry and deliberately-broken synthetic ones.
 *
 * The synthetic ids used here ('TEST_SYNTH', …) exist only inside these
 * tests: they never enter CAPABILITY_IDS, CAPABILITY_REGISTRY, client
 * output, or database rows (the canonical migrations CHECK-constrain the
 * closed production set, and the capability module's write paths validate
 * against the production registry).
 */

import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_IDS,
  CAPABILITY_REGISTRY,
  KARAR_ENVIRONMENTS,
  assertValidRegistry,
  isCapabilityId,
  isKararEnvironment,
  validateRegistry,
  type CapabilityDescriptor,
} from './index';

describe('production registry facts', () => {
  it('holds exactly the seven reviewed capabilities — FUNDRAISING is deliberately absent', () => {
    expect([...CAPABILITY_IDS]).toEqual([
      'TRANSACTIONS',
      'BUDGETS',
      'GOALS',
      'INSIGHTS',
      'AI_ADVISOR',
      'ZAKAT',
      'AMANAT',
    ]);
    expect(isCapabilityId('FUNDRAISING')).toBe(false);
    expect(isCapabilityId('TEST_SYNTH')).toBe(false);
    expect(Object.keys(CAPABILITY_REGISTRY).sort()).toEqual([...CAPABILITY_IDS].sort());
  });

  it('deploys NOTHING, whatever a capability claims about its own code', () => {
    // The load-bearing half, and it is asserted over EVERY id without
    // exception: `implementation` is a fact about this repository, and
    // `deployment` is the field that decides anything. One capability is now
    // built; none is deployed.
    for (const id of CAPABILITY_IDS) {
      const descriptor = CAPABILITY_REGISTRY[id];
      expect(descriptor.id).toBe(id);
      expect(Object.keys(descriptor.deployment)).toEqual([]);
      expect(descriptor.declaredJurisdictions).toEqual([]);
      expect(descriptor.providerPendingExplainable).toBeUndefined();
    }
  });

  it('says TRANSACTIONS is built, because its code exists', () => {
    // Seven bounded contexts behind migrations 0087-0101, 27 mounted
    // operations, seven Flutter feature folders calling them. `implementation`
    // asks whether the code exists and nothing else, so NOT_IMPLEMENTED here
    // was a false answer rather than a conservative one.
    const transactions = CAPABILITY_REGISTRY.TRANSACTIONS;
    expect(transactions.implementation).toBe('IMPLEMENTED');
    expect(transactions.lifecycle).toBe('ALPHA');
    // …and being built buys it nothing. Both of these are what actually deny.
    expect(Object.keys(transactions.deployment)).toEqual([]);
    expect(transactions.declaredJurisdictions).toEqual([]);
    // The registry is still structurally valid with a built capability in it.
    expect(validateRegistry(CAPABILITY_IDS, CAPABILITY_REGISTRY)).toEqual([]);
  });

  it('keeps every OTHER capability honestly unbuilt', () => {
    for (const id of CAPABILITY_IDS.filter((candidate) => candidate !== 'TRANSACTIONS')) {
      expect({ id, implementation: CAPABILITY_REGISTRY[id].implementation }).toEqual({
        id,
        implementation: 'NOT_IMPLEMENTED',
      });
      expect(CAPABILITY_REGISTRY[id].lifecycle).toBe('PLANNED');
    }
  });

  it('keeps AMANAT undeclared, disclosure-bearing, and HIDDEN', () => {
    const amanat = CAPABILITY_REGISTRY.AMANAT;
    expect(amanat.declaredJurisdictions).toEqual([]);
    expect(amanat.disclosureBearing).toBe(true);
    expect(amanat.clientExposure).toBe('HIDDEN');
  });

  it('passes structural validation', () => {
    expect(validateRegistry(CAPABILITY_IDS, CAPABILITY_REGISTRY)).toEqual([]);
    expect(() => assertValidRegistry(CAPABILITY_IDS, CAPABILITY_REGISTRY)).not.toThrow();
  });

  it('names the four environments, exactly', () => {
    expect([...KARAR_ENVIRONMENTS]).toEqual(['local', 'dev', 'staging', 'production']);
    expect(isKararEnvironment('production')).toBe(true);
    expect(isKararEnvironment('prod')).toBe(false);
    expect(isKararEnvironment('')).toBe(false);
  });
});

type SynthId = 'TEST_SYNTH' | 'TEST_OTHER';

function synthDescriptor(
  id: SynthId,
  overrides: Partial<CapabilityDescriptor<SynthId>> = {},
): CapabilityDescriptor<SynthId> {
  return {
    id,
    lifecycle: 'PLANNED',
    implementation: 'NOT_IMPLEMENTED',
    deployment: {},
    declaredJurisdictions: [],
    disclosureBearing: false,
    clientExposure: 'ACTIONABLE',
    ...overrides,
  };
}

describe('validateRegistry over synthetic registries', () => {
  it('accepts a coherent synthetic registry, including an IMPLEMENTED + DEPLOYED one', () => {
    const ids = ['TEST_SYNTH'] as const;
    const registry = {
      TEST_SYNTH: synthDescriptor('TEST_SYNTH', {
        implementation: 'IMPLEMENTED',
        deployment: { local: 'DEPLOYED' },
      }),
    } as const;
    expect(validateRegistry(ids, registry as never)).toEqual([]);
  });

  it('rejects duplicate ids', () => {
    const ids: readonly SynthId[] = ['TEST_SYNTH', 'TEST_SYNTH'];
    const registry = { TEST_SYNTH: synthDescriptor('TEST_SYNTH') };
    const violations = validateRegistry(ids, registry as never);
    expect(violations.map((v) => v.rule)).toContain('DUPLICATE_ID');
  });

  it('rejects a descriptor whose id disagrees with its key', () => {
    const ids: readonly SynthId[] = ['TEST_SYNTH'];
    const registry = { TEST_SYNTH: synthDescriptor('TEST_OTHER') };
    const violations = validateRegistry(ids, registry as never);
    expect(violations.map((v) => v.rule)).toContain('ID_KEY_MISMATCH');
  });

  it('rejects a missing descriptor and an undeclared one', () => {
    const ids: readonly SynthId[] = ['TEST_SYNTH'];
    const registry = { TEST_OTHER: synthDescriptor('TEST_OTHER') };
    const rules = validateRegistry(ids, registry as never).map((v) => v.rule);
    expect(rules).toContain('MISSING_DESCRIPTOR');
    expect(rules).toContain('UNDECLARED_DESCRIPTOR');
  });

  it('rejects DEPLOYED anywhere while NOT_IMPLEMENTED — no configuration deploys missing code', () => {
    const ids: readonly SynthId[] = ['TEST_SYNTH'];
    const registry = {
      TEST_SYNTH: synthDescriptor('TEST_SYNTH', { deployment: { production: 'DEPLOYED' } }),
    };
    const violations = validateRegistry(ids, registry as never);
    expect(violations.map((v) => v.rule)).toContain('DEPLOYED_WHILE_NOT_IMPLEMENTED');
  });

  it('rejects unknown deployment environments and duplicated declared jurisdictions', () => {
    const ids: readonly SynthId[] = ['TEST_SYNTH'];
    const registry = {
      TEST_SYNTH: synthDescriptor('TEST_SYNTH', {
        implementation: 'IMPLEMENTED',
        deployment: { prod: 'DEPLOYED' } as never,
        declaredJurisdictions: ['qa', 'qa'] as never,
      }),
    };
    const rules = validateRegistry(ids, registry as never).map((v) => v.rule);
    expect(rules).toContain('UNKNOWN_DEPLOYMENT_ENVIRONMENT');
    expect(rules).toContain('DUPLICATE_DECLARED_JURISDICTION');
  });

  it('rejects a disclosure-bearing, jurisdiction-less descriptor that is not HIDDEN (the Amanat rule)', () => {
    const ids: readonly SynthId[] = ['TEST_SYNTH'];
    const registry = {
      TEST_SYNTH: synthDescriptor('TEST_SYNTH', { disclosureBearing: true }),
    };
    const violations = validateRegistry(ids, registry as never);
    expect(violations.map((v) => v.rule)).toContain('UNDISCLOSED_EXPOSURE');

    const hidden = {
      TEST_SYNTH: synthDescriptor('TEST_SYNTH', {
        disclosureBearing: true,
        clientExposure: 'HIDDEN',
      }),
    };
    expect(validateRegistry(ids, hidden as never)).toEqual([]);
  });

  it('assertValidRegistry throws with every violation named', () => {
    const ids: readonly SynthId[] = ['TEST_SYNTH'];
    const registry = {
      TEST_SYNTH: synthDescriptor('TEST_SYNTH', { deployment: { local: 'DEPLOYED' } }),
    };
    expect(() => assertValidRegistry(ids, registry as never)).toThrow(
      /DEPLOYED_WHILE_NOT_IMPLEMENTED/,
    );
  });
});

describe('production registry immutability', () => {
  it('freezes every descriptor, so no in-process code can rewrite exposure', () => {
    for (const id of CAPABILITY_IDS) {
      expect(Object.isFrozen(CAPABILITY_REGISTRY[id])).toBe(true);
    }
  });

  it('keeps AMANAT hidden even when a caller tries to overwrite it', () => {
    const amanat = CAPABILITY_REGISTRY.AMANAT as { clientExposure: string };
    try {
      amanat.clientExposure = 'ACTIONABLE';
    } catch {
      // Strict mode throws; non-strict silently ignores. Either is acceptable —
      // what matters is the value below.
    }
    expect(CAPABILITY_REGISTRY.AMANAT.clientExposure).toBe('HIDDEN');
  });
});
