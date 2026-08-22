/**
 * THE COLLAPSE, AND THE LINE THE LOCAL FIXTURE DOES NOT CROSS.
 *
 * `capability-gate.test.ts` proves the composed surface refuses. This proves
 * the thing that decides it: that every internal outcome the shared resolver
 * can produce arrives at the financial surface as one of two values, that the
 * denial reason is never so much as READ on the way, and that the local
 * fixture substitutes for a decision nobody has taken without ever
 * substituting for an answer nobody could obtain.
 *
 * THE REASON-READING PROOF IS STRUCTURAL, NOT A PROMISE. The resolutions
 * below carry `gate`, `reason` and `provenance` as getters that THROW. Code
 * that touched any of them — to log it, to branch on it, to pass it on —
 * would fail this suite rather than pass review.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CapabilityAuditTrail,
  NoProvidersConfiguredSource,
  ResolveCapabilityAvailability,
  productionRegistryView,
} from '@karar/capability';
import { Result, TenantId, UserId } from '@karar/shared-kernel';
import { describe, expect, it } from 'vitest';

import type { FinancialPrincipal } from '../financial/principal.js';
import {
  LocalSyntheticCapabilityAvailabilityEnvironmentError,
  LocalSyntheticFinancialCapabilityAvailability,
  ResolvedCapabilityFinancialGate,
  resolveFinancialCapabilityGate,
  type FinancialCapabilityResolution,
} from './financial-capability-gate.js';

const PRINCIPAL: FinancialPrincipal = {
  tenantId: TenantId.of('11111111-1111-4111-8111-111111111111'),
  userId: UserId.of('22222222-2222-4222-8222-222222222222'),
};

const CLOCK = { now: () => new Date('2026-08-19T09:00:00.000Z') };

/** What the resolver was asked, recorded so the question can be asserted on. */
interface Asked {
  readonly calls: unknown[];
}

/**
 * A resolution entry whose outcome is readable and whose every explanatory
 * member detonates. Anything but `capabilityId` and `outcome` is a leak
 * waiting to happen, so reading one here is a test failure.
 */
function entry(capabilityId: string, outcome: 'ALLOWED' | 'DENIED'): unknown {
  const detonate = (member: string) => (): never => {
    throw new Error(`the gate read '${member}' — a denial reason must never leave the resolver`);
  };
  return Object.defineProperties(
    { capabilityId, outcome },
    {
      gate: { get: detonate('gate'), enumerable: false },
      reason: { get: detonate('reason'), enumerable: false },
      provenance: { get: detonate('provenance'), enumerable: false },
      state: { get: detonate('state'), enumerable: false },
    },
  );
}

function resolverReturning(
  resolutions: readonly unknown[],
  asked: Asked = { calls: [] },
): FinancialCapabilityResolution {
  return {
    execute: (input: unknown) => {
      asked.calls.push(input);
      return Promise.resolve(
        Result.ok({
          environment: 'local',
          resolvedAt: CLOCK.now(),
          resolutions,
        }),
      );
    },
  } as unknown as FinancialCapabilityResolution;
}

function resolverFailing(error: { readonly kind: string }): FinancialCapabilityResolution {
  return {
    execute: () => Promise.resolve(Result.err(error)),
  } as unknown as FinancialCapabilityResolution;
}

function resolverThrowing(message: string): FinancialCapabilityResolution {
  return {
    execute: () => Promise.reject(new Error(message)),
  } as unknown as FinancialCapabilityResolution;
}

function resolvedGate(resolution: FinancialCapabilityResolution): ResolvedCapabilityFinancialGate {
  return new ResolvedCapabilityFinancialGate(resolution, CLOCK);
}

describe('the resolved gate collapses every outcome to two values', () => {
  it('an ALLOWED capability opens the surface', async () => {
    const gate = resolvedGate(resolverReturning([entry('TRANSACTIONS', 'ALLOWED')]));
    await expect(gate.decideFor(PRINCIPAL)).resolves.toBe('AVAILABLE');
  });

  it('a DENIED capability refuses, whatever the gate that denied it', async () => {
    // The reason is unreadable by construction here; the point is that the
    // adapter needs only the outcome, so every one of the resolver's eight
    // gates arrives as the same answer.
    const gate = resolvedGate(resolverReturning([entry('TRANSACTIONS', 'DENIED')]));
    await expect(gate.decideFor(PRINCIPAL)).resolves.toBe('UNAVAILABLE');
  });

  it('a resolution that FAILED is not a permission', async () => {
    for (const kind of ['RESOLUTION_FAILED', 'UNKNOWN_CAPABILITY', 'AUDIT_APPEND_FAILED']) {
      const gate = resolvedGate(resolverFailing({ kind }));
      await expect(gate.decideFor(PRINCIPAL), kind).resolves.toBe('UNAVAILABLE');
    }
  });

  it('an answer that does not mention the capability is not an answer', async () => {
    const gate = resolvedGate(resolverReturning([]));
    await expect(gate.decideFor(PRINCIPAL)).resolves.toBe('UNAVAILABLE');
  });

  it('a resolver that threw propagates, so the guard fails closed on it', async () => {
    const gate = resolvedGate(
      resolverThrowing('relation "capability_availability" does not exist'),
    );
    await expect(gate.decideFor(PRINCIPAL)).rejects.toThrow(/capability_availability/);
  });
});

