# Developer Onboarding

**Every question below must be answerable from `docs/` alone.** That is a Phase 0 exit criterion — if you cannot answer one from the documentation, the documentation has a gap and that is a bug worth reporting.

> **Note on provenance.** Architecture Plan v2 requires this document to answer "every §93 question plus five new ones", where §93 is a question list defined in **Plan v1**, which is not reproduced in the v2 document. The v1 list was not available when this was written. The questions below were reconstructed to cover the ground a §93-style onboarding list covers, and **the five new questions are quoted verbatim from Plan v2 §0.8**. If the original v1 §93 list surfaces, this document should be reconciled against it.

---

## The five new questions

Named explicitly in Plan v2 §0.8.

### 1. How do I add a capability?

[`../architecture/extension-pattern.md`](../architecture/extension-pattern.md).

Write `MODULE.md` first — all seventeen checklist points, before any code. Then: a new module directory, a `CapabilityDescriptor`, permissions, events in the catalogue, a Flutter feature folder, OpenAPI paths, projections, tests.

Then register the **append-only** seams: a `CapabilityId` union member, a PolicyPack clause, availability rows, an admin nav entry, a root module import, a route.

**Nothing existing is modified.** If adding a capability requires *editing* logic in an unrelated module, the seam is wrong and gets fixed before you proceed. Verify with the diff check in [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md).

Worked example: [`../scenarios/b-add-amanat.md`](../scenarios/b-add-amanat.md).

### 2. How do I add a country?

[`../architecture/jurisdiction-policy.md`](../architecture/jurisdiction-policy.md).

**You add a jurisdiction, not a country.** Country is an attribute; jurisdiction is the policy key.

- **Code:** one PolicyPack under `packages/jurisdiction-policy/src/packs/<j>/v1/` — deltas only. Plus locale resources and any jurisdiction-specific provider adapters.
- **Configuration:** jurisdiction record, operating-entity assignment, availability rows, legal document versions, provider enablement, plan availability.
- **External:** legal clearance per capability, an operating-entity and licensing decision, and a residency determination.

**Financial rules usually do not change.** A jurisdiction maps to an existing ruleset version unless rules genuinely differ — divergence requires evidence, not anticipation.

Worked example: [`../scenarios/a-new-country.md`](../scenarios/a-new-country.md).

### 3. How do I add an operating entity?

[`../architecture/operating-entity.md`](../architecture/operating-entity.md).

Configuration plus a legal decision. Create the `OperatingEntity` with its registered jurisdiction, permitted jurisdictions, data-protection role **per relationship**, licences held, contracting capacity, and legal document set.

**Moving existing users or records to a different entity is `EntityMigration`** — an explicit, audited operation with a re-consent evaluation step. **Never a silent `UPDATE`.** Historical records keep their original `operatingEntityAtCreation`, because that is what happened.

### 4. How do I classify data?

[`../security/data-classification.md`](../security/data-classification.md).

Six classes: `PUBLIC` · `INTERNAL` · `CONFIDENTIAL` · `HIGHLY_SENSITIVE_FINANCIAL` · `SECRET` · `SEALED`.

Classify **per data element, not per module** — Amanat is `CONFIDENTIAL` metadata and `SEALED` payload in the same aggregate. Declare it in the Prisma schema classification map, the event catalogue, the `CapabilityDescriptor`, and `MODULE.md`.

Raising a class is always permitted. **Lowering one requires an ADR**, because data already written under the lower expectation may have reached logs, events, or projections that cannot be recalled. **Nothing may ever be reclassified out of `SEALED`.**

### 5. How do I handle sealed data?

[`../architecture/sealed-data.md`](../architecture/sealed-data.md) and [`../security/sealed-access.md`](../security/sealed-access.md).

Mostly: **you do not.** `SEALED` payloads are unreachable without a `SealAccessGrant`, which is a required, non-nullable argument to `SealedRecordStore.read()`. There is no overload without one, and no `SUPPORT`, `ADMIN`, `ANALYTICS`, or `AI` grant type exists.

If you are building a sealed capability: split metadata from payload so **lifecycle is queryable while substance is not**; never project, log, or emit the payload; never let it reach an AI context; and remember that **the amount is sealed** — dashboards show counts, states, and ages, never sums.

