# Control Matrix

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.2 · **Date:** 2026-08-15 · **Review:** every phase gate

**v0.2 (2026-08-15, Phase 2):** platform-foundation controls KAR-CTL-051–065 added; KAR-CTL-033 and 040 moved to IMPLEMENTED [P2] with pointers; Phase-1 evidence pointers refreshed to the evidence register's COLLECTED/VERIFIED state.

The single source of truth for Karar's control set and each control's status. Other documents (SOC 2 mapping, Statement of Applicability, policies) reference these IDs and **must not fork the statuses recorded here**.

---

## Status model

| Status | Meaning |
|---|---|
| `DESIGNED` | The control is defined in a canonical document; its enforcing mechanism does not yet run |
| `IMPLEMENTED` | The mechanism exists (tooling, CI check, in-repo artefact) but has not yet produced reviewed evidence over time |
| `OPERATING` | The mechanism runs repeatedly as intended |
| `EVIDENCED` | Operation is demonstrated by collected, reviewed evidence in the evidence register |
| `NOT_APPLICABLE` | Does not apply, with a stated reason |
| `DEFERRED` | Applies at a named later phase; not pretended before then |
| `EXCEPTION` | Deviates from its own statement; recorded in the exceptions register with compensating controls |

**No control below is claimed OPERATING or EVIDENCED.** Phase 1 produced designs and tooling; Phase 2 produced platform code with tests executed locally against live PostgreSQL. Neither is an operating history, and nothing is deployed anywhere.

**[C1] contingency note:** controls marked `IMPLEMENTED [C1]` rest on the Phase-1 CI workflows authored in parallel with this register (`.github/workflows/ci.yml`, `security.yml`, `.github/dependabot.yml` — present on this branch). If the named check is absent when Phase 1 merges, the status reverts to `DESIGNED`. Resolved 2026-08-15: the checks exist in the merged CI and the first run URLs are COLLECTED in the [evidence register](evidence-register.md) (EV-001–EV-006); the marker is retained for traceability.

**[P2] contingency note:** controls marked `IMPLEMENTED [P2]` rest on the Phase-2 platform code and its test suite — run locally by the lead against live PostgreSQL on 2026-08-15 and expected to run on the Phase 2 PR CI. IMPLEMENTED here means the mechanism exists in-repo with passing tests; it does not mean the mechanism operates in any environment, because none exists. Evidence for all [P2] controls is `PENDING` until the Phase 2 PR CI run URL is recorded against EV-201–EV-219.

Owners are roles, defined in [`control-owners.md`](control-owners.md). Canonical design detail lives in `docs/security/*`, `docs/architecture/*`, and the ADRs — rows link rather than restate.

## Controls

### Governance

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-001 | A defined set of security policies (14, [policy-index](policy-index.md)) exists, is approved by the Platform Owner, and is reviewed at phase gates | DESIGNED | Security Owner | CC1.1, CC5.3 | 5.1 | none yet | 1 | All 14 currently DRAFT, approval pending |
| KAR-CTL-002 | Security responsibilities are assigned to named roles with documented separation-of-duties triggers at headcount thresholds | DESIGNED | Platform Owner | CC1.3, CC1.4 | 5.2, 5.3 | none yet | 1 | Current single-person reality stated in control-owners.md |
| KAR-CTL-003 | Risks are assessed on the 5x5 methodology, recorded in the risk register, and reviewed at every phase gate | DESIGNED | Security Owner | CC3.1, CC3.2, CC3.4, CC9.1 | Clause 6.1 (27001) | EV-008 (PENDING) | 1 | Methodology and register exist; first review record pending |
| KAR-CTL-004 | Each phase ends with a recorded security/compliance gate review per [phase-compliance-gate.md](phase-compliance-gate.md) | DESIGNED | Compliance Owner | CC4.1, CC4.2 | 5.35, 5.36 | none yet | 1 | First gate record is the Phase 1 close |
| KAR-CTL-005 | Deviations from any policy or control are recorded in the exceptions register with compensating controls and an expiry or exit trigger | DESIGNED | Compliance Owner | CC1.5, CC5.3 | 5.36 | none yet | 1 | Three exceptions currently open |
| KAR-CTL-006 | Every public technical or legal claim maps to an Assurance Claim Registry entry with evidence pointer and owner | DESIGNED | Compliance Owner | CC2.3 | 5.31, 5.36 | none yet | 1 | Registry exists (`docs/security/assurance-claims.md`); mechanical link check is architecture test 26, Phase 2+ |

