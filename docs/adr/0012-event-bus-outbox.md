# ADR-0012 — Event bus + transactional outbox

**Status:** ACCEPTED · **Phase:** 2

## Context

Modules must react to each other's state changes — projections rebuild, notifications send, audit records write — without importing each other's internals. The classic failure is a state change that commits while its event is lost, or an event published for a change that rolled back.

## Decision

**Transactional outbox.** State change and event enqueue commit in **one database transaction**. A relay in `apps/worker` publishes to the event bus.

- **At-least-once** delivery, **idempotent** consumers keyed on event ID.
- Ordering preserved per aggregate.
- Bounded retry with backoff, then dead-letter. **Dead-lettered events alert.**
- Consumers are failure-isolated; one failure does not block others.
- **A consumer writes only its own module's data.**

## Consequences

**Positive**

- No lost events and no phantom events, without distributed transactions.
- Modules decouple without importing each other.
- The relay is the only place delivery semantics live.

**Negative — accepted**

- Consumers must be idempotent — a real design constraint on every handler.
- Eventual consistency between a state change and its downstream effects. Projections therefore show an "as of" timestamp (ADR-0020).
- An extra table, a relay process, and lag to monitor.

## Alternatives rejected

**Publish directly from the use case.** Rejected: the event escapes even when the transaction rolls back.

**Publish after commit, in application code.** Rejected: a crash between commit and publish loses the event silently — the failure mode that is hardest to detect and most damaging to a projection.

**Change Data Capture from the WAL.** Rejected for v1: it couples consumers to table shapes rather than to a designed event contract, and it makes ADR-0025's payload governance unenforceable — you cannot forbid sealed data in an event whose shape is a table.

**Synchronous in-process calls between modules.** Rejected: it recreates the coupling `public-api.ts` exists to prevent, and makes one module's slowness another's outage.

**No dead-letter alerting.** Rejected: a silent DLQ fills up unnoticed until someone asks why a projection is stale.
