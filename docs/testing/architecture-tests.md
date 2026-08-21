# Architecture Tests

**26 CI-blocking tests**, plus a canary-purity check that is not numbered because it guards an artefact rather than a structure. Plan v2 §13 specifies 21; the Phase 0.2 legacy audit added five (22–26).

**Gates block the merge, not merely the workflow run.** The legacy's gates *"block a workflow run, not a merge or a deploy; no enforcement path exists in the repository"* (INFRA-07).

## Current status, and why three tests are asleep

`pnpm arch:test`: of the **27 registry entries, 24 are ACTIVE and pass, 0 fail, and 3 are deferred by activation phase**; registry errors 0; the self-test passes over 70 cases; and all three supplementary checks (`admin-no-db-driver`, `phase5-ingestion-not-mounted-early`, `module-permissions-in-catalogue`) pass. `phase5-ingestion-not-mounted-early` scans zero files now that the marker has moved and cannot fail again; it is retained as the other half of a lock test 24 has taken over, and it is counted as a pass, which is why the headline reads 27. The registry's `currentPhase` is **5**.

**The runner's own summary line prints `25 passed`, and the discrepancy is arithmetic rather than substance.** It adds `admin-no-db-driver` to the pass count and does not add `phase5-ingestion-not-mounted-early`, which increments the failure count on a violation and increments nothing on a pass. The registry-derived figure above is the one to quote; the asymmetry is recorded here rather than resolved by choosing whichever number reads better.

Each test carries an **activation phase** in [`architecture-test-registry.json`](architecture-test-registry.json), and the runner enforces the gate in both directions: a test whose activation phase has been reached with no implementation is a **registry error**, not a silent skip.

| Deferred | Activation | Waiting on |
|---|---|---|
| 13 Sealed containment | 13 | No code carries `SEALED`-marked content to scan (Documents + Sealed Vault phase) |
| 14 Grant required | 13 | Vault transaction isolation becomes implementable and checkable with the same phase |
| canary-purity | 13 | The sealed-integrity canary is designed and implemented (key-custody phase) |

**Test 24 is the one worth explaining, because the lock it sits inside is the only one in this repository that runs in both directions.** Its activation phase is 5, and for most of Phase 5 the registry deliberately stayed at `currentPhase` 4: setting it to 5 while no ingestion path existed would have made the test scan nothing and pass, which is the failure mode this repository has already been bitten by three times. The other half of the lock, the supplementary `phase5-ingestion-not-mounted-early` check, refused a pre-phase-5 tree that mounted an ingestion path at all. **Neither the marker nor the path could move without the other** — and they moved together, in one commit that mounted the CSV upload and parse routes, implemented `checkResourceLimits`, flipped test 24 to `ACTIVE` with its `implementedIn`, advanced `currentPhase` 4 → 5, and updated the README status row.

**What test 24 now enforces, and how its pass was shown to be non-vacuous.** It discovers real ingestion paths from the tree rather than from a maintained list — using the same definition the pre-activation guard used, so the two controls cannot disagree about what counts — and fails in both directions: a mounted path declaring no central policy, and a central policy naming a path that no longer exists. It also fails when the tree contains no real path at all. Two mutations of the live tree prove the pass is real rather than asserted: hardcoding a byte or row bound in a helper fails, naming `apps/api/src/financial/csv-body.ts`; removing the `INGESTION_LIMIT_POLICIES` reference from a mounted controller fails, naming `statement-import-source.controller.ts`. The first mutation is why the check scans the whole ingestion surface rather than only the files that mount a route: a controller can reference the central policy faithfully and then call a helper that hardcodes the number, and the helper is where the bound actually bites. That hole was found by mutating the real tree, not by the seeded self-tests — which is the argument for doing both.

The supplementary `phase5-ingestion-not-mounted-early` check now scans zero files and passes trivially, because the marker has moved past it. It is kept rather than deleted: it is the guard that would fire again if the marker were ever rolled back with the routes left in place.

The **self-test runs on every invocation**, not as a separate job: it seeds a violation per checker in a temporary tree and asserts each one fails and names the seeded file, then asserts that a set of legitimate shapes stays unflagged. A suite whose passes have not been shown to be non-vacuous on the same run is a suite that reports its own configuration.

---

## Layering and boundaries

| # | Test | Fails when |
|---|---|---|
| 1 | Domain purity | `domain/` imports a framework, ORM, or HTTP symbol |
| 2 | Layer direction | `application/` imports `infrastructure/`, or `domain/` imports either |
| 3 | Module boundary | A cross-module import bypasses `public-api.ts` |
| 4 | No ORM leakage | A Prisma type appears outside `infrastructure/` |
| 5 | Ports declared inward | An adapter exists with no port declared in `application/` |
| 6 | No business logic in controllers | A controller exceeds declared complexity or calls more than one use case |
| 10 | No direct provider access | A domain or application file names a vendor or **cloud SDK** — any GCP/AWS/Azure SDK import in `domain/` or `application/`; a provider-specific URI or resource name (`gs://`, `arn:`, project paths) in a domain entity; a database, storage, messaging, secrets, KMS, or AI provider client (Cloud SQL, RDS, GCS, S3, Pub/Sub, Secret Manager, Secrets Manager, Vertex, …) referenced outside its own adapter in `infrastructure/providers/` or `infrastructure/persistence/` |
| 11 | Deterministic domain | `domain/` reads the system clock or a random source |
| 17 | Pure packages | One of the five constrained packages gains a framework dependency: `shared-kernel`, `financial-engine`, `jurisdiction-policy` and `state-machine` are pure by manifest and source; `capability-registry` is purity-constrained by both |
| 18 | Storage access | A domain touches `ObjectStorage` directly rather than via `documents` |
| 20 | Kernel surface | `shared-kernel` exports anything beyond the **ten** universals, or is missing one. The ten are `CalendarDay`, `Clock`, `Currency`, `DomainEvent`, `ExchangeRate`, `Money`, `Percentage`, `Result`, `TenantId`, `UserId`; [ADR-0027](../adr/0027-calendar-day-and-instant.md) raised the cap from nine to ten and authorises that one distinction and nothing more. The check runs in **both** directions — a fixture that omits a universal and one that adds a stranger — because a rename is absent under its old name and extra under its new one, which is also how an aliasing re-export that changes the public surface is caught |

