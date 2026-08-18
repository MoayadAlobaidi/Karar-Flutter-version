# Data Classification and Handling Policy

**Status:** DRAFT · **Owner:** Security Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 4 gate (Phase 2 target missed; re-affirmed but not content-reviewed at Phase 3.5)

## Scope

All information Karar creates or holds, in every environment and artefact — including documentation, fixtures, and the compliance corpus itself. **The classification scheme is canonical in [`docs/security/data-classification.md`](../security/data-classification.md)**; this policy binds the organization to it and states the rules of use. It does not restate the handling matrix.

## Purpose

Six classes — `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `HIGHLY_SENSITIVE_FINANCIAL`, `SECRET`, `SEALED` — with handling decided by class, not by situational judgment. `SEALED` is categorically different: inaccessible to Karar itself, with no operator permission, support escalation, or exemption mechanism that produces a read.

## Requirements

- **R1.** Every column, event field, log statement, and projection column carries exactly one class; handling follows the canonical matrix (at rest, in transit, in events, projections, logs, AI context, support/admin visibility, analytics, search).
- **R2.** Classification is declared where the canonical document says it is declared — schema comments and classification map, event catalogue, `CapabilityDescriptor`, `MODULE.md`. *Declaration tooling and enforcement tests: not yet operating — Phase 2 (architecture tests 13/15).*
- **R3.** What exists today is classified now: repository contents are `INTERNAL` (docs, tooling) or `PUBLIC` where explicitly published; credentials for accounts are `SECRET`; nothing in the repository may hold `CONFIDENTIAL` or above about any real person — there are no customers, and fixtures are synthetic (KAR-CTL-038, `SECURITY.md`).
- **R4.** Raising a classification is always permitted; lowering one requires an ADR, because data already written under the lower expectation cannot be recalled from logs and projections. **Nothing is ever reclassified out of `SEALED`.**
- **R5.** `HIGHLY_SENSITIVE_FINANCIAL` payload in an event requires a declared `payloadExemption` naming owner, reason, and reviewer; CI fails without it. **`SEALED` has no exemption mechanism at all** — no field to set, no process to invoke. *(Enforcement Phase 2; the asymmetry is policy from day one.)*
- **R6.** The two named costs of `SEALED` are accepted and must not be engineered around: no search over sealed content, and no analytics over it — not even aggregates.
- **R7.** Classification governs evidence and documentation too: evidence artefacts follow [evidence-handling.md](../compliance/evidence-handling.md), and no compliance record may contain a value whose class forbids that location.
- **R8.** *Not yet operating — Phase 13:* sealed access follows [`docs/security/sealed-access.md`](../security/sealed-access.md) — grant-gated, audited on every attempt, refused included.
- **R9.** Classification questions during design resolve to the stricter class until decided by the Security Owner; a dataset that cannot be classified cannot be built (MODULE.md intake blocks).

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md) — except where the canonical scheme states no exemption exists (`SEALED`), in which case there is nothing to except.

## Evidence

Later: classification-enforcement test output (EV-002 family), coverage of declarations per module. Today: the synthetic-data rule's truth by construction. Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-033, 034 (deferred), 038, 040 (deferred), 012 (deferred).
