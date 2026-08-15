# Logging and Monitoring Policy

**Status:** DRAFT · **Owner:** Operations Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 2 gate

## Scope

Logs, audit trails, metrics, and alerting across Karar systems. **Almost everything here is future-gated and marked so** — no runtime exists to log or monitor. The policy exists now because Phase 2 builds observability and audit foundations, and the rules must precede the code.

## Purpose

Records that establish what happened, protected from tampering, free of the data classes they must never carry — and, eventually, monitoring that notices trouble before a customer does.

## Requirements

- **R1.** What logging exists today: CI run logs (vendor-retained) and local development output. CI logs must never receive secrets (KAR-CTL-009, 036); that is the entire current logging surface, stated so the rest of this policy cannot be mistaken for it.
- **R2.** *Not yet operating — Phase 2:* application logs are structured, classification-aware, and redact `CONFIDENTIAL` and above; `SECRET` and `SEALED` never appear in logs, events, projections, analytics, or AI context (architecture test 13; data-classification matrix).
- **R3.** *Not yet operating — Phase 2:* the audit trail is append-only — revoked grants recorded, UPDATE/DELETE raising even for the owner — and covers security-relevant events: authentication outcomes, permission changes, consent events, key operations.
- **R4.** *Not yet operating — Phases 2/8:* every staff read of a customer record is audited, including reads returning nothing (legacy AZ5; threat model T5).
- **R5.** *Not yet operating — Phase 13:* every sealed-payload access attempt is audited, successful or refused, with its grant reference (ADR-0017).
- **R6.** *Not yet operating — Phase 17:* log retention per environment defined with the deployment profile; retention for logs that could contain personal data follows the retention-and-erasure-policy and ADR-0026 declarations — logs are a dataset with a lifecycle, not an exhaust.
- **R7.** *Not yet operating — Phase 20:* monitoring with SLOs, alert rules that distinguish severities, on-call rotation and escalation — all launch gates (environments.md §9–10). A single alert recipient does not satisfy this policy.
- **R8.** *Not yet operating — Phase 20:* the sealed-integrity canary runs on schedule in staging and production, alerting on decryption failure — the only lawful detector of sealed key loss (ADR-0017).
- **R9.** Monitoring data and log excerpts used as evidence follow [evidence-handling.md](../compliance/evidence-handling.md): counts and redacted samples, never raw logs in git.
- **R10.** Clock discipline for correlating records (SoA 8.17) arrives with distributed runtime, Phase 17.

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md). None currently — deferral is stated in-line, which is deliberate: a marked future requirement needs no exception.

## Evidence

Today: none possible beyond CI log references (EV-001). Later: redaction test output, audit-trail samples, alert-routing tests, canary results — per the [Type II evidence plan](../compliance/soc2/type-ii-evidence-plan.md). Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-039, 040, 041 (all deferred), 009, 036.