describe('another capability being available unlocks nothing here', () => {
  it('refuses when a different capability is ALLOWED and this one is DENIED', async () => {
    const gate = resolvedGate(
      resolverReturning([entry('BUDGETS', 'ALLOWED'), entry('TRANSACTIONS', 'DENIED')]),
    );
    await expect(gate.decideFor(PRINCIPAL)).resolves.toBe('UNAVAILABLE');
  });

  it('refuses when a different capability is ALLOWED and this one is absent', async () => {
    const gate = resolvedGate(
      resolverReturning([entry('BUDGETS', 'ALLOWED'), entry('ZAKAT', 'ALLOWED')]),
    );
    await expect(gate.decideFor(PRINCIPAL)).resolves.toBe('UNAVAILABLE');
  });
});

describe('the question asked of the resolver', () => {
  it('names the session principal, this capability, and no environment', async () => {
    const asked: Asked = { calls: [] };
    await resolvedGate(resolverReturning([entry('TRANSACTIONS', 'ALLOWED')], asked)).decideFor(
      PRINCIPAL,
    );
    expect(asked.calls).toHaveLength(1);
    const input = asked.calls[0] as Record<string, unknown>;
    expect(input['subject']).toEqual({
      tenantId: PRINCIPAL.tenantId,
      userId: PRINCIPAL.userId,
    });
    expect(input['capabilityIds']).toEqual(['TRANSACTIONS']);
    // The resolver binds its environment at construction. A field here would
    // be a place a request could eventually reach.
    expect(Object.keys(input).sort()).toEqual(['capabilityIds', 'now', 'subject']);
  });
});

describe('the local synthetic availability fixture', () => {
  it('refuses to exist outside local, in every deployed environment', () => {
    for (const env of ['dev', 'staging', 'production']) {
      expect(
        () =>
          new LocalSyntheticFinancialCapabilityAvailability(
            resolvedGate(resolverReturning([entry('TRANSACTIONS', 'DENIED')])),
            { env },
          ),
        env,
      ).toThrow(LocalSyntheticCapabilityAvailabilityEnvironmentError);
    }
  });

  it('substitutes for a resolved denial — the decision nobody has taken', async () => {
    const fixture = new LocalSyntheticFinancialCapabilityAvailability(
      resolvedGate(resolverReturning([entry('TRANSACTIONS', 'DENIED')])),
      { env: 'local' },
    );
    await expect(fixture.decideFor(PRINCIPAL)).resolves.toBe('AVAILABLE');
  });

  it('never substitutes for a resolution that FAILED — the answer nobody could obtain', async () => {
    const fixture = new LocalSyntheticFinancialCapabilityAvailability(
      resolvedGate(resolverFailing({ kind: 'RESOLUTION_FAILED' })),
      { env: 'local' },
    );
    await expect(fixture.decideFor(PRINCIPAL)).resolves.toBe('UNAVAILABLE');
  });

  it('never substitutes for a resolver that threw', async () => {
    const fixture = new LocalSyntheticFinancialCapabilityAvailability(
      resolvedGate(resolverThrowing('the availability store is unreachable')),
      { env: 'local' },
    );
    await expect(fixture.decideFor(PRINCIPAL)).rejects.toThrow(/unreachable/);
  });

  it('passes an ALLOWED capability through unchanged', async () => {
    const fixture = new LocalSyntheticFinancialCapabilityAvailability(
      resolvedGate(resolverReturning([entry('TRANSACTIONS', 'ALLOWED')])),
      { env: 'local' },
    );
    await expect(fixture.decideFor(PRINCIPAL)).resolves.toBe('AVAILABLE');
  });

  it('runs the real resolution on every request rather than short-circuiting it', async () => {
    const asked: Asked = { calls: [] };
    const fixture = new LocalSyntheticFinancialCapabilityAvailability(
      resolvedGate(resolverReturning([entry('TRANSACTIONS', 'DENIED')], asked)),
      { env: 'local' },
    );
    await fixture.decideFor(PRINCIPAL);
    await fixture.decideFor(PRINCIPAL);
    expect(asked.calls).toHaveLength(2);
  });
});

