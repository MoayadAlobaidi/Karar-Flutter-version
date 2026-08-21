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
| Current phase | **5 — IN PROGRESS** — the financial data platform, on `claude/karar-v2-phase-5-financial-foundation` ([report](docs/phases/phase-05.md)). The marker moved to 5 with the **first real mounted ingestion path** — CSV statement upload and parse — because architecture test 24 (resource limits) activates at phase 5 and a limits test with no path to scan proves nothing. **Not complete, not deployed**: no build has run on a device, there is no provider connector, and no capability is available |
| Last completed phase | 4 (Flutter and mobile security foundation, [report](docs/phases/phase-04.md)) — merged 18 August 2026 |
| Branch model | `main` + phase branches (current: `claude/karar-v2-phase-5-financial-foundation`) |
| Application implementation | Platform foundation, identity/tenancy/access control, the jurisdiction and capability foundation, a Flutter client covering account, identity and platform state, and the Phase 5 financial data platform: six financial modules plus `provider-capabilities`, behind **27 HTTP operations over 21 `/financial/*` paths** with CSV statement ingestion mounted. **Nothing is deployed and no capability is available anywhere** — the registry entry for `TRANSACTIONS` is still `NOT_IMPLEMENTED`, no PolicyPack clears it, and no client renders it |
| Mobile | Builds and tests for Android and iOS, with per-environment application identifiers verified out of real packaged artifacts. **No signed build, no signing material, no store submission, no deployed endpoint** — a build for any environment other than `LOCAL` is refused because no endpoint exists, and the biometric prompt has never been exercised on a device |
| Cloud | None provisioned; local development is cloud-free |
| Compliance | Readiness framework in place; **no certification is claimed** |

"COMPLETE" means a phase's deliverables exist and its own internal gates passed. It does **not** mean merged, deployed, production ready, app-store ready, signed, or certified — the distinction is kept in [`docs/phases/README.md`](docs/phases/README.md).

## Start here

| If you want to… | Read |
|---|---|
| Understand the system | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Know why something is the way it is | [`docs/adr/`](docs/adr/README.md) — 29 decision records |
| Onboard as an engineer | [`docs/onboarding/developer.md`](docs/onboarding/developer.md) |
| Work on the Flutter client | [`docs/onboarding/flutter.md`](docs/onboarding/flutter.md) |
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
| `apps/mobile` | Flutter client (consumer; white-label flavors are Phase 11). Renders values; computes nothing authoritative. Seventeen feature folders — ten of account, identity and platform state, seven financial (accounts and wallets, transactions, categories, payment instruments, statement imports, transfer matching, connections and sources), every financial route gated on the platform's own capability answer and re-evaluated on every build; a generated Dart API client with contract drift detection; Android and iOS build guards that refuse a deployed-environment package with no usable endpoint — see [`flutter.md`](docs/architecture/flutter.md) |
| `apps/api` | NestJS modular monolith — the only public API surface |
| `apps/worker` | Second entrypoint over the same modules: outbox relay, projections, scheduled jobs |
| `apps/admin` | Super Admin SPA; talks to the control plane only, carries no database driver |
| `packages/` | Ten workspace packages; five are framework-free pure (`shared-kernel`, `financial-engine`, `jurisdiction-policy`, `state-machine` and `content-trust` — the `PURE_PACKAGES` tier the architecture checker enforces), one more is the manifest-and-source-constrained `capability-registry`, and two are local test fixtures that exist so synthetic values cannot reach a production install. `platform` is the backend platform library shared by api and worker — typed config, the PostgreSQL foundation (including the Prisma runtime and the RLS principal context), errors, observability, events/outbox/jobs |
| `modules/` | 29 module directories; the 19 that have code each publish a `public-api.ts`, and the rest are skeletons awaiting their phase |
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

Cross-module imports resolve to the target module's `public-api.ts` and nothing else. Five packages (`shared-kernel`, `financial-engine`, `jurisdiction-policy`, `capability-registry`, `state-machine`) are pure — no framework, no I/O. Forbidden imports fail the architecture tests in CI, not a code review's memory. See [`clean-architecture.md`](docs/architecture/clean-architecture.md) and [`architecture-tests.md`](docs/testing/architecture-tests.md).

## Repository structure