### Access control

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-007 | Repository and CI access is restricted to authorized accounts with MFA enforced | IMPLEMENTED | Security Owner | CC6.1, CC6.2, CC6.3 | 5.15, 5.16, 8.4, 8.5 | EV-007 (VERIFIED 2026-08-15) | 1 | Moved DESIGNED → IMPLEMENTED on the EV-007 verification, per this row's own trigger |
| KAR-CTL-008 | The default branch is protected: PRs required, required status checks, force-push and deletion denied | IMPLEMENTED | Engineering Owner | CC6.1, CC8.1 | 8.4, 8.32 | EV-007 (VERIFIED 2026-08-15) | 1 | Settings export exists; required states and verification commands: `docs/operations/repository-security-settings.md` |
| KAR-CTL-009 | CI credentials follow least privilege: default token read-only, scopes elevated per job, no long-lived cloud credentials in CI | DESIGNED | Engineering Owner | CC6.1, CC6.3 | 8.2, 5.17 | none yet | 1 | Verified against workflow files at the Phase 1 gate |
| KAR-CTL-010 | Application authentication hardening: lockout without counter reset, trusted-proxy IP resolution, normalised-path rate policy, short-lived tokens with rotation and server-side revocation | DEFERRED | Security Owner | CC6.1, CC6.2, CC6.6 | 8.5, 5.16, 5.17 | none yet | 3 | Design: threat model T4; no application exists |
| KAR-CTL-011 | Tenant isolation: RLS enabled and FORCEd on every table or explicitly allow-listed; adversarial cross-tenant tests assert on non-empty data | DEFERRED | Engineering Owner | CC6.1, CC6.3 | 8.3 | none yet | 3 | ADR-0022; architecture test 22 |
| KAR-CTL-012 | Sealed payload access requires a compiler-enforced `SealAccessGrant`; no support/admin/analytics/AI grant type exists | DEFERRED | Security Owner | CC6.1, C1.1, C1.2 | 8.3, 8.24 | none yet | 13 | ADR-0017; architecture tests 13/14 |
| KAR-CTL-013 | Environment access is mediated by the control plane: short-lived, single-environment, purpose-scoped tokens; production gateway adds reason capture and reauthentication | DEFERRED | Platform Owner | CC6.1, CC6.2, CC6.3 | 8.2, 5.15 | none yet | 8, 20 | ADR-0021; separate deployment is a Phase 20 gate |
| KAR-CTL-014 | Access rights are reviewed at every phase gate (quarterly once environments operate) and on any role change | DESIGNED | Security Owner | CC6.2, CC6.3 | 5.18 | none yet | 1 | Trivial set today (one maintainer); the review is still recorded |

### Change management

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-015 | All changes reach the default branch through pull requests; no direct pushes | IMPLEMENTED | Engineering Owner | CC8.1 | 8.32 | EV-001 (COLLECTED), EV-007 (VERIFIED 2026-08-15) | 1 | Enforcement verified by the EV-007 settings export (PR-only, force-push and deletion denied) |
| KAR-CTL-016 | CI checks are merge-blocking: a failing required check prevents merge, not merely a red run | IMPLEMENTED | Engineering Owner | CC8.1, CC7.1 | 8.32, 8.29 | EV-007 (branch protection verified 2026-08-15); EV-001 (COLLECTED 2026-08-15) | 1 | Branch protection on `main` requires the 8 CI checks; admins bound. The legacy's gates blocked runs, not merges (INFRA-07) — this control exists because of that |
| KAR-CTL-017 | Every change is reviewed by someone other than its author before merge | EXCEPTION | Engineering Owner | CC8.1, CC4.2 | 8.32, 5.3 | none yet | 1 | EXC-001: single-approver reality; compensating controls recorded there |
| KAR-CTL-018 | Sensitive change classes (migrations, financial rules, AI changes, key operations, capability availability, jurisdiction policy) pass staging before production | DEFERRED | Operations Owner | CC8.1, A1.1 | 8.31 | none yet | 19 | List: `docs/architecture/environments.md` §4 |
| KAR-CTL-019 | Architectural decisions are recorded as ADRs; accepted ADRs are superseded, never edited | IMPLEMENTED | Platform Owner | CC2.2, CC8.1 | 8.27 | in-repo: `docs/adr/` (26 ADRs) | 0 | Practised through Phases 0–0.5; not yet independently evidenced |