---

## Getting started

### 6. How do I run the system locally?

```bash
make doctor      # verify your toolchain matches the pins
make bootstrap   # install workspace and Flutter dependencies
make dev         # bring up local infra; prints how to start each entrypoint
pnpm build       # compile once — the db CLI runs from dist
make db-create   # bootstrap roles, the local database, and grants (first run)
make db-migrate  # apply migrations as karar_migrator
make verify      # run the full local check suite
```

`make help` lists everything else. **Local development has zero cloud dependency** — no GCP account, no API key, no shared database. Without the two db steps the API boots but `/readyz` honestly answers 503 (Q40). If a host-level PostgreSQL already occupies 5432, set `POSTGRES_PORT=5433` first (Q48). As of Phase 2 the running system is infrastructure, real readiness, and the platform foundation; product capabilities do not exist yet (Q39).

### 7. What do I need installed?

Node, pnpm, Docker, and the Flutter SDK — versions pinned in `.tool-versions` and `package.json` engines. `make doctor` checks your machine against the pins.

### 8. Where does my code go?

| Writing… | Goes in |
|---|---|
| A business rule with no I/O | `modules/<m>/domain/` |
| A business operation | `modules/<m>/application/use-cases/` |
| An interface to something external | `modules/<m>/application/ports/` |
| An implementation of one | `modules/<m>/infrastructure/providers/` |
| A database query | `modules/<m>/infrastructure/persistence/` |
| An HTTP endpoint | `modules/<m>/presentation/http/` |
| A financial calculation | `packages/financial-engine/` |
| A jurisdictional rule | `packages/jurisdiction-policy/` |
| Client UI | `apps/mobile/lib/features/<f>/` |

### 9. What may import what?

[`../architecture/clean-architecture.md`](../architecture/clean-architecture.md), and every directory has a `README.md` stating its import rules.

Summary: dependencies point inward. `domain/` imports `shared-kernel` and nothing else. Cross-module imports resolve to `public-api.ts` and nothing else. `infrastructure/` depends on `application/`, not the reverse.

---

## Core concepts

### 10. How is money represented?

**`BIGINT` minor units + a `Currency` carrying its ISO 4217 exponent.** No floating point anywhere — database, domain, API, or Dart. On the wire, `minorUnits` is a **string**, because a 64-bit integer does not survive JavaScript's number type.

**Never assume the exponent is 2.** KWD, BHD, and OMR are three-decimal currencies. ([ADR-0006](../adr/0006-monetary-representation.md))

### 11. Who computes financial figures?

`packages/financial-engine`, once. **Not the client, not SQL, not a job's private copy, not the AI.** ([ADR-0007](../adr/0007-one-financial-engine.md))

### 12. How does the AI produce numbers?

**It does not.** The model receives `VerifiedFinancialFacts` and returns prose containing placeholders like `{{fact:monthly_surplus}}`. Karar substitutes the locale-formatted value.

This is simultaneously the numeric-safety mechanism and the Arabic/RTL/multi-currency rendering mechanism. ([ADR-0019](../adr/0019-verified-financial-facts.md))

### 13. How is tenant data isolated?

Four layers: RBAC, tenant-scoped repositories, **PostgreSQL RLS**, and adversarial tests.

**RLS is the boundary. The Prisma extension is convenience on top of it** — this is the thing most likely to be misremembered. ([`../architecture/tenancy.md`](../architecture/tenancy.md), [ADR-0022](../adr/0022-rls-phase-3.md))

### 14. Why must every tenant query be inside a transaction?

Prisma cannot set a session GUC per query outside an interactive transaction, and RLS needs `SET LOCAL app.tenant_id`. All tenant-scoped queries route through `withTenant(ctx, fn)`. This costs connection overhead and constrains query style — a documented, accepted cost.

### 15. How do modules talk to each other?

Domain events through a **transactional outbox** — state change and event enqueue commit in one transaction — or direct calls through `public-api.ts`. Every event is in the catalogue with declared consumers. ([ADR-0012](../adr/0012-event-bus-outbox.md), [ADR-0025](../adr/0025-event-governance.md))

