# Trust Services Mapping

**Status:** ACTIVE mapping view · **Owner:** Compliance Owner · **Version:** 0.2 · **Date:** 2026-08-15 · **Review:** every phase gate (mapping deltas per gate report §5)

Maps Karar controls to AICPA Trust Services Criteria identifiers. **Statuses are the [control matrix](../control-matrix.md)'s and are quoted here as of matrix v0.2 — the matrix is the source of truth; if this file and the matrix disagree, the matrix wins.** Criterion themes below are stated in Karar's own words, not the TSC text.

Status shorthand: D = DESIGNED · I = IMPLEMENTED · I[C1] = implemented contingent on Phase-1 CI merge · I[P2] = implemented as Phase-2 code with tests run locally/CI, deployed nowhere · DEF = DEFERRED(phase) · EXC = exception.

---

## Common criteria (Security)

| TSC | Theme (Karar wording) | Karar controls (status) | Notes |
|---|---|---|---|
| CC1.1 | Commitment to integrity via approved policies | KAR-CTL-001 (D) | 14 policies DRAFT, approval Phase 2 gate |
| CC1.2 | Governance oversight of controls | KAR-CTL-002 (D), 004 (D) | No board exists; oversight = Platform Owner + recorded gates. Stated, not disguised |
| CC1.3 | Structures, reporting lines, authorities | KAR-CTL-002 (D) | Role model + SoD triggers in control-owners.md |
| CC1.4 | Competence and its maintenance | KAR-CTL-002 (D) | Hiring-related practices activate at first hire (see SoA 6.1–6.6 PLANNED) |
| CC1.5 | Accountability for control responsibilities | KAR-CTL-002 (D), 005 (D) | Every control names an owner role; deviations to exceptions register |
| CC2.1 | Quality information for control operation | KAR-CTL-019 (I), 023 (I[C1]) | ADR corpus + docs checks |
| CC2.2 | Internal communication of objectives/responsibilities | KAR-CTL-019 (I), 023 (I[C1]), 001 (D) | Everything canonical in-repo is the communication mechanism at this size |
| CC2.3 | External communication, incl. reporting channels | KAR-CTL-006 (D), 043 (I) | Assurance-claim linkage; SECURITY.md intake |
| CC3.1–CC3.3 | Objectives set, risks identified and analysed, fraud considered | KAR-CTL-003 (D), 021 (D), 024 (D) | 5x5 methodology; threat-model-driven requirements; insider/fraud vectors are threat model T5 |
| CC3.4 | Changes that alter risk are assessed | KAR-CTL-003 (D), 004 (D) | Re-scoring at every phase gate is the mechanism |
| CC4.1–CC4.2 | Controls are evaluated and deficiencies reported | KAR-CTL-004 (D), 014 (D) | Phase gates + access reviews; independent evaluation limited by EXC-001 until team grows |
| CC5.1–CC5.3 | Control activities selected, deployed via policy | KAR-CTL-001 (D), 005 (D) + the matrix itself | The matrix is the deployment record |
| CC6.1 | Logical access restricted by design | KAR-CTL-007 (I), 008 (I), 009 (D), 010 (DEF 3), 011 (DEF 3), 012 (DEF 13), 013 (DEF 8/20), 033 (I[P2]), 036 (D), 052 (I[P2]), 053 (I[P2]) | Layered model: `docs/security/access-control.md`. Phase 2 adds the first enforced non-SCM access boundary: DML-only `karar_app` vs schema-owning `karar_migrator`, denials proven live |
| CC6.2 | Credentials issued/deprovisioned with authorization | KAR-CTL-007 (I), 014 (D), 013 (DEF) | Trivial population today; the review still happens |
| CC6.3 | Access modification/removal, least privilege | KAR-CTL-009 (D), 014 (D), 013 (DEF), 053 (I[P2]) | Database roles carry no SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE |
| CC6.4 | Physical access to facilities | — | No facilities exist; inherited from cloud provider at Phase 17+ (shared-responsibility model). Endpoint physical care: acceptable-use policy |
| CC6.5 | Disposal of assets/data | KAR-CTL-037 (DEF 5), asset-inventory rule 3, AUP §R7 | |
| CC6.6 | Defenses at the boundary against external actors | KAR-CTL-010 (DEF 3), 032 (DEF 17+) | No boundary exists yet to defend |
| CC6.7 | Data protected in movement and on media | KAR-CTL-032 (DEF 17+), 034 (DEF), 036 (D), 064 (D) | Classification matrix defines in-transit rules; key-custody contracts are design-only, no key operations exist |
| CC6.8 | Unauthorized/malicious software prevented | KAR-CTL-028 (I[C1]), AUP §R5 | Pinning + reviewed updates are the current surface's realistic malware control |
| CC7.1 | Vulnerabilities and misconfigurations detected | KAR-CTL-025 (D — scan runs, report-only), 026 (I[C1]), 027 (I[C1]), 029 (I[C1]), 020 (I[C1]), 051 (I[P2]), 062 (I[P2]) | 025's blocking threshold is the open piece. Phase 2 adds misconfiguration detection at boot (fail-fast typed config) and truthful readiness |
| CC7.2 | Anomalies monitored and evaluated | KAR-CTL-041 (DEF 20), 039 (DEF 8 half), 040 (I[P2]), 056 (I[P2]), 057 (I[P2]), 058 (I[P2] — lag/DLQ metrics), 062 (I[P2]), 063 (I[P2]), 065 (D) | 2026-08-15: no longer empty — the audit trail, redacting telemetry, readiness, and queue metrics exist as tested code. Still not monitoring: nothing runs continuously and nothing alerts or pages (KAR-RSK-003); the "evaluated" half stays deferred to Phase 20 |
| CC7.3 | Security events evaluated and declared | KAR-CTL-042 (D), 043 (I) | |
| CC7.4 | Incidents responded to per program | KAR-CTL-042 (D) | Policy DRAFT; untested — no operations |
| CC7.5 | Recovery from incidents | KAR-CTL-042 (D), 045 (DEF 20) | |
| CC8.1 | Changes authorized, tested, approved, deployed controlled | KAR-CTL-015 (I), 016 (I[C1]), 017 (EXC), 018 (DEF 19), 019 (I), 020 (I[C1]), 031 (D), 054 (I[P2]), 055 (I[P2]) | EXC-001 is the material qualification on "approved". Phase 2 extends change control to the schema: checksum-verified forward-only migrations, drift detection, destructive-op double guard |
| CC9.1 | Disruption risk mitigations | KAR-CTL-003 (D), 045 (DEF 20), 046 (D) | |
| CC9.2 | Vendor and business-partner risk managed | KAR-CTL-047 (D), 048 (DEF 20) | Register live; DPAs gated on personal data existing |

