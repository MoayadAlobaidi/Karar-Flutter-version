# Karar

Karar is a **Qatar-first personal-finance platform**: an API-first, extensible capability platform for personal financial wellbeing, serving consumers directly and — by design, not yet by implementation — partner banks through white-label and embedded channels. It operates across multiple jurisdictions through multiple legal entities, with a Flutter client and a TypeScript backend. Qatar is the launch market; KSA, UAE, and Oman are planned expansion markets with no launch commitment.

Karar is a platform whose unit of extension is a **capability** — a bounded context with an owner, its own vocabulary, permissions, data classification, and jurisdictional availability — not a budgeting app that will later grow features. It is a **greenfield rebuild**: the legacy system (Qarar) is a requirements, evidence, and test-case source, never a code source ([greenfield rule](docs/architecture/greenfield-rule.md)).

**What Karar is not** (stated plainly so nothing is inferred from silence):

- Karar does not custody customer funds and is not a payment processor. Billing may be orchestrated through approved external providers, which execute settlement; Karar records subscription and entitlement state and verified billing events.
- Karar makes no credit decision and gives no investment advice.
- Karar's AI never computes a financial result — it explains figures the deterministic engine produced, and it never writes a number.
- Karar claims no compliance certification, no regulatory approval, no production readiness, and no Sharia review, anywhere in this repository.

The full list with rationale is in [`docs/architecture/overview.md` §2](docs/architecture/overview.md).

## Status

| | |
|---|---|
| Current phase | **3 — COMPLETE** ([phase report](docs/phases/phase-03.md)); Phase 3.5 not started |
| Last completed phase | 2 (platform and data foundation, [report](docs/phases/phase-02.md)) |
| Branch model | `main` + phase branches (`claude/karar-v2-phase-1-foundation`) |
| Application implementation | Platform foundation plus identity, tenancy, and access control — no consumer product capabilities are implemented |
| Cloud | None provisioned; local development is cloud-free |
| Compliance | Readiness framework in place; **no certification is claimed** |

## Start here

