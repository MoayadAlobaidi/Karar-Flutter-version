# Threat Model

**Status:** Phase 0 — design-stage model. **No system exists, no data is held, no penetration test has been performed.**
**Basis:** Karar's architecture as documented, plus 128 findings from the legacy audit of `MoayadAlobaidi/Qarar`.

---

## 1. Assets, ranked

| # | Asset | Why ranked here |
|---|---|---|
| 1 | **Sealed obligation payloads** | Confidential by promise, unreadable by Karar, irrecoverable if keys are lost |
| 2 | **Encryption keys (KEK/DEK)** | Compromise exposes everything; loss destroys sealed data permanently |
| 3 | **Customer financial data** | Transactions, balances, statements — the product's core sensitive holding |
| 4 | **Authentication credentials and sessions** | Gateway to 1 and 3 |
| 5 | **Administrative access** | Cross-tenant reach; production capability |
| 6 | **Consent and legal-acceptance records** | The legal basis for processing; evidentiary |
| 7 | **Audit records** | Establish what happened; must resist tampering |
| 8 | **Capability availability configuration** | Controls what is lawfully exposed where |

## 2. Trust boundaries

```mermaid
graph TB
    U[Untrusted: internet, clients, third-party reporters]
    U --> EDGE[Edge: TLS, rate limit, authn]
    EDGE --> APP[Application: modular monolith]
    APP --> DB[(PostgreSQL — RLS boundary)]
    APP -.grant required.-> V[Sealed vault<br/>own process, keys, network]
    ADM[Admin browser] --> CP[Control plane<br/>own trust boundary]
    CP -.short-lived scoped token.-> APP
    APP --> EXT[External providers:<br/>AI, storage, KMS, verification]
    style V fill:#ffe8e8
    style DB fill:#e8f4e8
    style CP fill:#fff4e8
```

**Four boundaries that matter:** the edge, the database (RLS), the sealed vault, and the control plane. Each is designed so that compromise of the layer above does not automatically breach it.

## 3. Threats and controls

### T1 — Cross-tenant data access

**Vector:** a missing filter, a missing RLS policy, a forgotten tenant scope, or a `?tenantId=` parameter.

| Control | |
|---|---|
| RLS enabled **and** FORCEd on every table, or explicitly allow-listed with a reason | ADR-0022 |
| Application role has **no `BYPASSRLS`** | |
| `app.tenant_id` bound from the caller's record **inside** the transaction, never client input | |
| Architecture test 22 detects *no RLS*, *enabled-without-policy*, **and** *FORCEd-without-enabled* | |
| Adversarial cross-tenant tests **asserting non-empty expected data**, exercising SELECT, UPDATE, DELETE | |

**Legacy evidence:** 24 of 69 tables without RLS, 6 unexplained; `tenant_invitations` holding bearer codes with no RLS; isolation proved for 3 of 45 tables with UPDATE never exercised.

### T2 — Sealed data exposure

**Vector:** a projection, an event, a log line, an AI prompt, an admin endpoint, a support escalation, or a SQL-level mistake.

| Control | |
|---|---|
| `SealAccessGrant` is a **required, non-nullable argument** — compiler-enforced | ADR-0017 |
| RLS on `sealed_payloads` additionally requires a grant GUC | |
| `AiContext` input types **structurally cannot hold** sealed data | |
| No `SUPPORT`/`ADMIN`/`ANALYTICS`/`AI` grant type exists | |
| No admin role holds `amanat.content.read` at any level | |
| Event rule is mandatory with **no exemption mechanism** | ADR-0025 |
| Architecture tests 13, 14 | |
| **Every attempted access audited, successful or refused** | |

### T3 — Key compromise or key loss

**Loss is the under-weighted half**, and the legacy proves it: **ENC-2 — the production key "has already been lost once."**

