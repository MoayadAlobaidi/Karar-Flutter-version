import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { PostgresPersistenceAdapter } from '@karar/platform/dist/db/index.js';
import type { PlatformLogger } from '@karar/platform/dist/observability/index.js';
import { APP_LOGGER, DB_ADAPTER, HEALTH_SERVER, TELEMETRY, WORKER_RUNTIME } from './di-tokens.js';
import type { HealthServerHandle } from './health-server.js';
import type { WorkerRuntime } from './runtime.js';
import type { Telemetry } from './telemetry/init-telemetry.js';

/**
 * Graceful shutdown, in dependency order (mirrors apps/api/src/shutdown.ts;
 * SIGTERM/SIGINT → enableShutdownHooks → app.close() → here):
 *
 *   1. runtime.stop() — stop intake; the relay finishes its in-flight event
 *      and releases unpublished claims; the poller finishes the job in flight
 *      and releases unstarted leases. Nothing is lost, nothing stays stuck.
 *   2. health server closes — the orchestrator stops getting ready answers.
 *   3. database pool drains.
 *   4. telemetry FLUSHES (last spans/metrics) before the process may exit.
 */
@Injectable()
export class ShutdownCoordinator implements OnApplicationShutdown {
  constructor(
    @Inject(APP_LOGGER) private readonly logger: PlatformLogger,
    @Inject(WORKER_RUNTIME) private readonly runtime: WorkerRuntime,
    @Inject(HEALTH_SERVER) private readonly health: HealthServerHandle,
    @Inject(DB_ADAPTER) private readonly adapter: PostgresPersistenceAdapter,
    @Inject(TELEMETRY) private readonly telemetry: Telemetry,
  ) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.info({ signal: signal ?? 'close' }, 'shutting down');
    try {
      await this.runtime.stop();
    } catch (error) {
      this.logger.warn({ err: error }, 'runtime stop failed during shutdown');
    }
    try {
      await this.health.close();
    } catch (error) {
      this.logger.warn({ err: error }, 'health server close failed during shutdown');
    }
    try {
      await this.adapter.end();
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
