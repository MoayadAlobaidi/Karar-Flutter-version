# Phase Compliance Gate

**Status:** DRAFT · **Owner:** Compliance Owner · **Approver:** Platform Owner (pending) · **Version:** 0.2 · **Date:** 2026-08-15 · **Review:** Phase 2 gate

**v0.2 (2026-08-15):** Phase 2 gate checklist appended — checklist only; the gate record itself is written by the lead at phase close.

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

## Phase 2 specifics — gate checklist

**Status: PENDING. This is the checklist, not the record.** The gate outcome (PASS or findings) is recorded by the lead at phase close, below this block, following the Phase 1 pattern. Prepared 2026-08-15 alongside the Phase 2 compliance updates (matrix v0.2, registers v0.2).

The Phase 2 gate report must verify, beyond the standard eight sections:

1. **EV-201–EV-219 first instances.** The Phase 2 PR CI run URL(s) recorded against the new evidence rows and their statuses moved PENDING → COLLECTED; the phase report's verification section (`docs/phases/phase-02.md`) referenced as the lead-local-run record of 2026-08-15. Any row that cannot cite a green run stays PENDING, with a reason and owner.
2. **Control deltas with pointers.** KAR-CTL-051–065 added (13 IMPLEMENTED [P2], 2 DESIGNED); KAR-CTL-033 and 040 moved to IMPLEMENTED [P2]; KAR-CTL-007, 008, 015 moved to IMPLEMENTED on the EV-007 verification. Each move must cite its pointer; confirm no control anywhere claims OPERATING or EVIDENCED and nothing is represented as deployed.
3. **Design-only boundaries hold.** KAR-CTL-064/065 remain DESIGNED; no cloud KMS, no production keys, no operating canary is claimed anywhere (SoA 8.24 deliberately not advanced).
4. **Policy approval decision.** The 14 DRAFT policies name this gate as their approval target ([policy-index](policy-index.md)); the gate records approval by the Platform Owner or the slip with a new target. Silence fails the gate.
5. **Evidence-store decision.** The interim-store exit was due "no later than the Phase 2 gate" ([evidence register](evidence-register.md), KAR-RSK-011): record the chosen store or the explicit re-acceptance of the interim.
6. **Risk review record (EV-008 pattern).** Register v0.2 deltas signed: KAR-RSK-014/015 added, 010 re-scored 12 → 9, 003 note revised, no closures; every other row confirmed reviewed.
7. **Exceptions re-affirmed.** EXC-001, 002, 003 re-affirmed (register v0.2); verify no exit trigger fired — the team is still one person.
8. **Mapping deltas match the matrix.** SoA v0.2 (seven rows to IMPLEMENTED, tally 47/28/10/8/0) and trust-services mapping v0.2 quote matrix v0.2 exactly; any disagreement resolves toward the matrix.
9. **Claims reconciliation.** The threat model's "Phase 2 platform threats" evidence refs (EV-201–EV-213) resolve one-for-one against the evidence register; assurance-claim entries touched by Phase 2 re-reviewed; architecture test 26 green on the closing run.
10. **Architecture-test activation.** Tests 5, 6, 23 ACTIVE and 25 deepened; 19 registry-active numbered tests plus the supplementary check passing (20 passing); self-test 22 seeded-violation cases (EV-217).
11. **Fresh-clone verification.** Executed at phase close and recorded (EV-218, KAR-CTL-046).
12. **KAR-CTL-025 threshold decision.** The Phase 1 gate deferred the SCA blocking threshold to this gate: decide, or re-defer with the reason and the tightening criterion re-affirmed.
13. **Database-reality checks.** Spot-verify in the CI logs: from-zero creation ran twice, a 42501 denial and a P0001 trigger denial actually occurred, and the destructive-reset guard refused outside its double condition.