```
apps/        mobile · api · worker · admin — entrypoints, no business logic
packages/    shared-kernel · financial-engine · jurisdiction-policy · capability-registry · state-machine · api-contracts · platform
             plus two local-only fixture packages: consent-local-fixtures · financial-retention-local-fixtures
modules/     29 module directories, each with MODULE.md; the 19 with code publish public-api.ts
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
| `financial-accounts` | Issuer catalogue and per-country markets, accounts and wallets, source-reported balance snapshots |
| `financial-connections` | How data arrives, and which source feeds which account — rails, connections, account source links |
| `payment-instruments` | What spends from an account — cards and payment identities, never a balance |
| `transactions` | Ingestion, normalization, dedup, provenance, categorization |
| `transfer-matching` | Two transactions that were one movement of a person's own money |
| `statement-imports` | A CSV statement staged behind review — draft, upload, parse, preview, commit or erase |
| `provider-capabilities` | What a provider *could* do, described in types and owning no table — it executes nothing |
| `budgets` | Budget definition and tracking |
| `goals` | Savings plans and goals |
| `insights` | Derived financial insight from engine facts |
| `zakat` | Deterministic Zakat calculation and tracking — never payment, never a fatwa |
| `ai` | AI orchestration over verified facts |
| `amanat` | Sealed after-death information handover — declares no jurisdiction, hidden from clients |
| `identity` | Authentication, sessions, MFA, session tenant binding |
| `users` | Profile and preferences |
| `tenancy` | Tenant model, isolation, membership resolution and tenant switching |
| `authorization` | Deny-by-default RBAC — permission catalogue, roles, the central `PolicyService` |
| `operating-entity` | Legal person, controller/processor roles, entity migration |
| `consent` | Consent triple, legal documents, re-consent |
| `audit` | Append-only audit records |
| `jurisdiction` | Country and jurisdiction registers, assignments, restrict-only settings, the pack-activation ledger |
| `capability` | Availability resolution over eight gates, availability rows, tenant entitlements, the client-safe view |
| `subject-policy` | `SubjectPolicySelection` — immutable, version-pinned subject elections |
| `bootstrap` | The authenticated client bootstrap surface and tenant binding |
| `documents` | Evidence files behind the object-storage port |
| `sealed-vault` | Grant-gated `SEALED` storage |
| `notifications` | Delivery behind channel ports |
| `projections` | Rebuildable read models for admin/ops |
| `control-plane` | Security gateway and scoped token minting |

## Country and jurisdiction model

Seven separated dimensions, deliberately never conflated:

- **Country** — geography (ISO 3166-1); keys currency defaults, languages, formatting. An attribute, not the policy key, and carrying no business rule.
- **Jurisdiction** — the legal regime governing a person or record. The policy key. Not assumed one per country: a financial free zone is a distinct regime inside its country's borders.
- **OperatingEntity** — the legal person providing the service and bearing responsibility; determines controller/processor roles.
- **SubjectPolicySelection** — the elective option-set a subject chose, versioned and pinned, within what the jurisdiction permits.
- **DeploymentProfile** — where and on what infrastructure a deployment runs; an infrastructure concept, never a business one.
- **Tenant** — the brand and product boundary a user belongs to; the isolation key.
- **Brand** — presentation identity (tokens, name, app identity); configuration on top of a tenant.

See [`jurisdiction-policy.md`](docs/architecture/jurisdiction-policy.md) and [`operating-entity.md`](docs/architecture/operating-entity.md).

## Financial data model

Seven concepts kept apart, because collapsing any pair asserts something untrue about a real person's finances ([ADR-0028](docs/adr/0028-multi-rail-financial-sources.md)). A person here typically holds several banks, more than one account of the same type at one of them, a mobile-money wallet or two, a payroll wallet, cards spending from a wallet, and cash.

```mermaid
graph TD
  U[User] --> C[FinancialConnection<br/>how data arrives]
  I[Institution / issuer] --> M[InstitutionMarket<br/>one row per country]
  I -.names.-> C
  C --> L[AccountSourceLink<br/>many-to-many]
  L --> A[FinancialAccount / Wallet<br/>where a balance sits]
  A --> S[BalanceSnapshot<br/>source-reported, per kind]
  A --> PI[PaymentInstrument<br/>card, no balance column]
  A --> T[Transaction]
  T --> P[TransactionProvenance]
  T --> TM[TransferMatch<br/>own-account movement, no amount]
  ING[Manual entry · CSV import<br/>BUILT AND MOUNTED] --writes--> T
  HTTP[HTTP surface<br/>27 operations, 21 paths] --reads--> A
  FLU[Flutter screens<br/>BUILT, CAPABILITY-GATED] -.reads.-> HTTP
  EXT[External provider rails<br/>NOT BUILT, refused by CHECK] -.feeds.-> C

  style FLU stroke-dasharray: 5 5
  style EXT stroke-dasharray: 5 5
