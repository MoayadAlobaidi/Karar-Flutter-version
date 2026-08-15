import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '@karar/platform/dist/config/index.js';
import { createLogger } from '@karar/platform/dist/observability/index.js';
import { AppModule } from '../app.module.js';
import { HealthController } from './health.controller.js';
import { withBudget } from './readiness-probes.js';
import type { MigrationsStatus, ReadinessProbes } from './readiness-probes.js';
import { CHECK_BUDGET_MS, ReadinessService } from './readiness.service.js';

const config = loadConfig(
  { KARAR_ENV: 'local', POSTGRES_PASSWORD: 'sentinel-password-value' },
  { serviceName: 'karar-api' },
);

function quietLogger() {
  return createLogger({
    serviceName: 'karar-api',
    serviceVersion: 'test',
    env: 'local',
    level: 'fatal',
    destination: { write() {} },
  });
}

function fakeProbes(overrides: Partial<ReadinessProbes> = {}): ReadinessProbes {
  return {
    pingDatabase: () => Promise.resolve(),
    migrationsStatus: () => Promise.resolve<MigrationsStatus>('ok'),
    close: () => Promise.resolve(),
    ...overrides,
  };
}

async function compileApp(probes: ReadinessProbes) {
  return Test.createTestingModule({
    imports: [
      AppModule.forRoot({
        config,
        logger: quietLogger(),
        telemetry: { shutdown: () => Promise.resolve() },
        probes,
      }),
    ],
  }).compile();
}

interface SentReply {
  statusCode?: number;
  body?: unknown;
}

function fakeReply(sent: SentReply) {
  const reply = {
    status(code: number) {
      sent.statusCode = code;
      return reply;
    },
    send(body: unknown) {
      sent.body = body;
      return reply;
    },
  };
  return reply;
}

describe('healthz — liveness', () => {
  it('is constant and touches no dependency', async () => {
    const moduleRef = await compileApp(
      fakeProbes({
        pingDatabase: () => Promise.reject(new Error('db is down and liveness must not care')),
        migrationsStatus: () => Promise.reject(new Error('unreachable')),
      }),
    );
    const controller = moduleRef.get(HealthController);
    expect(controller.healthz()).toEqual({ status: 'ok' });
    await moduleRef.close();
  });
});

describe('readyz — real checks', () => {
  it('answers 200 with per-check states when postgres is up and migrations are ok', async () => {
    const moduleRef = await compileApp(fakeProbes());
    const controller = moduleRef.get(HealthController);
    const sent: SentReply = {};
    await controller.readyz(fakeReply(sent));
    expect(sent.statusCode).toBe(200);
    expect(sent.body).toEqual({ status: 'ok', checks: { postgres: 'up', migrations: 'ok' } });
    await moduleRef.close();
  });

  it('answers 503 with postgres=down when the ping fails', async () => {
    const moduleRef = await compileApp(
      fakeProbes({
        pingDatabase: () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
      }),
    );
    const controller = moduleRef.get(HealthController);
    const sent: SentReply = {};
    await controller.readyz(fakeReply(sent));
    expect(sent.statusCode).toBe(503);
    expect(sent.body).toEqual({
      status: 'unavailable',
      checks: { postgres: 'down', migrations: 'ok' },
    });
    await moduleRef.close();
  });

  it.each<MigrationsStatus>(['behind', 'unknown'])(
    'answers 503 when migrations are %s',
    async (status) => {
      const moduleRef = await compileApp(
        fakeProbes({ migrationsStatus: () => Promise.resolve(status) }),
      );
      const controller = moduleRef.get(HealthController);
      const sent: SentReply = {};
      await controller.readyz(fakeReply(sent));
      expect(sent.statusCode).toBe(503);
      expect(sent.body).toEqual({
        status: 'unavailable',
        checks: { postgres: 'up', migrations: status },
      });
      await moduleRef.close();
    },
  );

  it('never leaks connection details, driver errors or credentials in the body', async () => {
    const moduleRef = await compileApp(
      fakeProbes({
        pingDatabase: () =>
          Promise.reject(
            new Error('password authentication failed for user "karar" at 127.0.0.1:5432'),
          ),
      }),
    );
    const controller = moduleRef.get(HealthController);
    const sent: SentReply = {};
    await controller.readyz(fakeReply(sent));
    const serialized = JSON.stringify(sent.body);
    for (const leaked of [
      '127.0.0.1',
      '5432',
      'karar',
      'password',
      'sentinel-password-value',
      'postgres://',
      'ECONNREFUSED',
    ]) {
      expect(serialized).not.toContain(leaked);
    }
    expect(serialized).toContain('"postgres":"down"');
    await moduleRef.close();
  });

  it('maps a hung dependency to down within the check budget', async () => {
    const never = new Promise<void>(() => {});
    const service = new ReadinessService({
      pingDatabase: (budgetMs) => withBudget(budgetMs, never),
      migrationsStatus: () => Promise.resolve('ok'),
      close: () => Promise.resolve(),
    });
    const startedAt = Date.now();
    const report = await service.check();
    expect(report.checks.postgres).toBe('down');
    expect(Date.now() - startedAt).toBeLessThan(CHECK_BUDGET_MS + 1_000);
  });
});

describe('withBudget', () => {
  it('rejects when the work overruns the budget', async () => {
    await expect(withBudget(30, new Promise(() => {}))).rejects.toThrow('budget');
  });

  it('resolves with the value inside the budget', async () => {
    await expect(withBudget(1_000, Promise.resolve('fast'))).resolves.toBe('fast');
  });
});
