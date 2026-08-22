/**
 * Readiness integration tests against REAL local infrastructure and the REAL
 * platform db foundation (bootstrap + migrations + app-role adapter), plus
 * the REAL rate-limit store.
 *
 * Gated behind KARAR_READINESS_SUITE=1 because they require Docker and mutate the
 * compose postgres and redis services. Run them with:
 *
 *   POSTGRES_PORT=5433 REDIS_PORT=6380 docker compose up -d postgres redis otel-collector --wait
 *   POSTGRES_PORT=5433 REDIS_PORT=6380 KARAR_READINESS_SUITE=1 pnpm --filter @karar/api test
 *
 * The suite bootstraps roles/database and migrates to latest first (Agent B's
 * CLI), so the ready path asserts the full truth: postgres up, applied ==
 * latest, and a rate-limit store that answers.
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
import {
  RateLimitRedisConnection,
  createRateLimitRedisClient,
} from '@karar/platform/dist/ratelimit/index.js';
import { AppModule } from './app.module.js';
import { composePhase3Modules } from './composition/phase3-modules.js';
import { createDbReadinessProbes } from './health/readiness-probes.js';

// __dirname: this package compiles to CommonJS (vitest provides it in-runner).
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// Gated on its OWN variable, not on KARAR_INTEGRATION.
//
// That flag means "an unreachable database is a failure, not a skip", and it
// belongs on every lane that runs database suites. This suite means something
// different and incompatible: it STOPS AND RESTARTS the compose containers, so
// running it alongside the other 80+ database suites kills their connections
// mid-test. While the two shared one variable, the main CI lane could not
// declare the database required without also turning this suite loose on it --
// so it declared nothing, and every one of those suites was free to skip green.
const integrationEnabled = process.env['KARAR_READINESS_SUITE'] === '1';
const postgresPort = process.env['POSTGRES_PORT'] ?? process.env['PGPORT'] ?? '5433';
const redisPort = process.env['REDIS_PORT'] ?? '6380';
/** Nothing listens here: a store that is unreachable for a whole test. */
const UNREACHABLE_STORE_PORT = 6499;

/** Environment handed to config and to the db role-profile factory. */
const testEnv: Record<string, string> = {
  KARAR_ENV: 'local',
  POSTGRES_PORT: postgresPort,
  REDIS_PORT: redisPort,
  KARAR_TELEMETRY_ENABLED: 'false',
};

function run(command: string): void {
  execSync(command, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      POSTGRES_PORT: postgresPort,
      PGPORT: postgresPort,
      REDIS_PORT: redisPort,
    },
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

const get = (target: NestFastifyApplication, url: string) =>
  target.getHttpAdapter().getInstance().inject({ method: 'GET', url });

const postJson = (target: NestFastifyApplication, url: string, payload: object) =>
  target
    .getHttpAdapter()
    .getInstance()
    .inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload });

interface ReadyzProbe {
  readonly statusCode: number;
  /** The bytes as sent — what a leak assertion has to read. */
  readonly raw: string;
  readonly report: {
    readonly status: string;
    readonly checks: {
      readonly postgres: string;
      readonly migrations: string;
      readonly redis: string;
    };
  };
}

async function readyz(target: NestFastifyApplication): Promise<ReadyzProbe> {
  const response = await get(target, '/readyz');
  return {
    statusCode: response.statusCode,
    raw: response.body,
    report: JSON.parse(response.body) as ReadyzProbe['report'],
  };
}

/** Polls /readyz until `accept` holds; the last body names the failure. */
async function awaitReadyz(
  target: NestFastifyApplication,
  accept: (probe: ReadyzProbe) => boolean,
  timeoutMs = 60_000,
): Promise<ReadyzProbe> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const probe = await readyz(target);
    if (accept(probe)) return probe;
    if (Date.now() > deadline) {
      throw new Error(`readiness never reached the expected state; last: ${probe.raw}`);
    }
    await sleep(500);
  }
}

interface Harness {
  readonly app: NestFastifyApplication;
  /** The store's raw client, so a test can assert what shutdown did to it. */
  readonly client: ReturnType<typeof createRateLimitRedisClient>;
}

/**
 * The probe surface main.ts builds — the db adapter AND the rate-limit store,
 * with the store's connection established BEFORE the app serves anything,
 * exactly as the composition root does it. `database` swaps the probe profile
 * onto a scratch database; `storePort` points the store somewhere unreachable.
 */
