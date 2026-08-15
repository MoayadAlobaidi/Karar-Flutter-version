# ADR-0020 — Projections as non-authoritative read models

**Status:** ACCEPTED · **Phase:** 8

## Context

Super Admin needs cross-tenant operational views: user overviews, tenant health, integration health, AI usage and cost, capability availability, country performance, and case queues. Serving these by querying domain aggregates directly would couple the admin surface to every domain's internals and make ordinary refactors break the back office.

It would also require the admin path to hold read access to consumer financial tables — the legacy's AZ1 finding, where *"only the absence of an endpoint prevents the read."*

## Decision

**Projections in a `readmodel` schema, built from domain events via the outbox.**

Rules:

- **Never a source of truth.**
- **Fully rebuildable** — `make rebuild-projection <name>` — which is what makes them safe to change.
- Every admin view shows an **"as of" timestamp**, because they are eventually consistent.
- **Lag is monitored and alerted.**
- **`SEALED` data never enters a projection** (architecture test 13).
- Owned by the **consuming** concern (admin/ops), not the source domain.

Projections: `admin_user_overview`, `tenant_health`, `integration_health`, `environment_health`, `ai_usage`, `capability_availability_overview`, `country_performance`, `operating_entity_overview`, `amanat_case_operational`.

## Consequences

**Positive**

- Admin queries do not touch domain aggregates, so domain refactors do not break the back office.
- Admin reads do not require access to consumer financial tables — a real security boundary, not just a layering nicety.
- Rebuildability means a projection's shape can change freely.
- `amanat_case_operational` lets operations run the capability — counts, states, ages — with **no capacity to read an obligation**.

**Negative — accepted**

- Eventual consistency. An operator may see a stale figure, which is why the "as of" timestamp is mandatory rather than decorative.
- Projection builders are extra code and extra lag to monitor.
- A rebuild on a large dataset takes time and must be operable without downtime.

## Alternatives rejected

**Query domain aggregates directly for admin.** Rejected: couples admin to domain internals and requires broad read grants on financial tables.

**A read replica of the domain schema.** Rejected: same coupling, and it does not shape data for the questions operations actually asks.

**Materialized views.** Rejected: refresh semantics are coarse, and they cannot be built incrementally from events with checkpointing.

**Treating projections as authoritative for anything.** Rejected absolutely — that would make an eventually-consistent, rebuildable artefact a source of truth, and a rebuild would silently change history.

**Allowing sealed data into an operational projection.** Rejected: an aggregate over few sealed records leaks membership, so **not even aggregates** are permitted.
