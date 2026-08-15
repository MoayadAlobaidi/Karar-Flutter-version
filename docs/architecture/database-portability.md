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
PostgresPersistenceAdapter        (infrastructure/persistence/ — ONE implementation, Prisma, confined)
        ↓
DataSource / connection factory
        ↓
DatabaseProfile                   (per DeploymentProfile)
        ↓
Managed PostgreSQL
```

The application requests a **`Repository`** — never a `CloudSQLClient`, `AwsRdsClient`, or `SupabaseClient`.

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

The same suite must eventually run against **local Docker PostgreSQL, Cloud SQL, RDS, and any other approved provider** where practical. Local contract tests begin in **Phase 1–2**; cloud CI execution is added when those environments exist. A provider that fails the suite is not approved, whatever its marketing says.

## 8. What this document does not promise

| Not promised | Why |
|---|---|
| Engine-agnosticism | §1 — the isolation design is PostgreSQL-specific by choice |
| Every provider adapter now | Ports first; adapters when a deployment phase needs them |
| Zero-cost provider moves | Data migration is real work; §6 and the [migration contract](infrastructure-portability.md) make it *possible*, not free |
| Any specific provider's approval | Decisions and their evidence live in [`country-deployment-matrix.md`](country-deployment-matrix.md) |
