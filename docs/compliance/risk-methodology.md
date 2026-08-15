# Risk Methodology

**Status:** DRAFT · **Owner:** Security Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** Phase 2 gate

This is the method behind the [risk register](risk-register.md). It also serves ISO/IEC 27001:2022 Clause 6.1 (risk assessment and treatment planning) — see [iso27001/requirements-mapping.md](iso27001/requirements-mapping.md).

---

## Risk appetite

Stated once, used everywhere:

- **Low appetite** for risks to **customer-data confidentiality** and **financial correctness**. These are the product's premise; a sealed-data or money-path compromise is unacceptable at any scale (a sealed exposure is SEV-1 at n=1, per `SECURITY.md`).
- **Moderate appetite** for **delivery-speed risks while pre-production** — an unpolished process, a deferred control, or a single-person bottleneck is acceptable when recorded and phase-bounded, because no customer or datum is yet exposed.
- Appetite tightens automatically as phases advance: what is acceptable with zero customers is re-scored at Phase 17 (cloud), Phase 19 (staging), and Phase 20 (production readiness), where several risks have hard exit gates.

## Scoring — 5x5

**Likelihood** (that the risk materializes within the current assessment horizon — the next two phases):

| L | Label | Guide |
|---|---|---|
| 1 | Rare | Hard to construct a plausible path |
| 2 | Unlikely | Plausible but needs multiple failures |
| 3 | Possible | A single failure or oversight suffices |
| 4 | Likely | Expected without active countermeasures |
| 5 | Near-certain | The condition already holds or recurs |

**Impact** (on Karar's obligations, customers, or viability if it materializes):

| I | Label | Guide |
|---|---|---|
| 1 | Negligible | Absorbed without plan change |
| 2 | Minor | Rework inside a phase |
| 3 | Moderate | A phase slips or an external commitment is touched |
| 4 | Major | Launch-blocking, legal exposure, or loss of a foundational guarantee |
| 5 | Severe | Customer-data breach, financial-correctness failure, unrecoverable loss (e.g. sealed keys), or project end |

**Score = L × I**, banded:

| Band | Score | Handling |
|---|---|---|
| Low | 1–4 | Accept by default; note in register |
| Moderate | 5–9 | Treatment optional but owner named; review each gate |
| High | 10–15 | Treatment required with a target phase; Platform Owner visibility |
| Critical | 16–25 | Treatment required before the next phase gate closes, or an explicit Platform Owner acceptance recorded |

## Treatment options

`MITIGATE` (reduce L or I with controls) · `ACCEPT` (recorded, owner named, review date set — the register the legacy never wrote, its worklist M10) · `TRANSFER` (contract/insurance/vendor — rarely available pre-production) · `AVOID` (remove the activity).

An `ACCEPT` at High or Critical requires the Platform Owner's recorded acceptance and appears in the [exceptions register](exceptions-register.md) when it deviates from a stated control.

## Process

1. **Identify** — at phase gates, in threat-model updates, in incident post-reviews, and whenever a MODULE.md or ADR names a new risk.
2. **Score** — L, I, band, by the owning role; scored on the current state, with gates and compensating controls in place (residual, not inherent).
3. **Treat** — choose an option, record it in the [treatment plan](treatment-plan.md) with a target phase.
4. **Review** — every register row at every phase gate (KAR-CTL-003); scores re-checked when phase context changes them, with the review recorded as EV-008.

## Register hygiene

- IDs `KAR-RSK-###`, stable, never reused.
- A risk closed is marked `CLOSED` with the closing event referenced — the row stays.
- Anything neither controlled, tested, nor N/A must appear here with a named owner before production (`docs/legacy/security-findings.md` §9).