### 16. Can I put a country code in my code?

**Yes, in reference data. No, in a business conditional.**

Localization tables, currency references, address and phone formatting, seed data, and test fixtures are fine. `if (country === 'QA')` in `domain/`, `application/`, or `presentation/` is not.

Use cases ask `EffectivePolicy` a question; they never branch on jurisdiction. ([ADR-0014](../adr/0014-jurisdiction-vs-country.md))

### 17. How do I know if a capability is available?

Ask the resolver. Every gate is AND: declared jurisdiction → PolicyPack clearance → operating entity permitted and licensed → availability row → environment → tenant entitlement → subscription and flags → integrations and consent.

**Deny by default: no availability row means `DISABLED`.** Every denial carries a machine-readable reason. ([`../architecture/capability-registry.md`](../architecture/capability-registry.md))

### 18. Where do I check capability availability?

**Two places: the controller boundary and inside the use case.** HTTP is not the only caller — jobs and AI tools call use cases directly.

---

## Working practices

### 19. What must I write before implementing a capability?

`MODULE.md`, answering all seventeen checklist points. Six are governance decisions and several need a legal answer. Template: [`../MODULE_TEMPLATE.md`](../MODULE_TEMPLATE.md).

### 20. How do I test?

| Layer | Style |
|---|---|
| `domain/`, pure packages | Unit tests. No mocks, no container, no database |
| `application/` | Use cases with in-memory port fakes |
| `infrastructure/` | Integration against real PostgreSQL in Docker |
| Tenant isolation | **Adversarial, asserting non-empty expected data**, exercising SELECT/UPDATE/DELETE |
| Architecture | 26 CI-blocking tests |

**Every control needs a test that fails when the control is removed** — a test that the *attack* fails, not that the control exists.

### 21. What will fail my build?

See [`../testing/architecture-tests.md`](../testing/architecture-tests.md) and the table in [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md).

### 22. How do I add a database table?

One forward-only migration file in `packages/platform/db/migrations/`, named `NNNN_description.sql` with the next free number **in your workstream's range** (`0001`–`0009` platform core, `0010`–`0019` audit, `0020`–`0029` eventing/jobs; later ranges assigned by the phase lead). In the same file: grant `karar_app` the **minimal DML the table needs** (audit tables `SELECT, INSERT` only; never `GRANT ALL`), and end with the mandatory `-- rollback:` recovery block — the runner rejects files without one. Then `pnpm --filter @karar/platform db:migrate && db:verify`. Canonical rules: [`packages/platform/db/migrations/README.md`](../../packages/platform/db/migrations/README.md).

The table also needs: `tenant_id` if tenant-owned, RLS enabled **and** FORCEd (activates Phase 3), and a full **lifecycle declaration** — in `MODULE.md` for module-owned tables, in [`DATA_LIFECYCLE.md`](../../packages/platform/db/DATA_LIFECYCLE.md) for platform tables no module owns ([ADR-0026](../adr/0026-data-lifecycle.md)) — plus pinning columns if it carries legal consequence. The SQL is **provider-neutral PostgreSQL**: no cloud-specific database feature without the documented exception in [`../architecture/database-portability.md` §3](../architecture/database-portability.md).

### 23. How do I add an external dependency?

**As a port.** Declare the interface in `application/ports/`, implement it in `infrastructure/providers/`, and provide a deterministic fake for tests. No vendor SDK appears outside `infrastructure/providers/`.

**A port with no implementation is honest. A fake implementation that pretends to work is not.**

### 24. What environments exist, and what must pass staging?

`LOCAL → DEV → STAGING → PRODUCTION`.

Mandatory staging passage: financial rules, migrations, AI changes, bank connectors, subscriptions, white-label configuration, mobile releases, **country policy changes, capability availability changes, operating-entity changes**, and sealed vault or key operations. ([`../architecture/environments.md`](../architecture/environments.md))

### 25. How do I get admin access to an environment?

Through the **control plane**. Your browser holds a session with the control plane only and **never an environment credential**; the control plane mints a short-lived, single-environment, purpose-scoped token per request. Production additionally requires a reason and may require a second approval. ([ADR-0021](../adr/0021-control-plane-gateway.md))

