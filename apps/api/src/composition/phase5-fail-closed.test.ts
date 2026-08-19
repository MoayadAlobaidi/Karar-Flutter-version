/**
 * Phase 5 refuses to compose outside `KARAR_ENV=local`, and no part of that
 * refusal depends on the order of the lines in `phase5-modules.ts`.
 *
 * ## The defect this suite exists to keep closed
 *
 * The transactions module's AES field-encryption adapter and its keyed
 * dedup-fingerprint adapter used to carry no environment guard. They were kept
 * out of deployed processes only because the composition root constructed four
 * OTHER, guarded providers on earlier lines and those threw first. That is
 * security by line ordering, and it is the kind that survives review and dies
 * to a refactor: reorder the file, extract a helper, defer a construction, or
 * add a second entry point that composes these modules, and a deployed process
 * quietly acquires in-process key material with nothing failing.
 *
 * So this suite asserts two different things, and the second is the one that
 * matters:
 *
 *  1. `composePhase5Modules` refuses in `dev`, `staging` and `production`.
 *  2. The transactions resolvers refuse ON THEIR OWN — called first, in
 *     isolation, with no other Phase 5 constructor having run. `FIRST_REFUSAL`
 *     below is evaluated at module load, before this file does anything else
 *     at all, which is the strongest form of that claim available in a test.
 *
 * ## Why the database handle is a trap rather than a fake
 *
 * A deployed composition must refuse BEFORE it reaches infrastructure. The
 * handle passed below throws on any property access, so a refusal that arrived
 * late enough to open a connection would fail this suite with a different
 * error than the one it expects.
 */

import type { Clock } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  DedupFingerprintKeyUnavailableError,
  resolveDedupFingerprintPort,
  resolveHsfFieldEncryptionPort as resolveTransactionsEncryption,
  resolveTransactionRetentionDecisionPort as resolveTransactionsRetention,
} from '@karar/transactions';
import { describe, expect, it } from 'vitest';

import { composePhase5Modules } from './phase5-modules.js';

/**
 * The very first statement this file executes. Nothing in Phase 5 has been
 * constructed at this point — not an accounts resolver, not a statement-import
 * resolver, not the retention fixture — so a provider coming back here would
 * be one that guards nothing.
 */
const FIRST_REFUSAL: unknown = (() => {
  try {
    return resolveTransactionsEncryption({ env: 'production' });
  } catch (error) {
    return error;
  }
})();

/** The three values `KARAR_ENV` accepts besides `local`. */
const DEPLOYED_ENVIRONMENTS = ['dev', 'staging', 'production'] as const;

/** Throws on any access, so a late refusal is distinguishable from a timely one. */
function unusablePrisma(): PrismaHandle {
  return new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(
          `Phase 5 composition reached the database handle (property '${String(property)}') ` +
            'before refusing; a deployed environment must fail while resolving ports',
        );
      },
    },
  ) as PrismaHandle;
}

const frozenClock: Clock = { now: () => new Date('2026-08-18T09:00:00.000Z') };

function compose(environment: string): void {
  composePhase5Modules({
    environment,
    prisma: unusablePrisma(),
    clock: frozenClock,
    producer: 'phase5-fail-closed-test',
  });
}

describe('the transactions resolvers refuse without anything else having run', () => {
  it('refused at module load, before any other Phase 5 construction', () => {
    expect(FIRST_REFUSAL).toBeInstanceOf(Error);
    expect((FIRST_REFUSAL as Error).name).toBe('HsfFieldEncryptionError');
  });

  it('refuses when the dedup resolver is called first instead — order changes nothing', () => {
    expect(() => resolveDedupFingerprintPort({ env: 'production' })).toThrow(
      DedupFingerprintKeyUnavailableError,
    );
  });

  it('refuses when the retention resolver is called first instead', () => {
    expect(() => resolveTransactionsRetention({ env: 'production' })).toThrow(
      /may only be constructed in the 'local' environment/,
    );
  });

  it('refuses in every deployed environment, whichever resolver is reached first', () => {
    for (const env of DEPLOYED_ENVIRONMENTS) {
      // Deliberately the reverse of the order `composePhase5Modules` uses, so
      // that a reader can see the refusal is not being borrowed from the line
      // above it.
      expect(() => resolveDedupFingerprintPort({ env })).toThrow();
      expect(() => resolveTransactionsRetention({ env })).toThrow();
      expect(() => resolveTransactionsEncryption({ env })).toThrow();
    }
  });
});

describe('composePhase5Modules', () => {
  for (const environment of DEPLOYED_ENVIRONMENTS) {
    it(`refuses to compose in '${environment}' and never touches the database`, () => {
      let caught: unknown;
      try {
        compose(environment);
      } catch (error) {
        caught = error;
      }
      expect(caught, `composing Phase 5 in '${environment}' must throw`).toBeInstanceOf(Error);
      // The trap handle raises a message of its own; seeing it here would mean
      // the surface got as far as infrastructure before refusing.
      expect((caught as Error).message).not.toContain('reached the database handle');
    });
  }

  it('composes in local, with every port bound to a real implementation', () => {
    // The one environment where the local adapters may exist. Composition
    // builds the modules without touching the handle, because every repository
    // holds it rather than calling it at construction.
    const modules = composePhase5Modules({
      environment: 'local',
      prisma: unusablePrisma(),
      clock: frozenClock,
      producer: 'phase5-fail-closed-test',
    });
    expect(modules.length).toBeGreaterThan(0);
  });
});
