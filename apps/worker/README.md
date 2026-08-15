# Background entrypoint

Outbox relay, projection builders, and scheduled jobs. **A second entrypoint, not a second application** (ADR-0013) — it imports the same modules and calls the same use cases.

**Jobs call use cases.** A job cannot make a transition a human path could not.

## Import rules

May import `modules/*/public-api.ts` and `packages/*`. **Contains no duplicated business logic.**

## What Phase 2 boots

`main.ts` is the composition root: typed config (`loadConfig` + `loadWorkerSettings`), OTel SDK, structured logger, the app-role `PostgresPersistenceAdapter`, and the `WorkerRuntime` — the platform `OutboxRelay` publishing through the in-memory `EventBus`, and the `JobPoller` executing registered handlers (`packages/platform/src/{outbox,jobs}`; ADR-0012).

Business-free by rule: the only registered job handler is the diagnostic `platform.diagnostic.echo`, and the only bus subscription is the allow-listed `worker-diagnostics` consumer of `platform.diagnostic.ping`. Product handlers arrive with their modules.

Health, on loopback at `KARAR_WORKER_PORT` (default 3001): `/healthz` liveness; `/readyz` real checks — PostgreSQL reachable, migrations current, relay and poller loops recently alive. SIGTERM stops intake, finishes in-flight work, releases claims and leases, drains the pool, and flushes telemetry.

Settings (all optional, validated): `KARAR_WORKER_PORT`, `KARAR_OUTBOX_RELAY_INTERVAL_MS`, `KARAR_OUTBOX_RELAY_BATCH_SIZE`, `KARAR_JOBS_POLL_INTERVAL_MS`, `KARAR_JOBS_POLL_BATCH_SIZE`, `KARAR_JOBS_LEASE_TTL_MS`, `KARAR_WORKER_LOOP_STALE_MS`.

Run locally against a migrated database: `PGPORT=5433 pnpm --filter @karar/worker dev`.