### 26. Where do secrets live?

`.env` locally (git-ignored; `.env.example` holds placeholders). A secret manager elsewhere. **Every environment has its own — never reuse production's encryption key anywhere.** ([`../security/secrets.md`](../security/secrets.md))

### 27. How do I write documentation?

**Derive it from source, not from the previous version of the document**, and label evidence CODE / RUNTIME / INFRASTRUCTURE / ABSENT. An INFRASTRUCTURE claim must never be read as a verified one. ([`../../CONTRIBUTING.md`](../../CONTRIBUTING.md))

### 28. What if I disagree with an architectural decision?

Read the ADR first — it records the alternatives that were rejected and why. If you have **new information**, write a superseding ADR. Do not edit the accepted one: the record of what was believed at the time is the point.

### 29. What was the legacy system, and can I copy from it?

`MoayadAlobaidi/Qarar` — a near-production Java/Spring Boot platform with a React Native client, audited in Phase 0.2.

**No. The greenfield rule is absolute** — [`../architecture/greenfield-rule.md`](../architecture/greenfield-rule.md). The legacy is a requirements, evidence, and test-case source, never a code, schema, or architecture source; every surviving behaviour travels the full sequence *requirement → domain model → use case → port → adapter*. What *is* reusable is knowledge, and it is more valuable than the code: the 2,028-line Zakat specification, tuned parsing rules with their test cases, schema and migration lessons, operational scripts, and the decisions with their rationale — including the mistakes.

[`../legacy/reusable-assets.md`](../legacy/reusable-assets.md) grades every asset. [`../legacy/security-findings.md`](../legacy/security-findings.md) records what must not be repeated.

### 30. What is the single most important lesson from the legacy?

Two, and they are different in kind.

**ENC-2 — the production encryption key is a one-way door and has already been lost once.** For `SEALED` data that failure is unrecoverable *and* undetectable, discovered at the worst possible moment. Hence an approved key-custody strategy, rotation, and the integrity canary (ADR-0017).

**P1 — the published AI consent notice described a redaction behaviour the code did not implement**, and that notice was the legal basis for a cross-border transfer of customer financial data. *The code was defensible; the document was wrong.* **Published legal text is part of the system.**

### 31. Which cloud provider does Karar depend on?

**None, by design.** Domain and application code know no cloud — every infrastructure dependency is a provider-neutral port, and cloud SDKs, provider clients, and provider URIs are banned outside `infrastructure/` adapters (architecture test 10).

Where a deployment actually runs is a **`DeploymentProfile`** — provider, region, database, storage, keys — resolved at the infrastructure edge, per deployment, and recorded in the [country deployment matrix](../architecture/country-deployment-matrix.md). Qatar's candidate is GCP (**UNVERIFIED**, no account exists); other jurisdictions may use other providers; a partner bank may mandate its own. The database commitment is **PostgreSQL the engine, portable across managed providers** — not any one vendor's PostgreSQL ([`../architecture/database-portability.md`](../architecture/database-portability.md)).

Practical consequences: persist `ObjectRef`/`SecretRef`/`KeyRef`, never a `gs://` or `arn:` value; read ports, never `GCP_PROJECT_ID`; and write provider-neutral SQL.

---

## Running and extending the workspace

Added in Phase 1, when the repository became executable.

### 32. How do I run all checks?

`make verify` — the same suite CI runs, minus the scans that only make sense in CI. `make help` lists every target. The CI-enforced rules themselves are tabulated in [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) and specified in [`../testing/architecture-tests.md`](../testing/architecture-tests.md).

### 33. How do I add an app, package, or module?

- **App:** a new entrypoint under `apps/` — composition and startup only, no business logic (`apps/README.md`).
- **Package:** under `packages/`, only if it is genuinely shared; the pure packages must stay framework-free (architecture test 17).
- **Module:** a capability — follow [`../architecture/extension-pattern.md`](../architecture/extension-pattern.md), `MODULE.md` first (Q1), and the seam-verification diff in [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md).

### 34. How do I add a DeploymentProfile?

