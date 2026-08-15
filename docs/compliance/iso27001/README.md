# ISO/IEC 27001 Readiness

**Status:** DRAFT · **Owner:** Compliance Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** every phase gate

---

## What ISO/IEC 27001 certification is, in two paragraphs

ISO/IEC 27001 certifies a **management system**, not a product: an ISMS — the standing apparatus of scope, leadership, risk assessment, treatment, operation, measurement, and improvement through which an organization manages information security continuously. Certification is granted by an accredited certification body after a two-stage audit (documentation review, then implementation audit) and is maintained through surveillance audits and a three-year recertification cycle. Like SOC 2 Type II, it turns on demonstrated operation over time, not on the quality of the paperwork alone.

Karar's baseline is **ISO/IEC 27001:2022 including Amendment 1:2024**, with **ISO/IEC 27002:2022** as the implementation reference for the 93 Annex A controls. The readiness work here builds the ISMS skeleton — scope statement, clause-by-clause mapping, Statement of Applicability, improvement loop — on top of the same [control matrix](../control-matrix.md) and [risk register](../risk-register.md) that serve SOC 2, so there is one control reality with two framework views.

## Explicit non-claim

Karar holds **no ISO/IEC 27001 certificate**, has engaged no certification body, and represents nothing in this directory as an ISMS in certified operation (Assurance Claim Registry AC-009). "Readiness" means the management-system structure is being built honestly enough that a Stage 1 audit would find a real, if young, system — not that any audit is scheduled.

## The readiness approach

1. **One control set** — Annex A applicability ([statement-of-applicability.md](statement-of-applicability.md)) points into the control matrix rather than duplicating it.
2. **The phase gates are the management review** — Clause 9/10 obligations ride the existing per-phase gate ([phase-compliance-gate.md](../phase-compliance-gate.md)) instead of inventing a parallel meeting cadence a solo team would not keep.
3. **Risk first** — Clause 6 is served by the [risk methodology](../risk-methodology.md) and [register](../risk-register.md) that already drive engineering priorities.
4. **Improvement is a log, not a ceremony** — [continual-improvement.md](continual-improvement.md) records nonconformities and corrective actions from day one (currently zero, honestly).

## Contents

| File | Purpose |
|---|---|
| [isms-scope.md](isms-scope.md) | Scope statement, interfaces, exclusions with reasons |
| [requirements-mapping.md](requirements-mapping.md) | Clauses 4–10 mapped to Karar artefacts |
| [statement-of-applicability.md](statement-of-applicability.md) | All 93 Annex A controls with status and justification |
| [continual-improvement.md](continual-improvement.md) | Nonconformity and corrective-action log + improvement loop |
