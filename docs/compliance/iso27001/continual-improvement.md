# Continual Improvement

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** every phase gate

The Clause 10 mechanism: a log of nonconformities and corrective actions, plus the loop that feeds it. Seeded honestly with **zero entries** — the ISMS is days old and has not yet completed a cycle in which a nonconformity could have been found.

---

## What counts as a nonconformity

- A control practiced differently from its matrix statement without a recorded exception
- An exception whose exit trigger fired without action
- Evidence missing where the [evidence plan](../soc2/type-ii-evidence-plan.md) says it must exist
- A phase closed without its gate report, or a gate item silently skipped
- A published claim contradicting built reality (the P1 pattern — also an assurance-registry event)
- An incident post-review finding a control that failed as designed

Improvement opportunities (better control, cheaper evidence, clearer policy) are logged too, marked `OFI` rather than `NC` — they carry no corrective-action obligation, only an owner and a decision.

## Log schema

| Field | Meaning |
|---|---|
| `id` | `CI-###`, stable |
| `type` | `NC` (nonconformity) · `OFI` (improvement opportunity) |
| `source` | gate review · incident review · independent-reviewer-agent finding · external review · ad hoc |
| `description` | What was found, with the control/policy/register reference |
| `root cause` | For NC: why it happened — pattern-level, in the spirit of `docs/legacy/security-findings.md` §9 (root causes, not symptoms) |
| `correction` | The immediate fix |
| `corrective action` | The change that prevents recurrence (control edit, new test, process change) |
| `owner` | Role |
| `opened / due / closed` | Dates; due defaults to the next phase gate |
| `verification` | How closure was confirmed, by whom, when |
| `status` | `OPEN` · `IN_PROGRESS` · `CLOSED` · `ACCEPTED` (Platform Owner accepts without corrective action, with reason) |

## The improvement loop

1. **Find** — each phase gate reviews: gate report findings, incident post-reviews, reviewer-agent output, stale evidence, fired exception triggers.
2. **Log** — every finding lands here within the gate cycle that found it; an unlogged finding is itself an NC.
3. **Fix** — correction now, corrective action with an owner and a due gate; corrective actions that change controls flow into the [control matrix](../control-matrix.md) via PR.
4. **Verify** — closure requires named verification, recorded; the gate after the due date checks it.
5. **Learn** — recurring root causes (two NCs sharing one) escalate to the Platform Owner as a systemic item, per the legacy audit's own method.

## Log

| id | type | source | description | root cause | correction | corrective action | owner | opened | due | closed | verification | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| — | — | — | *No entries. First review that could generate one is the Phase 1 gate.* | — | — | — | — | — | — | — | — | — |