| Control | |
|---|---|
| KMS-held KEKs, jurisdiction-scoped; per-record DEKs | |
| **Approved `KeyCustodyStrategy`** (ADR-0017) — recovery/continuity tested; drill rehearsed where technically applicable | Phase 20 gate |
| **Sealed-integrity canary** — synthetic sealed record per KEK, known non-customer plaintext, decrypted on a schedule | Phase 20 gate |
| Rotation designed in from Phase 2, not retrofitted | |
| Startup refuses to boot without a key, or when existing data cannot be decrypted | |
| Separate keys per environment — **never reuse production's anywhere** | |

For sealed data, loss is **unrecoverable and undetectable**, discovered at the worst possible moment. The canary is the only mechanism that detects it without violating the seal.

### T4 — Authentication and session attacks

| Vector | Control |
|---|---|
| Credential stuffing, brute force | Lockout that **does not reset the counter on lock** (legacy AUTHN-11), distributed rate limiting |
| **Rate-limit bypass via client-supplied headers** | Client IP from a **configured trusted-proxy allow-list**. Legacy AUTHN-04, HIGH — assessed as total bypass |
| **Rate-limit bypass via path encoding** | Policy selected from the **normalised, decoded** path. Legacy API-01, HIGH — `/api/v1/ai/%63hat` |
| Token theft | Short-lived access tokens; rotating refresh; **server-side revocation for all sessions, admin first** (legacy AUTHN-07) |
| Stale authorization | Roles re-derived from the database per request — **carried forward from the legacy, which got this right** |
| Recovery-code brute force | Attempt counter and lock (legacy has neither) |
| Password reset flooding | Per-account cooldown |

### T5 — Privileged insider or compromised admin

| Control | |
|---|---|
| Control plane mints short-lived, single-environment, purpose-scoped tokens; **browser holds no environment credential** | ADR-0021 |
| Production gateway: reason capture, optional second approval, reauthentication, network restriction | |
| Admin data from **projections**, not domain tables | ADR-0020 |
| **Every staff read of a customer record audited, including reads returning nothing** | Legacy AZ5 |
| Append-only audit: revoked grants **and** a trigger raising on UPDATE/DELETE even for the owner | |
| **Restrict-only settings** — an operator cannot enable a capability code has not cleared | ADR-0015 |
| Sealed data unreachable at any privilege level | |

The restrict-only invariant is specifically an anti-insider control: **a compromised admin account cannot expose a capability where it has no legal basis.**

### T6 — AI-specific threats

| Vector | Control |
|---|---|
| Model states a wrong figure | **The model never writes a number** — ADR-0019 |
| Prompt injection via merchant narratives | Injection controls **built and executed**, not merely written (legacy AI-1, AI-9) |
| Sensitive data in prompts | Facts-only context; unconditional redaction of machine identifiers; sealed structurally excluded |
| Cross-border transfer without basis | `AIProcessingPolicy` typed clause; consent gate **fails closed** (legacy AI-5 fails open) |
| Bypassing controls via a direct provider call | One orchestrator; architecture test 10 (legacy AI-4) |
| Cost exhaustion | Per-user and per-tenant metering and caps; kill switch **tested**, not decorative |

### T7 — Ingestion and rendering resource exhaustion

| Vector | Control |
|---|---|
| Unbounded parsed rows | **Explicit row cap.** Legacy FILES-2, HIGH — a 10 MB CSV carrying ~1M rows into one transaction on a pool of 10 |
| Malicious PDF | Page, memory, and wall-clock ceilings; magic-byte validation (legacy FILES-3) |
| Rendering abuse | **No caller-supplied HTML**; explicit budgets. Legacy FILES-7 |
| Disclosure package generation | Same limits — a rendering path handling sealed data |

**Rule: every ingestion and rendering path declares explicit limits and rejects rather than degrades.** Architecture test 24.

### T8 — The published document contradicts the system

**The legacy's most consequential finding, and not a code defect.**

> **P1** — the AI notice stated merchant names and notes were redacted; they were not. *"The code is defensible; the consent text is wrong, and that text is the legal basis for a cross-border transfer of customer financial data."*

Related: **P4** (privacy policy promises in-app export; no screen calls it), **P12** (republication asks nobody to re-accept), **C4** (a compulsory document promises per-item deletion the code does not provide).

