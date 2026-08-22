/**
 * Dropping a scratch test database without racing the pool that just closed.
 *
 * `DROP DATABASE ... WITH (FORCE)` terminates whatever is still attached. A
 * harness that closes its pool first — disconnect, then `pool.end()` — has
 * still not necessarily had its backend reaped by the server, and FORCE cuts
 * that socket. The client raises SQLSTATE 57P01 (admin_shutdown) with no query
 * in flight, vitest reports an unhandled error, and the run exits non-zero
 * with every assertion green. Observed once in ten consecutive canonical runs.
 *
 * FORCE has a second cost that matters more: it also terminates a backend a
 * harness genuinely LEAKED, so a real leak looks exactly like a clean
 * teardown. Draining first and then dropping plainly keeps the leak visible —
 * the drop fails, loudly, which is the failure worth having.
 *
 * Thirty-five call sites used the FORCE form. They call this instead, so the
 * decision lives in one place rather than being re-made per test file.
 */
import type { PostgresPersistenceAdapter } from './adapter.js';

/** How long to wait for the server to reap backends before giving up on it. */
const DRAIN_ATTEMPTS = 100;
const DRAIN_INTERVAL_MS = 20;

export async function dropScratchDatabase(
  maintenance: PostgresPersistenceAdapter,
  database: string,
): Promise<void> {
  for (let attempt = 0; attempt < DRAIN_ATTEMPTS; attempt += 1) {
    const remaining = await maintenance.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()`,
      [database],
    );
    if ((remaining.rows[0]?.count ?? '0') === '0') break;
    await new Promise((resolve) => setTimeout(resolve, DRAIN_INTERVAL_MS));
  }

  // No FORCE. If a connection is still attached after the drain window, this
  // fails and names the database — which is a harness leaking a pool, and is
  // exactly what FORCE used to hide.
  await maintenance.query(`DROP DATABASE IF EXISTS "${database}"`);
}
