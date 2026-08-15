# Phase 2 — Platform and data foundation

**Branch:** `claude/karar-v2-phase-2-platform-foundation` · **Started:** 15 August 2026 · **Status:** in progress
**Base:** Phase 1 merge commit `e535615` on `main`.

Verification sections are filled by the phase lead after running the commands — they record executed results, never intentions.

---

## Objective

Implement the foundational backend and data platform later capabilities depend on: typed configuration, the PostgreSQL foundation (roles, migrations, one provider-neutral persistence adapter), the shared kernel, the error model, real health/readiness, provider-neutral observability, the append-only audit foundation, the event catalogue and envelope, the transactional outbox, the background-job foundation, data-classification enforcement, lifecycle declarations for every Phase 2 table, and provider-neutral key-custody interfaces and design.

## Scope

Typed configuration · PostgreSQL foundation · database roles and migrations · shared-kernel implementation · error model · health and readiness · provider-neutral observability · append-only audit · event catalogue · event bus (in-memory) · transactional outbox · background-job foundation · data-classification enforcement · data-lifecycle declarations · key-custody and rotation interfaces/design.

## Out of scope

Identity, users, tenancy, operating entities, consent, RBAC, sessions, RLS tenant policies (Phase 3) · country PolicyPacks and capability availability (Phase 3.5) · Flutter product features · financial accounts, transactions, financial calculations (Phases 5–6) · AI (Phase 7) · Zakat (Phase 9) · Amanat (Phases 13–14) · subscriptions (Phase 10) · white-label (Phase 11) · any cloud infrastructure or cloud KMS adapter.

## Agent/workstream ownership

| Workstream | Owner | Responsibility |
|---|---|---|
| Lead | Phase lead | Integration, migration-number ranges, verification runs, phase gates, final merge |
| PostgreSQL foundation | Workstream B | `PostgresPersistenceAdapter`, connection profiles, roles/bootstrap, migration runner and CLI, migrations 0001–0002 |
| Kernel and errors | Workstream C | The nine shared-kernel universals; platform error model (`ErrorCode`, `PlatformError`, RFC 7807); wire mapping for money/percentage/rate |
| Config, health, observability | Workstream E | Typed fail-fast config with `SecretValue` and `karar-ref` types; API boot, OTel init, problem+json filter, real `/readyz`; pino + OTel helpers with redaction |
| Audit, classification, keys, arch tests | Workstream F | Audit module and migration 0010; classification module; key-custody types, ports, and canary contract; architecture-test activations |
| Events, outbox, jobs | Workstream D | Event catalogue loader/validator, envelope, in-memory bus; outbox and relay (migration 0020); job queue, registry, poller (migration 0021); worker runtime |
| Compliance | Workstream G | Control-matrix and evidence-register updates for Phase 2 controls (`docs/compliance/`, parallel to this report) |
| Documentation | Workstream H | Architecture-doc implemented-state updates, onboarding Q40–Q48, glossary, README, this report's body |
| Independent review | Workstream I | Reviews the integrated result without having built it |

All workstreams currently resolve to a single maintainer directing agent workstreams — see Known limitations.

## Deliverables

| Deliverable | Location |
|---|---|
| `@karar/platform` — the sixth package: config, db, errors, wire, observability, classification, keys, events, outbox, jobs | `packages/platform/` |
| Database bootstrap (roles, per-database grants) and migration runner with CLI (`db:create` / `db:migrate` / `db:verify` / `db:reset-local`; `make db-*` wrappers) | `packages/platform/src/db/`, `packages/platform/db/bootstrap/`, `Makefile` |
| The five migrations (`0001`–`0021`) with number-range ownership and grant convention | `packages/platform/db/migrations/` (policy in its `README.md`) |
| Platform data-lifecycle declarations (six fields per table) | `packages/platform/db/DATA_LIFECYCLE.md` |
| Shared kernel implemented — the nine universals with namespace-merged supporting vocabulary | `packages/shared-kernel/src/` |
| Event catalogue file, loader, and governance validation | `packages/api-contracts/events/catalogue.json`, `packages/api-contracts/src/events/` |
| Audit module — first real module: `AuditWriter` port, metadata guard, Postgres writer, append-only `audit.audit_events` | `modules/audit/` |
| API: typed config boot, OTel init, problem+json global filter, real `/readyz` | `apps/api/src/` |
| Worker: outbox relay and job poller loops, loopback health server, graceful shutdown | `apps/worker/src/` |
| Architecture-test activations (5, 6, 23) and registry at `currentPhase: 2` | `scripts/checks/architecture.mjs`, `docs/testing/architecture-test-registry.json` |
| Documentation: implemented-state updates across the five architecture docs, onboarding Q40–Q48, glossary platform terms | `docs/architecture/`, `docs/onboarding/developer.md`, `docs/glossary.md` |

