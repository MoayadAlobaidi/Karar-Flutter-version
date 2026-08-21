# Developer Onboarding

**Every question below must be answerable from `docs/` alone.** That is a Phase 0 exit criterion — if you cannot answer one from the documentation, the documentation has a gap and that is a bug worth reporting.

> **Note on provenance.** Architecture Plan v2 requires this document to answer "every §93 question plus five new ones", where §93 is a question list defined in **Plan v1**, which is not reproduced in the v2 document. The v1 list was not available when this was written. The questions below were reconstructed to cover the ground a §93-style onboarding list covers, and **the five new questions are quoted verbatim from Plan v2 §0.8**. If the original v1 §93 list surfaces, this document should be reconciled against it.

---

## The five new questions

Named explicitly in Plan v2 §0.8.

### 1. How do I add a capability?

[`../architecture/extension-pattern.md`](../architecture/extension-pattern.md).

Write `MODULE.md` first — all seventeen checklist points, before any code. Then: a new module directory, a descriptor entry, permissions declared in `MODULE.md` and seeded by migration, events in the catalogue, a Flutter feature folder, OpenAPI paths, projections, tests.

Then register the **append-only** seams: a `CAPABILITY_IDS` union member, its descriptor, the matching database CHECK constraint, a PolicyPack clause, availability rows, an admin nav entry, a root module import, a route. Step by step with the honest starting values: [Q55](#55-how-do-i-add-a-capability-in-practice).

**Nothing existing is modified.** If adding a capability requires *editing* logic in an unrelated module, the seam is wrong and gets fixed before you proceed. Verify with the diff check in [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md).

Worked example: [`../scenarios/b-add-amanat.md`](../scenarios/b-add-amanat.md).

### 2. How do I add a country?

[`../architecture/jurisdiction-policy.md`](../architecture/jurisdiction-policy.md).

**You add a jurisdiction, not a country.** Country is an attribute; jurisdiction is the policy key.

- **Code:** an entry in `packages/jurisdiction-policy/src/jurisdiction.ts` and one PolicyPack under `src/packs/`. Plus locale resources and any jurisdiction-specific provider adapters.
- **Migration:** a `countries` row if the country is new, and a `jurisdictions` row. The registers change by reviewed migration only — no runtime path exists to edit them.
- **Runtime:** jurisdiction assignments, pack activation for the environment, availability rows, entitlements, legal document versions.
- **External:** legal clearance per capability, an operating-entity and licensing decision, and a residency determination.

**Financial rules usually do not change.** A jurisdiction maps to an existing ruleset version unless rules genuinely differ — divergence requires evidence, not anticipation.

Step by step: [Q54](#54-how-do-i-add-a-jurisdiction-in-practice). Worked example: [`../scenarios/a-new-country.md`](../scenarios/a-new-country.md).

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
make doctor           # verify your toolchain matches the pins
make bootstrap        # install workspace and Flutter dependencies
make dev              # bring up local infra; prints how to start each entrypoint
make prisma-generate  # generate the Prisma client (git-ignored; needed before compiling)
pnpm build            # compile once — the db CLI runs from dist
make db-create        # bootstrap roles, the local database, and grants (first run)
make db-migrate       # apply migrations as karar_migrator
make verify           # run the full local check suite
```

`make help` lists everything else. **Local development has zero cloud dependency** — no GCP account, no API key, no shared database. Without the two db steps the API boots but `/readyz` honestly answers 503 (Q40). If a host-level PostgreSQL already occupies 5432, set `POSTGRES_PORT=5433` first (Q48). The running system is the platform foundation plus identity, users, tenancy, authorization, operating-entity, consent, the kill-switch slice, and — since the Phase 5 activation — the financial surface: **27 operations under `/financial/*`, served by eight controllers composed in `apps/api/src/composition/phase5-modules.ts`.** They need a signed-in session bound to a tenant, so the seed step below is a prerequisite for reaching any of them; without a principal they answer 401, and with an unbound session 403. No client calls them (Q39).

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
| Client UI | `apps/mobile/lib/features/<f>/` — and its own rules, in [`flutter.md`](flutter.md) |
| A user-facing string | `apps/mobile/lib/l10n/arb/app_en.arb` **and** `app_ar.arb` — never a Dart file |

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

Four layers: RBAC, tenant-scoped repositories, **PostgreSQL RLS**, and adversarial tests. All four are implemented as of Phase 3.

**RLS is the boundary. The repository filter is convenience on top of it** — this is the thing most likely to be misremembered. ([`../architecture/tenancy.md`](../architecture/tenancy.md), [ADR-0022](../adr/0022-rls-phase-3.md))

### 14. Why must every tenant query be inside a transaction?

Prisma cannot set a session GUC per query outside an interactive transaction, and RLS needs transaction-local (`SET LOCAL`) GUC bindings. All principal-scoped queries route through `withPrincipalContext` — or its tenant+user sugar `withTenant` — which binds the `app.*` GUCs as the transaction's first statement (Q49). This costs connection overhead and constrains query style — a documented, accepted cost.

### 15. How do modules talk to each other?

Domain events through a **transactional outbox** — state change and event enqueue commit in one transaction — or direct calls through `public-api.ts`. Every event is in the catalogue with declared consumers. ([ADR-0012](../adr/0012-event-bus-outbox.md), [ADR-0025](../adr/0025-event-governance.md))

### 16. Can I put a country code in my code?

**Yes, in reference data. No, in a business conditional.**

Localization tables, currency references, address and phone formatting, seed data, and test fixtures are fine. `if (country === 'QA')` in `domain/`, `application/`, or `presentation/` is not.

Use cases ask `EffectivePolicy` a question; they never branch on jurisdiction. ([ADR-0014](../adr/0014-jurisdiction-vs-country.md))

### 17. How do I know if a capability is available?

Ask the resolver. Eight gates, all AND, in this order: descriptor (implemented and deployed here) → environment → jurisdiction and PolicyPack clearance → availability row → tenant entitlement → consent → operating-entity licence → provider.

**Deny by default: no availability row means `DISABLED`, and no entitlement row means denied.** Every denial carries a machine-readable reason internally; only actionable ones reach a client. Reading one: [Q57](#57-how-do-i-read-an-availability-denial). ([`../architecture/capability-registry.md` §4](../architecture/capability-registry.md))

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
| Architecture | 26 CI-blocking tests plus a canary-purity check; of the 27 registry entries, 24 are ACTIVE and pass, 0 fail, and 3 are deferred to phase 13, with a self-test on the same invocation |

**Every control needs a test that fails when the control is removed** — a test that the *attack* fails, not that the control exists.

The workspace figure, for scale rather than as a target: **2,313 tests across 174 files** at `66ad086`. Run it with the local database reachable — `KARAR_ENV=local`, the `POSTGRES_PORT` your Compose stack actually uses, and the matching `KARAR_DB_NAME`. Without them the integration files fail to *collect* rather than failing to *pass*, and the run still prints a large green-looking number for the unit suites that survived. A run reporting far fewer than 174 files has not verified what it appears to have.

### 21. What will fail my build?

See [`../testing/architecture-tests.md`](../testing/architecture-tests.md) and the table in [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md).

### 22. How do I add a database table?

One forward-only migration file in `packages/platform/db/migrations/`, named `NNNN_description.sql` with the next free number **in your workstream's range** (`0001`–`0009` platform core, `0010`–`0019` audit, `0020`–`0029` eventing/jobs; Phase 3 assigned `0030`–`0034` identity, `0040`–`0044` users/tenancy, `0050`–`0054` authorization/kill-switch, `0060`–`0065` operating-entity/consent; Phase 3.5 assigned `0070`–`0077`, `0080`–`0086`; Phase 5 assigned `0087`–`0099` for the financial data foundation and `0100`–`0101` for statement imports; later ranges assigned by the phase lead — unused numbers in a range stay unused, never backfilled). In the same file: grant `karar_app` the **minimal DML the table needs** (audit tables `SELECT, INSERT` only; never `GRANT ALL`), and end with the mandatory `-- rollback:` recovery block — the runner rejects files without one. Then `pnpm --filter @karar/platform db:migrate && db:verify`. Canonical rules: [`packages/platform/db/migrations/README.md`](../../packages/platform/db/migrations/README.md).

The table also needs: `tenant_id` if tenant-owned, RLS enabled **and** FORCEd — active since Phase 3; a table with neither RLS nor an entry in [`rls-allow-list.json`](../../packages/platform/db/rls-allow-list.json) fails the build — and a full **lifecycle declaration** — in `MODULE.md` for module-owned tables, in [`DATA_LIFECYCLE.md`](../../packages/platform/db/DATA_LIFECYCLE.md) for platform tables no module owns ([ADR-0026](../adr/0026-data-lifecycle.md)) — plus pinning columns if it carries legal consequence. If domain repositories will read it through Prisma, add the model to the mapping and regenerate (Q50). The SQL is **provider-neutral PostgreSQL**: no cloud-specific database feature without the documented exception in [`../architecture/database-portability.md` §3](../architecture/database-portability.md).

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

Since Phase 4 that includes the Flutter suite, and **`make test` runs it exactly as CI does** — `flutter test --exclude-tags golden` — so the local gate and CI never disagree about which tests exist. Golden baselines are run deliberately with `make test-golden`; they are not CI-enforced, and [`../architecture/flutter.md` §5](../architecture/flutter.md) explains why. Two things `make verify` does **not** cover, because they need a real build: the Android merged-manifest and APK assertions and the iOS packaged-bundle assertions, which run on the CI lanes that produce an artifact and fail rather than skip when one is missing. Client-specific commands are in [`flutter.md`](flutter.md).

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

Phase 5 — the financial data platform — is IN PROGRESS; the last completed phase is 4 (the Flutter and mobile security foundation), merged to `main` on 18 August 2026. **Phase 6 has not started.** Phase 5 has built schema, domain, ports and repositories across six financial modules — `financial-accounts`, `transactions`, `financial-connections`, `payment-instruments`, `transfer-matching`, `statement-imports` — plus `provider-capabilities`, which owns no table and executes nothing, behind migrations 0087-0101. **27 operations over 21 `/financial/*` paths are mounted**, manual transaction entry writes rows, and CSV statement import runs draft → upload → parse → preview → commit. What does not exist: any Flutter financial surface, any provider connector, any deployment, and — deliberately — any route for account deletion.

**The architecture-test registry's `currentPhase` is 5**, and it moved there in the same commit that mounted the first real ingestion path, because architecture test 24 (resource limits declared) activates at phase 5 and a limits test with no path to scan proves nothing. Test 24 is now ACTIVE and passing; the supplementary check that refused a pre-phase-5 tree mounting an ingestion path now scans zero files and passes trivially, and is kept as the guard that would fire if the marker were rolled back with the routes left in place.

The live status is the [root README status block](../../README.md#status); the Phase 5 detail is [`../phases/phase-05.md`](../phases/phase-05.md) and the Phase 4 detail is [`../phases/phase-04.md`](../phases/phase-04.md). **"Complete" means the deliverables exist and the phase's own gates passed — not deployed, not production ready, not store ready, not certified** ([`../phases/README.md`](../phases/README.md)).

### 39. What is explicitly out of scope right now?

Consumer product capabilities. Phase 3.5 delivered the policy and capability machinery, Phase 4 built a client that consumes it, and Phase 5 has built the financial data platform and its first HTTP surface — but **no capability is available to anyone**: every registry entry is `NOT_IMPLEMENTED` and deployed nowhere, `qa/v1` declares `clearedCapabilities: []` and clears nothing, and the client's navigable-capability set is correspondingly empty. **A mounted route is not an available capability**, and the Phase 5 financial surface is exactly where that distinction is easiest to lose: 27 operations answer in a local process, `TRANSACTIONS` is available in no PolicyPack, and no screen renders any of it.

Specifically **not built** inside Phase 5's own scope, so nobody infers it from the presence of a working route: **device verification** (the picker, the surface and the whole import path are built and compile on both platforms, but nothing here has run on a phone); **nothing further on categorization** — the automatic pipeline now runs on both write paths, alongside the subject's own assignment, whose choice always wins; **any provider connector**; and **account deletion over HTTP**, which is left out deliberately because the cross-module cascade is not atomic and the contract for reporting a partial outcome is unchosen. **No provider connector exists and no real provider capability is `VERIFIED`** — no issuer named in the catalogue exposes an interface to Karar, no credential of any kind is stored anywhere, there is no scraping, and only the `MANUAL` and `USER_FILE_UPLOAD` rails may exist, enforced by a database CHECK. `modules/provider-capabilities` describes what a rail could do in types and executes nothing. Nothing may display "Connected" for data a person typed or uploaded. **The financial-data retention decision is legal and has not been taken**, so this data cannot reach any deployed environment: the retention port fails closed everywhere but LOCAL and TEST.

Still out beyond Phase 5: budgets, goals, insights and scores, real bank connectors, Zakat, AI, Amanat, subscriptions, white-label flavours, the Super Admin surfaces, and any cloud infrastructure. Also out on the client specifically: any offline cache, any signed or store-distributed build, and any deployed endpoint — a build for anything other than `LOCAL` is refused because none exists. The full lists are in [`../phases/phase-05.md`](../phases/phase-05.md) and [`../phases/phase-04.md`](../phases/phase-04.md).

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

---

## Identity, tenancy, and access control

Added in Phase 3, when principals, isolation, and authorization became real.

### 49. How do I run a query under RLS — and what happens if I forget the context?

Every query touching principal-scoped tables runs inside `withPrincipalContext` (or the tenant+user sugar `withTenant`) from `packages/platform/src/db/principal-context.ts`. The wrapper opens one transaction and binds `app.tenant_id`, `app.user_id`, `app.session_id`, and `app.request_id` transaction-locally as its first statement; the values come from the caller's own session or membership record, **never from client input**.

Forgetting is not a data leak — it is an empty result or a typed error. A missing required key throws `PrincipalContextError` before any query runs, and a transaction that somehow reaches the database without context matches **no rows**, because every policy reads its GUC through `NULLIF(current_setting(name, true), '')`. `SET SESSION` on any `app.*` GUC is forbidden (architecture test 9) — a session-scoped value would outlive the transaction on a pooled connection. Canonical mechanism: [`../architecture/tenancy.md` §3](../architecture/tenancy.md).

### 50. How does Prisma fit in — and how do I regenerate the client or check drift?

Prisma is a **mapping over the canonical SQL schema, not a second migration system**. The SQL migrations (Q40) remain the only thing that changes the database; the multi-file schema in `packages/platform/prisma/schema/` maps the tables domain repositories use, and the client is constructed only through `createPrismaClient` — a driver adapter over the same connection profiles as the raw adapter, confined to infrastructure code (architecture test 4).

Two make targets carry the workflow: `make prisma-generate` regenerates the client into the git-ignored `packages/platform/prisma/client/` (run it after cloning and after any schema-folder change), and `make prisma-drift` fails if any mapped model diverges from the live database — run it against a migrated database after adding a migration or touching a `.prisma` file. ([`../architecture/backend.md` §6](../architecture/backend.md))

### 51. How do I run the adversarial security suite — and what is the scratch-database pattern?

`pnpm --filter @karar/security-tests test` runs the cross-cutting suite in `tests/security/` (cross-tenant isolation and privilege abuse across the Phase 3 module boundaries); the per-module adversarial suites run with their modules under `make test`. Both need the Compose services: `make dev` first, and on machines with a host-level PostgreSQL set `POSTGRES_PORT=5433` in `.env` (Q48) — the suites read the same variable.

These suites follow the **scratch-database pattern**: each suite bootstraps its own throwaway database from zero (roles, grants, full migration history — the same from-zero path as Q40), runs against it, and drops it afterwards. Nothing is shared between suites, every run re-proves the migration bootstrap, and seeding is itself an assertion — tenants are provisioned as the bootstrap superuser (provisioning is never a runtime path), everything else is written as `karar_app` under the exact principal context the runtime uses, and each tenant's own data is proven **non-empty before any denial is asserted**.

### 52. How do I check a permission?

Twice, like capability checks (Q18): mount `requirePermission('x.y.z')` on the controller route AND call `authorize()` inside the use case — HTTP is not the only caller. Both resolve through the authorization module's deny-by-default `PolicyService`: unknown permission, unassigned role, wrong tenant scope, and an unreachable store all deny, with machine-readable reasons. Roles are re-derived from the database on every check, so revocation is immediate — nothing caches authority, and access tokens carry no roles at all. The permission universe is closed: a permission exists because a migration seeded it and the compile-time catalogue lists it (test-asserted equal); wildcards are structurally impossible. ([`../../modules/authorization/MODULE.md`](../../modules/authorization/MODULE.md), [`../security/access-control.md`](../security/access-control.md))

**One caveat, because the tree diverges from that rule.** The route-level half — `requirePermission(...)` on the controller — has **no production call site anywhere**; Phase 3 and 3.5 modules enforce inside their use cases through each module's `PolicyService` port. The Phase 5 financial modules declare no permission at all, deliberately: every operation there is owner self-service, so RBAC decides nothing and a check would be a tautology for the only role that would hold it. See [`../security/access-control.md` §2](../security/access-control.md).

### 53. What can restrict my endpoint at runtime — and what happens during an outage?

Restrict-only kill switches (`NEW_REGISTRATIONS`, `PASSWORD_LOGIN`, `SESSION_REFRESH`, `TENANT_INVITATIONS`). A switch can only **deny** its operation: inactive, missing, and expired all mean unrestricted, and no state enables or widens anything. An active restriction answers 503 `OPERATION_RESTRICTED`; when switch state cannot be read at all, guarded operations fail **closed** with 503 `DEPENDENCY_UNAVAILABLE` — an outage must not silently enable. Every change is versioned, append-only ledgered, and audited with actor and reason. ([`../../modules/control-plane/MODULE.md`](../../modules/control-plane/MODULE.md))

---

## Jurisdiction, capability, and policy

Added in Phase 3.5, when policy resolution and capability availability became real.

### 54. How do I add a jurisdiction in practice?

Six steps, in this order. Nothing here decides a legal question — it declares one so that legal review can answer it.

1. **Declare the regime.** Add an entry to `JURISDICTIONS` in `packages/jurisdiction-policy/src/jurisdiction.ts`: code, country code, `type` (`NATIONAL`, `FINANCIAL_FREE_ZONE`, `SPECIAL_REGIME`), `status: 'DRAFT'`, the honest `reviewStatus`, null effective dates, and a `provenance` string saying who declared it and on what footing. If the country is new, add it to `COUNTRIES` too — a country carries no rule, only a display key, a formatting-default currency, and the ISO code's own status.
2. **Migrate the registers.** One reviewed migration inserting the `countries` and `jurisdictions` rows, matching the code exactly. There is no runtime write path for either register and no permission that could create one — a regime declaration changes by review, never at runtime.
3. **Write the pack.** A new file under `packages/jurisdiction-policy/src/packs/`, versioned `<jurisdiction>/v1`. Start it `DRAFT` with `approvalReference: null` and **every decision slot explicitly `PENDING_LEGAL_REVIEW` or `UNRESOLVED` with the open question stated**. Leave `clearedCapabilities` empty. Copy `qa-v1.ts` for the shape, never for the content.
4. **Name a strategy for anything you clear.** A cleared capability with no resolution strategy fails `validatePack` — there is no default, anywhere. Add it to `POLICY_PACKS` so the build knows the version exists.
5. **Activate it where it may run.** `canActivate` refuses a `DRAFT` pack outside `local`, so a draft governs local development and tests and nothing else. Activation writes one row in the append-only `policy_pack_activations` ledger through the module's use case, which re-checks the same predicate.
6. **Assign subjects.** `user_jurisdiction_assignments` / `tenant_jurisdiction_assignments`, with an honest `source`. Remember that `USER_DECLARED` is CHECK-bound to `UNVERIFIED`: a user picking a country never becomes a verified assignment, and a capability requiring verification will deny.

Canonical: [`../architecture/jurisdiction-policy.md` §9](../architecture/jurisdiction-policy.md). Worked end to end: [`../scenarios/a-new-country.md`](../scenarios/a-new-country.md).

### 55. How do I add a capability in practice?

After `MODULE.md` (Q1, Q19), the registration seams — every one an addition, and **every one starting at "no"**:

1. `CAPABILITY_IDS` in `packages/capability-registry/src/index.ts` gains a member.
2. `CAPABILITY_REGISTRY` gains a descriptor. Start it honestly: `lifecycle: 'PLANNED'`, `implementation: 'NOT_IMPLEMENTED'`, `deployment: {}`, `declaredJurisdictions: []`. Set `disclosureBearing` truthfully, and `clientExposure: 'HIDDEN'` if its denials must not be advertised — the validator *requires* `HIDDEN` for a disclosure-bearing descriptor with no declared jurisdiction.
3. A migration widens the `capability_id` CHECK on `capability_availability` and `tenant_capability_entitlements` to match the union. The closed set stays closed at the database too.
4. The PolicyPack gains a clause where legal review has cleared it: an entry in `clearedCapabilities`, a `resolutionStrategies` entry (mandatory), an `approvalPolicies` entry as `DECIDED` if disclosure-bearing (the pack fails validation without it), and `subjectPolicyOptions` only if it offers elections.
5. Availability rows and entitlements: **create none.** A missing availability row is `DISABLED` and a missing entitlement denies, which is the correct state the day a capability is registered.
6. Root module import, admin nav entry, GoRouter route.

`implementation` moves to `IMPLEMENTED` when the code exists; `deployment` gains an environment when it is genuinely deployed there. The validator rejects a descriptor claiming `DEPLOYED` while `NOT_IMPLEMENTED`, and no `lifecycle` value ever makes anything reachable. If any of this requires *editing* an unrelated module, stop — the seam is wrong ([`../architecture/extension-pattern.md` §3.1](../architecture/extension-pattern.md)).

### 56. How do I add a capability-scoped profile — an option set a subject elects?

Two halves that must not merge.

**The pack bounds the set.** Add a `SubjectPolicyOptionSet` under the pack's `subjectPolicyOptions` for your capability: an option-set id, its version, and the permitted option ids. That is the ceiling.

**Your capability owns the content.** The option *meaning* — what `nisab-basis:gold` computes — is a type in your bounded context, like `ZakatMethodologyProfile`. It does not go in `modules/subject-policy`, and it does not go in the pack: the pack carries references only.

Then record elections through `modules/subject-policy`. It stores universal metadata only — ids, capability, profile reference and version, jurisdiction, pack version, effective dates, status, provenance, snapshot hash — and validates every recording against the pack's permitted set through the `SubjectOptionSource` port. **A selection may narrow or choose; it may never expand.** An option outside the set, a capability that declares no subject policy, and a stale pack version are all typed denials.

Three consequences worth knowing before you design around it: rows are **immutable** (re-election inserts a new row and supersedes the old one, so historical results replay under the conventions that produced them), the module publishes **no events and exposes no HTTP** (an election is `CONFIDENTIAL` and purpose-limited — a published event would be a side channel), and there is **no generic preferences store** to fall back on. If your capability declares no elective options, that is the common case and costs nothing. ([`../architecture/jurisdiction-policy.md` §7](../architecture/jurisdiction-policy.md), [`../../modules/subject-policy/MODULE.md`](../../modules/subject-policy/MODULE.md))

### 57. How do I read an availability denial?

A denial names the **gate** that stopped it and the **reason**, and the gate tells you which lever is even relevant. Read them in order — the first failure wins, so a `NOT_IMPLEMENTED` denial says nothing about whether the entitlement would have passed.

| Gate | Reason | What it actually means |
|---|---|---|
| 1 Descriptor | `NOT_IMPLEMENTED`, `NOT_DEPLOYED` | The code does not exist, or is not deployed in this environment. **No row, pack, or grant can change this** |
| 2 Environment | `WRONG_ENVIRONMENT` | A row exists, but for a different deployment |
| 3 Jurisdiction | `JURISDICTION_ABSENT` | The principal has no assignment |
| | `JURISDICTION_UNVERIFIED` | They have one, but the clearance requires a verified assignment |
| | `JURISDICTION_NOT_CLEARED` | The pack's cleared set and the descriptor's `declaredJurisdictions` do not intersect here |
| | `POLICY_PACK_NOT_APPROVED` | The pack cannot govern this environment |
| 4 Availability | `DISABLED` | No row, or a row saying so. `INTERNAL_ONLY`/`PARTNER_ONLY` also deny — no audience model exists to check |
| 5 Entitlement | `ENTITLEMENT_MISSING`, `ENTITLEMENT_EXPIRED` | No row for this tenant, revoked, or the window has lapsed |
| 6 Consent | `CONSENT_REQUIRED`, `RECONSENT_REQUIRED` | Where the pack's basis *is* consent. **No published document also denies** |
| | `PROCESSING_BASIS_UNRESOLVED` | The pack names no resolvable basis — fail closed |
| 7 Licence | `LICENCE_MISSING`, `LICENCE_EXPIRED` | A pack-required licence type is absent, unevidenced, revoked, or lapsed |
| 8 Provider | `PENDING_PROVIDER`, `PROVIDER_UNAVAILABLE` | A pack-required provider kind is not configured or is down |

Today **every real capability denies at gate 1**, so that is the expected answer in any environment.

Two rules that catch people out. A denial at gates 1–4 **cannot** be fixed by adding an entitlement, consent, licence, or provider — those gates run first, and a ceiling denial while a grant-like row exists is audited as `capability.resolution.denied_above_ceiling`. And what you see in a **client** response is not the internal reason: hidden capabilities and non-actionable reasons are omitted from client output entirely, so debug against the internal resolver, never against the bootstrap response. ([`../architecture/capability-registry.md` §4–§5](../architecture/capability-registry.md))

### 58. How do I run the Phase 3.5 suites?

They are ordinary workspace projects, so `make test` runs them all. Individually:

```bash
pnpm --filter @karar/jurisdiction-policy test   # pure: packs, lifecycle, validation, strategies, EffectivePolicy
pnpm --filter @karar/capability-registry test   # pure: registry invariants
pnpm --filter @karar/jurisdiction test          # module + live-PostgreSQL integration
pnpm --filter @karar/capability test            # gates, client exposure, restrict-only property harness
pnpm --filter @karar/subject-policy test        # selections, supersession, leak regression
pnpm --filter @karar/bootstrap test             # bootstrap composition, binding, leak regression
```

The two pure packages need nothing running. The module suites include live-PostgreSQL integration tests on scratch databases (Q48, Q51): `make dev` first, and set `POSTGRES_PORT=5433` in `.env` if a host PostgreSQL already holds 5432.

The capability module's `restrict-only.property.test.ts` is worth reading before you change a gate: it generates configurations exhaustively over the ceiling core and then sweeps randomized grant-like inputs across them, asserting that the resolved outcome never exceeds the ceiling. If you reorder the gates, that is the test that will tell you.

### 59. How do I get a working tenant locally?

A session must be bound to a tenant before any tenant-scoped endpoint works, and binding requires a membership in a real tenant. Locally:

```bash
POSTGRES_PORT=5433 KARAR_ENV=local node scripts/db/seed-local-first-party.mjs
```

That creates the first-party tenant row named by `KARAR_FIRST_PARTY_TENANT_ID` — which defaults, in `local` only, to the documented synthetic UUID exported by the platform config. **Outside `local` the variable is required**, and a boot without it fails with a clear configuration error. Domain code never sees the literal; it reads the typed config.

The seed writes as the bootstrap superuser and creates the tenant **only**. Membership is deliberately not seeded there — `GrantFirstPartyMembership` is an audited use case in `modules/tenancy`, and burying a grant inside a seed script would put authority where nobody reviews it. Tenant provisioning has no runtime path at all this phase (`karar_app` holds `SELECT` only on `public.tenants`), which is why the seed needs the superuser and why real environments provision through the control plane.

With a membership in place, `GET /platform/bootstrap` reports the binding state and auto-binds a session that has exactly one usable membership; `POST /platform/tenant-binding` binds or switches explicitly. A switch issues a **new session and refresh family** and kills the old tokens, so re-read the response rather than reusing what you had. ([`../architecture/tenancy.md` §6](../architecture/tenancy.md))

---

## The Flutter client

Added in Phase 4, when the client became real. Day-to-day client work has its own guide: [`flutter.md`](flutter.md). These three answer the questions a backend engineer asks before opening it.

### 60. How do I run and test the client?

```bash
make bootstrap                                                  # workspace + Flutter dependencies
cd apps/mobile && flutter run --dart-define=KARAR_ENV=LOCAL     # against your local API
cd apps/mobile && flutter analyze
cd apps/mobile && flutter test --exclude-tags golden            # exactly what CI runs
```

**`--dart-define=KARAR_ENV` is required and has no default.** Since the per-environment application identifiers landed, a build told nothing about its environment is refused rather than silently becoming a production-identified artifact — and that applies to `flutter run` and to building from the Xcode IDE, not only to release assemblies.

The API must be running for anything past sign-in ([Q59](#59-how-do-i-get-a-working-tenant-locally) for the tenant, and `node scripts/db/seed-local-consent.mjs` for the consent prerequisites — it refuses any environment but `local` and `test`). `LOCAL` is the only profile that builds without an explicit endpoint; a `DEV`, `STAGING` or `PRODUCTION` build is **refused at configuration time** unless given an HTTPS endpoint that is not a developer-machine address, which is why no deployed-environment package can be produced today. ([`flutter.md`](flutter.md))

### 61. I changed an endpoint. What do I have to do in the client?

Change the contract in `packages/api-contracts/openapi/`, then regenerate:

```bash
cd apps/mobile && dart run tool/generate_api_client.dart          # regenerate
cd apps/mobile && dart run tool/generate_api_client.dart --check  # what CI runs
```

**Never edit `lib/core/networking/generated/`.** The drift check regenerates in memory and fails the build on any difference, so a hand edit is caught whether or not it was committed. If generation *fails*, read the message rather than working around it: the generator refuses only where guessing would be worse than stopping — an operation with no response schema, two schema-carrying 2xx responses, a union with no declared discriminator, or a wire value that cannot become a distinct Dart identifier. Each names the contract text at fault, and each is fixed in the contract.

**The drift gate binds contract to client. A separate suite binds server to contract, and you are expected to extend it with your change.** `tests/conformance` drives the composed application over real HTTP against live PostgreSQL and Redis, and validates the status, the `Content-Type` and the returned bytes against the OpenAPI document. It covers 221 of the merged contract's 300 declared operation/status pairs today — 82 of the 128 non-financial ones, plus 139 of the 172 the Phase 5 `/financial/*` fragments declare, in a second file with its own ledger so that one failure cannot hide the rest — and two ledgers assert **empty**: no problem document may leave under `application/json` when the contract declares `application/problem+json` (throw it and let the error boundary set the media type — do not write to the reply object), and **no operation may describe its response in prose without a schema**, because a schema-less operation is one neither the generated client nor this suite can check.

If your endpoint is on the mobile-consumed surface, add it to that suite as you write it rather than afterwards. The covered set is asserted explicitly at the end of the file, so a suite that quietly stopped exercising something fails loudly ([`../phases/phase-04.md`](../phases/phase-04.md)).

### 62. My new capability is implemented. Why is it not in the app?

Because the client renders an **allowlist**, and it is empty. A capability becomes reachable by being `IMPLEMENTED`, deployed for the environment, cleared by the jurisdiction pack, entitled, and *then* added to `navigableCapabilityIds` in `apps/mobile/lib/features/platform_bootstrap/domain/platform_capability.dart` with a registered destination.

The order matters and the last step is deliberately last. An id the server omitted is not a capability the client should mark unavailable — it is one the client **must not know exists** ([`../architecture/capability-registry.md` §5](../architecture/capability-registry.md)). That is also why there is no list of unrecognised ids anywhere in the client: such a list would itself disclose the names it holds.

Debug against the internal resolver, never against the bootstrap response ([Q57](#57-how-do-i-read-an-availability-denial)).