async function buildApp(options: { database?: string; storePort?: number } = {}): Promise<Harness> {
  const config = loadConfig(testEnv, { serviceName: 'karar-api' });
  const adapter = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv(options.database === undefined ? 'app' : 'superuser', {
      env: testEnv,
      ...(options.database === undefined ? {} : { database: options.database }),
    }),
  );
  const client = createRateLimitRedisClient({
    host: '127.0.0.1',
    port: options.storePort ?? Number(redisPort),
  });
  const store = new RateLimitRedisConnection(client, { startupBudgetMs: 2_000 });
  await store.connect();
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppModule.forRoot({
        config,
        logger: quietLogger(),
        telemetry: { shutdown: () => Promise.resolve() },
        probes: createDbReadinessProbes(adapter, store),
        // What main.ts hands the ShutdownCoordinator for the store.
        resources: [{ name: 'redis', close: () => store.close() }],
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, client };
}

/**
 * The WHOLE application, composed the way main.ts composes it — including the
 * startup step these tests exist to pin: the rate-limit store's connection is
 * ESTABLISHED before anything can be routed to the process. The store is one
 * of `composition.resources`, so `app.close()` drains it.
 */
async function buildComposedApp(): Promise<NestFastifyApplication> {
  const config = loadConfig(testEnv, { serviceName: 'karar-api' });
  const logger = quietLogger();
  const dbAdapter = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv('app', { env: testEnv }),
  );
  const composition = composePhase3Modules({ config, env: testEnv, dbAdapter, logger });
  await composition.rateLimitStore.connect();
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppModule.forRoot({
        config,
        logger,
        telemetry: { shutdown: () => Promise.resolve() },
        probes: createDbReadinessProbes(dbAdapter, composition.rateLimitStore),
        modules: composition.modules,
        enrichmentGuard: composition.enrichmentGuard,
        resources: composition.resources,
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

  const inject = (url: string, target: NestFastifyApplication = app) => get(target, url);

  beforeAll(async () => {
    // Real foundation: roles + database (superuser), then migrate to latest
    // (karar_migrator) — Agent B's CLI, driven exactly like a developer would.
    run('pnpm --filter @karar/platform db:create');
    run('pnpm --filter @karar/platform db:migrate');
    app = (await buildApp()).app;
  }, 120_000);

  afterAll(async () => {
    // Leave the services running for subsequent suites/agents.
    run('docker compose start postgres');
    run('docker compose start redis');
    await app?.close();
  }, 60_000);

  it('serves liveness regardless of dependencies', async () => {
    const response = await inject('/healthz');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('answers 200 {postgres: up, migrations: ok, redis: up} on a migrated database', async () => {
    const response = await inject('/readyz');
    expect(JSON.parse(response.body)).toEqual({
      status: 'ok',
      checks: { postgres: 'up', migrations: 'ok', redis: 'up' },
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
      const behind = await buildApp({ database: scratch });
      try {
        const response = await inject('/readyz', behind.app);
        expect(response.statusCode).toBe(503);
        expect(JSON.parse(response.body)).toEqual({
          status: 'unavailable',
          checks: { postgres: 'up', migrations: 'behind', redis: 'up' },
        });
      } finally {
        await behind.app.close();
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
          checks: { postgres: 'up', migrations: 'ok', redis: 'up' },
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

describe.skipIf(!integrationEnabled)('rate-limit store readiness and lifecycle', () => {
  afterAll(() => {
    run('docker compose start redis');
  }, 60_000);

  it('boots with an unreachable store and answers 503 redis=down, liveness still green', async () => {
    const harness = await buildApp({ storePort: UNREACHABLE_STORE_PORT });
    try {
      // Booting without a dependency is deliberate — the app is serving.
      expect((await get(harness.app, '/healthz')).statusCode).toBe(200);
      const probe = await readyz(harness.app);
      expect(probe.statusCode).toBe(503);
      expect(probe.report).toEqual({
        status: 'unavailable',
        checks: { postgres: 'up', migrations: 'ok', redis: 'down' },
      });
    } finally {
      await harness.app.close();
    }
  }, 60_000);

  it('stays 503 redis=down for as long as the store is unavailable', async () => {
    const harness = await buildApp({ storePort: UNREACHABLE_STORE_PORT });
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const probe = await readyz(harness.app);
        expect(probe.statusCode).toBe(503);
        expect(probe.report.checks.redis).toBe('down');
        await sleep(300);
      }
    } finally {
      await harness.app.close();
    }
  }, 60_000);

  it('never leaks the store endpoint, credentials or driver text in the readiness body', async () => {
    const harness = await buildApp({ storePort: UNREACHABLE_STORE_PORT });
    try {
      const probe = await readyz(harness.app);
      for (const leaked of [
        '127.0.0.1',
        String(UNREACHABLE_STORE_PORT),
        redisPort,
        'ECONNREFUSED',
        'Stream',
        'ioredis',
        'redis://',
        'password',
        'karar_dev_password',
      ]) {
        expect(probe.raw).not.toContain(leaked);
      }
      // States, and nothing but states.
      expect(probe.raw).toContain('"redis":"down"');
    } finally {
      await harness.app.close();
    }
  }, 60_000);

  it('closes the connected store cleanly on shutdown', async () => {
    const harness = await buildApp();
    expect(harness.client.status).toBe('ready');
    // The real path: app.close() → ShutdownCoordinator → the store resource.
    await harness.app.close();
    const deadline = Date.now() + 10_000;
    while (harness.client.status !== 'end') {
      if (Date.now() > deadline) {
        throw new Error(`the store client did not close; status: ${harness.client.status}`);
      }
      await sleep(100);
    }
    // Closed for good: no reconnect was scheduled behind the shutdown.
    await expect(harness.client.ping()).rejects.toThrow();
  }, 60_000);
});

describe.skipIf(!integrationEnabled)(
  'the rate-limit store connection race (composed application)',
  () => {
    let app: NestFastifyApplication;

    const login = (email: string) =>
      postJson(app, '/auth/login', { email, password: 'not-the-password' });

    beforeAll(async () => {
      app = await buildComposedApp();
    }, 120_000);

    afterAll(async () => {
      run('docker compose start redis');
      await app?.close();
    }, 60_000);

    it('REGRESSION: serves a rate-limited operation immediately after /readyz turns 200', async () => {
      const probe = await readyz(app);
      expect(probe.statusCode).toBe(200);
      expect(probe.report.checks.redis).toBe('up');
      // The FIRST command this process sends to the store. Before the startup
      // connect it lost the race with the handshake and — every login policy
      // failing closed — came back 503 over a store that was running.
      const response = await login(`race-${randomUUID()}@example.invalid`);
      expect(response.statusCode).toBe(401);
    }, 60_000);

    it('holds each declared failure mode during a later outage: login closed, refresh fallback', async () => {
      run('docker compose stop redis');
      try {
        const probe = await awaitReadyz(app, (p) => p.report.checks.redis === 'down', 30_000);
        expect(probe.statusCode).toBe(503);
        expect(probe.report.checks.postgres).toBe('up');
        expect((await get(app, '/healthz')).statusCode).toBe(200);

        // fail_closed (login_account): refused, and refused AS a store failure —
        // an attacker must not buy an unlimited guessing window by taking the
        // limiter down.
        const refused = await login(`outage-${randomUUID()}@example.invalid`);
        expect(refused.statusCode).toBe(503);
        const problem = JSON.parse(refused.body) as { code: string; details?: { policy?: string } };
        expect(problem.code).toBe('DEPENDENCY_UNAVAILABLE');
        expect(problem.details?.policy).toBe('login_account');

        // fail_open_fallback (refresh): proceeds under the in-process fallback
        // and is then answered on its own merits — never 503.
        const refresh = await postJson(app, '/auth/refresh', {
          refreshToken: `not-a-real-refresh-token-${randomUUID()}`,
        });
        expect(refresh.statusCode).toBe(401);
      } finally {
        run('docker compose start redis');
      }
    }, 120_000);

    it('recovers to 200 without a process restart once the store is back', async () => {
      const probe = await awaitReadyz(app, (p) => p.statusCode === 200, 60_000);
      expect(probe.report).toEqual({
        status: 'ok',
        checks: { postgres: 'up', migrations: 'ok', redis: 'up' },
      });
      // And the recovered connection serves the fail-closed path again.
      const response = await login(`recovered-${randomUUID()}@example.invalid`);
      expect(response.statusCode).toBe(401);
    }, 90_000);
  },
);