| Control | |
|---|---|
| Consent gates **fail closed** | |
| Republication triggers **re-consent evaluation**, material/non-material, **neither defaulted** | ADR-0024 |
| Capability promises reconcile with legal documents | Architecture test 26 |
| `MODULE.md` names the legal documents a capability's promises appear in | |

### T9 — Existence disclosure via the death-report endpoint

**Vector:** an unauthenticated third party files a death report and infers, from response content or timing, whether the subject had sealed records.

**Control:** identical responses **and identical timings** whether records exist or not, until authorization completes. Asserted by test, including timing equivalence. Rate limiting and abuse detection on reports.

**This is a privacy breach requiring no data release at all** — for a capability whose premise is confidentiality, the failure that matters most.

### T10 — Supply chain and secrets

| Control | |
|---|---|
| Dependency and secret scanning in CI, **blocking the merge, not just the run** | Legacy INFRA-07 |
| Flutter client built, analysed, and tested in CI | Legacy INFRA-10 — mobile is never checked |
| Secrets never in the repository, logs, or error messages | |
| Lockfiles committed; dependency updates reviewed | |

## Phase 2 platform threats

Threats introduced by the Phase 2 platform foundation (configuration, database
roles and migrations, events/outbox/jobs, audit, observability, key-custody
design), mapped to their controls. Evidence refs `EV-201..EV-213` are
placeholders the compliance workstream registers in the evidence index; test
paths under `packages/platform/src/outbox` and `packages/platform/src/jobs`
are workstream D's, named here by agreed location.

