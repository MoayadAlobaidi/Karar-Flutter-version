import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
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
import { createDbReadinessProbes } from './health/readiness-probes.js';
import { PlatformNestLogger } from './logging/nest-logger.js';
import { initTelemetry } from './telemetry/init-telemetry.js';

async function bootstrap(): Promise<void> {
  // Composition root: the ONLY thing done with the raw environment is handing
  // it to the two sanctioned readers — platform config (loadConfig) and the
  // platform db role-profile factory (fromEnv). Everything else consumes
  // typed config or a constructed dependency.
  let config: AppConfig;
  try {
    config = loadConfig(process.env, { serviceName: 'karar-api' });
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

  // The api runs on the APPLICATION role — never migrator, never superuser.
  const dbAdapter = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv('app', { env: process.env }),
  );

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot({ config, logger, telemetry, probes: createDbReadinessProbes(dbAdapter) }),
    new FastifyAdapter(),
    { logger: new PlatformNestLogger(logger) },
  );
  // SIGTERM/SIGINT → stop accepting, close server, then ShutdownCoordinator
  // drains the pool and flushes telemetry (see shutdown.ts).
  app.enableShutdownHooks();

  await app.listen({ port: config.service.port, host: '0.0.0.0' });
  // env and version are base fields on every line already.
  logger.info({ port: config.service.port }, 'api listening');
}

bootstrap().catch((error: unknown) => {
  // Bootstrap failures are fatal; the stack stays on stderr (server-side).
  process.stderr.write(
    `fatal bootstrap error\n${error instanceof Error && error.stack !== undefined ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
