# ADR-0005 — PostgreSQL + Prisma confined to infrastructure

**Status:** ACCEPTED · **Phase:** 2

## Context

Karar's isolation design depends on database mechanisms: row-level security, forced RLS, session GUCs, revoked grants, and migrations run as a restricted role. The datastore is therefore not an interchangeable detail — it is part of the security boundary.

## Decision

**PostgreSQL**, with **Prisma confined to `infrastructure/persistence/`**.

- No Prisma type appears in any other layer (architecture test 4).
- Repositories are declared as ports in `application/ports/` and implemented in infrastructure, mapping explicitly between persistence models and domain objects.
- Schemas: `public`, `readmodel`, `audit`, `sealed`.
- Migrations are forward-only SQL with rollback scripts, **run in CI as the restricted application role**.

## Consequences

**Positive**

- RLS, `FORCE ROW LEVEL SECURITY`, GUCs, and grant revocation are all available and are the actual isolation mechanism (ADR-0022).
- Prisma gives type-safe queries and a good migration workflow without leaking into the domain.
- Swapping Prisma later touches one directory.

**Negative — accepted**

- **Prisma cannot set a session GUC per query outside an interactive transaction.** All tenant-scoped queries route through a transaction wrapper issuing `SET LOCAL`. This costs connection overhead and constrains query style. Documented and accepted.
- Explicit mapping between persistence models and domain objects is boilerplate. It is also what keeps the domain free of the ORM.

## Alternatives rejected

**Prisma used directly in use cases.** Rejected: it is the fastest route to an application layer that cannot be tested without a database and cannot be moved off the ORM.

**A raw query builder (Kysely, raw SQL).** Rejected for v1: it would remove the GUC constraint above, but at the cost of migration tooling and type generation. **Reconsider if the transaction wrapper proves too costly** — this is the most likely ADR in this set to be superseded.

**MySQL.** Rejected: no forced RLS. The isolation design would have to be replaced, not ported.

**A managed serverless datastore.** Rejected: the mechanisms the security boundary depends on are PostgreSQL features, not vendor features.

**ORM-less, repository-per-table with hand-written SQL.** Rejected for a team of one: migration and type-safety tooling would be hand-built.