| Threat | Preventive control | Detective control | Test reference | Evidence | Residual risk | Owner |
|---|---|---|---|---|---|---|
| Migration abuse (elevated DDL, edited history) | Runner connects as `karar_migrator`, never superuser; forward-only; every file needs a `-- rollback:` block | sha256 checksum drift and missing/renamed applied files hard-fail `migrate` and `verify` | `packages/platform/src/db/contract.test.ts` | EV-201 | A hostile migration inside the range still runs with migrator rights; review is the control | Platform |
| Excess DB privilege | Grant convention: per-table minimal DML; no `GRANT ALL`, no PUBLIC, DDL only via migrator; roles carry no SUPER/BYPASSRLS/CREATEDB/CREATEROLE | Contract tests probe denials (42501) and role attributes live | `packages/platform/src/db/contract.test.ts` | EV-202 | Convention enforced by review + tests until an automated grant linter exists | Platform |
| Event loss / duplication | Transactional outbox: state and event commit in one transaction; at-least-once with idempotent consumers keyed on event id | Outbox lag/backlog metrics; relay retry accounting | `packages/platform/src/outbox` tests (D) | EV-203 | At-least-once means duplicates by design; a non-idempotent consumer is a defect class tests must catch per consumer | Platform |
| Poisoned event payload | Catalogue payload rules by classification (tests 8/15); `assertEventPayloadAllowed` at call sites; consumers validate against catalogue schema | CI catalogue checks; dead-lettering of unparseable events alerts | `scripts/checks/architecture.mjs#checkEventCatalogue`; `packages/platform/src/classification/classification.test.ts` | EV-204 | Semantic poisoning inside a valid shape remains; schema versioning discipline is the mitigation | Platform |
| Job replay / double execution | Jobs are idempotent with caller-supplied keys; single-claim leasing in the job store | Job run outcomes recorded; duplicate-claim metrics | `packages/platform/src/jobs` tests (D) | EV-205 | Crash between side effect and completion mark still replays; handlers must tolerate it | Platform |
| Dead-letter leakage | DLQ rows carry envelope + classification-redacted payload per catalogue rules; access via `SECURITY` review only | Dead-lettered events alert; DLQ depth monitored | `packages/platform/src/outbox` DLQ tests (D) | EV-206 | A payload legitimately carried under exemption sits in the DLQ for its retention; retention policy bounds exposure | Platform |
| Audit tampering | Append-only twice over: `karar_app` holds INSERT+SELECT only, and `audit_events_immutable` raises on UPDATE/DELETE/TRUNCATE even for the owner | Live denial tests both paths (42501 and P0001); audit gaps surface as `Result.err`, never swallowed | `modules/audit/__tests__/audit-append-only.integration.test.ts` | EV-207 | A superuser at the cluster level can drop the trigger; cluster access control and (later) off-host audit shipping bound it | Platform |
| Log leakage of classified data | Classification module is the one redaction vocabulary: `isLoggable` false for SECRET/SEALED, `[redacted:*]` markers; logger consumes it; audit metadata guard rejects/redacts | SEALED-at-log-site warn-once signal; test 13 deepens the static scan at Phase 13 | `packages/platform/src/classification/classification.test.ts`; `packages/platform/src/observability/logger.test.ts` | EV-208 | Free-text log messages can still embed data manually; review + future static scan cover that path | Platform |
| Config / secret leakage | `SecretValue` opaque holder (redacted on inspect/JSON); refs (`karar-ref:*`) instead of provider resource names; no direct env access outside config | `no-direct-env-access` test; profile-secrecy tests assert nothing prints | `packages/platform/src/config/config.test.ts`; `packages/platform/src/db/contract.test.ts` | EV-209 | Process-level compromise reads memory regardless; scope is leak-via-logs/serialization | Platform |
| Clock manipulation | Domain time arrives via `Clock` port only (test 11 bans ambient reads); audit rows carry caller `occurred_at` plus DB-defaulted `recorded_at` as an independent witness | Skew between occurred_at and recorded_at is queryable; monitoring hooks at Phase 3+ | `scripts/checks/architecture.mjs#checkDeterministicDomain`; `modules/audit/__tests__/audit-append-only.integration.test.ts` | EV-210 | Host NTP compromise moves both clocks; infrastructure hardening owns that layer | Platform |
| Key-version loss | Provenance is structural: every encrypt/wrap result carries `KeyVersionRef`; rotation keeps prior versions decryptable; destruction safeguards in `KeyRotationPolicy` | Sealed-integrity canary decrypts on schedule and alerts (Phase 13 operational; contract pinned now) | `packages/platform/src/keys/keys.test.ts` | EV-211 | Until the canary runs in production, loss detection is test-time only — accepted with the Phase 13/20 gates | Platform |
| Unbounded queues | Bounded retry with backoff then dead-letter; job and outbox backlogs capped/paged, never unbounded scans | Backlog depth + DLQ alerts; queue-age metrics | `packages/platform/src/outbox` / `packages/platform/src/jobs` tests (D) | EV-212 | A poison generator can still fill the DLQ inside limits; alerting is the mitigation | Platform |
| Portability drift (provider lock-in) | One `PostgresPersistenceAdapter`; profiles vary, adapter does not; refs never resource names; no cloud SDK outside `infrastructure/providers` (test 10) | Architecture test 10 scans every build; fresh-database-from-zero contract test | `scripts/checks/architecture.mjs#checkProviderBoundary`; `packages/platform/src/db/contract.test.ts` | EV-213 | SQL dialect creep inside migrations is not machine-checked; README convention + review own it | Platform |

## 4. Accepted risks

Recorded with owners, per the legacy's missing risk-acceptance register (its worklist item M10).

| Risk | Rationale | Owner |
|---|---|---|
| **No certificate pinning in v1** | Challenge C11, retained from Plan v1. The legacy has none either | Platform |
| **Single AI provider at Phase 7** | Port exists; second provider is configuration | Platform |
| **In-process control plane before Phase 20** | Gateway contract in place; separate deployment is a hard production gate | Platform |
| **No penetration test until Phase 20** | No system exists to test | Platform |
| **Read-only offline cache with no mutation queue** | An offline financial mutation queue is a correctness hazard | Product |

## 5. What this model does not establish

| | |
|---|---|
| That Karar is secure | No system exists |
| That the controls work | None are implemented |
| Any regulatory position | No approval, licence, or certification is claimed |
| Residency risk | Open question — see `../architecture/data-residency.md` |

**An independent security assessment by a party that did not build the system is a Phase 20 gate**, and nothing produced in-house substitutes for it.