## Architecture changes

**None to the approved architecture.** Three decisions made within it are recorded explicitly:

1. **A sixth package, `@karar/platform`** — a structural addition, not an architecture change: the backend platform library `api` and `worker` share. It is deliberately not a pure package (it depends on `pg`, `pino`, `@opentelemetry/api`); the four pure packages and their zero-dependency rule are unchanged, and the root README containers table records the new count ([`backend.md` §2](../architecture/backend.md)).
2. **node-postgres for the platform foundation; Prisma deferred to domain repositories.** The platform's own persistence (migration runner, outbox, jobs, audit writer) talks to PostgreSQL through node-postgres inside platform infrastructure code. Prisma remains the plan for domain repositories from Phase 3 — ADR-0005 stands unamended ([`backend.md` §6](../architecture/backend.md), [`database-portability.md` §2](../architecture/database-portability.md)).
3. **`Clock.System` lives at composition roots.** The kernel-purity rule (architecture test 11) bans system-clock reads inside `shared-kernel`, so the kernel ships the `Clock` interface and `Clock.Fixed` only; each composition root provides its own one-line host-clock adapter. Time arrives as an argument everywhere else.

## ADRs added/amended

None. The record stands at ADR-0001–0026.

## Code and package changes

- `packages/platform` — new. Source areas: `config` (typed fail-fast schema, `SecretValue`, `karar-ref` opaque references), `db` (adapter, profiles, bootstrap, runner, CLI), `errors` (platform codes, RFC 7807), `wire` (minor-units-string mapping), `observability` (pino, OTel helpers, classification-aware redaction), `classification` (six classes, payload rules), `keys` (refs, custody models, ports, canary contract, test-only provider), `events` (envelope, in-memory bus), `outbox` (enqueue, relay, receipts), `jobs` (queue port, Postgres queue, registry, poller).
- `packages/shared-kernel` — the nine universals implemented: `Money` (bigint minor units, largest-remainder `allocate`), `Currency` (registry: QAR, SAR, AED, OMR, KWD, BHD, USD, EUR, GBP), `Percentage` and `ExchangeRate` (exact scaled), `Clock`, `Result`, `DomainEvent`, `TenantId`, `UserId` — supporting vocabulary namespace-merged to keep the nine-export cap (test 20).
- `packages/api-contracts` — event catalogue plus loader/validator; the one Phase 2 event is `platform.diagnostic.ping`.
- `modules/audit` — first real module: domain/application/infrastructure/public-api, metadata-classification guard, Postgres writer.
- `apps/api` — composition root over the platform: config boot, telemetry init, global exception filter, DB-backed readiness, graceful shutdown.
- `apps/worker` — runtime wiring for relay and poller, typed worker settings, health server, graceful shutdown; only diagnostic handlers/consumers, business-free by rule.
- `scripts/checks/architecture.mjs` — checks for the newly activated tests and the Phase 2 structures.

## Database migrations

All forward-only, each with a mandatory `-- rollback:` recovery block; runner semantics in [`packages/platform/db/migrations/README.md`](../../packages/platform/db/migrations/README.md).

