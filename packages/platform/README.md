# @karar/platform

The backend platform library shared by `apps/api` and `apps/worker`: typed
configuration, the PostgreSQL foundation (adapter, connection profiles,
migration runner), the error model, observability, the event envelope and
in-memory bus, the transactional outbox, the job queue, data-classification
types, and key-custody ports. Introduced in Phase 2; recorded in the phase
report as a structural addition (a sixth package — the four pure packages and
their zero-dependency rule are unchanged).

## Import rules

May import `@karar/shared-kernel` and `@karar/api-contracts`. Never imports an
app or a module. Modules and apps consume it; the four pure packages never do.
