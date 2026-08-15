# ADR-0013 — Worker as a second entrypoint, not a second application

**Status:** ACCEPTED · **Phase:** 2

## Context

Karar needs scheduled and asynchronous work: the outbox relay, projection builders, retention jobs, subscription lifecycle transitions, and reference-data feeds. The common failure is a job that carries its own copy of a business rule and, over time, can make a state transition no human path allows.

## Decision

**`apps/worker` is a second entrypoint over the same module graph.** It imports the same modules, calls the same use cases, and shares the same domain. **It contains no duplicated business logic.**

Both entrypoints boot the same root module and differ only in what they start: `api` starts the HTTP adapter, `worker` starts schedulers and relays.

**Jobs call use cases.** A job cannot make a transition a human path could not.

## Consequences

**Positive**

- One implementation of every rule, reachable from HTTP, jobs, and AI tools alike.
- Capability checks inside use cases protect all three callers — which is why enforcement is not only at the controller boundary.
- The worker scales independently of the API while sharing the codebase.

**Negative — accepted**

- Both entrypoints load the full module graph, so boot time and memory reflect the whole application.
- A poorly bounded job can exhaust the shared connection pool. Mitigated by per-job concurrency limits and the resource-limits rule.

## Alternatives rejected

**A separate worker service with its own logic.** Rejected: duplicated rules drift. The legacy avoided this deliberately — its subscription lifecycle job routes every transition through the same state machine, recorded as *"the job cannot make a move a human could not"* — and Karar makes the same invariant structural rather than disciplined.

**Jobs inside the API process.** Rejected: a long job competes with request handling for the pool, and scaling the API scales the jobs.

**A managed workflow engine (BPM).** Rejected as premature. Each context owns its state machine on a ~100-line pure helper, with a documented extraction trigger: ≥3 contexts with human-review workflows **and** a unified operations queue **and** ≥2 shared reviewer roles.

**Cron in the container.** Rejected: no visibility, no retry semantics, no outbox integration, no audit.
