/**
 * Job handler registry: the worker runs registered APPLICATION handlers by
 * `job_type`. Handlers call use cases (ADR-0013) — a job cannot make a
 * transition a human path could not — and the registry itself carries no
 * business logic. Registration is explicit and duplicate-free so "what can
 * this worker run" is a declaration, not an archaeology exercise.
 */
import type { PlatformLogger } from '../observability/logger.js';
import type { ClaimedJob, HeartbeatOutcome } from './queue.js';

export interface JobHandlerContext {
  /** Extends the lease of a long-running job; check the outcome. */
  heartbeat(extendMs?: number): Promise<HeartbeatOutcome>;
  readonly logger?: PlatformLogger;
}

export type JobHandler = (job: ClaimedJob, context: JobHandlerContext) => Promise<void>;

export class JobHandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  register(jobType: string, handler: JobHandler): void {
    if (jobType.trim() === '') {
      throw new Error('register requires a non-empty jobType');
    }
    if (this.handlers.has(jobType)) {
      throw new Error(`A handler for job type '${jobType}' is already registered`);
    }
    this.handlers.set(jobType, handler);
  }

  resolve(jobType: string): JobHandler | undefined {
    return this.handlers.get(jobType);
  }

  registeredTypes(): string[] {
    return [...this.handlers.keys()].sort();
  }
}

/**
 * DIAGNOSTIC-ONLY job type — the single handler the platform ships. It
 * exercises the full enqueue → claim → execute → complete path for tests and
 * worker smoke checks, echoes its payload to the injected sink, and touches
 * no business state. Product job types belong to their owning modules in
 * later phases; nothing product-shaped is ever added here.
 */
export const PLATFORM_DIAGNOSTIC_ECHO = 'platform.diagnostic.echo';

/** Builds the diagnostic echo handler. TEST/DIAGNOSTIC USE ONLY. */
export function createDiagnosticEchoHandler(sink?: (echo: string) => void): JobHandler {
  return async (job, context) => {
    const echo = job.payload['echo'];
    if (typeof echo !== 'string') {
      throw new Error(`'${PLATFORM_DIAGNOSTIC_ECHO}' payload requires a string 'echo' field`);
    }
    sink?.(echo);
    context.logger?.debug({ jobId: job.id, jobType: job.jobType }, 'diagnostic echo executed');
    await Promise.resolve();
  };
}
