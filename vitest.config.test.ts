/**
 * The workspace test configuration itself, held to the one property whose
 * failure is silent.
 *
 * `globalSetup` is what makes `KARAR_INTEGRATION=1` mean anything: it opens a
 * socket to PostgreSQL and Redis before a single suite is collected and fails
 * the run when either is unreachable, so a verification run cannot go green
 * out of skipped suites. Its path used to be written relative —
 * `'./scripts/checks/integration-required-setup.mts'` — and vitest resolves
 * `globalSetup` against `test.root`, which defaults to the PROCESS CWD rather
 * than to the directory holding this config.
 *
 * At the repository root that resolved. From a package directory it did not,
 * and the run died at `ERR_LOAD_URL` before collecting anything. CI's own
 * "Readiness recovery suite" step is exactly that shape —
 * `pnpm --filter @karar/api exec vitest run src/readiness.integration.test.ts`
 * — so the twelve assertions that stop and restart the containers, including
 * the rate-limit-store startup-race regression, could not run at all. No PR
 * had been opened since the change that introduced it, so no CI run had
 * reported the failure.
 *
 * Asserting the path is ABSOLUTE and EXISTS is the whole guard: an absolute
 * path resolves identically from every working directory, which is the
 * property the CI step needs and the one a relative path cannot have.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import config from './vitest.config.js';

function globalSetupEntries(): string[] {
  const declared = (config as { test?: { globalSetup?: string | string[] } }).test?.globalSetup;
  if (declared === undefined) return [];
  return Array.isArray(declared) ? declared : [declared];
}

describe('workspace vitest configuration', () => {
  it('declares the integration fail-closed global setup', () => {
    expect(globalSetupEntries()).toHaveLength(1);
  });

  it('resolves every globalSetup entry from an absolute path that exists', () => {
    for (const entry of globalSetupEntries()) {
      expect({ entry, absolute: path.isAbsolute(entry), exists: fs.existsSync(entry) }).toEqual({
        entry,
        absolute: true,
        exists: true,
      });
    }
  });

  it('points at the setup file that carries the fail-closed rule, not some other file', () => {
    const [entry] = globalSetupEntries();
    expect(entry).toBeDefined();
    const source = fs.readFileSync(entry as string, 'utf8');
    // The rule itself, not merely a file with the right name.
    expect(source).toContain('KARAR_INTEGRATION');
    expect(source).toContain('export async function setup');
  });
});
