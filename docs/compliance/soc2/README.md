# SOC 2 Readiness

**Status:** DRAFT · **Owner:** Compliance Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** every phase gate

---

## What SOC 2 Type II is, in two paragraphs

A SOC 2 examination is an independent audit, performed by a licensed CPA firm, of an organization's controls against the AICPA Trust Services Criteria. A **Type I** report says the controls were suitably designed at a point in time. A **Type II** report says something stronger: that the controls **operated effectively over a period** — typically 6–12 months — which the auditor verifies by testing evidence generated throughout that window, not by reading policies.

Two consequences drive everything in this directory. First, **evidence over time**: a control with no trail of runs, reviews, and records cannot pass a Type II test no matter how well designed, which is why the [evidence register](../evidence-register.md) and [type-ii-evidence-plan.md](type-ii-evidence-plan.md) exist before any audit is contemplated. Second, **an independent auditor**: nothing Karar produces about itself — including this documentation — constitutes a SOC 2 result. The observation window cannot meaningfully open until controls operate in a production-relevant form, which for most of this control set means Phase 17 at the earliest and realistically Phases 19–20.

## The readiness approach

1. **Build the control set once**, in the [control matrix](../control-matrix.md), and view it here through TSC identifiers ([trust-services-mapping.md](trust-services-mapping.md)) rather than maintaining a second list.
2. **Generate evidence as a side effect of working** — CI runs, gate reports, register reviews — so the eventual observation window is a continuation of habit, not a new regime.
3. **Keep statuses honest** so the delta between "readiness" and "examinable" is always legible: today that delta is the entire operating history.
4. **Scope late**: candidate boundaries are drafted ([scope-candidate.md](scope-candidate.md)), but carve-outs, criteria categories, and the window are auditor conversations, had when engaging one.

## Explicit non-claim

Karar has **no SOC 2 report of any type**, is not under examination, has not engaged an auditor, and nothing in this repository may be quoted as implying otherwise (Assurance Claim Registry AC-009). "SOC 2 readiness" in this directory means exactly and only: the control framework and evidence structure are being built so a future Type II examination is possible.

## Contents

| File | Purpose |
|---|---|
| [scope-candidate.md](scope-candidate.md) | Candidate system description and boundaries |
| [trust-services-mapping.md](trust-services-mapping.md) | KAR-CTL controls mapped to TSC criteria |
| [type-ii-evidence-plan.md](type-ii-evidence-plan.md) | Per-family evidence types, frequency, collection, owner |
