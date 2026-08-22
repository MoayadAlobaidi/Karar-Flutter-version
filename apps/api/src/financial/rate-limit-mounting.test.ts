/**
 * Every mounted financial operation is rate-limited, and no route can become
 * unlimited by omission.
 *
 * The routes are enumerated from Nest's OWN route metadata — the same metadata
 * the router dispatches on — rather than from a list somebody maintains or from
 * URL strings. A list drifts the day a handler is added; a URL pattern drifts
 * the day a path suffix changes; the metadata cannot drift from the router,
 * because it IS the router's input.
 *
 * ORDER IS PART OF THE CONTROL. The guards are asserted with `toEqual` on the
 * array rather than `toContain`, because `[capability, rateLimit]` and
 * `[rateLimit, capability]` are different security properties: the first
 * refuses an unavailable capability before spending a budget on it and before a
 * 429 can say anything about availability; the second does not.
 */

import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { testRateLimits } from './__test-rate-limits.js';
import { FINANCIAL_CAPABILITY_GATE, type FinancialCapabilityGate } from './capability-gate.js';
import { FinancialCapabilityGuard } from './capability.guard.js';
import { FinancialApiModule } from './financial.module.js';
import { FINANCIAL_RATE_LIMIT_POLICIES, policyForHandler } from './rate-limit-policies.js';
import { FINANCIAL_RATE_LIMITS } from './rate-limit-port.js';
import { FinancialRateLimitGuard } from './rate-limit.guard.js';
import type { FinancialUseCases } from './use-cases.js';

/**
 * Nest's own metadata keys. Hardcoded for the same reason the capability
 * mounting suite hardcodes its own: a rename makes these reads `undefined` and
 * this suite FAILS, which is what a control should do when it can no longer see
 * what it checks.
 */
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';
const GUARDS_METADATA = '__guards__';

const unusedGate: FinancialCapabilityGate = { decideFor: () => Promise.resolve('UNAVAILABLE') };

function mountedModule() {
  return FinancialApiModule.register({
    useCases: {} as FinancialUseCases,
    clock: { now: () => new Date('2026-08-19T09:00:00.000Z') },
    rateLimits: testRateLimits(),
    capabilityGate: unusedGate,
  });
}

interface MountedRoute {
  readonly controller: string;
  readonly handler: string;
}

/** Every route the module actually mounts, read from route metadata. */
function mountedRoutes(): MountedRoute[] {
  const module = mountedModule();
  const controllers = (module.controllers ?? []) as Array<new (...args: never[]) => object>;
  const routes: MountedRoute[] = [];
  for (const controller of controllers) {
    for (const handler of Object.getOwnPropertyNames(controller.prototype)) {
      if (handler === 'constructor') continue;
      const method: unknown = controller.prototype[handler];
      if (typeof method !== 'function') continue;
      // A route carries BOTH keys. A helper such as `importId` or `serialize`
      // carries neither, and is skipped rather than listed.
      const hasPath = Reflect.getMetadata(PATH_METADATA, method) !== undefined;
      const hasMethod = Reflect.getMetadata(METHOD_METADATA, method) !== undefined;
      if (hasPath && hasMethod) routes.push({ controller: controller.name, handler });
    }
  }
  return routes;
}

function classGuards(target: unknown): unknown[] {
  const declared: unknown = Reflect.getMetadata(GUARDS_METADATA, target as object);
  return Array.isArray(declared) ? declared : [];
}

describe('every mounted financial operation carries a rate-limit budget', () => {
  const routes = mountedRoutes();

  it('the enumeration found the whole surface, so nothing below is vacuous', () => {
    const module = mountedModule();
    expect(module.controllers).toHaveLength(8);
    expect(routes).toHaveLength(27);
  });

  it('every controller carries BOTH guards, capability first', () => {
    const module = mountedModule();
    const controllers = (module.controllers ?? []) as Array<new (...args: never[]) => object>;
    for (const controller of controllers) {
      // toEqual on the array: order is the control, not membership.
      expect({ controller: controller.name, guards: classGuards(controller) }).toEqual({
        controller: controller.name,
        guards: [FinancialCapabilityGuard, FinancialRateLimitGuard],
      });
    }
  });

  it('every mounted route resolves to a policy — an operation cannot be unlimited', () => {
    const unmapped = routes
      .filter((route) => policyForHandler(route.controller, route.handler) === undefined)
      .map((route) => `${route.controller}.${route.handler}`);
    expect(unmapped).toEqual([]);
  });

  it('no mapping is orphaned — a deleted route leaves no stale budget', () => {
    const mounted = new Set(routes.map((route) => `${route.controller}.${route.handler}`));
    const orphaned = [...FINANCIAL_RATE_LIMIT_POLICIES.keys()].filter((key) => !mounted.has(key));
    expect(orphaned).toEqual([]);
  });

  it('there are exactly as many mappings as mounted routes, and no exemptions', () => {
    expect(FINANCIAL_RATE_LIMIT_POLICIES.size).toBe(routes.length);
  });

  it('the module provides the limiter port and the guard', () => {
    const module = mountedModule();
    const providers = (module.providers ?? []) as Array<{ provide?: unknown } | unknown>;
    const tokens = providers.map((provider) =>
      typeof provider === 'object' && provider !== null && 'provide' in provider
        ? (provider as { provide: unknown }).provide
        : provider,
    );
    expect(tokens).toContain(FINANCIAL_RATE_LIMITS);
    expect(tokens).toContain(FinancialRateLimitGuard);
    // The capability gate is still there beside it.
    expect(tokens).toContain(FINANCIAL_CAPABILITY_GATE);
    expect(tokens).toContain(FinancialCapabilityGuard);
  });

  it('every write-shaped budget fails CLOSED', () => {
    // A write admitted during a limiter outage is unbounded mutation of money
    // records. Read policies may fall back; nothing that mutates may.
    for (const [key, policy] of FINANCIAL_RATE_LIMIT_POLICIES) {
      if (policy.name === 'financial_read') continue;
      expect({ key, mode: policy.onStoreFailure }).toEqual({ key, mode: 'fail_closed' });
    }
  });

  it('the guard dereferences no request-shaped container at all', () => {
    // Same rule the capability guard is held to: it takes the request whole and
    // hands it to the principal source. A property access on it would be the
    // first step towards a caller-influenced budget.
    const source = readFileSync(path.join(__dirname, 'rate-limit.guard.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(/\b(request|req|query|body|params|headers|cookies)\s*(?:\.|\[)/.test(source)).toBe(
      false,
    );
  });
});
