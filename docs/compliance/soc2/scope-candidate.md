# SOC 2 Scope — Candidate

**Status:** DRAFT (candidate only — final scope is set with the chosen auditor) · **Owner:** Compliance Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** Phase 17, then each gate

Nothing here binds an examination; it exists so scope conversations start from a written position instead of a blank page.

---

## Candidate system

**The Karar platform**: the modular-monolith backend (`apps/api`, `apps/worker`), the Flutter client (`apps/mobile`), the admin surface and control plane (`apps/admin`, ADR-0021), the sealed vault (ADR-0017), supporting packages (`packages/*`), the CI/CD pipeline that produces and gates all of it, and the cloud infrastructure it will run on (Phase 17+, provider per `DeploymentProfile`).

**System description inputs** (the future auditor's Section 3 raw material): `docs/architecture/overview.md`, `environments.md`, `deployment-topology.md`, `docs/security/threat-model.md`, the [asset inventory](../asset-inventory.md), and the [shared-responsibility model](../shared-responsibility-model.md).

## Candidate criteria categories

All five mapped as candidates; Security is non-optional, the rest are justified by what the product is:

| Category | Candidate rationale |
|---|---|
| **Security** (CC series) | Foundational — always in scope |
| **Availability** | A finance product customers consult for obligations (Zakat dates, loan schedules); availability commitments will exist |
| **Processing Integrity** | The financial engine's correctness is the product promise — no-float money path, `VerifiedFinancialFacts`, deterministic rulesets |
| **Confidentiality** | `HIGHLY_SENSITIVE_FINANCIAL` and `SEALED` classes are confidentiality commitments stronger than typical — sealed data is confidential even against Karar itself |
| **Privacy** | Consent-gated processing, lifecycle declarations, export/erasure (ADR-0024/0026) — though Privacy scope in particular is an auditor conversation, since it may alternatively be evidenced under other frameworks |

The working assumption is Security + Availability + Confidentiality as the first examination's core, with Processing Integrity and Privacy confirmed or staged with the auditor. **To be confirmed — no category is committed.**

## Candidate boundaries and carve-outs (TBD with auditor)

| Item | Position |
|---|---|
| Cloud provider infrastructure | Subservice organization, carve-out method expected; inherited controls cited per the shared-responsibility model |
| Billing provider (Phase 10+) | Subservice organization; settlement is theirs (AC-011) |
| Partner-bank white-label tenants | Likely excluded from Karar's own report; contractual assurance instead — the controller/processor inversion makes them the customer of the report, not part of the system |
| Local developer environments | Out of scope as system components; in scope as endpoints under the acceptable-use policy |
| Legacy Qarar system | Out of scope entirely — no legacy code enters V2 (greenfield rule, AC-012) |

## Timing honesty

A Type II window needs controls operating in production-relevant form. Per the [roadmap](../../roadmap.md), production readiness is Phase 20 and phases 10–21 are an option, not a schedule — so **no examination date is projected**, and this file exists to make an eventual engagement cheaper, not to imply one is imminent.