### Secure development

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-020 | Architecture tests run in CI as merge-blocking structural controls (money-path, RLS shape, sealed rules, guard call sites, resource-limit declarations) | IMPLEMENTED [C1] | Engineering Owner | CC8.1, CC7.1, PI1.1 | 8.25, 8.27, 8.29 | EV-002 (COLLECTED); EV-217 (PENDING) | 1 | Harness landed Phase 1; the suite accretes toward the 26 in `docs/testing/architecture-tests.md`. 2026-08-15 (Phase 2): tests 5, 6, 23 activated and 25 deepened to the full six-field rule — 19 registry-active numbered tests plus the supplementary admin-no-db-driver check pass (20 passing); self-test asserts 22 seeded-violation cases |
| KAR-CTL-021 | Security requirements derive from the threat model, and every control ships a test that fails when the control is removed | DESIGNED | Security Owner | CC3.2, CC8.1, PI1.1 | 8.26, 8.25 | none yet | 1 | Canonical: `docs/security/threat-model.md`; test rule in CONTRIBUTING |
| KAR-CTL-022 | Greenfield rule: no legacy application code is ported into V2 | IMPLEMENTED | Platform Owner | CC8.1 | 5.32, 8.25 | AC-012 (assurance registry, verified at docs level 2026-08-15) | 0.5 | Re-verified at each phase gate while legacy references remain |
| KAR-CTL-023 | Documentation integrity checks (links, docs conventions) run in CI | IMPLEMENTED [C1] | Engineering Owner | CC2.2 | 5.37 | EV-006 (COLLECTED) | 1 | Supports drift risk KAR-RSK-010 |
| KAR-CTL-024 | New capabilities begin with a complete `MODULE.md` (17-point checklist, incl. legal documents and data lifecycle) before code | DESIGNED | Platform Owner | CC3.2, CC8.1 | 5.8, 8.26 | none yet | 1 | Template exists; first exercised when the first module lands |

### Supply chain

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-025 | Dependency vulnerability scanning (SCA) runs on every PR and blocks merge on findings above threshold | DESIGNED | Security Owner | CC7.1, CC8.1 | 8.8, 5.21 | EV-004 (COLLECTED) | 1 | Scan runs per-PR from Phase 1 but is **report-only**; the blocking threshold is pending (tightening criterion in `docs/operations/repository-security-settings.md`; Phase 1 gate deferred the decision to the Phase 2 gate). Status honest to the control statement, which requires blocking |
| KAR-CTL-026 | Secret scanning runs on every PR (and against history), blocking merge on findings | IMPLEMENTED [C1] | Security Owner | CC6.1, CC7.1 | 5.17, 8.12 | EV-005 (COLLECTED) | 1 | Local pre-commit coverage is partial — EXC-003 |
| KAR-CTL-027 | An SBOM is generated per CI build and retained as a build artifact | IMPLEMENTED [C1] | Engineering Owner | CC7.1 | 5.21 | EV-003 (COLLECTED) | 1 | Format/tool per Phase-1 CI implementation |
| KAR-CTL-028 | Dependencies and toolchain are pinned (committed lockfiles, declared tool versions, version-pinned base images) and updated only through reviewed PRs | IMPLEMENTED [C1] | Engineering Owner | CC7.1, CC8.1 | 5.21, 8.32 | EV-001 (COLLECTED) | 1 | Digest-pinning of container images is the target state; verify at Phase 1 gate |
| KAR-CTL-029 | Static analysis security testing runs in CI (lint/type checks plus CodeQL from Phase 1; scope grows with application code) | IMPLEMENTED [C1] | Security Owner | CC7.1 | 8.28, 8.29 | none yet | 1 | CodeQL job in `security.yml` runs from Phase 1 against tooling/scripts; meaningful application coverage begins with Phase-2 code |

