# Control Matrix

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** every phase gate

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

**No control below is claimed OPERATING or EVIDENCED.** Phase 1 produces designs and tooling, not an operating history.

**[C1] contingency note:** controls marked `IMPLEMENTED [C1]` rest on the Phase-1 CI workflows authored in parallel with this register (`.github/workflows/ci.yml`, `security.yml`, `.github/dependabot.yml` — present on this branch). If the named check is absent when Phase 1 merges, the status reverts to `DESIGNED`. Evidence for all [C1] controls is `PENDING` until the first CI run URL is recorded in the [evidence register](evidence-register.md).

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
| KAR-CTL-007 | Repository and CI access is restricted to authorized accounts with MFA enforced | DESIGNED | Security Owner | CC6.1, CC6.2, CC6.3 | 5.15, 5.16, 8.4, 8.5 | EV-007 (PENDING) | 1 | Owner must verify GitHub settings and export them; becomes IMPLEMENTED on EV-007 |
| KAR-CTL-008 | The default branch is protected: PRs required, required status checks, force-push and deletion denied | DESIGNED | Engineering Owner | CC6.1, CC8.1 | 8.4, 8.32 | EV-007 (PENDING) | 1 | Not claimed IMPLEMENTED until the settings export exists; required states and verification commands: `docs/operations/repository-security-settings.md` |
| KAR-CTL-009 | CI credentials follow least privilege: default token read-only, scopes elevated per job, no long-lived cloud credentials in CI | DESIGNED | Engineering Owner | CC6.1, CC6.3 | 8.2, 5.17 | none yet | 1 | Verified against workflow files at the Phase 1 gate |
| KAR-CTL-010 | Application authentication hardening: lockout without counter reset, trusted-proxy IP resolution, normalised-path rate policy, short-lived tokens with rotation and server-side revocation | DEFERRED | Security Owner | CC6.1, CC6.2, CC6.6 | 8.5, 5.16, 5.17 | none yet | 3 | Design: threat model T4; no application exists |
| KAR-CTL-011 | Tenant isolation: RLS enabled and FORCEd on every table or explicitly allow-listed; adversarial cross-tenant tests assert on non-empty data | DEFERRED | Engineering Owner | CC6.1, CC6.3 | 8.3 | none yet | 3 | ADR-0022; architecture test 22 |
| KAR-CTL-012 | Sealed payload access requires a compiler-enforced `SealAccessGrant`; no support/admin/analytics/AI grant type exists | DEFERRED | Security Owner | CC6.1, C1.1, C1.2 | 8.3, 8.24 | none yet | 13 | ADR-0017; architecture tests 13/14 |
| KAR-CTL-013 | Environment access is mediated by the control plane: short-lived, single-environment, purpose-scoped tokens; production gateway adds reason capture and reauthentication | DEFERRED | Platform Owner | CC6.1, CC6.2, CC6.3 | 8.2, 5.15 | none yet | 8, 20 | ADR-0021; separate deployment is a Phase 20 gate |
| KAR-CTL-014 | Access rights are reviewed at every phase gate (quarterly once environments operate) and on any role change | DESIGNED | Security Owner | CC6.2, CC6.3 | 5.18 | none yet | 1 | Trivial set today (one maintainer); the review is still recorded |

### Change management

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-015 | All changes reach the default branch through pull requests; no direct pushes | DESIGNED | Engineering Owner | CC8.1 | 8.32 | EV-001, EV-007 (PENDING) | 1 | Discipline in effect by convention; enforcement claim waits on EV-007 |
| KAR-CTL-016 | CI checks are merge-blocking: a failing required check prevents merge, not merely a red run | IMPLEMENTED | Engineering Owner | CC8.1, CC7.1 | 8.32, 8.29 | EV-007 (branch protection verified 2026-08-15); EV-001 (first run PENDING) | 1 | Branch protection on `main` requires the 8 CI checks; admins bound. The legacy's gates blocked runs, not merges (INFRA-07) — this control exists because of that |
| KAR-CTL-017 | Every change is reviewed by someone other than its author before merge | EXCEPTION | Engineering Owner | CC8.1, CC4.2 | 8.32, 5.3 | none yet | 1 | EXC-001: single-approver reality; compensating controls recorded there |
| KAR-CTL-018 | Sensitive change classes (migrations, financial rules, AI changes, key operations, capability availability, jurisdiction policy) pass staging before production | DEFERRED | Operations Owner | CC8.1, A1.1 | 8.31 | none yet | 19 | List: `docs/architecture/environments.md` §4 |
| KAR-CTL-019 | Architectural decisions are recorded as ADRs; accepted ADRs are superseded, never edited | IMPLEMENTED | Platform Owner | CC2.2, CC8.1 | 8.27 | in-repo: `docs/adr/` (26 ADRs) | 0 | Practised through Phases 0–0.5; not yet independently evidenced |

### Secure development

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-020 | Architecture tests run in CI as merge-blocking structural controls (money-path, RLS shape, sealed rules, guard call sites, resource-limit declarations) | IMPLEMENTED [C1] | Engineering Owner | CC8.1, CC7.1, PI1.1 | 8.25, 8.27, 8.29 | EV-002 (PENDING) | 1 | Harness lands Phase 1; the suite accretes toward the 26 in `docs/testing/architecture-tests.md` |
| KAR-CTL-021 | Security requirements derive from the threat model, and every control ships a test that fails when the control is removed | DESIGNED | Security Owner | CC3.2, CC8.1, PI1.1 | 8.26, 8.25 | none yet | 1 | Canonical: `docs/security/threat-model.md`; test rule in CONTRIBUTING |
| KAR-CTL-022 | Greenfield rule: no legacy application code is ported into V2 | IMPLEMENTED | Platform Owner | CC8.1 | 5.32, 8.25 | AC-012 (assurance registry, verified at docs level 2026-08-15) | 0.5 | Re-verified at each phase gate while legacy references remain |
| KAR-CTL-023 | Documentation integrity checks (links, docs conventions) run in CI | IMPLEMENTED [C1] | Engineering Owner | CC2.2 | 5.37 | EV-006 (PENDING) | 1 | Supports drift risk KAR-RSK-010 |
| KAR-CTL-024 | New capabilities begin with a complete `MODULE.md` (17-point checklist, incl. legal documents and data lifecycle) before code | DESIGNED | Platform Owner | CC3.2, CC8.1 | 5.8, 8.26 | none yet | 1 | Template exists; first exercised when the first module lands |

