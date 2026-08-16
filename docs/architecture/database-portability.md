# Database Portability

**ADRs:** 0005, 0008, 0022, 0023 · **Canonical for:** the PostgreSQL commitment, provider portability, connection resolution, migration portability, and the contract test suite.

---

## 1. The distinction that governs this document

> **Karar wants PostgreSQL *provider* portability — not arbitrary database-*engine* portability.**

Karar's canonical operational database family is **PostgreSQL**, because the architecture depends on capabilities that are not generic: transactions, constraints, exact numeric behaviour, **RLS with `FORCE`**, session GUCs, revoked grants, migrations run as a restricted role, JSONB where justified, and real indexes. These are the isolation and correctness mechanisms of ADR-0008 and ADR-0022 — the database is part of the security boundary, not an interchangeable detail.

**The honest claim, stated once and linked everywhere:**

> Karar is designed for PostgreSQL provider portability and controlled deployment portability. Domain/application boundaries make a future database-engine replacement *possible*, but replacing PostgreSQL itself would be a deliberate migration project.

Never claim more than this.

## 2. The stack — one persistence implementation, many connection profiles

```
Application repository port       (application/ — knows only Repository interfaces)
        ↓
PostgresPersistenceAdapter        (ONE implementation, confined to infrastructure code)
        ↓
DataSource / connection factory
        ↓
DatabaseProfile                   (per DeploymentProfile)
        ↓
Managed PostgreSQL
```

The application requests a **`Repository`** — never a `CloudSQLClient`, `AwsRdsClient`, or `SupabaseClient`.

**Implemented as of Phase 2** (`packages/platform/src/db`): the one `PostgresPersistenceAdapter` exists — node-postgres inside the platform package's infrastructure code. Connection settings come from a typed `ConnectionProfile` built per role (`LocalPostgresConnectionProfile.fromEnv('superuser' | 'migrator' | 'app')` — the only place the environment is read for connections), and the migration runner with its `db:create` / `db:migrate` / `db:verify` / `db:reset-local` CLI ships with it. A future `CloudSqlConnectionProfile` or `RdsConnectionProfile` differs in TLS material, IAM/database authentication, and discovery only — never in adapter or repository behaviour.

**Implemented as of Phase 3:** Prisma 7 serves domain repositories, per ADR-0005, without adding a second connection story or a second migration system. `createPrismaClient` (`packages/platform/src/db/prisma.ts`) is the only constructor, riding the `@prisma/adapter-pg` driver adapter over a `pg` pool built from the **same `ConnectionProfile`** — no connection URL lives in the Prisma schema. The multi-file schema (`packages/platform/prisma/schema/*.prisma`) *maps* the tables the canonical SQL migrations created; the SQL migrations remain the only migration authority, and `make prisma-drift` (`scripts/db/prisma-mapping-check.mjs`) fails when any mapped model diverges from the live database shape — one-directionally, so platform tables reached via the raw adapter are not drift. Details in [`backend.md` §6](backend.md).

> **There are no per-cloud business persistence adapters.** No `GcpCloudSqlPostgresAdapter`, no `AwsRdsPostgresAdapter`, no `AzurePostgresAdapter` for normal repository operations — unless an actual technical requirement appears, documented under §3. Cloud SQL, RDS, Azure Database for PostgreSQL, local Docker, and any approved compatible managed PostgreSQL all use the **same** `PostgresPersistenceAdapter`; what differs is the **connection profile**:

```
PostgresPersistenceAdapter → CloudSqlConnectionProfile
PostgresPersistenceAdapter → RdsConnectionProfile
PostgresPersistenceAdapter → LocalPostgresConnectionProfile
```

Cloud-provider differences belong in **Terraform, networking, TLS, IAM/database authentication, secrets, connection discovery, backup configuration, and high-availability configuration** — never in duplicated repository or business persistence code. `DatabaseProvider` is an infrastructure **provisioning/connection** concern; it is never an Application or Domain dependency.

**Approved provider family** (illustrative; the decided state per deployment lives in [`country-deployment-matrix.md`](country-deployment-matrix.md)):

```
Local Docker PostgreSQL           Google Cloud SQL for PostgreSQL
AWS RDS PostgreSQL                AWS Aurora PostgreSQL (if approved — see §3)
Azure Database for PostgreSQL     Other PostgreSQL-compatible approved provider
Dedicated / self-managed PostgreSQL
```

## 3. No cloud-specific database assumptions

The PostgreSQL implementation must not silently depend on one provider's functionality. A provider-specific database feature is permitted **only when all three hold**:

1. there is a **documented reason**;
2. it sits **behind an infrastructure abstraction**;
3. an **equivalent or fallback exists** for another approved provider.

Authoritative business persistence uses **standard PostgreSQL functionality**. Provider-specific functionality belongs in infrastructure configuration. (This is why "Aurora if approved" carries its caveat: PostgreSQL-*compatible* is a claim the contract tests verify, not a label taken on trust.)

The schema and migrations are **portable across supported PostgreSQL deployments wherever technically possible**; a provider-specific migration is an explicit, documented exception — never the default.

## 4. Connection resolution

```
Tenant A → shared Qatar PostgreSQL
Tenant B → dedicated Qatar PostgreSQL
Tenant C → AWS UAE PostgreSQL
Tenant D → dedicated bank PostgreSQL
```

