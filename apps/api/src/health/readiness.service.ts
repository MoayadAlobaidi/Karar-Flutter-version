import { Inject, Injectable } from '@nestjs/common';
import { METRIC_NAMES, makeGauge } from '@karar/platform/dist/observability/index.js';
import { READINESS_PROBES } from '../di-tokens.js';
import type { MigrationsStatus, ReadinessProbes } from './readiness-probes.js';

export interface ReadinessReport {
  readonly ready: boolean;
  readonly checks: {
    readonly postgres: 'up' | 'down';
    readonly migrations: MigrationsStatus;
  };
}

/** Per-check wall-clock budget. A hung dependency must not hang the probe. */
export const CHECK_BUDGET_MS = 1_500;

const readinessState = makeGauge(METRIC_NAMES.readinessState, {
  description: '1 when /readyz would answer 200, else 0',
});
const dbUp = makeGauge(METRIC_NAMES.dbUp, {
  description: '1 when the database answered the readiness ping, else 0',
});

/**
 * Executes REAL dependency checks — a constant is not a health check
 * (docs/architecture/backend.md §10, legacy INFRA-04):
 *
 *   postgres    `SELECT 1` on the application role   → 'up' | 'down'
 *   migrations  schema verify (applied == latest)    → 'ok' | 'behind' | 'unknown'
 *
 * Ready (HTTP 200) ONLY when postgres is up AND migrations are 'ok'; anything
 * else — including 'unknown' — reports 503 with per-check states. The report
 * carries STATES ONLY: never hosts, ports, roles, connection strings or
 * driver error text.
 */
@Injectable()
export class ReadinessService {
  constructor(@Inject(READINESS_PROBES) private readonly probes: ReadinessProbes) {}

  async check(): Promise<ReadinessReport> {
    const [postgres, migrations] = await Promise.all([
      this.probePostgres(),
      this.probeMigrations(),
    ]);
    const ready = postgres === 'up' && migrations === 'ok';
    readinessState.record(ready ? 1 : 0);
    dbUp.record(postgres === 'up' ? 1 : 0);
    return { ready, checks: { postgres, migrations } };
  }

  private async probePostgres(): Promise<'up' | 'down'> {
    try {
      await this.probes.pingDatabase(CHECK_BUDGET_MS);
      return 'up';
    } catch {
      // The failure reason (refused/timeout/auth) stays out of the response;
      // operators read it from server-side logs and metrics.
      return 'down';
    }
  }

  private async probeMigrations(): Promise<MigrationsStatus> {
    try {
      return await this.probes.migrationsStatus(CHECK_BUDGET_MS);
    } catch {
      return 'unknown';
    }
  }
}
