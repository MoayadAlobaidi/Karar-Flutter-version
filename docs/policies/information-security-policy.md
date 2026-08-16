# Information Security Policy

**Status:** DRAFT · **Owner:** Security Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 3.5 gate (Phase 2 gate missed)

## Scope

Everyone working on Karar (currently the roles in [`control-owners.md`](../compliance/control-owners.md), held by one person), every asset in the [asset inventory](../compliance/asset-inventory.md), and every phase of the [roadmap](../roadmap.md). This is the apex policy; the other thirteen ([policy index](../compliance/policy-index.md)) implement it by domain.

## Purpose

State what security means for Karar and bind the organization to it: a platform whose confidentiality and financial-correctness promises hold because they are designed in, tested, and evidenced — not asserted. The bar is set by the product's own premise: sealed data must be unreadable even by Karar (ADR-0017), and a sealed value in the wrong place is a SEV-1 at a single record (`SECURITY.md`).

## Requirements

- **R1.** Security objectives derive from the [threat model](../security/threat-model.md) and the risk appetite in [risk-methodology.md](../compliance/risk-methodology.md): low appetite for customer-data confidentiality and financial correctness, moderate for pre-production delivery speed.
- **R2.** Every control lives in the [control matrix](../compliance/control-matrix.md) with an honest status and an owning role. No claim of a control OPERATING or EVIDENCED may be made without the matrix and evidence register supporting it.
- **R3.** Data is handled by its classification, per the six-class scheme in [`docs/security/data-classification.md`](../security/data-classification.md) and the data-classification-and-handling-policy.
- **R4.** Risks are assessed, treated, and reviewed per the risk methodology; anything neither controlled, tested, nor N/A appears in the [risk register](../compliance/risk-register.md) with a named owner before production.
- **R5.** Deviations from any policy go through the [exceptions register](../compliance/exceptions-register.md) — compensating controls, approval, exit trigger. Undocumented deviation is a nonconformity ([continual-improvement](../compliance/iso27001/continual-improvement.md)).
- **R6.** Every phase closes with the security/compliance gate defined in [phase-compliance-gate.md](../compliance/phase-compliance-gate.md); hard roadmap gates (staging before production, key custody before production sealed data, independent assessment before launch) cannot be waived by anyone.
- **R7.** Karar makes no public claim of certification, compliance, approval, or clearance — anywhere, in any document or product surface (Assurance Claim Registry AC-009). Aspirations are stated as readiness work.
- **R8.** Security incidents and suspected vulnerabilities are handled per the incident-response and vulnerability-management policies; the private reporting channel in `SECURITY.md` stays published and monitored.
- **R9.** This policy set is reviewed at the Phase 2 gate, then at every gate touching its scope and at least annually. Material changes re-trigger Platform Owner approval.
- **R10.** *Not yet operating — team growth trigger:* separation of duties per the triggers in control-owners.md; until then the single-person reality and its compensations (EXC-001) stand in.

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md) only. Currently open and relevant: EXC-001 (single-person approval).

## Evidence

EV-008 (risk reviews); phase-gate reports; policy approval records once granted. Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-001, 002, 003, 004, 005, 006.
