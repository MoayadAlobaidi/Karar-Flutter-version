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
import { composePhase3Modules } from './composition/phase3-modules.js';
import { createDbReadinessProbes } from './health/readiness-probes.js';
import { PlatformNestLogger } from './logging/nest-logger.js';
import { initTelemetry } from './telemetry/init-telemetry.js';

async function bootstrap(): Promise<void> {
  // Composition root: the ONLY thing done with the raw environment is handing
  // it, unread, to sanctioned readers — platform config (loadConfig, the
  // redis endpoint, the trusted-proxy spec), the platform db role-profile
  // factory (fromEnv), and identity's config loader inside
  // composePhase3Modules. Everything else consumes typed config or a
  // constructed dependency; nothing here dereferences process.env.
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

  // Phase 3 module surface: identity, users, tenancy, consent, authorization,
  // control-plane — composed once, outside Nest (composition/phase3-modules.ts).
  const composition = composePhase3Modules({ config, env: process.env, dbAdapter, logger });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot({
      config,
      logger,
      telemetry,
      probes: createDbReadinessProbes(dbAdapter),
      modules: composition.modules,
      enrichmentGuard: composition.enrichmentGuard,
      resources: composition.resources,
    }),
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
