/**
 * When `KARAR_INTEGRATION=1`, an unreachable dependency FAILS THE RUN — once,
 * here, before a single suite is collected.
 *
 * Three documents already state this as a property of the whole suite:
 * `vitest.config.ts` ("set KARAR_INTEGRATION=1 to make an unavailable database
 * a failure instead of a skip"), `connection-budget.ts` ("the database is
 * REQUIRED. Unreachable is a failure"), and the CI workflow ("without this,
 * skipUnlessDatabaseRequired turns an unreachable database into a skip and the
 * lane exits green having verified none of it").
 *
 * It was true of nine files. Twenty-five others define their OWN reachability
 * probe and route it through no gate, so with `KARAR_INTEGRATION=1` and no
 * database they skipped green — including `cross-tenant-isolation`,
 * `privilege-abuse`, both runtime-conformance suites, the live-Redis
 * rate-limiter suite, and `session-config.test.ts`, which is the ONLY test of
 * the Prisma-session timezone pinning that fix F3 exists for.
 *
 * A per-file gate is the wrong shape for a whole-run property: it has to be
 * remembered every time somebody writes a probe, and the failure of memory is
 * silent and in the direction of testing less. This is one place, it cannot be
 * forgotten by a new suite, and it does not weaken anything — a run without
 * `KARAR_INTEGRATION` still skips exactly as before.
 */

import net from 'node:net';

const REQUIRED = process.env['KARAR_INTEGRATION'] === '1';

function reachable(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

export async function setup(): Promise<void> {
  if (!REQUIRED) return;

  const dbHost = process.env['KARAR_DB_HOST'] ?? process.env['PGHOST'] ?? '127.0.0.1';
  const dbPort = Number.parseInt(
    process.env['POSTGRES_PORT'] ?? process.env['PGPORT'] ?? '5432',
    10,
  );
  const redisHost = process.env['REDIS_HOST'] ?? '127.0.0.1';
  const redisPort = Number.parseInt(process.env['REDIS_PORT'] ?? '6379', 10);

  const unreachable: string[] = [];
  if (!(await reachable(dbHost, dbPort))) unreachable.push(`PostgreSQL at ${dbHost}:${dbPort}`);
  if (!(await reachable(redisHost, redisPort)))
    unreachable.push(`Redis at ${redisHost}:${redisPort}`);

  if (unreachable.length > 0) {
    throw new Error(
      `KARAR_INTEGRATION=1 declares that this run MUST exercise its infrastructure, and ` +
        `${unreachable.join(' and ')} ${unreachable.length === 1 ? 'is' : 'are'} unreachable. ` +
        `The run is failed here rather than left to produce a green result from skipped suites. ` +
        `Start them (docker compose up -d postgres redis --wait) or drop KARAR_INTEGRATION.`,
    );
  }
}