```

**Dashed elements are not built, and the convention has moved twice because the tree has.** Payment instruments and transfer matching were the dashed pair while they were modelled in the ADR with no migration and no code; ingestion and the HTTP surface replaced them once those tables landed. Both of those are now solid too: manual transaction entry and CSV statement import write real rows, and 27 operations over 21 `/financial/*` paths read them back. What remains dashed is what a bank actually is: **every acquisition rail beyond `MANUAL` and `USER_FILE_UPLOAD` is refused by a database CHECK.** The screens are no longer dashed — seven financial feature folders read those 27 operations through the generated client — but nothing is deployed and no capability is AVAILABLE, so a mounted, gated route in a local build is not a capability anyone has been granted. Every solid box is schema that exists, code tested against live PostgreSQL, and a route the runtime-conformance suite drives for real — and **none of it is deployed anywhere.**

Why each separation earns its cost:

- **An issuer is not a market presence.** One issuer operating in four countries is one issuer with four market rows. Issuer codes carry no country prefix, because a code beginning `QA_` reads as a fact about where the issuer belongs and invites a duplicate row the moment a second market appears. **Country is not Jurisdiction** — the market table keys on country and has no jurisdiction column.
- **A connection is not an account.** One connection may feed many accounts; one person may hold several connections to one institution.
- **An account's origin is not its current source.** `origin_kind` is immutable and says only how the account first came to exist. An account may be typed in, then fed by CSV, then linked to an API, and stay one account — which is what account-source links exist for. No column asserts a single permanent data source.
- **A wallet is an account; a card is not.** `CHECK ((wallet_kind IS NOT NULL) = (account_type = 'WALLET'))` — a biconditional, so neither half can be satisfied by accident. Two virtual cards on one wallet must not read as two more balances, and `payment_instruments` carries **no balance column at all**: the row describing a card has nowhere to put a figure, so no reader, export or projection can total one by accident.
- **A transfer match is a relationship, not a movement.** `transfer_matches` names two of a person's transactions and says they were one movement of their own money. It carries **no amount** — the amounts live on the transactions it names, and a copy on the relationship would be a third figure that could disagree with both.
- **An account has a nature, and nothing here adds it up.** `account_nature` is `ASSET`, `LIABILITY` or `UNKNOWN`, so a credit-card liability is not read as cash. `UNKNOWN` is the honest default rather than a placeholder, and no code in these modules sums, nets or totals balances.
- **The account is identified by its id alone.** There is deliberately no uniqueness over institution + user, institution + type, institution + currency, or issuer + wallet kind. Two current accounts at one bank in one currency is ordinary.
- **A balance kind is never inferred from another.** `balance_kind` is `NOT NULL` with no default, so a caller asking what can be spent cannot silently receive a settled figure.

**Thirteen acquisition rails are named; only `MANUAL` and `USER_FILE_UPLOAD` may exist.** Every other rail is refused by a database CHECK, not merely by application code, so an unimplemented rail cannot be written even by direct SQL. **No credential of any kind is stored** — no username, password, mPIN, OTP, token, cookie or session state — there is no scraping or app automation, and nothing may display "Connected" for data that arrived by hand or by file.

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

Tenant-scoped endpoints additionally need a tenant to bind a session to. `node scripts/db/seed-local-first-party.mjs` creates the local first-party tenant that `KARAR_FIRST_PARTY_TENANT_ID` names — required outside `local`, defaulted to a documented synthetic id locally ([onboarding Q59](docs/onboarding/developer.md)).

The client runs against that local API with `cd apps/mobile && flutter run --dart-define=KARAR_ENV=LOCAL`. **The dart-define is now required** — since the per-environment application identifiers landed, a build told nothing about its environment is refused rather than silently becoming a production-identified artifact, and that applies to `flutter run` and to Xcode-IDE builds as well as to release assemblies. `LOCAL` is the only profile that needs no explicit endpoint; a build for `DEV`, `STAGING` or `PRODUCTION` **fails at configuration time** unless it is given an HTTPS endpoint that is not a developer-machine address, which is why no deployed-environment package can currently be produced. Client-specific commands and rules are in [`docs/onboarding/flutter.md`](docs/onboarding/flutter.md).

No cloud account, API key, or shared database is required for any of it — that is a design rule, not a convenience ([`environments.md` §3](docs/architecture/environments.md)).

## Testing and CI

- **Unit tests** for `domain/` and the pure packages — no mocks, no container. `jurisdiction-policy` and `capability-registry` need nothing running at all.
- **Integration tests** against real PostgreSQL in Docker — since Phase 2 the workspace suite includes live-PostgreSQL runs of the migration, audit-immutability, outbox, and jobs suites, with concurrency proofs (two relays over 200 events; two workers over 100 jobs). `make dev` first; see the quick-start port note for machines with a host PostgreSQL.
- **Adversarial security tests** — since Phase 3, per-module isolation suites plus the cross-cutting [`tests/security/`](tests/security) suite: two tenants seeded with real rows, own-tenant data proven non-empty first, then cross-tenant SELECT/INSERT/UPDATE/DELETE denial, pooled-connection context hygiene, and privilege-escalation probes ([`tenancy.md`](docs/architecture/tenancy.md)).
- **Property tests** — since Phase 3.5, the capability resolver's restrict-only invariant is proven rather than asserted: the ceiling core is exercised exhaustively over generated configurations, then swept with randomized grant-like inputs, asserting that no entitlement, consent, licence, or provider status can widen what code and policy have not permitted ([`capability-registry.md` §4](docs/architecture/capability-registry.md)).
- **Leak-regression tests** — since Phase 3.5, suites that drive fakes trying to leak through every port and assert the serialized output carries exactly the declared fields: the bootstrap surface's closed field set, and the subject-policy audit trail's reference-only metadata.
- **Contract tests** per repository port against the PostgreSQL contract, per [`database-portability.md` §7](docs/architecture/database-portability.md) — platform DB/outbox/jobs contracts run locally and in CI today, module repository ports since Phase 3; cloud provider legs are future.
- **Architecture tests** — 26 CI-blocking structural tests plus a canary-purity check, kept in a registry with per-test activation phases; a test activates when the structure it guards exists, and the registry fails the run if an activation phase arrives without an implementation. **24 of the 27 registry entries are ACTIVE and pass, 0 fail, 3 are deferred** — 13, 14 and canary-purity await the sealed-vault phase, and nothing else is asleep. Test 24 (resource limits declared) activated with the first mounted ingestion path, in the same commit that moved `currentPhase` to 5. Three supplementary checks pass alongside them — one of which, `phase5-ingestion-not-mounted-early`, now scans zero files and cannot fail again, and is retained as the other half of a lock test 24 has taken over. A self-test runs on the same invocation, seeding a violation per checker to prove the passes are not vacuous. Its case count grows with the checkers and is therefore not pinned here — the runner prints it.
- **Client tests** — since Phase 4, the Flutter suite runs on every PR: unit, widget and source-scanning tests, every component and screen exercised in **both locales** with direction derived from the locale rather than passed in, tap targets and overflow checked at 1.0x and 2.0x text scale, and WCAG contrast computed over both palettes. Golden baselines exist but are **deliberately excluded from CI** ([`flutter.md` §5](docs/architecture/flutter.md)).
- **Artifact tests** — since Phase 4, assertions that read a real build rather than its source: the merged Android manifest's permission set compared exactly, the built APK's network policy and absence of credential material, the assertion that the Android release is unsigned rather than debug-signed, and the packaged iOS bundle's transport posture and **effective bundle identifier across all four environments**. They run on the lanes that produce an artifact, and a missing artifact fails them rather than skipping them — the correction for a period when they lived on a lane that built nothing and passed by skipping.
- **Runtime contract conformance** — since Phase 4, real serialized responses from the composed application validated against the OpenAPI document that describes them, with ledgers asserted empty: no response carries an RFC 7807 body under the wrong media type, and no operation describes its body in prose without a schema. The merged contract declares **300 operation/status pairs across 55 paths**; two suites cover **221** of them — 82 of the 128 non-financial pairs, and 139 of the 172 the Phase 5 financial surface declares, the financial ones in their own file so that one failure does not hide the rest. The contract drift check binds contract to client; this binds server to contract ([`flutter.md` §8](docs/architecture/flutter.md)).
- **Security scans and SBOM** — dependency and secret scanning, software bill of materials, supply-chain checks.

Required PR checks must pass before merge — CI blocks the merge, not merely the workflow run. The workflows are [`ci.yml`](.github/workflows/ci.yml) (lint, type-check, build, tests, architecture tests, the mobile lanes) and [`security.yml`](.github/workflows/security.yml) (scans, SBOM). Not every job is a required check; the current list is in [`repository-security-settings.md`](docs/operations/repository-security-settings.md). See [`architecture-tests.md`](docs/testing/architecture-tests.md).

Security concerns are reported privately per [`SECURITY.md`](SECURITY.md), never as public issues.

## Roadmap and phase discipline

Completed: 0, 0.5, 1, 2, 3, 3.5, 4. **Phase 5 is IN PROGRESS; Phase 6 has NOT STARTED.** Phase 3 delivered identity, users, tenancy, operating entities, RBAC, consent with re-consent evaluation, sessions, kill switches, PostgreSQL RLS, and adversarial cross-tenant tests; Phase 3.5 added Country and Jurisdiction, typed versioned PolicyPacks with the `qa/v1` draft, resolution strategies and `EffectivePolicy`, `SubjectPolicySelection`, the compile-time capability registry with deny-by-default availability and tenant entitlements, session tenant binding, and the authenticated client bootstrap surface; Phase 4 added the Flutter client — the startup state machine, a generated Dart API client with contract drift detection, authentication and session flows, secure token storage with single-flight refresh, application lock, tenant selection, jurisdiction self-declaration, capability-aware navigation, the consent surface, a design system with Arabic and RTL first-class, and Android and iOS build guards that refuse a deployed-environment package without a usable endpoint — and hardened the contracts it consumes, so that a bootstrap resolution failure and a legitimately empty capability set are now different answers, every problem document leaves through one writer, and real server responses are held against the OpenAPI document rather than only the generated client. What it did **not** deliver is stated as plainly in its [report](docs/phases/phase-04.md): no signed build, no deployed endpoint, and a biometric prompt that has never been exercised on a device.

Phase 5, in progress, has built the **financial data platform** across six modules — the issuer catalogue with per-country markets, accounts and wallets, source-reported balance snapshots, transactions with revisions and provenance, connections and account source links, payment instruments, transfer matching, and CSV statement imports — behind migrations 0087-0101, together with [ADR-0027](docs/adr/0027-calendar-day-and-instant.md) (calendar days are not instants) and [ADR-0028](docs/adr/0028-multi-rail-financial-sources.md) (seven separated concepts across thirteen named acquisition rails), both **ACCEPTED**. A seventh module, `provider-capabilities`, describes in types what a provider could do; it owns no table and executes nothing. The data is now reachable: **27 operations over 21 `/financial/*` paths** are mounted from the composition root, and CSV statement ingestion runs the full draft → upload → parse → preview → commit sequence with parsing writing no financial record and only a reviewed commit doing so. `currentPhase` moved to **5** and architecture test 24 became **ACTIVE** in that same commit, because a resource-limit test with no path to scan proves nothing.

What Phase 5 has **not** done is equally load-bearing: **no build has run on a device**, there is **no provider connector** and no real provider capability VERIFIED, **nothing deployed** and no capability AVAILABLE, the retention decision is **unresolved** and fails closed outside LOCAL, and **account deletion is not exposed over HTTP** because its cross-module cascade is not atomic and the contract for reporting a partial outcome has not been chosen. Phase 5 is IN PROGRESS, not complete.

Every phase ends with the same documented update set — README status block, roadmap, phase report, onboarding if commands changed, evidence register — specified in [`docs/phases/README.md`](docs/phases/README.md). Full phase table and gates: [`docs/roadmap.md`](docs/roadmap.md).

## Documentation index

| | |
|---|---|
| Architecture | [`docs/architecture/`](docs/architecture/overview.md) — start at the overview |
| Decisions | [`docs/adr/`](docs/adr/README.md) — 29 records |
| Security | [`docs/security/`](docs/README.md#security) |
| Compliance | [`docs/compliance/`](docs/compliance/README.md) · policies in [`docs/policies/`](docs/policies/README.md) |
| Onboarding | [`docs/onboarding/developer.md`](docs/onboarding/developer.md) · client: [`docs/onboarding/flutter.md`](docs/onboarding/flutter.md) |
| Roadmap | [`docs/roadmap.md`](docs/roadmap.md) |
| Capability map | [`docs/architecture/capability-map.md`](docs/architecture/capability-map.md) |
| Deployment matrix | [`docs/architecture/country-deployment-matrix.md`](docs/architecture/country-deployment-matrix.md) |
| Phase reports | [`docs/phases/`](docs/phases/README.md) |
| Glossary | [`docs/glossary.md`](docs/glossary.md) |
| Documentation rules | [`docs/documentation-style-guide.md`](docs/documentation-style-guide.md) |

## Licence

Proprietary. All rights reserved.