| Migration | Creates |
|---|---|
| `0001_platform_and_audit_schemas` | Schemas `platform` and `audit` (owned by `karar_migrator`), `platform.schema_migrations` |
| `0002_public_schema_hygiene` | Revokes `CREATE` on schema `public` from `PUBLIC` |
| `0010_audit_events` | `audit.audit_events` — append-only by revoked grants and an owner-proof statement-level trigger |
| `0020_outbox` | `platform.outbox_events` and `platform.event_consumer_receipts` |
| `0021_jobs` | `platform.jobs` — lease, retry, idempotent-enqueue semantics |

**Schemas and roles summary:** bootstrap (`db:create`) creates `karar_migrator` (restricted schema owner and migration role: `NOSUPERUSER`, `NOBYPASSRLS`, no `CREATEDB`/`CREATEROLE`) and `karar_app` (runtime: per-table minimal DML from each table's migration, no DDL, no DELETE on outbox/receipts/jobs/audit), revokes `PUBLIC` connect, and transfers ownership of schema `public` to the migrator. The api and worker connect as `karar_app`; nothing at runtime is a superuser.

## API changes

No business endpoints. Two operational surfaces changed, additive:

- `apps/api` `/readyz` now executes real checks — `SELECT 1` on the application role and a read-only migration verify — answering 200 only when PostgreSQL is up **and** migrations are current, else 503 with per-check states (states only, never hosts or driver errors). Errors platform-wide leave as RFC 7807 `application/problem+json`.
- `apps/worker` gained its own loopback-only health server (`KARAR_WORKER_PORT`, default 3001): `/healthz` liveness, `/readyz` checking PostgreSQL, migrations, and both loop heartbeats.

`api-contracts` diff: the event catalogue and its loader are new; the OpenAPI surface is unchanged.

## Security controls

Phase 2 controls, each canonical in the linked document; the framework mapping lives in the [control matrix](../compliance/control-matrix.md) (updated by the compliance workstream in parallel):

- **Least-privilege database roles** — restricted migrator, minimal per-table app grants, no runtime DDL, superuser confined to bootstrap ([`backend.md` §6](../architecture/backend.md)).
- **Append-only audit, doubly enforced** — revoked grants plus an owner-proof trigger on `audit.audit_events`; metadata guard keeps payloads out ([`data-model.md` §10](../architecture/data-model.md)).
- **Fail-fast typed configuration** — missing/malformed values stop boot with field names only; secrets travel as self-redacting `SecretValue` ([`../security/secrets.md`](../security/secrets.md)).
- **Classification enforcement in code** — six classes with payload rules on the event path and sink rules in the logger; `SECRET`/`SEALED` never reach logs ([`../security/data-classification.md`](../security/data-classification.md)).
- **Honest readiness** — a constant is not a health check; `/readyz` states are real dependency probes ([`backend.md` §10](../architecture/backend.md)).
- **Immutable, checksummed migration history** — drift detection distinguishes history from tampering ([`database-portability.md` §6](../architecture/database-portability.md)).
- **Provider-neutral opaque references** — `karar-ref` types keep provider identifiers out of persisted data from the first row ([`infrastructure-portability.md` §6](../architecture/infrastructure-portability.md)).

## SOC 2 mapping

Deferred to the [control matrix](../compliance/control-matrix.md), which the compliance workstream updates for Phase 2 in parallel with this report — mapping is readiness work; **no SOC 2 attestation is claimed**.

## ISO 27001 mapping

As above: authoritative control IDs live in the [control matrix](../compliance/control-matrix.md); **no ISO/IEC 27001 certification is claimed**.

## Evidence produced

EV-201 through EV-219 are registered in the [evidence register](../compliance/evidence-register.md), all PENDING with first collection recorded as: Phase 2 PR CI runs plus the lead's local verification of 2026-08-15 (this section). Local machine-readable reports regenerate at `scripts/checks/.out/` on every run. CI artifact URLs are attached to the evidence rows once the Phase 2 PR's first workflow runs complete.

## Tests executed

All executed locally by the phase lead on 2026-08-15 (macOS arm64, toolchain per `.tool-versions`, live PostgreSQL 17 via Compose on port 5433 — this machine hosts its own PostgreSQL on 5432); CI repeats the suites against Compose PostgreSQL on the default port.

| Suite | Result |
|---|---|
| Workspace (vitest, all packages/apps) | **467 passed, 5 gated, 472 total** — 43/44 files (the gated file is the compose-manipulating readiness suite below) |
| Readiness integration (KARAR_INTEGRATION=1, stops/starts PostgreSQL) | **22/22** — up, down, recovery, migration-behind |
| Platform package alone | 203 tests, 17 files — includes migration contract, restricted-role denial, audit immutability, outbox atomicity/concurrency (2 relays × 200 events, zero duplicates), jobs concurrency (2 workers × 100 jobs, exactly-once), local-only password-guard |
| Architecture tests | **20 passed, 0 failed, 8 deferred by activation phase; registry errors 0; self-test 22/22 seeded violations caught** |
| Documentation checks | 7/7 |
| Flutter analyze/test | pass (unchanged from Phase 1; no mobile work this phase) |

## Build results

`pnpm -r build` clean across all 9 workspace projects. `make verify` passes end to end. Database flow verified live: `make db-verify` reports all five migrations applied by `karar_migrator`; the from-zero path (`db:create` → `db:migrate` → `db:verify`) is additionally proven twice against scratch databases inside the contract tests. Integration fixes applied during the lead pass, recorded rather than hidden: the Phase 1 `financial-engine` placeholder was reconciled to the real kernel API; development password fallbacks in connection profiles were gated to `KARAR_ENV=local` with fail-fast outside it (new guard tests); a package `exports` map was added to `@karar/platform`; the CI workspace job gained a Compose PostgreSQL step; `make db-*` targets were wired with a build prerequisite and added to `.PHONY`. One flaky observation, recorded honestly and then fixed: the `apps/worker` outbox-ping integration test failed once immediately after a PostgreSQL container restart — its final assertion raced the relay's `published_at` update against the consumer receipt. The assertion now polls (the outbox contract guarantees eventual publication, not same-instant ordering); five consecutive reruns pass.

## Independent review

The independent reviewer inspected the complete integrated diff, re-executing every headline verification (all six test suites, both check scripts, the live database flow) rather than trusting reports; every quoted count reproduced exactly. Findings: **0 BLOCKING, 0 HIGH, 2 MEDIUM, 4 LOW, 6 INFORMATIONAL** — verdict mergeable after the MEDIUMs.

Dispositions, all before this PR opened: both MEDIUMs fixed (an unset `KARAR_ENV` now counts as non-local in the credential-fallback gate, with a test — a mis-targeted CLI run can no longer downgrade role passwords on a reachable cluster; CI now sets `KARAR_INTEGRATION=1`, so the readiness-integration evidence for EV-216 is collected in CI rather than only on a maintainer machine). All four LOWs fixed (a failed ROLLBACK now destroys the pooled client instead of re-pooling it; the second lifecycle table renders correctly; the stale exports-map risk wording corrected; the log redactor now walks class-instance properties, with a test). The six INFORMATIONAL items are recorded as accepted: catalogue diagnostics stop at the first problem entry, the worker health server is loopback-only until a deployment profile exists, concurrent `db:migrate` runs fail noisily rather than queueing, one stale build artifact in `dist/`, stale-lease re-queue has no backoff by design, and two cosmetic message/metric labels.

## Known limitations


- **Metrics exist; alerting does not.** Dead-letter and lag instruments are emitted, but no alert routes, dashboards, or on-call rotation consume them yet.
- **Key custody is design-only.** Types, ports, custody models, and the canary contract exist with a test-only provider; no KMS adapter and no running canary (Phase 13+).
- **In-memory event bus only — by design.** Cross-process delivery is the outbox's job; no cloud transport exists or is claimed. The bus port is what a later transport implements.
- **Deep dist imports.** A package `exports` map now exists on `@karar/platform` (clean subpaths plus a `dist/*` passthrough), but the apps still use the older `@karar/platform/dist/...` specifiers; sweeping them to the clean subpaths is deferred cleanup. The concepts documented here are unaffected.
- **RLS not yet active.** The Phase 2 platform/audit tables are role-bounded but carry no RLS policies; RLS and its architecture tests activate with the first tenant-scoped tables (Phase 3).
- **Single maintainer.** Every workstream role resolves to one person; independent review is a role, not yet a separate party.

## Accepted risks

Carried in the [risk register](../compliance/risk-register.md) with named owners:

| Risk | Owner |
|---|---|
| Single-maintainer bus factor across all roles (carried from Phase 1) | Maintainer |
| Custody design-only window: sealed-data phases must not start before a custody strategy is approved and the canary runs | Maintainer |
| Internal `@karar/platform` paths remain reachable through the exports map's `dist/*` passthrough (kept so existing deep imports work until the specifier sweep) | Maintainer |
| Outbox/jobs/audit history grows unpurged until the retention job ships (grants deliberately withhold DELETE) | Maintainer |

## Deferred work

- **Phase 3:** RLS policies and adversarial tenant tests (activating architecture tests 9, 21, 22); Prisma-based domain repositories on top of the platform adapter (ADR-0005); `DataSourceResolver`.
- **Later phases:** retention/purge jobs for outbox, receipts, jobs, and audit history (the numbers move to PolicyPacks at Phase 3.5); cloud KMS adapters and the running sealed-integrity canary (Phase 13+); cloud CI legs of the database contract suite and any cloud transport for the event bus (Phase 17+); the `@karar/platform` exports map.

## Documentation updated

Per the [phase-end ritual](README.md):

- Root `README.md` — containers and structure (six packages), quick-start db steps, testing section, roadmap paragraph; status block already carried Phase 2.
- [`../roadmap.md`](../roadmap.md) — Phase 2 row marked in progress at phase start; marked complete at phase close.
- This report — body complete; verification sections filled by the lead at phase close.
- [`../onboarding/developer.md`](../onboarding/developer.md) — Q6/Q22/Q38/Q39 updated; Q40–Q48 added for the platform foundation.
- [`../glossary.md`](../glossary.md) — platform-foundation terms added.
- [`../README.md`](../README.md) — documentation-index phase header and phase-02 row.
- Architecture docs — implemented-state notes: [`backend.md`](../architecture/backend.md), [`data-model.md`](../architecture/data-model.md), [`database-portability.md`](../architecture/database-portability.md), [`infrastructure-portability.md`](../architecture/infrastructure-portability.md), [`event-governance.md`](../architecture/event-governance.md).
- [`modules/audit/MODULE.md`](../../modules/audit/MODULE.md) — updated by the audit workstream.
- [`../compliance/evidence-register.md`](../compliance/evidence-register.md) and control matrix — compliance workstream, parallel to this report.

## Next-phase entry criteria

Phase 3 (identity, users, tenancy, operating-entity, RBAC, consent with re-consent evaluation, sessions, kill switches, PostgreSQL RLS, adversarial cross-tenant tests — [roadmap row 3](../roadmap.md)) may start when:

- The Phase 2 PR is merged to `main` with required CI checks green, and this report's verification sections are filled.
- The from-zero database flow (`db:create` → `db:migrate` → `db:verify` clean) is proven on a clean checkout, so Phase 3 migrations extend a reproducible baseline.
- The platform foundation is consumable as Phase 3's substrate: typed config, the persistence adapter, the audit writer, the outbox, and the job queue — Phase 3 builds identity and tenancy on these rather than introducing parallel plumbing.
- Architecture tests 9 (tenant scoping), 21 (pinning), and 22 (RLS coverage) are understood as activating with Phase 3's first tenant-scoped tables per their registry criteria — the first such migration ships with RLS enabled and FORCEd, pinning columns where legal consequence exists, and non-empty adversarial isolation tests.
- The Phase 2 compliance gate is passed per [`../compliance/phase-compliance-gate.md`](../compliance/phase-compliance-gate.md).