## Availability

| TSC | Theme | Karar controls (status) |
|---|---|---|
| A1.1 | Capacity planned and monitored | KAR-CTL-030 (DEF 17–19), 041 (DEF 20) |
| A1.2 | Environmental/backup/recovery infrastructure in place | KAR-CTL-044 (DEF 17/20), 045 (DEF 20), 046 (D), 035 (DEF 13/20) |
| A1.3 | Recovery procedures tested | KAR-CTL-044 (DEF), 045 (DEF) — RTO must be **measured**, per Phase 20 gate |

## Processing Integrity

| TSC | Theme | Karar controls (status) |
|---|---|---|
| PI1.1 | Data/processing definitions support correct outputs | KAR-CTL-020 (I[C1]) — no-float money-path test; 021 (D); 058, 059, 060 (I[P2]) — transactional outbox with exactly-once-marked publication, leased idempotent jobs, receipt-based consumer idempotency |
| PI1.2–PI1.3 | Inputs and processing complete, accurate, timely | Deferred to the financial engine (Phase 6: `VerifiedFinancialFacts`, exhaustive calculator tests) and ingestion resource limits (threat model T7, architecture test 24). Phase 2's contribution: at-least-once delivery made safe by idempotency (KAR-CTL-060, I[P2]) — completeness plumbing, not content accuracy |
| PI1.4–PI1.5 | Outputs and stored items complete/accurate | Deferred: Phase 6 engine + Phase 5 provenance/dedup; staging passage for financial rules (KAR-CTL-018, DEF 19) |

Processing-integrity evidence for **financial content** begins to exist at Phases 5–6. As of Phase 2 (2026-08-15) the platform carries structural PI mechanisms — no event silently lost or double-applied, no job double-executed under concurrency (proven at 2 relays × 200 events, 2 workers × 100 jobs) — which is delivery integrity, not correctness of any business calculation, and is claimed as nothing more.

## Confidentiality

| TSC | Theme | Karar controls (status) |
|---|---|---|
| C1.1 | Confidential information identified and protected | KAR-CTL-033 (I[P2]), 034 (DEF), 012 (DEF 13), 038 (I), 040 (I[P2]), 057 (I[P2]), 061 (I[P2]), 063 (I[P2]) |
| C1.2 | Confidential information disposed of when no longer needed | KAR-CTL-037 (DEF 5), 050 (DEF 5/16) — every Phase 2 table already declares retention and erasure (`packages/platform/db/DATA_LIFECYCLE.md`); the executing retention job is later-phase |

The `SEALED` class exceeds typical confidentiality commitments — confidential against the operator itself (ADR-0017); its controls are the ones most rigorously gated (Phase 20).

## Privacy

| TSC | Theme | Karar controls (status) |
|---|---|---|
| P1 | Notice of privacy practices | KAR-CTL-006 (D), 049 (DEF 3) — notice-vs-system reconciliation is the anti-P1 control |
| P2 | Choice and consent | KAR-CTL-049 (DEF 3) — fail-closed gates, re-consent evaluation (ADR-0024) |
| P3 | Collection limited to purpose | KAR-CTL-024 (D), 038 (I) |
| P4 | Use, retention, disposal per commitments | KAR-CTL-037 (DEF 5), 050 (DEF 5/16) — ADR-0026 declarations |
| P5 | Subject access (export) | KAR-CTL-050 (DEF 16) — export reconciles with declared treatments |
| P6 | Third-party disclosure controlled | KAR-CTL-047 (D), 048 (DEF 20) |
| P7 | Data quality | Deferred — provenance/dedup at Phase 5 |
| P8 | Complaint handling and enforcement | KAR-CTL-043 (I), 042 (D) — consumer-facing privacy channel arrives with Phase 16 privacy flows |

**The Privacy category currently has almost no operating substance because no personal data is processed at all (KAR-CTL-038)** — which is itself the strongest privacy fact available at Phase 1.

## Gaps this mapping makes visible

1. **CC7.2 has signals but no monitoring** (updated 2026-08-15): Phase 2 delivered the emitting half — audit trail, redacting telemetry, queue and readiness metrics — but nothing runs continuously, and alerting/on-call remain Phase 20 (KAR-RSK-003). The gap narrowed; it did not close.
2. **CC8.1's approval leg rests on EXC-001** — the mechanical gates are real; independent human approval is not, yet.
3. **A1/PI evidence cannot exist before Phases 5–6/17–20** — the observation window starts after those, not before. Phase 2's delivery-integrity tests are design proof, not window evidence.
4. **CC6.7/8.24-adjacent cryptography is design-only** (2026-08-15): custody and canary contracts exist (KAR-CTL-064, 065, DESIGNED); nothing encrypts production data because none exists.
