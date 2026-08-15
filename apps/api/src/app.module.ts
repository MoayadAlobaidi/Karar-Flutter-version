import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import type { AppConfig } from '@karar/platform/dist/config/index.js';
import type { PlatformLogger } from '@karar/platform/dist/observability/index.js';
import { APP_CONFIG, APP_LOGGER, READINESS_PROBES, TELEMETRY } from './di-tokens.js';
import { GlobalExceptionFilter } from './errors/global-exception.filter.js';
import { HealthController } from './health/health.controller.js';
import type { ReadinessProbes } from './health/readiness-probes.js';
import { ReadinessService } from './health/readiness.service.js';
import { RequestLoggingInterceptor } from './logging/request-logging.interceptor.js';
import { ShutdownCoordinator } from './shutdown.js';
import type { Telemetry } from './telemetry/init-telemetry.js';

export interface AppModuleOptions {
  config: AppConfig;
  logger: PlatformLogger;
  telemetry: Telemetry;
  /**
   * Built at the composition root (main.ts) from the platform db foundation —
   * the adapter on the app-role connection profile; tests pass fakes.
   */
  probes: ReadinessProbes;
}

// Root module of the single application both entrypoints boot (ADR-0013).
// Phase 2 composes modules/* here; today it carries the platform surface:
// config/logger/telemetry composition, health, and the error boundary.
@Module({})
export class AppModule {
  static forRoot(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [
        { provide: APP_CONFIG, useValue: options.config },
        { provide: APP_LOGGER, useValue: options.logger },
        { provide: TELEMETRY, useValue: options.telemetry },
        { provide: READINESS_PROBES, useValue: options.probes },
        ReadinessService,
        ShutdownCoordinator,
        // Order matters for neither: the interceptor wraps handlers, the
        // filter is the single error-logging boundary.
        { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
      ],
    };
  }
}
