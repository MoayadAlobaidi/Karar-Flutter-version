import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { PlatformLogger } from '@karar/platform/dist/observability/index.js';
import { APP_LOGGER, READINESS_PROBES, SHUTDOWN_RESOURCES, TELEMETRY } from './di-tokens.js';
import type { ReadinessProbes } from './health/readiness-probes.js';
import type { Telemetry } from './telemetry/init-telemetry.js';

/** A named closeable composed in main.ts (Prisma handle, Redis client). */
export interface ShutdownResource {
  readonly name: string;
  close(): Promise<void>;
}

/**
 * Graceful shutdown, in dependency order: Nest has already stopped accepting
 * requests and closed the HTTP server when this runs (enableShutdownHooks →
 * SIGTERM/SIGINT → app.close()); here the database pool is drained and
 * telemetry is FLUSHED (last spans/metrics export) before the process is
 * allowed to exit.
 */
@Injectable()
export class ShutdownCoordinator implements OnApplicationShutdown {
  constructor(
    @Inject(APP_LOGGER) private readonly logger: PlatformLogger,
    @Inject(READINESS_PROBES) private readonly probes: ReadinessProbes,
    @Inject(TELEMETRY) private readonly telemetry: Telemetry,
    @Inject(SHUTDOWN_RESOURCES) private readonly resources: readonly ShutdownResource[],
  ) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.info({ signal: signal ?? 'close' }, 'shutting down');
    for (const resource of this.resources) {
      try {
        await resource.close();
      } catch (error) {
        this.logger.warn(
          { err: error, resource: resource.name },
          'resource close failed during shutdown',
        );
      }
    }
    try {
      await this.probes.close();
    } catch (error) {
      this.logger.warn({ err: error }, 'database pool close failed during shutdown');
    }
    try {
      await this.telemetry.shutdown();
    } catch (error) {
      this.logger.warn({ err: error }, 'telemetry flush failed during shutdown');
    }
    this.logger.info('shutdown complete');
  }
}
