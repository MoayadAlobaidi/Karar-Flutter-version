# Phase Compliance Gate

**Status:** DRAFT · **Owner:** Compliance Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** Phase 2 gate

Every phase ends with a Security/Compliance review whose output is a recorded gate report. This defines what that report must contain. It is the compliance half of the phase-closure template the docs process defines at [`docs/phases/PHASE_TEMPLATE.md`](../phases/PHASE_TEMPLATE.md) — the template carries the overall phase report; the sections below are what its security/compliance section must satisfy. The gate report itself is evidence (EV-008 pattern) and is referenced from the evidence register.

---

## The gate report — required sections

**1. Control status deltas.**
Which KAR-CTL controls changed status this phase (DESIGNED → IMPLEMENTED → OPERATING …), each with the pointer that justifies the move — a CI run, a settings export, a review record. A status change with no pointer does not pass. Statuses only ever move in the [control matrix](control-matrix.md); the report cites, never forks.

**2. Evidence generated and missing.**
EV rows collected or reviewed this phase; expected evidence that did not materialize (e.g. a [C1]-contingent control whose check never ran), each with a reason and a follow-up owner.

**3. Risk register update.**
New risks, re-scored risks, closed risks (EV-008 record). Explicit statement that the register was reviewed even when nothing changed.

**4. Exceptions.**
New exceptions opened, existing ones re-affirmed or closed, and any exception whose exit trigger fired but was not acted on — the last is a gate failure, not a note.

**5. Mapping deltas.**
Changes flowing into the SOC 2 [trust-services mapping](soc2/trust-services-mapping.md) and the ISO [Statement of Applicability](iso27001/statement-of-applicability.md) (e.g. a PLANNED Annex A control becoming real this phase). Nonconformities and corrective actions recorded in [continual-improvement](iso27001/continual-improvement.md).

**6. Claims reconciliation.**
Assurance Claim Registry entries touched by this phase's scope re-reviewed (`docs/security/assurance-claims.md` §3); any published promise the phase's output contradicts is named — this is the anti-P1 check.

**7. Residual risk statement.**
One paragraph, plain language: what the platform is still exposed to entering the next phase, and why that is acceptable (or what was accepted by whom if it is High/Critical).

**8. Next-phase entry criteria.**
The compliance preconditions for the next phase to begin — deferred controls that activate, evidence that must start flowing, legal/external gates that fall due (e.g. Phase 14's Amanat clearance, Phase 20's custody gates). Pulled from the [treatment plan](treatment-plan.md) and the [roadmap](../roadmap.md) gate lists, not invented per gate.

## Rules

- **No gate, no phase close.** A phase without a recorded gate report is not complete, whatever the code says.
- **Honesty over completeness:** "not done, because X, owned by Y" passes review; silence or an unsupported OPERATING claim fails it.
- The reviewer is the Compliance Owner; where a phase's work was authored under EXC-001 (single person), the independent-reviewer-agent findings for the phase are attached to the report.
- Hard roadmap gates (staging before production, custody before sealed data, independent assessment before launch) cannot be waived by a gate report — they are preconditions the report verifies, not items it may accept as risks.

## Phase 1 specifics

The first gate report (closing Phase 1) must additionally record: verification of EV-007 (branch protection, per `docs/operations/repository-security-settings.md`), the workflow-file review against KAR-CTL-009 and KAR-RSK-005, first-run references for EV-001–EV-006, disposition of the `Archive.zip` item (KAR-RSK-012), a decision on the SCA blocking threshold (KAR-CTL-025 — currently report-only), and confirmation that every [C1]-contingent control's check actually exists in the merged CI.

## Phase 1 gate record — PASSED, 2026-08-15

- EV-007 verified row-by-row via the GitHub API; observed values in `docs/operations/repository-security-settings.md`.
- EV-001–EV-006 COLLECTED with first-run URLs (all 12 checks green; one transient Actions-allowlist failure fixed and recorded).
- `Archive.zip` (KAR-RSK-012) disposition: untracked and git-ignored in the Phase 1 PR; history deliberately not rewritten; risk row updated.
- KAR-CTL-025 decision: dependency audit stays report-only for Phase 2; the blocking dependency gate remains `dependency-review` (KAR-CTL-027). Tightening criterion unchanged in the settings doc.
- All [C1]-contingent controls confirmed: every referenced check exists in the merged CI and ran green.
- Independent review: 0 BLOCKING / 2 HIGH / 6 MEDIUM — all HIGH and MEDIUM remediated pre-PR ([phase report](../phases/phase-01.md)).
- No control moved to OPERATING or EVIDENCED at this gate; statuses remain as the matrix records.
