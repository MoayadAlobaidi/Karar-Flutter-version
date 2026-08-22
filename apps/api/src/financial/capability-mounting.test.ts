/**
 * THE GATE IS ON EVERY CONTROLLER THE MODULE MOUNTS — read from the module's
 * own list, not from a list written here.
 *
 * The behavioural half (capability-gate.test.ts) drives all twenty-seven
 * operations and proves each one refuses. It cannot prove the thing that
 * actually goes wrong later: a NEW controller added to `financial.module.ts`
 * without the guard. A behavioural suite would keep passing — it does not
 * know the new route exists — and the surface would ship with a hole.
 *
 * So this reads `FinancialApiModule.register(...)`'s `controllers` array, the
 * same array Nest mounts, and asserts that each entry carries the guard as
 * class-level metadata. Adding a controller to that array is therefore a
 * failing test until it is gated, and removing the guard from an existing one
 * fails immediately.
 *
 * The second half is a source scan, for the same reason
 * `no-tenant-input.test.ts` is one: "no code path lets a caller influence the
 * decision" is a property of the source tree, and no single response can
 * demonstrate it.
 */

import 'reflect-metadata';

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { testRateLimits } from './__test-rate-limits.js';
import { FINANCIAL_CAPABILITY_GATE, type FinancialCapabilityGate } from './capability-gate.js';
import { FinancialCapabilityGuard } from './capability.guard.js';
import { FinancialApiModule } from './financial.module.js';
import type { FinancialUseCases } from './use-cases.js';

/**
 * Nest's own class-level guard metadata key. Hardcoded deliberately: if a
 * future version renames it, the reads below return undefined and this suite
 * FAILS, which is the outcome a security control should have when it can no
 * longer see what it is checking.
 */
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

function classGuards(target: unknown): unknown[] {
  const declared: unknown = Reflect.getMetadata(GUARDS_METADATA, target as object);
  return Array.isArray(declared) ? declared : [];
}

describe('every controller the financial module mounts carries the capability gate', () => {
  const controllers = mountedModule().controllers ?? [];

  it('read a real controller list — the check is not vacuous', () => {
    expect(controllers.length).toBe(8);
  });

  for (const controller of controllers) {
    const name = (controller as { name?: string }).name ?? String(controller);
    it(`${name} declares FinancialCapabilityGuard`, () => {
      expect(classGuards(controller)).toContain(FinancialCapabilityGuard);
    });
  }

  it('the guard and the gate binding are both provided by the module', () => {
    const providers = mountedModule().providers ?? [];
    expect(providers).toContain(FinancialCapabilityGuard);
    const tokens = providers.map((provider) =>
      typeof provider === 'object' && provider !== null && 'provide' in provider
        ? provider.provide
        : provider,
    );
    expect(tokens).toContain(FINANCIAL_CAPABILITY_GATE);
  });
});

// --- the source-tree half --------------------------------------------------

const HERE = __dirname;
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');
const FINANCIAL_DIR = path.join('apps', 'api', 'src', 'financial');
const GUARD = path.join(FINANCIAL_DIR, 'capability.guard.ts');

function sourceFiles(root: string): string[] {
  const absolute = path.join(REPO_ROOT, root);
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'dist' || entry === 'node_modules') continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
      found.push(path.relative(REPO_ROOT, full));
    }
  };
  walk(absolute);
  return found;
}

/** Source with comments removed: the property is what the CODE does. */
function code(file: string): string {
  return readFileSync(path.join(REPO_ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const FILES = sourceFiles(FINANCIAL_DIR);

/**
 * Reading a capability- or availability-shaped value out of anything a caller
 * controls. A `?capability=`, an `x-capability-available` header, a cookie or
 * a body field must name nothing on this surface.
 */
const CAPABILITY_FROM_REQUEST =
  /\b(query|body|params|headers|cookies|request|req|raw)\s*(?:\.\s*(?:capability|capabilityId|available|availability|entitlement|jurisdiction)\b|\[\s*['"][^'"]*(?:capability|available|entitlement|jurisdiction)[^'"]*['"]\s*\])/i;

describe('nothing a caller sends can reach the capability decision', () => {
  it('scanned a real source tree — the check is not vacuous', () => {
    expect(FILES.length).toBeGreaterThan(15);
    expect(FILES).toContain(GUARD);
  });

  for (const file of FILES) {
    it(`${file} reads no capability input from the request`, () => {
      expect(CAPABILITY_FROM_REQUEST.test(code(file))).toBe(false);
    });
  }

  it('the guard dereferences no request-shaped container at all', () => {
    // It obtains the request and hands it, whole and unread, to the principal
    // source. A property access on it — any at all — would be the first step
    // towards a caller-influenced decision.
    expect(/\b(request|req|query|body|params|headers|cookies)\s*(?:\.|\[)/.test(code(GUARD))).toBe(
      false,
    );
  });

  it('the financial surface names no capability id anywhere', () => {
    // The id lives in ONE place, at the composition root
    // (composition/financial-capability-gate.ts). A second mention here would
    // be a second place to change when the surface's capability changes, and
    // the first one somebody would forget.
    for (const file of FILES) {
      expect(code(file), `${file} names a capability id`).not.toMatch(
        /\b(TRANSACTIONS|BUDGETS|GOALS|INSIGHTS|AI_ADVISOR|ZAKAT|AMANAT)\b/,
      );
    }
  });

  it('the decision the surface consumes has exactly two values', () => {
    // A third value is where a reason starts. The refusal must be
    // indistinguishable across every internal cause, and a type with room for
    // one is where that stops being true.
    const port = code(path.join(FINANCIAL_DIR, 'capability-gate.ts'));
    const declaration = /export type FinancialCapabilityDecision =([^;]+);/.exec(port);
    expect(declaration).not.toBeNull();
    const values = (declaration?.[1] ?? '')
      .split('|')
      .map((value) => value.trim())
      .filter((value) => value !== '');
    expect(values).toEqual(["'AVAILABLE'", "'UNAVAILABLE'"]);
  });
});
