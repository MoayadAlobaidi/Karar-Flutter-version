/**
 * Readiness integration tests against REAL local infrastructure and the REAL
 * platform db foundation (bootstrap + migrations + app-role adapter).
 *
 * Gated behind KARAR_INTEGRATION=1 because they require Docker and mutate the
 * compose postgres service. Run them with:
 *
 *   POSTGRES_PORT=5433 docker compose up -d postgres otel-collector --wait
 *   POSTGRES_PORT=5433 KARAR_INTEGRATION=1 pnpm --filter @karar/api test
 *
 * The suite bootstraps roles/database and migrates to latest first (Agent B's
 * CLI), so the ready path asserts the full truth: postgres up AND applied ==
 * latest.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@karar/platform/dist/config/index.js';
import {
  LocalPostgresConnectionProfile,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createLogger } from '@karar/platform/dist/observability/index.js';
import { AppModule } from './app.module.js';

// __dirname: this package compiles to CommonJS (vitest provides it in-runner).
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const integrationEnabled = process.env['KARAR_INTEGRATION'] === '1';
const postgresPort = process.env['POSTGRES_PORT'] ?? process.env['PGPORT'] ?? '5433';

/** Environment handed to config and to the db role-profile factory. */
const testEnv: Record<string, string> = {
  KARAR_ENV: 'local',
  POSTGRES_PORT: postgresPort,
  KARAR_TELEMETRY_ENABLED: 'false',
};

function run(command: string): void {
  execSync(command, {
    cwd: REPO_ROOT,
    env: { ...process.env, POSTGRES_PORT: postgresPort, PGPORT: postgresPort },
    stdio: 'pipe',
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function quietLogger() {
  return createLogger({
    serviceName: 'karar-api',
    serviceVersion: 'integration',
    env: 'local',
    level: 'fatal',
    destination: { write() {} },
  });
}

async function buildApp(probeProfileDatabase?: string): Promise<NestFastifyApplication> {
  const config = loadConfig(testEnv, { serviceName: 'karar-api' });
  const adapter = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv(
      probeProfileDatabase === undefined ? 'app' : 'superuser',
      {
        env: testEnv,
        ...(probeProfileDatabase === undefined ? {} : { database: probeProfileDatabase }),
      },
    ),
  );
  const { createDbReadinessProbes } = await import('./health/readiness-probes.js');
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppModule.forRoot({
        config,
        logger: quietLogger(),
        telemetry: { shutdown: () => Promise.resolve() },
        probes: createDbReadinessProbes(adapter),
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe.skipIf(!integrationEnabled)('readiness against live compose postgres', () => {
  let app: NestFastifyApplication;

  const inject = (url: string, target: NestFastifyApplication = app) =>
    target.getHttpAdapter().getInstance().inject({ method: 'GET', url });

  beforeAll(async () => {
    // Real foundation: roles + database (superuser), then migrate to latest
    // (karar_migrator) — Agent B's CLI, driven exactly like a developer would.
    run('pnpm --filter @karar/platform db:create');
    run('pnpm --filter @karar/platform db:migrate');
    app = await buildApp();
  }, 120_000);

  afterAll(async () => {
    // Leave postgres running for subsequent suites/agents.
    run('docker compose start postgres');
    await app?.close();
  }, 60_000);

  it('serves liveness regardless of dependencies', async () => {
    const response = await inject('/healthz');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('answers 200 {postgres: up, migrations: ok} on a migrated database', async () => {
    const response = await inject('/readyz');
    expect(JSON.parse(response.body)).toEqual({
      status: 'ok',
      checks: { postgres: 'up', migrations: 'ok' },
    });
    expect(response.statusCode).toBe(200);
  }, 30_000);

  it('answers 503 {migrations: behind} against an un-migrated scratch database', async () => {
    const scratch = `karar_readyz_behind_${process.pid}`;
    const maintenance = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { env: testEnv, database: 'postgres' }),
    );
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS ${scratch}`);
      await maintenance.query(`CREATE DATABASE ${scratch}`);
      const behindApp = await buildApp(scratch);
      try {
        const response = await inject('/readyz', behindApp);
        expect(response.statusCode).toBe(503);
        expect(JSON.parse(response.body)).toEqual({
          status: 'unavailable',
          checks: { postgres: 'up', migrations: 'behind' },
        });
      } finally {
        await behindApp.close();
      }
      await maintenance.query(`DROP DATABASE IF EXISTS ${scratch}`);
    } finally {
      await maintenance.end();
    }
  }, 60_000);

  it('flips to 503 postgres=down when postgres stops, while liveness stays green', async () => {
    run('docker compose stop postgres');
    try {
      const response = await inject('/readyz');
      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body) as {
        status: string;
        checks: { postgres: string; migrations: string };
      };
      expect(body.status).toBe('unavailable');
      expect(body.checks.postgres).toBe('down');
      for (const leaked of [
        '127.0.0.1',
        postgresPort,
        'ECONNREFUSED',
        'password',
        'karar_app',
        'karar_dev_password',
      ]) {
        expect(response.body).not.toContain(leaked);
      }
      const liveness = await inject('/healthz');
      expect(liveness.statusCode).toBe(200);
    } finally {
      run('docker compose start postgres');
    }
  }, 120_000);

  it('recovers to 200 without a restart once postgres is back', async () => {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const response = await inject('/readyz');
      if (response.statusCode === 200) {
        expect(JSON.parse(response.body)).toEqual({
          status: 'ok',
          checks: { postgres: 'up', migrations: 'ok' },
        });
        break;
      }
      if (Date.now() > deadline) {
        throw new Error(`postgres did not recover in time; last: ${response.body}`);
      }
      await sleep(1_000);
    }
  }, 90_000);
});