A `DeploymentProfile` is typed infrastructure configuration, never business code: define the profile per [`../architecture/infrastructure-portability.md` §2](../architecture/infrastructure-portability.md), wire its routing assignment per §3, bind it to a Terraform composition, and record the decision in the [country deployment matrix](../architecture/country-deployment-matrix.md) — following its new-country bootstrap workflow, with unknowns marked, never invented.

### 35. How do I add a cloud adapter?

Implement an existing provider port from the canonical catalogue ([`../architecture/infrastructure-portability.md` §5](../architecture/infrastructure-portability.md)) in `infrastructure/providers/`; if no port fits, declare one in `application/ports/` first (Q23). Nothing provider-specific leaves the adapter — no cloud SDK, client, or URI in `domain/` or `application/` (architecture test 10). The database is the deliberate exception: no per-cloud persistence adapters exist (Q36).

### 36. How do I add a database connection profile?

Not a new adapter — the one `PostgresPersistenceAdapter` serves every approved managed PostgreSQL. Add a connection profile and its `DataSourceResolver` mapping per [`../architecture/database-portability.md` §2/§4](../architecture/database-portability.md); provider differences stay in Terraform, networking, TLS, IAM, secrets, backup, and HA configuration.

### 37. How are security controls mapped, and where is evidence recorded?

[`../compliance/control-matrix.md`](../compliance/control-matrix.md) maps platform controls to SOC 2 and ISO/IEC 27001; [`../compliance/evidence-register.md`](../compliance/evidence-register.md) records the evidence, fed by every phase's report ([`../phases/README.md`](../phases/README.md)). This is readiness work — no certification is claimed.

### 38. What is the current phase?