### Infrastructure (future-gated)

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-030 | Environment ladder with full isolation: per-environment databases, keys, secrets, capped AI spend; boot-time environment identity assertion | DEFERRED | Operations Owner | CC6.1, A1.1 | 8.31 | none yet | 17–19 | Design: `docs/architecture/environments.md`; Compose profiles from Phase 1 keep the discipline pre-cloud |
| KAR-CTL-031 | Infrastructure is defined as code (Terraform compositions per deployment/environment) and changed only via reviewed PRs | DESIGNED | Operations Owner | CC8.1 | 8.9, 8.32 | none yet | 1 | Skeleton in `infra/terraform` from Phase 1; nothing provisioned |
| KAR-CTL-032 | Transport protections: TLS on every connection, database transport authenticated (`verify-full`), edge rate limiting | DEFERRED | Operations Owner | CC6.6, CC6.7 | 8.20, 8.21 | none yet | 17+ | `docs/security/secrets.md` §10; legacy ENC-1 lesson |

### Data protection

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-033 | Every column, event field, log statement, and projection column carries one of the six data classes, with handling per the classification matrix | IMPLEMENTED [P2] | Security Owner | CC6.1, C1.1 | 5.12, 5.13 | EV-204, EV-208 (PENDING) | 2 | Canonical: `docs/security/data-classification.md`. 2026-08-15: enforcement landed at Phase 2 — classification vocabulary in code, event payload rules, logger redaction, audit metadata guard, and six-field lifecycle rows for every Phase 2 table (`packages/platform/db/DATA_LIFECYCLE.md`); KAR-CTL-061 is the enforcement mechanism, and coverage extends to each new surface as it lands |
| KAR-CTL-034 | Encryption at rest by class: field-level AES-256-GCM for `HIGHLY_SENSITIVE_FINANCIAL`, per-record DEKs for `SEALED`, KMS-held KEKs — with coverage measured, not assumed | DEFERRED | Security Owner | C1.1, CC6.7 | 8.24 | none yet | 2 (design), 13, 20 | ADR-0017; coverage tool required by `docs/security/secrets.md` §8. 2026-08-15: the Phase-2 design portion exists as code contracts (KAR-CTL-064); encryption itself remains deferred |
| KAR-CTL-035 | Key custody, rotation, and the sealed-integrity canary follow ADR-0017; an approved `KeyCustodyStrategy` precedes any production `SEALED` data | DEFERRED | Security Owner | CC6.7, A1.2 | 8.24 | none yet | 13, 20 | Hard Phase 20 gate; legacy ENC-2 is the origin. 2026-08-15: custody, rotation, and canary contracts pinned in code at Phase 2 (KAR-CTL-064, 065 — DESIGNED); the gates stand unchanged |
| KAR-CTL-036 | Secrets live in per-environment stores, never in the repository, logs, or error messages; `.env.example` carries placeholders only | DESIGNED | Security Owner | CC6.1 | 5.17 | none yet | 1 | Detective layer is KAR-CTL-026; canonical: `docs/security/secrets.md` |
| KAR-CTL-037 | Every persistent dataset declares subject relationship, purpose, classification, retention, export treatment, and erasure strategy, CI-enforced | DEFERRED | Privacy Owner | P4.1, P4.2, C1.2 | 8.10 | none yet | 5 | ADR-0026; architecture test 25 |
| KAR-CTL-038 | No real customer or personal data exists in any environment; all test and fixture data is synthetic | IMPLEMENTED | Privacy Owner | C1.1, P1.1 | 8.33 | none yet | 1 | True today by construction (no system, no customers); becomes an enforced rule at Phases 2 (seed data) and 19 (staging) |