Three infrastructure-level concepts carry this, and none is visible to a use case:

| Concept | Role |
|---|---|
| `DatabaseProfile` | The typed description of one database binding inside a `DeploymentProfile` |
| `DataSourceResolver` | Maps resolved tenant/deployment context → the datasource |
| `DatabaseConnectionFactory` | Produces connections for a profile, pooling included |

Phase 2 implements the profile shape and its opaque `DatabaseProfileRef` (`karar-ref:database-profile:<id>`, [`infrastructure-portability.md` §6](infrastructure-portability.md)) plus pooled connections per profile in the adapter. Phase 3 implements the `DataSourceResolver` seam itself (`packages/platform/src/db/datasource-resolver.ts`) with the only implementation Phase 3 needs: `SingleDatasourceResolver`, under which every tenant resolves to the one shared local datasource — topology rung L0, where isolation is carried entirely by RLS, never by routing. Routing resolvers remain future — they arrive with dedicated-database deployments (rungs L1+), replace `SingleDatasourceResolver` at the composition root, and change nothing else: repositories and use cases never see which database answered.

## 5. Multi-database from the beginning — without multi-database chaos

Karar is architecturally capable of multiple databases. That does **not** mean requests dynamically talk to arbitrary databases — every binding goes through a **controlled deployment profile**.

The topology ladder, per rung, on any approved provider:

| Rung | Database shape |
|---|---|
| **L0** | Shared database, shared schema, `tenant_id` + RLS |
| **L1** | Dedicated database for a tenant |
| **L2** | Dedicated runtime + database |
| **L3** | Dedicated cloud account/project/subscription + runtime + DB + keys |

Illustrative (configuration, never assumption): Qatar on GCP Cloud SQL; UAE on AWS RDS; Saudi on GCP or TBD; a bank on a dedicated AWS account with dedicated RDS. **No domain rewrite in any cell of that matrix.**

## 6. Migration portability — a database from zero

**Any new environment or database must be creatable entirely from the repository:**

```
create infrastructure → configure secrets → run migrations → seed reference data → verify
```

— never from manual DBA history, and never by copying an existing environment's database. **A new UAE database is provisioned without copying Qatar's.**

**Implemented as of Phase 2** for the local provider: `pnpm --filter @karar/platform db:create`, then `db:migrate`, then `db:verify` (with `KARAR_DB_NAME=<name>` selecting the target) creates roles, database, grants, and the full schema from the repository alone; integration tests prove the from-zero path, twice, against scratch databases. Runner semantics (checksum drift, forward-only, `-- rollback:` blocks) are canonical in [`packages/platform/db/migrations/README.md`](../../packages/platform/db/migrations/README.md). Of the requirements below, dry-run tooling does not exist yet (`db:verify` is the read-only comparison), and backup-before-destructive plus expand/migrate/contract are stated policy pending their first destructive migration.

Requirements:

| | |
|---|---|
| Migrations in version control | Deterministic ordering |
| No undocumented manual schema changes | Provider-neutral SQL where practical |
| Explicit provider-specific migrations **only when unavoidable**, documented per §3 | Schema compatibility checks |
| Migration **dry-run** | **Backup before destructive operations** |
| **Expand / migrate / contract** pattern for breaking changes | Rollback / forward-recovery documentation per migration |
| Run in CI **as the restricted application role** (inherited — the legacy's version of this check genuinely caught a defective migration) | Seed data is reviewed reference data, not copied rows |

## 7. The contract test suite

One **integration-test contract per repository port**, asserting behaviour against the **PostgreSQL contract rather than any provider's**:

- repository behaviour (CRUD, queries, pagination)
- **RLS assumptions** — enabled, FORCEd, GUC-scoped, non-empty adversarial expectations
- transaction semantics — `SET LOCAL`, isolation, rollback
- **`Money` persistence** — BIGINT minor units round-trip exactly, all exponents
- migrations — from-zero bootstrap produces the expected schema

The same suite must eventually run against **local Docker PostgreSQL, Cloud SQL, RDS, and any other approved provider** where practical. Local contract tests exist as of **Phase 2** — adapter, migration, outbox, and job-queue contract suites run against the Compose PostgreSQL locally and in CI, including concurrency proofs (two relays over 200 events; two workers over 100 jobs) and the from-zero migration bootstrap. The RLS and repository-port rows are active as of **Phase 3**: every module's repository integration suite runs its port against live PostgreSQL under `withPrincipalContext`, the RLS assumptions (enabled, FORCEd, GUC-scoped, fail-closed on unset context) are asserted adversarially on non-empty data per module and again by the cross-cutting `tests/security/` suite, and each suite bootstraps its own scratch database from zero — which re-proves the migration bootstrap on every run. **Cloud CI legs remain future** — they are added when those environments exist. A provider that fails the suite is not approved, whatever its marketing says.

## 8. What this document does not promise

| Not promised | Why |
|---|---|
| Engine-agnosticism | §1 — the isolation design is PostgreSQL-specific by choice |
| Every provider adapter now | Ports first; adapters when a deployment phase needs them |
| Zero-cost provider moves | Data migration is real work; §6 and the [migration contract](infrastructure-portability.md) make it *possible*, not free |
| Any specific provider's approval | Decisions and their evidence live in [`country-deployment-matrix.md`](country-deployment-matrix.md) |