describe('resolveFinancialCapabilityGate', () => {
  it('gives a deployed environment the resolved gate and nothing else', async () => {
    for (const env of ['dev', 'staging', 'production']) {
      const gate = resolveFinancialCapabilityGate({
        env,
        resolution: resolverReturning([entry('TRANSACTIONS', 'DENIED')]),
        clock: CLOCK,
      });
      expect(gate, env).toBeInstanceOf(ResolvedCapabilityFinancialGate);
      // The state of the world today: nothing is implemented, nothing is
      // deployed and no pack clears anything, so a deployed environment
      // serves no financial route at all.
      await expect(gate.decideFor(PRINCIPAL), env).resolves.toBe('UNAVAILABLE');
    }
  });

  it('gives local the labelled fixture', () => {
    const gate = resolveFinancialCapabilityGate({
      env: 'local',
      resolution: resolverReturning([entry('TRANSACTIONS', 'DENIED')]),
      clock: CLOCK,
    });
    expect(gate).toBeInstanceOf(LocalSyntheticFinancialCapabilityAvailability);
  });

  it('has no third branch a flag could reach', () => {
    // An environment string nobody recognises is a deployed one as far as
    // this seam is concerned: it gets the resolved gate, never the fixture.
    const gate = resolveFinancialCapabilityGate({
      env: 'LOCAL',
      resolution: resolverReturning([entry('TRANSACTIONS', 'DENIED')]),
      clock: CLOCK,
    });
    expect(gate).toBeInstanceOf(ResolvedCapabilityFinancialGate);
  });
});

describe('over the REAL resolver and the REVIEWED registry', () => {
  /**
   * The resolver as the composition root builds it — the real gate engine,
   * the real production registry — over ports representing the world as it
   * actually is: no jurisdiction assignment, no availability row, no
   * entitlement, no provider. Nothing here is a stand-in for the DECISION;
   * only for the stores it would be read from.
   */
  function realResolution(): FinancialCapabilityResolution {
    const noRows = {
      factsFor: () => Promise.resolve({ kind: 'NO_ROW', existsForOtherEnvironment: false }),
    };
    const noEntitlement = { factsFor: () => Promise.resolve({ kind: 'NONE' }) };
    const noConsent = { statusFor: () => Promise.resolve({ kind: 'NOT_EVALUATED' }) };
    const noLicences = { licensingContextFor: () => Promise.resolve({ kind: 'NOT_EVALUATED' }) };
    const auditNeverCalled = {
      execute: () => {
        throw new Error('the read path must not append an audit record');
      },
    };
    return new ResolveCapabilityAvailability(
      productionRegistryView(),
      'local',
      { effectivePolicyFor: () => Promise.resolve({ kind: 'NO_ASSIGNMENT' as const }) },
      noRows as never,
      noEntitlement as never,
      noConsent as never,
      noLicences as never,
      new NoProvidersConfiguredSource(),
      new CapabilityAuditTrail(auditNeverCalled as never, 'local'),
    ) as unknown as FinancialCapabilityResolution;
  }

  it('refuses the surface, because the reviewed registry says the code is unbuilt', async () => {
    // No configuration reaches gate 1. This is the answer every DEPLOYED
    // environment gets today, produced by the real engine rather than asserted.
    await expect(resolvedGate(realResolution()).decideFor(PRINCIPAL)).resolves.toBe('UNAVAILABLE');
  });

  it('leaves the surface reachable in local, through the labelled fixture', async () => {
    // The reason the local suite and a developer's machine still have twenty-
    // seven working operations, and the only place that is true.
    const fixture = new LocalSyntheticFinancialCapabilityAvailability(
      resolvedGate(realResolution()),
      { env: 'local' },
    );
    await expect(fixture.decideFor(PRINCIPAL)).resolves.toBe('AVAILABLE');
  });
});

describe('the fixture leaves the policy packs alone', () => {
  const SOURCE = readFileSync(path.join(__dirname, 'financial-capability-gate.ts'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('imports no policy pack and touches no jurisdiction registry', () => {
    // Unblocking a route by editing `qa/v1` would forge the clearance rather
    // than obtain it. The fixture cannot do that from here: it does not know
    // the packs exist.
    expect(SOURCE).not.toContain('@karar/jurisdiction-policy');
    expect(SOURCE).not.toContain('POLICY_PACKS');
    expect(SOURCE).not.toContain('qa/v1');
  });

  it('claims no deployment and no implementation for anything', () => {
    // Nothing here writes a descriptor fact. The reviewed registry keeps
    // saying the capability is unbuilt and deployed nowhere.
    expect(SOURCE).not.toContain('DEPLOYED');
    expect(SOURCE).not.toContain('IMPLEMENTED');
  });
});
