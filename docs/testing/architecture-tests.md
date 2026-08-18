# Architecture Tests

**26 CI-blocking tests.** Plan v2 §13 specifies 21; the Phase 0.2 legacy audit added five (22–26).

**Gates block the merge, not merely the workflow run.** The legacy's gates *"block a workflow run, not a merge or a deploy; no enforcement path exists in the repository"* (INFRA-07).

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
| 17 | Pure packages | `jurisdiction-policy` or `state-machine` gains a framework dependency |
| 18 | Storage access | A domain touches `ObjectStorage` directly rather than via `documents` |
| 20 | Kernel surface | `shared-kernel` exports anything beyond the ten universals, or is missing one |

## Correctness

| # | Test | Fails when |
|---|---|---|
| 7 | Money discipline | A float, `number`, or `double` appears in a monetary position |
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