### Logging and monitoring (future-gated)

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-039 | Append-only audit trail; every staff read of a customer record is audited, including reads returning nothing | DEFERRED | Security Owner | CC7.2, CC7.3 | 8.15 | none yet | 2, 8 | Threat model T5; legacy AZ5. 2026-08-15: the append-only store and immutability mechanism landed at Phase 2 (KAR-CTL-056); this row stays DEFERRED because its staff-read half activates with admin surfaces at Phase 8 |
| KAR-CTL-040 | Logs redact `CONFIDENTIAL` and above; `SECRET` and `SEALED` never appear in logs, events, projections, analytics, or AI context | IMPLEMENTED [P2] | Engineering Owner | CC7.2, C1.1 | 8.15, 8.11 | EV-208 (PENDING) | 2 | Architecture test 13 (deepens at Phase 13). 2026-08-15: the redaction mechanism landed at Phase 2 for logs, events, and audit metadata; projections, analytics, and AI context do not yet exist and inherit the mechanism when they do |
| KAR-CTL-041 | Monitoring and alerting with severity-differentiated routing, on-call rotation, and escalation | DEFERRED | Operations Owner | CC7.2, CC7.3, A1.1 | 8.16 | none yet | 20 | A single alert recipient is not on-call (`environments.md` §10) |

### Incident response

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-042 | Incidents are handled per the incident-response policy: severity model (sealed exposure is SEV-1 at n=1), roles, communication, and post-incident review feeding the improvement log | DESIGNED | Security Owner | CC7.3, CC7.4, CC7.5 | 5.24, 5.25, 5.26, 5.27 | none yet | 1 | Policy DRAFT; no operations to respond for yet |
| KAR-CTL-043 | A private vulnerability-reporting channel is published and acknowledged | IMPLEMENTED | Security Owner | CC2.3, CC7.3 | 6.8 | in-repo: `SECURITY.md` | 0.5 | No SLA pre-on-call, stated honestly in SECURITY.md |

### Availability, backup, continuity (future-gated)

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-044 | Backups run per policy with restore verification that includes application recovery, not only data restore | DEFERRED | Operations Owner | A1.2, A1.3 | 8.13 | none yet | 17, 20 | Legacy: RPO evidenced, RTO never measured |
| KAR-CTL-045 | Business continuity and DR: runbook executed and RTO measured before production launch | DEFERRED | Operations Owner | A1.2, A1.3, CC9.1 | 5.29, 5.30, 8.14 | none yet | 20 | Phase 20 gate list |
| KAR-CTL-046 | Canonical source and documentation are fully recoverable from any complete clone; no canonical artefact exists only in SCM-hosted state | DESIGNED | Operations Owner | A1.2 | 8.13 | EV-218 (PENDING) | 1 | Treatment for KAR-RSK-011; evidence-register export rule supports it; first fresh-clone verification is a Phase 2 close item |

### Vendor management

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-047 | Vendors and subprocessors are recorded in the register with data shared, DPA status, and review dates; new vendors get a security review before adoption | DESIGNED | Compliance Owner | CC9.2 | 5.19, 5.20, 5.21, 5.22, 5.23 | none yet | 1 | Register exists; first periodic review pending |
| KAR-CTL-048 | A DPA is executed with every processor before any personal data reaches it | DEFERRED | Privacy Owner | CC9.2, P6.1 | 5.20, 5.34 | none yet | 20 | Roadmap non-engineering gate; no personal data is processed today |

### Privacy

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-049 | Consent gates fail closed; republication of a legal document triggers re-consent evaluation with materiality decided, never defaulted | DEFERRED | Privacy Owner | P2.1, P3.1 | 5.34 | none yet | 3 | ADR-0024; legacy P1/P12 origin |
| KAR-CTL-050 | Data export and erasure are derived from lifecycle declarations, and export coverage reconciles with declared treatments | DEFERRED | Privacy Owner | P4.3, P5.1, P5.2 | 5.34, 8.10 | none yet | 5, 16 | ADR-0026; legacy P5/P7 origin |

### Platform foundation (Phase 2)

