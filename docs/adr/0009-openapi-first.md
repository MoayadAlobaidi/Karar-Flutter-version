# ADR-0009 — OpenAPI-first contract with generated SDKs

**Status:** ACCEPTED · **Phase:** 1

## Context

Karar serves a Flutter client, an admin SPA, and eventually partner integrations. Contract drift between server and clients is a persistent source of defects, and a contract generated from controllers describes whatever the controllers happen to do — including the accidents.

## Decision

**The OpenAPI contract in `packages/api-contracts` is authored, not generated from code.** SDKs are generated from it.

- Dart client — generated, committed, consumed by Flutter.
- TypeScript client — generated, for the admin SPA and partners.
- **Hand-editing a generated client is a CI failure.**
- `/api/v1/…`; additive changes stay in `v1`, breaking changes create `v2` and both run during migration.
- Money crosses the wire as `{ minorUnits: string, currency: string }`.
- Errors are RFC 7807, and **every capability denial carries a machine-readable reason**.
- **`sdkExposure` is declared per capability and defaults to `false`.**

## Consequences

**Positive**

- The API is designed rather than emitted.
- Client and server cannot drift silently.
- Capability scoping narrows a client's surface automatically from entitlements.
- The contract is reviewable as a document, by people who do not read the implementation.

**Negative — accepted**

- Authoring the contract before the implementation feels slower for the first endpoint of each shape.
- Generated clients must be regenerated and committed, which shows up in diffs.
- Generator quirks occasionally require contract phrasing chosen for the generator rather than for elegance.

## Alternatives rejected

**Generate OpenAPI from Nest decorators.** Tempting and common. Rejected: it inverts authority — the contract becomes a report on the code rather than a constraint on it — and it makes breaking changes easy to ship accidentally, because nothing was declared to break.

**GraphQL.** Rejected: capability-scoped surfaces, per-jurisdiction availability, and typed denial reasons are simpler to express and enforce over REST resources. GraphQL's flexible querying is also a poor fit for a platform whose entire access model is deny-by-default.

**gRPC.** Rejected: poor browser story for the admin SPA, and no advantage for a client that is not latency-bound.

**Hand-written clients.** Rejected: drift, duplicated effort across two languages.
