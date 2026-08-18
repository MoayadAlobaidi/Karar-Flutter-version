/**
 * Whether a missing database is a skip or a failure, and how many test workers
 * the connection budget actually allows.
 *
 * ## Why a skip is dangerous here
 *
 * Every integration suite in this repository guards itself with
 * `describe.skipIf(unreachable !== null)`. That is right for a developer who
 * has not started PostgreSQL: the unit suites still run and the output says
 * plainly what was not exercised. It is wrong everywhere else, because a
 * skipped suite is reported in the same green summary as a passing one. A run
 * whose database was quietly unavailable proves nothing and looks identical to
 * a run that proved everything.
 *
 * It has already happened in this repository in the other direction: on a
 * twelve-core machine the workspace suite opened more connections than the
 * server allowed, whole suites became "unreachable", and the skip count rose
 * from twelve to twenty-five while the run still exited green. The number of
 * skips was the only evidence anything was wrong.
 *
 * So the decision is explicit and environment-driven, never inferred:
 *
 * - `KARAR_INTEGRATION=1` — the database is REQUIRED. Unreachable is a
 *   failure that stops the run and says why.
 * - otherwise — unreachable is a skip, with a banner naming what was not run.
 *
 * ## The connection budget
 *
 *   usable  = max_connections - superuser_reserved_connections - headroom
 *   workers = floor(usable / CONNECTIONS_PER_WORKER)
 *
 * `CONNECTIONS_PER_WORKER` is the worst case for one integration file, which
 * holds three pools at once while it provisions: the application pool
 * (`poolMax` 10), the migrator pool (2) and the superuser maintenance pool (2).
 * On a default server that is 100 - 3 - 5 = 92 usable, 92 / 14 = 6 workers —
 * fewer than the twelve cores, which is exactly why an unbounded worker count
 * exhausted the server. The equation is here rather than in a comment on a
 * magic number so that a future change to `poolMax` is visibly a change to the
 * worker count.
 */

/** Worst-case simultaneous connections held by one integration test file. */
export const CONNECTIONS_PER_WORKER = 14;

/** Left free for psql, an editor's connection, and the odd stray session. */
export const CONNECTION_HEADROOM = 5;

export interface ConnectionBudget {
  readonly maxConnections: number;
  readonly reserved: number;
  readonly usable: number;
  readonly workers: number;
}

/**
 * The worker count this server can support, never more than the machine's
 * cores. Both inputs are read from the environment so a CI runner or a
 * differently configured server does not need this file edited.
 */
export function connectionBudget(
  env: NodeJS.ProcessEnv = process.env,
  cpuCount = 1,
): ConnectionBudget {
  const maxConnections = Number(env['KARAR_TEST_MAX_CONNECTIONS'] ?? 100);
  const reserved = Number(env['KARAR_TEST_RESERVED_CONNECTIONS'] ?? 3);
  const usable = Math.max(0, maxConnections - reserved - CONNECTION_HEADROOM);
  const affordable = Math.floor(usable / CONNECTIONS_PER_WORKER);
  return {
    maxConnections,
    reserved,
    usable,
    // At least one: a budget that computes zero workers would run nothing at
    // all and report success, which is the failure this module exists to stop.
    workers: Math.max(1, Math.min(affordable, Math.max(1, cpuCount))),
  };
}

/** True when this run has declared that the database must be present. */
export function databaseIsRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['KARAR_INTEGRATION'] === '1';
}

export class DatabaseUnavailableError extends Error {
  override readonly name = 'DatabaseUnavailableError';

  constructor(suite: string, reason: string) {
    super(
      `${suite} requires PostgreSQL and it is unavailable: ${reason}. ` +
        'KARAR_INTEGRATION=1 declares that this run must exercise the database, so this is a ' +
        'failure rather than a skip — a skipped integration suite is reported in the same green ' +
        'summary as a passing one and proves nothing.',
    );
  }
}

/**
 * The single decision every integration fixture asks.
 *
 * Returns whether the suite should skip. Throws instead when the run declared
 * the database required, so the failure names the suite and the reason rather
 * than surfacing later as an unexplained absence.
 */
export function skipUnlessDatabaseRequired(
  suite: string,
  unreachableReason: string | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (unreachableReason === null) return false;
  if (databaseIsRequired(env)) throw new DatabaseUnavailableError(suite, unreachableReason);
  return true;
}