### Supply chain

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-025 | Dependency vulnerability scanning (SCA) runs on every PR and blocks merge on findings above threshold | DESIGNED | Security Owner | CC7.1, CC8.1 | 8.8, 5.21 | EV-004 (PENDING) | 1 | Scan runs per-PR from Phase 1 but is **report-only**; the blocking threshold is pending (tightening criterion in `docs/operations/repository-security-settings.md`). Status honest to the control statement, which requires blocking |
| KAR-CTL-026 | Secret scanning runs on every PR (and against history), blocking merge on findings | IMPLEMENTED [C1] | Security Owner | CC6.1, CC7.1 | 5.17, 8.12 | EV-005 (PENDING) | 1 | Local pre-commit coverage is partial — EXC-003 |
| KAR-CTL-027 | An SBOM is generated per CI build and retained as a build artifact | IMPLEMENTED [C1] | Engineering Owner | CC7.1 | 5.21 | EV-003 (PENDING) | 1 | Format/tool per Phase-1 CI implementation |
| KAR-CTL-028 | Dependencies and toolchain are pinned (committed lockfiles, declared tool versions, version-pinned base images) and updated only through reviewed PRs | IMPLEMENTED [C1] | Engineering Owner | CC7.1, CC8.1 | 5.21, 8.32 | EV-001 (PENDING) | 1 | Digest-pinning of container images is the target state; verify at Phase 1 gate |
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
| KAR-CTL-033 | Every column, event field, log statement, and projection column carries one of the six data classes, with handling per the classification matrix | DESIGNED | Security Owner | CC6.1, C1.1 | 5.12, 5.13 | none yet | 2 | Canonical: `docs/security/data-classification.md`; enforcement tests from Phase 2 |
| KAR-CTL-034 | Encryption at rest by class: field-level AES-256-GCM for `HIGHLY_SENSITIVE_FINANCIAL`, per-record DEKs for `SEALED`, KMS-held KEKs — with coverage measured, not assumed | DEFERRED | Security Owner | C1.1, CC6.7 | 8.24 | none yet | 2 (design), 13, 20 | ADR-0017; coverage tool required by `docs/security/secrets.md` §8 |
| KAR-CTL-035 | Key custody, rotation, and the sealed-integrity canary follow ADR-0017; an approved `KeyCustodyStrategy` precedes any production `SEALED` data | DEFERRED | Security Owner | CC6.7, A1.2 | 8.24 | none yet | 13, 20 | Hard Phase 20 gate; legacy ENC-2 is the origin |
| KAR-CTL-036 | Secrets live in per-environment stores, never in the repository, logs, or error messages; `.env.example` carries placeholders only | DESIGNED | Security Owner | CC6.1 | 5.17 | none yet | 1 | Detective layer is KAR-CTL-026; canonical: `docs/security/secrets.md` |
| KAR-CTL-037 | Every persistent dataset declares subject relationship, purpose, classification, retention, export treatment, and erasure strategy, CI-enforced | DEFERRED | Privacy Owner | P4.1, P4.2, C1.2 | 8.10 | none yet | 5 | ADR-0026; architecture test 25 |
| KAR-CTL-038 | No real customer or personal data exists in any environment; all test and fixture data is synthetic | IMPLEMENTED | Privacy Owner | C1.1, P1.1 | 8.33 | none yet | 1 | True today by construction (no system, no customers); becomes an enforced rule at Phases 2 (seed data) and 19 (staging) |

### Logging and monitoring (future-gated)

| ID | Control | Status | Owner | SOC 2 TSC | ISO 27002:2022 | Evidence | Phase | Notes |
|---|---|---|---|---|---|---|---|---|
| KAR-CTL-039 | Append-only audit trail; every staff read of a customer record is audited, including reads returning nothing | DEFERRED | Security Owner | CC7.2, CC7.3 | 8.15 | none yet | 2, 8 | Threat model T5; legacy AZ5 |
| KAR-CTL-040 | Logs redact `CONFIDENTIAL` and above; `SECRET` and `SEALED` never appear in logs, events, projections, analytics, or AI context | DEFERRED | Engineering Owner | CC7.2, C1.1 | 8.15, 8.11 | none yet | 2 | Architecture test 13 |
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
| KAR-CTL-046 | Canonical source and documentation are fully recoverable from any complete clone; no canonical artefact exists only in SCM-hosted state | DESIGNED | Operations Owner | A1.2 | 8.13 | none yet | 1 | Treatment for KAR-RSK-011; evidence-register export rule supports it |

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

## Tally (v0.1)

| Status | Count |
|---|---|
| DESIGNED | 20 |
| IMPLEMENTED | 11 (7 of them [C1]-contingent) |
| DEFERRED | 18 |
| EXCEPTION | 1 |
| OPERATING / EVIDENCED / NOT_APPLICABLE | 0 |

50 controls. Changes to this matrix go through PR review like any other change; the status column is updated only with a pointer to what changed (a CI run, a settings export, a review record).