## Correctness

| # | Test | Fails when |
|---|---|---|
| 7 | Money discipline | A monetary position is typed `number`, or a float operation appears, anywhere in the pure packages, any module layer, or the api/worker apps. Dart `double` is a SEPARATE control, in `apps/mobile/test`, not this one |
| 12 | No jurisdiction branching | A conditional or pattern match on a country/jurisdiction identifier appears in `domain/`, `application/`, or `presentation/`. **Country codes in localization, reference data, formatting, fixtures, and seed data are permitted** |
| 21 | Pinning | A table declared to carry legal consequence lacks `jurisdictionAtCreation`, `policyPackVersionAtCreation`, `operatingEntityAtCreation`, or `subjectPolicySelectionVersion` |

## Sealed data

| # | Test | Fails when |
|---|---|---|
| 13 | Sealed containment | `SEALED` appears in a projection, event, log, analytic, or AI context |
| 14 | Grant required | A `SealedRecordStore` read path exists without a `SealAccessGrant` at the type level, or a vault operation joins a caller transaction |
| — | Canary purity | The sealed-integrity canary's plaintext contains customer-derived data |

## Events

| # | Test | Fails when |
|---|---|---|
| 8, 15 | Event catalogue | A published event is absent from the catalogue; a consumer is not in `allowedConsumers`; a schema change is neither additive nor version-bumped; **a `SEALED` event carries anything but identifiers and status** (mandatory, no exemption); a `HIGHLY_SENSITIVE_FINANCIAL` event carries payload without a declared `payloadExemption` naming owner, reason, and reviewer |

## Governance

| # | Test | Fails when |
|---|---|---|
| 16 | Module ownership | A module directory lacks `MODULE.md` |
| 19 | Approval policy | A capability declaring disclosure has no `ApprovalPolicy` in a pack; an override below a declared default lacks a recorded legal basis and approver |

## Tenancy

| # | Test | Fails when |
|---|---|---|
| 9 | Tenant scoping | A repository method is reachable without tenant context |
| 22 | **RLS coverage** | A table is not RLS-enabled and FORCEd and is not on an explicit allow-list with a stated reason. **Detects three shapes: *no RLS*, *enabled-without-policy*, and *FORCEd-without-enabled*** |

## Added by the legacy audit

| # | Test | Origin |
|---|---|---|
| 22 | RLS coverage guard, all three shapes | RLS-01, RLS-02, P14 — the legacy's guard tests only for *enabled-without-policy*, and its own audit table is *FORCEd but not enabled* |
| 23 | **No declared guard without a call site** | AZ3 — `TenantAccessGuard` has *two of three documented protections with no call site anywhere*. They read as live controls and are not |
| 24 | **Ingestion and rendering paths declare explicit resource limits** — bytes, rows, pages, wall-clock, memory | FILES-2 (HIGH), FILES-7, API-05 |
| 25 | **Every persistent dataset declares its lifecycle** — subject relationship, purpose, classification, retention, export treatment, erasure strategy ([ADR-0026](../adr/0026-data-lifecycle.md)) | P7, P8 — one production table holds statement-derived data belonging to no user and cannot be erased on request |
| 26 | **Technical and legal capability claims have evidence traceability** — every claim a `CapabilityDescriptor` or referenced legal document makes maps to an entry in the [Assurance Claim Registry](../security/assurance-claims.md) with an evidence pointer and a named owner | P1, P4, P12, C4 |

### On test 26

CI cannot read legal prose, and this test does not pretend it can. What it asserts mechanically is the **link**: a capability that references a legal document, or a document that promises a behaviour, must have a registry entry naming the claim, its evidence (a test ID, a code path, a document, an evidence label), and an owner. Whether the evidence actually supports the claim is a **human review recorded in the registry**, not a build step.

That link and owner are exactly what was missing when the legacy's AI consent notice and its redaction code diverged: *"The code is defensible; the consent text is wrong, and that text is the legal basis for a cross-border transfer of customer financial data."*

---

## The principle behind all of them

> **Every control ships with a test that fails when the control is removed.**

Not a test that the control exists — **a test that the attack fails.**

And for isolation specifically: **tests assert on non-empty expected data.** A cross-tenant test that passes because nothing came back has verified nothing. The legacy's tenant roster returns empty for everyone because a policy is missing, and *an empty roster is indistinguishable from correct isolation.*

## Related suites — not architecture tests

**PostgreSQL adapter contract tests** ([`../architecture/database-portability.md`](../architecture/database-portability.md)): one contract suite per repository port, runnable against local Docker PostgreSQL from Phase 1–2 and, when those environments exist, against each approved managed PostgreSQL provider. It pins repository behaviour, RLS assumptions, transaction semantics, `Money` persistence, and migrations to the **PostgreSQL contract rather than any provider's**. Integration tests, not structural ones — listed here so nobody looks for them in the 26.

## Coverage this does not provide

| | |
|---|---|
| That the system is secure | Architecture tests check structure, not behaviour under attack |
| That business logic is correct | That is what unit and integration tests are for |
| That prose matches code | Test 26 asserts the link and the owner, not the semantics |
| That runtime configuration is correct | RLS runtime verification scripts cover part of this; staging covers more |
