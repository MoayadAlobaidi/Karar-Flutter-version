/**
 * The worker runtime: the outbox relay loop and the job poller over one
 * app-role database adapter, plus the diagnostic wiring that proves the paths
 * end to end (ADR-0012, ADR-0013).
 *
 * BUSINESS-FREE BY RULE: the only registered job handler is the platform
 * diagnostic echo, and the only bus subscription is the allow-listed
 * `worker-diagnostics` consumer of `platform.diagnostic.ping`. Product
 * handlers and consumers arrive with their modules in later phases and are
 * registered here by the module graph, never hand-written into the worker.
 */
import { PLATFORM_DIAGNOSTIC_PING, type EventCatalogue } from '@karar/api-contracts';
import type { PostgresPersistenceAdapter } from '@karar/platform/dist/db/index.js';
import { verifyMigrations } from '@karar/platform/dist/db/index.js';
import { InMemoryEventBus } from '@karar/platform/dist/events/index.js';
import {
  JobHandlerRegistry,
  JobPoller,
  PLATFORM_DIAGNOSTIC_ECHO,
  PostgresJobQueue,
  createDiagnosticEchoHandler,
} from '@karar/platform/dist/jobs/index.js';
import { OutboxRelay, withIdempotency } from '@karar/platform/dist/outbox/index.js';
import type { PlatformLogger } from '@karar/platform/dist/observability/index.js';

import type { WorkerReadinessReport } from './health-server.js';
import type { WorkerSettings } from './worker-settings.js';

/** The consumer name this worker subscribes under (catalogue allow-list). */
export const WORKER_DIAGNOSTICS_CONSUMER = 'worker-diagnostics';

/** Per-check wall-clock budget: a hung dependency must not hang the probe. */
const READINESS_CHECK_BUDGET_MS = 1_500;

async function withBudget<T>(budgetMs: number, work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`readiness check exceeded ${budgetMs}ms budget`)),
          budgetMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export interface WorkerRuntimeOptions {
  readonly adapter: PostgresPersistenceAdapter;
  readonly catalogue: EventCatalogue;
  readonly settings: WorkerSettings;
  readonly logger: PlatformLogger;
  /** Unique process identity; owns outbox claims and job leases. */
  readonly workerId: string;
}

export class WorkerRuntime {
  readonly bus: InMemoryEventBus;
  readonly queue: PostgresJobQueue;
  readonly registry: JobHandlerRegistry;
  readonly relay: OutboxRelay;
  readonly poller: JobPoller;

  private readonly adapter: PostgresPersistenceAdapter;
  private readonly settings: WorkerSettings;
  private readonly logger: PlatformLogger;
  private startedAtMs: number | null = null;

  constructor(options: WorkerRuntimeOptions) {
    this.adapter = options.adapter;
    this.settings = options.settings;
    this.logger = options.logger;

    this.bus = new InMemoryEventBus(options.catalogue, {
      onConsumerError: (failure) => {
        // The bus boundary is where consumer outcomes are logged, once.
        this.logger.error(
          {
            consumer: failure.consumerName,
            eventId: failure.eventId,
            eventName: failure.eventName,
            err: failure.error,
          },
          'event consumer failed',
        );
      },
    });
    // Diagnostic outbox consumer: allow-listed, idempotent via receipts in its
    // own transaction — the reference consumer shape (event-governance.md §6).
    this.bus.subscribe(WORKER_DIAGNOSTICS_CONSUMER, PLATFORM_DIAGNOSTIC_PING, async (envelope) => {
      await this.adapter.withTransaction(async (tx) => {
        const outcome = await withIdempotency(
          tx,
          WORKER_DIAGNOSTICS_CONSUMER,
          envelope.eventId,
          async () => {
            this.logger.debug(
              { eventId: envelope.eventId, correlationId: envelope.correlationId },
              'diagnostic ping consumed',
            );
          },
        );
        if (!outcome.executed) {
          this.logger.debug({ eventId: envelope.eventId }, 'diagnostic ping duplicate skipped');
        }
      });
    });

    this.queue = new PostgresJobQueue(this.adapter, {
      defaultLeaseTtlMs: this.settings.jobsLeaseTtlMs,
    });
    this.registry = new JobHandlerRegistry();
    // TEST/DIAGNOSTIC-ONLY handler — the single one the platform registers.
    this.registry.register(PLATFORM_DIAGNOSTIC_ECHO, createDiagnosticEchoHandler());

    this.relay = new OutboxRelay({
      adapter: this.adapter,
      publisher: this.bus,
      relayId: options.workerId,
      batchSize: this.settings.outboxBatchSize,
      pollIntervalMs: this.settings.outboxIntervalMs,
      logger: this.logger,
    });
    this.poller = new JobPoller({
      queue: this.queue,
      registry: this.registry,
      workerId: options.workerId,
      batchSize: this.settings.jobsBatchSize,
      leaseTtlMs: this.settings.jobsLeaseTtlMs,
      pollIntervalMs: this.settings.jobsIntervalMs,
      logger: this.logger,
    });
  }

  start(): void {
    this.startedAtMs = Date.now();
    this.relay.start();
    this.poller.start();
  }

  /** Graceful: stop intake, finish in-flight work, release claims and leases. */
  async stop(): Promise<void> {
    await Promise.all([this.relay.stop(), this.poller.stop()]);
  }

  /** The /readyz verdict: PG reachable AND migrations current AND loops alive. */
  async readiness(): Promise<WorkerReadinessReport> {
    const [postgres, migrations] = await Promise.all([
      this.probePostgres(),
      this.probeMigrations(),
    ]);
    const outboxRelay = this.loopState(this.relay.isRunning, this.relay.lastTickAt);
    const jobPoller = this.loopState(this.poller.isRunning, this.poller.lastTickAt);
    return {
      ready:
        postgres === 'up' &&
        migrations === 'ok' &&
        outboxRelay === 'alive' &&
        jobPoller === 'alive',
      checks: { postgres, migrations, outboxRelay, jobPoller },
    };
  }

  private loopState(isRunning: boolean, lastTickAt: number | null): 'alive' | 'stale' {
    if (!isRunning || this.startedAtMs === null) {
      return 'stale';
    }
    // Before the first completed tick, the start instant is the heartbeat: a
    // freshly started loop is alive, a loop that never ticks goes stale.
    const heartbeat = lastTickAt ?? this.startedAtMs;
    return Date.now() - heartbeat <= this.settings.loopStaleAfterMs ? 'alive' : 'stale';
  }

  private async probePostgres(): Promise<'up' | 'down'> {
    try {
      await withBudget(READINESS_CHECK_BUDGET_MS, this.adapter.query('SELECT 1'));
      return 'up';
    } catch {
      // The failure reason stays out of the report; operators read it from logs.
      return 'down';
    }
  }

  private async probeMigrations(): Promise<'ok' | 'behind' | 'unknown'> {
    try {
      const report = await withBudget(
        READINESS_CHECK_BUDGET_MS,
        verifyMigrations({ adapter: this.adapter }),
      );
      return report.status === 'clean' ? 'ok' : 'behind';
    } catch {
      return 'unknown';
    }
  }
}
