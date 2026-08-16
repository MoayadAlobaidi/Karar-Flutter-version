# Compliance

The control framework and evidence structure for Karar V2's SOC 2 Type II and ISO/IEC 27001 **readiness** work. Readiness, precisely: this directory establishes controls, ownership, risk handling, and evidence discipline so that a future examination has something real to examine.

## What is claimed

**Nothing.** Karar holds no SOC 2 report, no ISO/IEC 27001 certificate, no regulatory approval, and claims none (Assurance Claim Registry AC-009). No control in this directory is asserted as OPERATING or EVIDENCED. As of Phase 3 (2026-08-16) there is still no cloud, no customer, and no production environment; what exists is a documented control set, registers with honest contents, Phase-1 CI tooling with first-run evidence collected, and Phase-2 platform and Phase-3 identity/tenancy/access-control code whose controls are IMPLEMENTED in the matrix's narrow sense — mechanisms in-repo with tests run locally and in CI, deployed nowhere. Any document or conversation representing more than that is wrong and should be corrected against this page.

## How the pieces relate

```
risk-methodology ──> risk-register ──> treatment-plan ──────────┐
                                        │                       │
control-owners ──> control-matrix <── exceptions-register       │ phases
                        │   ▲                                   │ (roadmap)
   policies (14) ───────┘   └── evidence-register <── evidence-handling
                        │                                       │
        soc2/ mapping + evidence plan                           │
        iso27001/ SoA + clause mapping                          │
                        └──────────── phase-compliance-gate <───┘
```

The **[control matrix](control-matrix.md)** is the core: 78 controls with honest statuses (50 from Phase 1, 15 platform-foundation controls added at Phase 2, 13 identity/tenancy/access controls added at Phase 3). Everything else either feeds it (risks, exceptions, policies) or views it (SOC 2 mapping, ISO SoA). Statuses live in the matrix only — the framework views must never fork them.

## Reading order

1. [control-matrix.md](control-matrix.md) — the control set and the status model
2. [control-owners.md](control-owners.md) — roles, the single-person reality, separation triggers
3. [risk-methodology.md](risk-methodology.md) → [risk-register.md](risk-register.md) → [treatment-plan.md](treatment-plan.md)
4. [exceptions-register.md](exceptions-register.md) — the three open deviations
5. [evidence-register.md](evidence-register.md) + [evidence-handling.md](evidence-handling.md) — what proof will look like, and what may never enter git
6. [phase-compliance-gate.md](phase-compliance-gate.md) — how each phase closes
7. [policy-index.md](policy-index.md) → [`docs/policies/`](../policies/) — the 14 DRAFT policies
8. [asset-inventory.md](asset-inventory.md), [vendor-and-subprocessor-register.md](vendor-and-subprocessor-register.md), [shared-responsibility-model.md](shared-responsibility-model.md)
9. [soc2/](soc2/README.md) and [iso27001/](iso27001/README.md) — the framework views

## Relationship to the rest of the repository

Canonical security design lives in `docs/security/` (threat model, data classification, secrets, assurance claims) and the ADRs — compliance documents **reference** them and add control identity, status, ownership, and evidence on top. Phase gates come from `docs/roadmap.md` and `docs/architecture/environments.md`; the lessons behind many controls come from `docs/legacy/security-findings.md`. When a compliance document and a canonical design document disagree, the design document wins and the compliance document gets fixed.

## Baselines

- **ISO/IEC 27001:2022 + Amd 1:2024**, with **ISO/IEC 27002:2022** as the control reference (93 Annex A controls).
- **SOC 2** per the current AICPA Trust Services Criteria; all five categories are mapped as candidates (Security foundational; Availability, Processing Integrity, Confidentiality, Privacy), with the final examination scope to be confirmed with the chosen auditor.
