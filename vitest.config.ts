/**
 * Workspace test configuration.
 *
 * The only thing set here is how many workers may run at once, and it is set
 * because the default — one per core — is wrong for this repository. Nearly
 * every integration suite provisions its own PostgreSQL database and holds
 * three pools while it does so, and a twelve-core machine running twelve of
 * those at once asks for more connections than a default server allows.
 *
 * What made that dangerous rather than merely slow: when the server refuses a
 * connection the suites report themselves UNREACHABLE and SKIP. The run stays
 * green, and the only evidence anything went wrong is a skip count that rose
 * from twelve to twenty-five. A verification run that quietly stopped
 * verifying looks exactly like one that proved everything.
 *
 * The worker count therefore comes from the connection budget rather than from
 * the CPU count, with the equation and its inputs in
 * `packages/platform/src/db/connection-budget.ts` so that a change to
 * a pool size is visibly a change to the worker count. Set
 * `KARAR_TEST_MAX_CONNECTIONS` when running against a server configured for
 * more; set `KARAR_INTEGRATION=1` to make an unavailable database a failure
 * instead of a skip.
 */
import os from 'node:os';

import { defineConfig } from 'vitest/config';

import { connectionBudget } from './packages/platform/src/db/connection-budget.js';

const budget = connectionBudget(process.env, os.cpus().length);

export default defineConfig({
  test: {
    // The ONE place collection is scoped. It used to be stated here and again
    // as --exclude flags in the `test` script, and a CLI --exclude REPLACES
    // this list rather than adding to it — so the two could drift, and did.
    //
    // `.claude` holds agent worktrees, which are checkouts of OTHER commits.
    // Collected, they double the suite with duplicates that provision
    // databases concurrently against the same PostgreSQL, and every published
    // test total becomes a function of who happened to have an agent running.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
    // Fails the WHOLE run when KARAR_INTEGRATION=1 and a dependency is
    // unreachable, so the property those three documents state is a property
    // of the run rather than of the nine files that remembered to check.
    globalSetup: ['./scripts/checks/integration-required-setup.mts'],
    maxWorkers: budget.workers,
    minWorkers: 1,
  },
});