Controls delivered by the Phase 2 platform code. Canonical design detail: `docs/security/threat-model.md` ("Phase 2 platform threats"), ADR-0012, ADR-0013, ADR-0017, ADR-0025, ADR-0026. Test paths cited are the mechanisms' own suites; their outputs are the EV-201–EV-219 evidence family.

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-051 | Runtime configuration is typed and fail-fast: boot refuses on missing or invalid configuration, and errors name the field and env var only — values are never printed | IMPLEMENTED [P2] | Engineering Owner | CC7.1, CC8.1 | 8.9 | EV-209, EV-214 (PENDING) | 2 | `packages/platform/src/config`; `ConfigurationError` carries the never-print-values rule in its contract |
| KAR-CTL-052 | Configuration secrets are opaque `SecretValue` holders, redacted on inspect and serialization; secrets are addressed by `karar-ref:*` references, never provider resource names; no direct `process.env` access outside the config loader and adapters | IMPLEMENTED [P2] | Security Owner | CC6.1 | 5.17, 8.12 | EV-209 (PENDING) | 2 | Enforced by the `no-direct-env-access` test and profile-secrecy tests (`packages/platform/src/config`) |
| KAR-CTL-053 | Database least privilege: `karar_migrator` (owns schemas, DDL only, carries no SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE) is separated from `karar_app` (per-table minimal DML, no DDL); denials proven live as 42501 | IMPLEMENTED [P2] | Security Owner | CC6.1, CC6.3 | 5.15, 8.2, 8.3 | EV-202 (PENDING) | 2 | Grant convention: no `GRANT ALL`, no PUBLIC; probed live by `packages/platform/src/db/contract.test.ts` |
| KAR-CTL-054 | Migrations are forward-only and checksum-verified with drift detection: a sha256 mismatch or a missing/renamed applied file hard-fails `migrate` and `verify`; from-zero database creation is a tested path | IMPLEMENTED [P2] | Engineering Owner | CC8.1 | 8.32, 8.9 | EV-201, EV-215 (PENDING) | 2 | `packages/platform/src/db/migrations.ts`; every migration file carries a `-- rollback:` block, executed by a human decision, never automatically |
| KAR-CTL-055 | Destructive database operations are double-guarded: `reset-local` refuses unless `KARAR_ENV=local` **and** the target host is loopback; there is deliberately no force flag | IMPLEMENTED [P2] | Engineering Owner | CC8.1, A1.2 | 8.32 | EV-214, EV-215 (PENDING) | 2 | `packages/platform/src/db/bootstrap.ts` — a guard that can be flagged away in the destroying command is not a guard |
| KAR-CTL-056 | The audit trail is append-only twice over: `karar_app` holds INSERT+SELECT only on `audit.audit_events`, and an immutability trigger raises on UPDATE/DELETE/TRUNCATE even for the owner; audit write failure surfaces as a typed error result, never swallowed | IMPLEMENTED [P2] | Security Owner | CC7.2, CC7.3 | 8.15, 5.33 | EV-207 (PENDING) | 2 | `modules/audit`; both denial paths (42501 and P0001) proven live. The Phase 2 mechanism behind KAR-CTL-039 |
| KAR-CTL-057 | Audit metadata is classification-guarded: secret-patterned keys are rejected outright, `SEALED` values are rejected outright, and `HIGHLY_SENSITIVE_FINANCIAL` values are stored redacted unless identifier/status-shaped | IMPLEMENTED [P2] | Security Owner | C1.1, CC7.2 | 8.15, 8.11 | EV-207, EV-208 (PENDING) | 2 | `modules/audit/application/audit-metadata-guard.ts` |
| KAR-CTL-058 | Event publication is transactional: outbox rows commit atomically with state; relays claim via `FOR UPDATE SKIP LOCKED`, mark publication exactly once, back off on failure, dead-letter at max attempts, and recover stale claims; lag and failure metrics are exposed | IMPLEMENTED [P2] | Engineering Owner | PI1.1, CC7.2 | 8.16, 8.25 | EV-203, EV-206, EV-212 (PENDING) | 2 | ADR-0012; concurrency proven with 2 relays × 200 events (`packages/platform/src/outbox`). Delivery is at-least-once by design; KAR-CTL-060 makes that safe |
| KAR-CTL-059 | Background jobs execute under single-claim leases with caller-supplied idempotency keys, priorities, bounded retries, dead-lettering, a payload-size cap, and graceful shutdown | IMPLEMENTED [P2] | Engineering Owner | PI1.1, A1.1 | 8.6, 8.16 | EV-205, EV-212 (PENDING) | 2 | ADR-0013; concurrency proven with 2 workers × 100 jobs (`packages/platform/src/jobs`) |
| KAR-CTL-060 | Event consumers are idempotent by receipts: a (consumer, event id) receipt makes redelivery of an already-processed event a no-op | IMPLEMENTED [P2] | Engineering Owner | PI1.1, PI1.3 | 8.25 | EV-203 (PENDING) | 2 | `packages/platform/src/outbox/receipts.ts`; receipts outlive the outbox rows they protect (`packages/platform/db/DATA_LIFECYCLE.md`) |
| KAR-CTL-061 | The six-class data classification is enforced at every platform surface that exists: event payload rules (`SEALED` identifier/status-only with **no exemption mechanism**; `HIGHLY_SENSITIVE_FINANCIAL` identifier-only without a declared owner/reason/reviewer exemption), logger redaction, and audit metadata all consume one classification vocabulary | IMPLEMENTED [P2] | Security Owner | C1.1, CC6.1 | 5.12, 5.13, 8.11, 8.12 | EV-204, EV-208 (PENDING) | 2 | `packages/platform/src/classification`; the enforcement mechanism KAR-CTL-033 names |
| KAR-CTL-062 | Readiness is truthful: `/readyz` on both api and worker (the worker on its own port) checks live PostgreSQL connectivity and migration status, and reports not-ready when a dependency fails | IMPLEMENTED [P2] | Operations Owner | CC7.1, A1.1 | 8.16 | EV-216 (PENDING) | 2 | `apps/api/src/health`, `apps/worker/src/health-server.ts`; a readiness probe that cannot fail is decoration, not a control |
| KAR-CTL-063 | Observability is classification-aware: OTel-compatible logs, traces, and metrics pass through the classification redaction vocabulary; `SEALED` is never loggable on any path | IMPLEMENTED [P2] | Engineering Owner | CC7.2, C1.1 | 8.15, 8.16, 8.11 | EV-208 (PENDING) | 2 | `packages/platform/src/observability`. Signals exist; alerting and on-call remain DEFERRED (KAR-CTL-041) — this control emits, it does not watch |
| KAR-CTL-064 | Key custody is contract-first: every encrypt/wrap result carries `KeyRef`/`KeyVersionRef` provenance; the four custody models of ADR-0017 are a closed enum; `KeyManagementProvider`/`EncryptionProvider` ports define the provider seam; identifiers derive from content, never from key material or ciphertext (rotation-vs-identifier rule) | DESIGNED | Security Owner | C1.1, CC6.7, A1.2 | 8.24 | EV-211 (PENDING) | 2 | `packages/platform/src/keys`; contract tests pin the design, but no enforcing provider runs — the only provider is test-only in-memory. **No cloud KMS, no production keys.** Implementation lands with KAR-CTL-035 at Phases 13/20 |
| KAR-CTL-065 | The sealed-integrity canary is contract-pinned: canary plaintext must carry the `KARAR-CANARY-` synthetic-marker prefix, structurally excluding customer-derived content from the one record that is decrypted on schedule | DESIGNED | Security Owner | CC7.2, A1.2 | 8.24, 8.16 | EV-211 (PENDING) | 2 | `packages/platform/src/keys/canary.ts`; the operating canary is a Phase 13 build and Phase 20 gate (KAR-CTL-035). Until it runs in production, key-loss detection is test-time only |

## Tally (v0.2)

| Status | Count |
|---|---|
| DESIGNED | 18 |
| IMPLEMENTED | 29 (6 of them [C1]-contingent, 15 of them [P2]-contingent — the v0.1 tally said 7 [C1]; the marked rows are 6: KAR-CTL-020, 023, 026, 027, 028, 029, corrected here) |
| DEFERRED | 17 |
| EXCEPTION | 1 |
| OPERATING / EVIDENCED / NOT_APPLICABLE | 0 |

65 controls. Changes to this matrix go through PR review like any other change; the status column is updated only with a pointer to what changed (a CI run, a settings export, a review record).
