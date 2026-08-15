/**
 * Readiness probes for /readyz, built on the platform database foundation
 * (packages/platform/src/db): the ping runs `SELECT 1` through the
 * `PostgresPersistenceAdapter` on the APPLICATION role, and the migration
 * check is the runner's read-only `verifyMigrations` — migration 0001 grants
 * `karar_app` SELECT on `platform.schema_migrations` exactly for this surface.
 */
import { verifyMigrations } from '@karar/platform/dist/db/index.js';
import type { PostgresPersistenceAdapter } from '@karar/platform/dist/db/index.js';

export type MigrationsStatus = 'ok' | 'behind' | 'unknown';

export interface ReadinessProbes {
  /** Resolves when `SELECT 1` succeeds on the application role within the budget. */
  pingDatabase(budgetMs: number): Promise<void>;
  /** Schema migration status; 'unknown' when it cannot be established. */
  migrationsStatus(budgetMs: number): Promise<MigrationsStatus>;
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

export function createDbReadinessProbes(adapter: PostgresPersistenceAdapter): ReadinessProbes {
  return {
    async pingDatabase(budgetMs) {
      await withBudget(budgetMs, adapter.query('SELECT 1'));
    },
    async migrationsStatus(budgetMs) {
      // Read-only comparison of the database against db/migrations. 'clean'
      // means applied == latest; 'pending' AND 'drift' both mean the schema
      // is not the one this build was written for — not ready.
      const report = await withBudget(budgetMs, verifyMigrations({ adapter }));
      return report.status === 'clean' ? 'ok' : 'behind';
    },
    async close() {
      await adapter.end();
    },
  };
}
