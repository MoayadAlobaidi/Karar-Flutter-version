# ADR-0008 — Multi-tenancy: shared database + `tenant_id` + scoped repositories

**Status:** ACCEPTED · **Phase:** 3

## Context

Karar serves first-party consumers, white-label partners, and internal tenants from one platform, and may later need to move a tenant to a dedicated database or project. Retrofitting tenancy means touching every table, query, index, and test in a system that already holds data.

The legacy is the evidence: it added RLS across three migrations and at HEAD **24 of 69 tables still have no RLS** — 6 of them unexplained, with `users` among them. Four tenant tables were passed over *without comment*.

## Decision

**Shared database, `tenant_id` on every tenant-owned table from the first migration**, with four layers of isolation:

1. RBAC in the use case
2. Tenant-scoped repositories (Prisma extension + `AsyncLocalStorage`)
3. **PostgreSQL RLS — the actual boundary** (ADR-0022)
4. Adversarial cross-tenant tests in CI

**Tenant is resolved at the infrastructure edge** from the authenticated principal, the API client binding, or the request host. **Never from a client-supplied header or body field.**

The topology ladder (ADR-0023) permits moving a tenant to a dedicated database or project without domain changes.

## Consequences

**Positive**

- One schema, one migration path, one deployment for most tenants.
- The isolation mechanism is in the database, where application bugs cannot bypass it.
- Moving up the ladder is infrastructure work, not a rewrite.

**Negative — accepted**

- Every tenant-scoped query runs inside a transaction wrapper issuing `SET LOCAL` (ADR-0005).
- A single database is a shared blast radius at L0. Mitigated by RLS and the ladder.
- Cross-tenant operations need an explicitly elevated, audited path, scoped to the narrowest reads required — not whole-transaction elevation, which is a legacy defect (RLS-04).

## Alternatives rejected

**Database-per-tenant from the start.** Rejected: N migration paths, N backup regimes, and N connection pools before a single customer exists. Available as rung L1 when a requirement appears.

**Schema-per-tenant.** Rejected: migration complexity grows with tenant count, and PostgreSQL performance degrades with very large schema counts.

**Application-layer filtering only.** Rejected: defeated by any code path that forgets the filter, and there is always one. **The Prisma extension is convenience on top of RLS, not the boundary** — stated explicitly because it is the most likely thing to be misremembered.

**Deferring tenancy to a later phase.** Rejected on the legacy's direct evidence.
