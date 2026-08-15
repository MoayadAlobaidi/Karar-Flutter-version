import 'reflect-metadata';
import { hostname } from 'node:os';
import { NestFactory } from '@nestjs/core';
import { readDefaultEventCatalogue } from '@karar/api-contracts';
import {
  ConfigurationError,
  loadConfig,
  type AppConfig,
} from '@karar/platform/dist/config/index.js';
import {
  LocalPostgresConnectionProfile,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createLogger } from '@karar/platform/dist/observability/index.js';
import { AppModule } from './app.module.js';
import { startHealthServer } from './health-server.js';
import { WorkerRuntime } from './runtime.js';
import { initTelemetry } from './telemetry/init-telemetry.js';
import { loadWorkerSettings, type WorkerSettings } from './worker-settings.js';

async function bootstrap(): Promise<void> {
  // Composition root: the ONLY thing done with the raw environment is handing
  // it to the sanctioned readers — platform config (loadConfig, the worker
  // settings schema) and the platform db role-profile factory. Everything
  // else consumes typed values.
  let config: AppConfig;
  let settings: WorkerSettings;
  try {
    config = loadConfig(process.env, { serviceName: 'karar-worker' });
    settings = loadWorkerSettings(process.env);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      // Fail fast, field NAMES only — never values (environments.md §7).
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  // Telemetry first, so everything after emits into a registered SDK.
  const telemetry = initTelemetry(config);
  const logger = createLogger({
    serviceName: config.service.name,
    serviceVersion: config.service.version,
    env: config.env,
    level: config.log.level,
  });

  const adapter = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv('app', { env: process.env }),
  );
  const catalogue = readDefaultEventCatalogue();
  const workerId = `${config.service.name}@${hostname()}:${process.pid}`;
  const runtime = new WorkerRuntime({ adapter, catalogue, settings, logger, workerId });

  // Health before loops: /readyz honestly answers 503 (loops stale) until
  // start() below, then flips to 200 once both loops heartbeat.
  const health = await startHealthServer({
    port: settings.port,
    readiness: () => runtime.readiness(),
    logger,
  });

  try {
    const app = await NestFactory.createApplicationContext(
      AppModule.forRoot({ config, logger, telemetry, runtime, adapter, health }),
      { logger: false },
    );
    // SIGTERM/SIGINT → app.close() → ShutdownCoordinator: stop intake, finish
    // in-flight, release claims/leases, drain pool, flush telemetry.
    app.enableShutdownHooks();
  } catch (error) {
    await health.close().catch(() => undefined);
    throw error;
  }

  runtime.start();
  logger.info(
    {
      port: health.port,
      env: config.env,
      version: config.service.version,
      workerId,
      jobTypes: runtime.registry.registeredTypes(),
    },
    'worker ready',
  );
}

bootstrap().catch((error: unknown) => {
  // Bootstrap failures are fatal; the stack stays on stderr (server-side).
  process.stderr.write(
    `fatal bootstrap error\n${error instanceof Error && error.stack !== undefined ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
