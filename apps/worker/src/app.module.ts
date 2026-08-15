import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { AppConfig } from '@karar/platform/dist/config/index.js';
import type { PostgresPersistenceAdapter } from '@karar/platform/dist/db/index.js';
import type { PlatformLogger } from '@karar/platform/dist/observability/index.js';
import {
  APP_CONFIG,
  APP_LOGGER,
  DB_ADAPTER,
  HEALTH_SERVER,
  TELEMETRY,
  WORKER_RUNTIME,
} from './di-tokens.js';
import type { HealthServerHandle } from './health-server.js';
import type { WorkerRuntime } from './runtime.js';
import { ShutdownCoordinator } from './shutdown.js';
import type { Telemetry } from './telemetry/init-telemetry.js';

export interface WorkerModuleOptions {
  config: AppConfig;
  logger: PlatformLogger;
  telemetry: Telemetry;
  /** Built at the composition root (main.ts); tests pass fakes. */
  runtime: WorkerRuntime;
  adapter: PostgresPersistenceAdapter;
  health: HealthServerHandle;
}

// Root module of the single application both entrypoints boot (ADR-0013):
// apps/api starts the HTTP adapter over this graph; the worker starts the
// outbox relay and the job poller instead. Phase 2 composes the platform
// surface; modules/* join here as they gain application code.
@Module({})
export class AppModule {
  static forRoot(options: WorkerModuleOptions): DynamicModule {
    return {
      module: AppModule,
      providers: [
        { provide: APP_CONFIG, useValue: options.config },
        { provide: APP_LOGGER, useValue: options.logger },
        { provide: TELEMETRY, useValue: options.telemetry },
        { provide: WORKER_RUNTIME, useValue: options.runtime },
        { provide: DB_ADAPTER, useValue: options.adapter },
        { provide: HEALTH_SERVER, useValue: options.health },
        ShutdownCoordinator,
      ],
    };
  }
}
