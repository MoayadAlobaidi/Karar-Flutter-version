import { Inject, Injectable } from '@nestjs/common';
import { METRIC_NAMES, makeGauge } from '@karar/platform/dist/observability/index.js';
import { READINESS_PROBES } from '../di-tokens.js';
import type { MigrationsStatus, ReadinessProbes } from './readiness-probes.js';

export interface ReadinessReport {
  readonly ready: boolean;
  readonly checks: {
    readonly postgres: 'up' | 'down';
    readonly migrations: MigrationsStatus;
    readonly redis: 'up' | 'down';
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
 *   redis       round trip to the rate-limit store   → 'up' | 'down'
 *
 * Ready (HTTP 200) ONLY when postgres is up, migrations are 'ok' AND the
 * rate-limit store answers; anything else — including 'unknown' — reports 503
 * with per-check states. The store counts because the identity policies that
 * bound credential guessing fail CLOSED without it (platform ratelimit
 * policy.ts): an instance that cannot rate-limit refuses login, verification,
 * reset, MFA and invitation, and calling that ready would route real traffic
 * into guaranteed 503s. The report carries STATES ONLY: never hosts, ports,
 * roles, connection strings or driver error text.
 */
@Injectable()
export class ReadinessService {
  constructor(@Inject(READINESS_PROBES) private readonly probes: ReadinessProbes) {}

  async check(): Promise<ReadinessReport> {
    const [postgres, migrations, redis] = await Promise.all([
      this.probePostgres(),
      this.probeMigrations(),
      this.probeRedis(),
    ]);
    const ready = postgres === 'up' && migrations === 'ok' && redis === 'up';
    readinessState.record(ready ? 1 : 0);
    dbUp.record(postgres === 'up' ? 1 : 0);
    return { ready, checks: { postgres, migrations, redis } };
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

  private async probeRedis(): Promise<'up' | 'down'> {
    try {
      await this.probes.pingRedis(CHECK_BUDGET_MS);
      return 'up';
    } catch {
      // Same stance as the database: the driver's reason (refused/timeout/
      // "stream isn't writeable") is server-side detail, never a response.
      return 'down';
    }
  }
}
