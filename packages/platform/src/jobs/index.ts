// @karar/platform/jobs — the background-job foundation (ADR-0013).
//
// JOBS ARE WORK, EVENTS ARE FACTS: a job requests that something be done
// (retries, one leased executor, an outcome); an event records that something
// happened (immutable, catalogued, many consumers). The full distinction is
// documented at the head of queue.ts. Handlers call use cases; the only
// handler shipped here is the clearly-marked diagnostic echo.
export {
  JOB_STATUSES,
  JobPayloadTooLargeError,
  type ClaimOptions,
  type ClaimedJob,
  type CompleteOutcome,
  type EnqueueJobInput,
  type EnqueueResult,
  type FailOutcome,
  type HeartbeatOutcome,
  type JobQueue,
  type JobRecord,
  type JobStatus,
  type ReleaseOutcome,
  type StaleRecoveryReport,
} from './queue.js';
export { PostgresJobQueue, type PostgresJobQueueOptions } from './postgres-queue.js';
export {
  JobHandlerRegistry,
  PLATFORM_DIAGNOSTIC_ECHO,
  createDiagnosticEchoHandler,
  type JobHandler,
  type JobHandlerContext,
} from './registry.js';
export {
  JOB_METRIC_NAMES,
  JobPoller,
  type JobPollerOptions,
  type PollerRunReport,
} from './poller.js';