Phase 2 — platform and data foundation, in progress. The live status is the [root README status block](../../README.md#status); the detail is [`../phases/phase-02.md`](../phases/phase-02.md).

### 39. What is explicitly out of scope right now?

Product capabilities. Phase 2 delivers the backend platform foundation — configuration, database, audit, events/outbox/jobs, observability — with no budgets, transactions, Zakat, AI, identity, or tenancy, and no cloud provisioned. The full out-of-scope list is in [`../phases/phase-02.md`](../phases/phase-02.md).

---

## The platform foundation

Added in Phase 2, when the database, eventing, and observability foundations became real.

### 40. How do migrations work — and how do I create a database from zero?

Plain SQL files in `packages/platform/db/migrations/`, applied in strict filename order by the platform runner, each in its own transaction, recorded in `platform.schema_migrations` with a sha256 checksum; drift on an applied file fails hard. Any database — first, second, or scratch — is created identically, never by copying another:

```bash
KARAR_DB_NAME=<name> pnpm --filter @karar/platform db:create   # roles, database, grants
KARAR_DB_NAME=<name> pnpm --filter @karar/platform db:migrate  # full history as karar_migrator
KARAR_DB_NAME=<name> pnpm --filter @karar/platform db:verify   # expect: status clean
```

Canonical: [`packages/platform/db/migrations/README.md`](../../packages/platform/db/migrations/README.md); the portability rule it satisfies is [`../architecture/database-portability.md` §6](../architecture/database-portability.md).

### 41. Which database role may do what?

Three roles, least privilege each ([`../architecture/backend.md` §6](../architecture/backend.md)): the compose **superuser** is used only by `db:create`/`db:reset-local` to create roles, databases, and grants; **`karar_migrator`** owns the `platform`/`audit` schemas and applies migrations — restricted (`NOSUPERUSER`, `NOBYPASSRLS`), so a migration needing elevated privilege fails on a laptop; **`karar_app`** is the runtime role — per-table minimal DML granted by each table's own migration, no DDL, no `BYPASSRLS`, and deliberately no DELETE on outbox/jobs/audit tables. The api and worker connect as `karar_app`, the runner as `karar_migrator`, and nothing runs as superuser.

### 42. Events vs jobs — which do I use?

**Events are facts; jobs are work.** An event records that something *happened* — past tense, immutable, published through the outbox, consumed by whoever the catalogue allows. A job *requests* that something be done — it retries, exactly one worker holds its lease at a time, and it ends in an outcome (`succeeded`/`failed_retryable`/`dead`). If it can fail and be retried, it is a job; if it is true forever once said, it is an event. Publishing a command as an event is RPC-over-bus ([`../architecture/event-governance.md` §5](../architecture/event-governance.md), [ADR-0013](../adr/0013-worker-entrypoint.md)).

### 43. How does the outbox guarantee delivery?

The envelope is inserted in **the same transaction** as the state change (`enqueueInTransaction`), so neither commits without the other. The relay claims rows with `FOR UPDATE SKIP LOCKED`, publishes, and marks `published_at` only after the publisher succeeded; failures retry with exponential backoff and dead-letter at `max_attempts`, counted by an alertable metric. Delivery is **at-least-once**, made safe by consumer receipts: `withIdempotency` records `(consumer, eventId)` in the consumer's own transaction, so a duplicate is a no-op. ([`../architecture/backend.md` §8](../architecture/backend.md), [ADR-0012](../adr/0012-event-bus-outbox.md))

### 44. How do I add an event safely?

Catalogue first: declare it in `packages/api-contracts/events/catalogue.json` — name, `schemaVersion`, owner module, classification, `allowedConsumers`, retention, payload rule and schema. `SEALED` events carry identifiers and status only, no exemption exists; `HIGHLY_SENSITIVE_FINANCIAL` beyond identifier-only needs a `payloadExemption`. Then publish through `makeEnvelope` + `enqueueInTransaction` (the payload is validated against the catalogue and the classification rules at publish time), and each consumer must be named in `allowedConsumers` — the bus refuses an undeclared subscription. Canonical rules: [`../architecture/event-governance.md`](../architecture/event-governance.md).

### 45. How do I add a job handler?

Register it by `job_type` in the worker's `JobHandlerRegistry` (duplicate registration throws): `registry.register('my.job.type', handler)`. A handler receives the claimed job and a context with `heartbeat()` for lease extension on long work, and it **calls a use case** — a job cannot make a transition a human path could not ([ADR-0013](../adr/0013-worker-entrypoint.md)). Enqueue with `queue.enqueue({ jobType, payload, idempotencyKey?, … })`; the same `(jobType, idempotencyKey)` enqueued twice returns the first job. The poller converts handler errors into job outcomes — throw, never log-and-swallow.

### 46. Where are logs, metrics, and traces configured — and how is redaction enforced?

In `packages/platform/src/observability`: pino JSON logs and `@opentelemetry/api` helpers; the apps initialize the OTel SDK at their composition roots (`apps/*/src/telemetry/`) and export OTLP to the Compose collector (`OTEL_EXPORTER_OTLP_ENDPOINT`). Redaction is layered and automatic: credential-shaped keys are replaced on every log object, `SecretValue` self-redacts on every rendering path, and the classification module's sink rules keep `SECRET`/`SEALED` out entirely. Log an error **once**, at the boundary that converts it; interior code rethrows. ([`../architecture/backend.md` §11](../architecture/backend.md))

### 47. How is audit different from logs?

Logs are operational telemetry — free-form, retention by ops policy, consumed by engineers, and lines can be lost without a correctness problem. Audit is an **accountability record**: structured `audit.audit_events` rows written through the audit module's use case, append-only by both revoked grants and an owner-proof trigger, with a metadata guard keeping payloads out. If the answer to "who did what, when, to which resource, with what outcome" must survive scrutiny, it is audit; if it helps debug Tuesday's incident, it is a log. ([`../architecture/data-model.md` §10](../architecture/data-model.md), [`modules/audit/MODULE.md`](../../modules/audit/MODULE.md))

### 48. How do I run every test, including the live-PostgreSQL suites?

`make test` (or `pnpm test` plus `flutter test`) runs the whole workspace — the platform's migration, audit-immutability, outbox, and jobs suites included, which need the Compose PostgreSQL: `make dev` first. On machines where a host-level PostgreSQL already listens on 5432, point everything at the Compose instance with `POSTGRES_PORT=5433` in `.env` (compose republishes on it) — the test suites and the db CLI read the same variable, `PGPORT` works too. `make verify` runs the full local gate; CI runs the same suites against its own Compose PostgreSQL. ([Q32](#32-how-do-i-run-all-checks); [`../architecture/backend.md` §12](../architecture/backend.md))
