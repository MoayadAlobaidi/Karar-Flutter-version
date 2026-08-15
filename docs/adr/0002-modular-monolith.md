# ADR-0002 — Modular monolith over microservices

**Status:** ACCEPTED · **Phase:** 1

## Context

Karar is built by a solo engineer growing to two or three. It must support many bounded contexts — consumer finance, Zakat, sealed obligations, governance, control plane — and eventually permit one of them (the sealed vault) to run in its own security boundary.

## Decision

**One deployable application containing many bounded contexts**, each exposing exactly one legal import surface: its `public-api.ts`. Cross-module imports that bypass it fail CI.

The monolith is a **deployment** choice, not an architectural one. The module seams are real, and `sealed-vault` is designed from day one to be extracted — network-capable port surface, no shared transaction, idempotent operations, no shared state.

## Consequences

**Positive**

- One repository, one build, one deploy, one debugger.
- Refactoring across contexts is a compiler-checked operation, not a distributed migration.
- Transactions are local, so the outbox is the only distributed-consistency mechanism needed.
- Extraction remains available where it is justified, and is prepared for exactly where it is (ADR-0017).

**Negative — accepted**

- One scaling unit. Acceptable: there are no customers, and the scaling profile is unknown.
- Module discipline depends on CI. Mitigated by architecture tests 3 and 5.
- A single deployment is a single blast radius, except for the vault, which is the part that matters most.

## Alternatives rejected

**Microservices from the start.** Rejected: it would impose distributed transactions, network failure modes, service discovery, and per-service operational burden on a team of one, before a single customer exists. The cost is certain; the benefit is speculative.

**Monolith with no module boundaries.** Rejected: this is the outcome the `public-api.ts` rule exists to prevent. Without enforced seams, extraction later means untangling rather than moving.

**Serverless functions per capability.** Rejected: capabilities share a module graph, policy resolution, and a financial engine. Fragmenting them would duplicate boot cost and scatter the graph for no isolation benefit the module boundaries do not already provide.