| If you want to… | Read |
|---|---|
| Understand the system | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Know why something is the way it is | [`docs/adr/`](docs/adr/README.md) — 26 decision records |
| Onboard as an engineer | [`docs/onboarding/developer.md`](docs/onboarding/developer.md) |
| Run it locally | [Developer quick start](#developer-quick-start) below |
| See how it extends | [`docs/architecture/extension-pattern.md`](docs/architecture/extension-pattern.md) |
| See it worked end to end | [`docs/scenarios/`](docs/scenarios/a-new-country.md) — four scenarios |
| Understand the legacy system | [`docs/legacy/qarar-audit.md`](docs/legacy/qarar-audit.md) |
| Look up a term | [`docs/glossary.md`](docs/glossary.md) |

## The decisions everything follows from

1. **Clean Architecture, compiler-enforced.** `domain/` and the pure packages declare zero framework dependencies, so a forbidden import does not resolve. ([ADR-0001](docs/adr/0001-clean-architecture.md))
2. **Modular monolith with real seams.** One deployable; `sealed-vault` designed from day one to be extracted. ([ADR-0002](docs/adr/0002-modular-monolith.md))
3. **One authoritative financial engine.** Money is BIGINT minor units with a `Currency` carrying its ISO 4217 exponent; the client computes nothing authoritative. ([ADR-0006](docs/adr/0006-monetary-representation.md), [ADR-0007](docs/adr/0007-one-financial-engine.md))
4. **Policy is typed code; availability is audited configuration** — and settings may only restrict what code permits, never expand it. ([ADR-0015](docs/adr/0015-policy-packs.md))
5. **Deny by default.** A capability with no availability row is `DISABLED`; code existing is never sufficient for exposure. ([ADR-0016](docs/adr/0016-capability-registry.md))
6. **Greenfield, and cloud-portable.** The legacy is knowledge, never code; deployments bind to providers through `DeploymentProfile`s; the database commitment is PostgreSQL-the-engine. ([greenfield rule](docs/architecture/greenfield-rule.md), [ADR-0023](docs/adr/0023-deployment-topology-ladder.md))

## System context

Dashed elements are future integrations — designed as ports, not yet implemented.

```mermaid
graph TB
    CONS[Consumer]
    PARTNER[Partner / white-label client]
    HEADLESS[SDK / headless client]
    SA[Super Admin]

    CONS --> MOB[Karar mobile<br/>Flutter]
    MOB --> EDGE
    PARTNER --> EDGE
    HEADLESS --> EDGE
    SA --> CP[Control plane<br/>security gateway]
    CP --> EDGE

    EDGE[DeploymentRouter + DeploymentDirectory<br/>Karar edge] --> API[Karar API<br/>modular monolith]
    API --> WRK[Worker<br/>outbox relay · jobs · projections]
    API --> PG[(PostgreSQL<br/>RLS + tenant_id)]
    WRK --> PG

    API -.-> AIP[AI providers<br/>future]
    API -.-> BANK[Bank / data providers<br/>future]
    API -.-> BILL[External billing providers<br/>future]

    style AIP stroke-dasharray: 5 5
    style BANK stroke-dasharray: 5 5
    style BILL stroke-dasharray: 5 5
    style EDGE fill:#fff4e8,color:#111
```

## Containers

| Container | What it is |
|---|---|
| `apps/mobile` | Flutter client (consumer + white-label flavors). Renders values; computes nothing authoritative |
| `apps/api` | NestJS modular monolith — the only public API surface |
| `apps/worker` | Second entrypoint over the same modules: outbox relay, projections, scheduled jobs |
| `apps/admin` | Super Admin SPA; talks to the control plane only, carries no database driver |
| `packages/` | Six shared packages; four are framework-free pure. `platform` is the backend platform library shared by api and worker — typed config, the PostgreSQL foundation (including the Prisma runtime and the RLS principal context), errors, observability, events/outbox/jobs |
| `modules/` | 21 bounded contexts, each behind a `public-api.ts` |
| PostgreSQL | The one authoritative store — RLS-enforced tenant isolation |
| Local infra | Docker Compose ([`docker-compose.yml`](docker-compose.yml)): `postgres`, `redis`, `minio`, `otel-collector` — zero cloud dependency |
| Provider adapters | Every external dependency (AI, storage, keys, messaging, identity, billing) behind a port in `infrastructure/` |

## Request and deployment routing

Routing solves two problems with two mechanisms, both invisible to domain code ([`infrastructure-portability.md` §3](docs/architecture/infrastructure-portability.md)):

```mermaid
graph TB
    C[Client] --> DR[DeploymentRouter — Karar edge]
    DR --> DD[DeploymentDirectory lookup]
    DD --> DP[Home deployment — DeploymentProfile]
    DP --> RT[Karar runtime]
    RT --> DSR[DataSourceResolver — tenant datasource]
    DSR --> PG[(PostgreSQL)]
```

Four clarifications, one line each:

1. Routing to the correct deployment happens **before any business-data access**.
2. Portability does not mean cross-cloud credential sprawl — a runtime holds credentials for its own deployment's resources only.
3. Each deployment prefers its own resources; cross-deployment access requires an explicitly reviewed architecture.
4. Provider assignments are configuration, recorded in the [country deployment matrix](docs/architecture/country-deployment-matrix.md) — never code, never assumption.

## Clean architecture

Dependencies point inward, and the compiler enforces it: `domain/` and the pure packages declare zero framework dependencies, so a forbidden import does not resolve.

```
presentation/    HTTP controllers, DTOs           → may use application/
application/     use cases, ports                 → may use domain/
domain/          entities, rules, no I/O          → may use shared-kernel only
infrastructure/  adapters, persistence, providers → implements application/ ports
```

Cross-module imports resolve to the target module's `public-api.ts` and nothing else. Four packages (`shared-kernel`, `financial-engine`, `jurisdiction-policy`, `state-machine`) are pure — no framework, no I/O. Forbidden imports fail the architecture tests in CI, not a code review's memory. See [`clean-architecture.md`](docs/architecture/clean-architecture.md) and [`architecture-tests.md`](docs/testing/architecture-tests.md).

## Repository structure

```
apps/        mobile · api · worker · admin — entrypoints, no business logic
packages/    shared-kernel · financial-engine · jurisdiction-policy · state-machine · api-contracts · platform
modules/     21 bounded contexts, each with public-api.ts and MODULE.md
infra/       Terraform — contracts · providers · per-deployment compositions
docs/        architecture · adr · security · compliance · phases · legacy · onboarding
scripts/     verification, checks, helpers
docker-compose.yml   local infrastructure (LOCAL environment)
```

Every significant directory has a `README.md` stating what it owns and what may import it.

## Domain and capability map

Full detail, including availability, gates, and external providers: [`capability-map.md`](docs/architecture/capability-map.md).

| Capability / context | In one phrase |
|---|---|
| `financial-accounts` | Institutions, connectors, account records |
| `transactions` | Ingestion, normalization, dedup, categorization |
| `budgets` | Budget definition and tracking |
| `goals` | Savings plans and goals |
| `insights` | Derived financial insight from engine facts |
| `zakat` | Deterministic Zakat calculation and tracking — never payment, never a fatwa |
| `ai` | AI orchestration over verified facts |
| `amanat` | Sealed after-death information handover — gated `PENDING_LEGAL_REVIEW` |
| `identity` | Authentication, sessions, MFA |
| `users` | Profile and preferences |
| `tenancy` | Tenant model and isolation |
| `authorization` | Deny-by-default RBAC — permission catalogue, roles, the central `PolicyService` |
| `operating-entity` | Legal person, controller/processor roles, entity migration |
| `consent` | Consent triple, legal documents, re-consent |
| `audit` | Append-only audit records |
| `capability-registry` | Descriptors, availability, deny-by-default |
| `documents` | Evidence files behind the object-storage port |
| `sealed-vault` | Grant-gated `SEALED` storage |
| `notifications` | Delivery behind channel ports |
| `projections` | Rebuildable read models for admin/ops |
| `control-plane` | Security gateway and scoped token minting |

## Country and jurisdiction model

Seven separated dimensions, deliberately never conflated:

- **Country** — geography (ISO 3166-1); keys currency defaults, languages, formatting. An attribute, not the policy key.
- **Jurisdiction** — the legal regime governing a person or record. The policy key.
- **OperatingEntity** — the legal person providing the service and bearing responsibility; determines controller/processor roles.
- **SubjectPolicySelection** — the elective option-set a subject chose, versioned and pinned, within what the jurisdiction permits.
- **DeploymentProfile** — where and on what infrastructure a deployment runs; an infrastructure concept, never a business one.
- **Tenant** — the brand and product boundary a user belongs to; the isolation key.
- **Brand** — presentation identity (tokens, name, app identity); configuration on top of a tenant.

See [`jurisdiction-policy.md`](docs/architecture/jurisdiction-policy.md) and [`operating-entity.md`](docs/architecture/operating-entity.md).

## Infrastructure and database portability

Karar is multi-cloud capable by structure: no business capability knows which cloud hosts it. GCP is one provider profile — the Qatar candidate, **UNVERIFIED**, no account exists. The UAE may use a locally-available provider; a partner bank may mandate its own.

The database commitment is **PostgreSQL the engine**, portable across managed providers: one `PostgresPersistenceAdapter` serves them all, and provider differences live in connection profiles and Terraform. Replacing PostgreSQL itself would be a deliberate migration project, not a configuration change — that limit is stated, not hidden.

See [`infrastructure-portability.md`](docs/architecture/infrastructure-portability.md) and [`database-portability.md`](docs/architecture/database-portability.md).

## Environments

`LOCAL → DEV → STAGING → PRODUCTION`. Local development has zero cloud dependency. **Production must not be introduced before a separate staging environment exists** — a hard Phase 20 gate, and the changes that must pass staging first are enumerated in [`environments.md`](docs/architecture/environments.md).

## Security architecture

Summary only — canonical documents under [`docs/security/`](docs/README.md#security):

- **Tenant isolation:** RBAC, tenant-scoped repositories, PostgreSQL RLS (enabled and FORCEd), adversarial tests asserting on non-empty data.
- **Least privilege:** migrations run as a restricted role; the admin SPA never holds an environment credential; the control plane mints short-lived scoped tokens.
- **Audit:** append-only records; every sealed access, disclosure, and entity migration is audited.
- **Sealed data:** `SEALED` is inaccessible to Karar itself without a typed `SealAccessGrant`; key custody is provider-neutral with an integrity canary.
- **Secrets:** never in the repository, logs, or error messages; per-environment keys, never reused.
- **Data classification:** six classes, declared per data element, with lifecycle declarations per dataset.
- **Incident response and secure SDLC:** documented procedures, CI security scans, SBOM, and supply-chain controls.

## Compliance readiness

Karar maintains a **SOC 2 and ISO/IEC 27001 readiness** approach: a control matrix mapping platform controls to both frameworks, and an evidence register that phases feed. Honest current status: the framework exists, most controls are DESIGNED rather than operating, and **no certification of any kind is claimed**. See [`docs/compliance/`](docs/compliance/README.md).

## AI architecture

The AI layer is model-independent behind an `AIProvider` port with an orchestrator, and it consumes `VerifiedFinancialFacts` — typed values the financial engine computed — never raw transactions. AI is never authoritative for financial results; responses carry fact placeholders that Karar substitutes with locale-formatted values. AI routing is independent of the hosting provider, and `SEALED` data never reaches an AI context. See [`docs/architecture/ai.md`](docs/architecture/ai.md).

## White label, SDK, and embedded

White label distinguishes the **control plane** (configuring a partner tenant) from the **data plane** (that configuration changing what a customer sees) — both are budgeted, and no partner ever requires a code fork. Brand configuration, capability entitlements, and the partner's own operating entity are configuration. Partner integration is OpenAPI-first with generated SDKs; embedding the Flutter client add-to-app is a Phase 15 boundary. See [`white-label.md`](docs/architecture/white-label.md) and [`sdk-strategy.md`](docs/architecture/sdk-strategy.md).

## Developer quick start

Prerequisites are pinned in [`.tool-versions`](.tool-versions) (Node, pnpm, Flutter); Docker is required. Then:

```bash
make doctor           # verify your toolchain matches the pins
make bootstrap        # install workspace and Flutter dependencies
make dev              # bring up local infra; prints how to start each entrypoint
make prisma-generate  # generate the Prisma client (git-ignored; needed before compiling)
pnpm build            # compile once — the db CLI runs from dist
make db-create        # bootstrap database roles and grants (first run)
make db-migrate       # apply migrations as the restricted migrator role
make verify           # run the full local check suite
```

`make help` lists the remaining targets (`prisma-drift` verifies the Prisma mapping against the live database). `make dev` starts the Compose services and tells you how to run the API, worker, admin, and mobile entrypoints; the API always serves the health endpoints (`/readyz` answers 503 until the database is created and migrated — a real check, not a constant). If a host-level PostgreSQL already occupies 5432, set `POSTGRES_PORT=5433` in `.env` first. A clean-machine walkthrough of these commands is part of phase verification.

No cloud account, API key, or shared database is required for any of it — that is a design rule, not a convenience ([`environments.md` §3](docs/architecture/environments.md)).

## Testing and CI

- **Unit tests** for `domain/` and the pure packages — no mocks, no container.
- **Integration tests** against real PostgreSQL in Docker — since Phase 2 the workspace suite includes live-PostgreSQL runs of the migration, audit-immutability, outbox, and jobs suites, with concurrency proofs (two relays over 200 events; two workers over 100 jobs). `make dev` first; see the quick-start port note for machines with a host PostgreSQL.
- **Adversarial security tests** — since Phase 3, per-module isolation suites plus the cross-cutting [`tests/security/`](tests/security) suite: two tenants seeded with real rows, own-tenant data proven non-empty first, then cross-tenant SELECT/INSERT/UPDATE/DELETE denial, pooled-connection context hygiene, and privilege-escalation probes ([`tenancy.md`](docs/architecture/tenancy.md)).
- **Contract tests** per repository port against the PostgreSQL contract, per [`database-portability.md` §7](docs/architecture/database-portability.md) — platform DB/outbox/jobs contracts run locally and in CI today, module repository ports since Phase 3; cloud provider legs are future.
- **Architecture tests** — 26 CI-blocking structural tests, kept in a registry with per-test activation phases; a test activates when the structure it guards exists.
- **Security scans and SBOM** — dependency and secret scanning, software bill of materials, supply-chain checks.

Required PR checks must pass before merge — CI blocks the merge, not merely the workflow run. The workflows are [`ci.yml`](.github/workflows/ci.yml) (lint, type-check, build, tests, architecture tests) and [`security.yml`](.github/workflows/security.yml) (scans, SBOM). See [`architecture-tests.md`](docs/testing/architecture-tests.md).

Security concerns are reported privately per [`SECURITY.md`](SECURITY.md), never as public issues.

## Roadmap and phase discipline

Completed: 0, 0.5, 1, 2, and 3 — the last delivering identity, users, tenancy, operating entities, RBAC, consent with re-consent evaluation, sessions, kill switches, PostgreSQL RLS, and adversarial cross-tenant tests. Next: 3.5 (jurisdiction and capability foundation — PolicyPacks, capability availability, `SubjectPolicySelection` resolution, session tenant binding), not started.

Every phase ends with the same documented update set — README status block, roadmap, phase report, onboarding if commands changed, evidence register — specified in [`docs/phases/README.md`](docs/phases/README.md). Full phase table and gates: [`docs/roadmap.md`](docs/roadmap.md).

## Documentation index

| | |
|---|---|
| Architecture | [`docs/architecture/`](docs/architecture/overview.md) — start at the overview |
| Decisions | [`docs/adr/`](docs/adr/README.md) — 26 records |
| Security | [`docs/security/`](docs/README.md#security) |
| Compliance | [`docs/compliance/`](docs/compliance/README.md) · policies in [`docs/policies/`](docs/policies/README.md) |
| Onboarding | [`docs/onboarding/developer.md`](docs/onboarding/developer.md) |
| Roadmap | [`docs/roadmap.md`](docs/roadmap.md) |
| Capability map | [`docs/architecture/capability-map.md`](docs/architecture/capability-map.md) |
| Deployment matrix | [`docs/architecture/country-deployment-matrix.md`](docs/architecture/country-deployment-matrix.md) |
| Phase reports | [`docs/phases/`](docs/phases/README.md) |
| Glossary | [`docs/glossary.md`](docs/glossary.md) |
| Documentation rules | [`docs/documentation-style-guide.md`](docs/documentation-style-guide.md) |

## Licence

Proprietary. All rights reserved.
