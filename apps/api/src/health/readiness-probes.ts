/**
 * Readiness probes for /readyz.
 *
 * The database pair is built on the platform database foundation
 * (packages/platform/src/db): the ping runs `SELECT 1` through the
 * `PostgresPersistenceAdapter` on the APPLICATION role, and the migration
 * check is the runner's read-only `verifyMigrations` — migration 0001 grants
 * `karar_app` SELECT on `platform.schema_migrations` exactly for this surface.
 *
 * The rate-limit store is probed too, because the identity policies that
 * guard credential guessing fail CLOSED without it (platform ratelimit
 * policy.ts): an instance whose limiter cannot answer refuses logins, and a
 * load balancer must know that before it routes to it.
 */
import { verifyMigrations } from '@karar/platform/dist/db/index.js';
import type { PostgresPersistenceAdapter } from '@karar/platform/dist/db/index.js';
import { assertSessionTimeZoneIsUtc } from '@karar/platform/dist/db/session-config.js';

export type MigrationsStatus = 'ok' | 'behind' | 'unknown';

/**
 * The rate-limit store as readiness sees it: one real round trip, no status
 * field and no topology. `RateLimitRedisConnection` satisfies it structurally.
 */
export interface RateLimitStoreProbe {
  ping(): Promise<void>;
}

export interface ReadinessProbes {
  /** Resolves when `SELECT 1` succeeds on the application role within the budget. */
  pingDatabase(budgetMs: number): Promise<void>;
  /** Schema migration status; 'unknown' when it cannot be established. */
  migrationsStatus(budgetMs: number): Promise<MigrationsStatus>;
  /** Resolves when the rate-limit store answers a round trip within the budget. */
  pingRedis(budgetMs: number): Promise<void>;
  close(): Promise<void>;
}

/** Rejects with a timeout error when `work` overruns its budget. */
export async function withBudget<T>(budgetMs: number, work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`readiness check exceeded ${budgetMs}ms budget`)),
          budgetMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `rateLimitStore` is optional so a harness that composes only the database
 * still builds a probe set. Readiness then reports the store DOWN: it states
 * what it verified, and an unverifiable dependency that whole endpoints fail
 * closed on is not one to claim as up.
 */
export function createDbReadinessProbes(
  adapter: PostgresPersistenceAdapter,
  rateLimitStore?: RateLimitStoreProbe,
): ReadinessProbes {
  return {
    async pingDatabase(budgetMs) {
      // `SHOW TimeZone` rather than `SELECT 1`: it is the same minimal round
      // trip (a GUC read, no table touched) and it proves one thing more.
      // A session that is not in UTC reports `timestamptz` values shifted by
      // its offset, so a ledger read on it is wrong by whole hours in both
      // directions — grants not yet effective, windows still open after they
      // closed. That is not a usable database for this system, so it reads as
      // `postgres: down` rather than being reported as healthy.
      await withBudget(budgetMs, assertSessionTimeZoneIsUtc(adapter));
    },
    async migrationsStatus(budgetMs) {
      // Read-only comparison of the database against db/migrations. 'clean'
      // means applied == latest; 'pending' AND 'drift' both mean the schema
      // is not the one this build was written for — not ready.
      const report = await withBudget(budgetMs, verifyMigrations({ adapter }));
      return report.status === 'clean' ? 'ok' : 'behind';
    },
    async pingRedis(budgetMs) {
      if (rateLimitStore === undefined) {
        throw new Error('no rate-limit store was wired into the readiness probes');
      }
      await withBudget(budgetMs, rateLimitStore.ping());
    },
    async close() {
      await adapter.end();
    },
  };
}
