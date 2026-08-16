import { Module } from '@nestjs/common';
import type { CanActivate, DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import type { AppConfig } from '@karar/platform/dist/config/index.js';
import type { PlatformLogger } from '@karar/platform/dist/observability/index.js';
import {
  APP_CONFIG,
  APP_LOGGER,
  READINESS_PROBES,
  SHUTDOWN_RESOURCES,
  TELEMETRY,
} from './di-tokens.js';
import { GlobalExceptionFilter } from './errors/global-exception.filter.js';
import { HealthController } from './health/health.controller.js';
import type { ReadinessProbes } from './health/readiness-probes.js';
import { ReadinessService } from './health/readiness.service.js';
import { RequestLoggingInterceptor } from './logging/request-logging.interceptor.js';
import { ShutdownCoordinator, type ShutdownResource } from './shutdown.js';
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
  /** The composed module surface (Phase 3: composePhase3Modules); tests omit it. */
  modules?: DynamicModule[];
  /** Global request-enrichment guard (never denies); tests omit it. */
  enrichmentGuard?: CanActivate;
  /** Extra closeables drained by the ShutdownCoordinator before the probes. */
  resources?: ShutdownResource[];
}

// Root module of the single application both entrypoints boot (ADR-0013).
// It carries the platform surface (config/logger/telemetry composition,
// health, the error boundary) and mounts the composed module surface built
// in main.ts — module wiring stays ordinary imports (ADR-0016).
@Module({})
export class AppModule {
  static forRoot(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: options.modules ?? [],
      controllers: [HealthController],
      providers: [
        { provide: APP_CONFIG, useValue: options.config },
        { provide: APP_LOGGER, useValue: options.logger },
        { provide: TELEMETRY, useValue: options.telemetry },
        { provide: READINESS_PROBES, useValue: options.probes },
        { provide: SHUTDOWN_RESOURCES, useValue: options.resources ?? [] },
        ReadinessService,
        ShutdownCoordinator,
        // Order matters for neither: the interceptor wraps handlers, the
        // filter is the single error-logging boundary.
        { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        // The enrichment guard never denies; it resolves the bearer principal
        // once so module principal sources can read it (auth/request-principal.ts).
        ...(options.enrichmentGuard !== undefined
          ? [{ provide: APP_GUARD, useValue: options.enrichmentGuard }]
          : []),
      ],
    };
  }
}
