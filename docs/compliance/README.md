# Compliance

The control framework and evidence structure for Karar V2's SOC 2 Type II and ISO/IEC 27001 **readiness** work. Readiness, precisely: this directory establishes controls, ownership, risk handling, and evidence discipline so that a future examination has something real to examine.

## What is claimed

**Nothing.** Karar holds no SOC 2 report, no ISO/IEC 27001 certificate, no regulatory approval, and claims none (Assurance Claim Registry AC-009). No control in this directory is asserted as OPERATING or EVIDENCED, and no evidence row anywhere is EVIDENCED. As of the Phase 5 gate (2026-08-22) there is still no cloud, no customer, and no production environment; what exists is a documented control set, registers with honest contents, Phase-1 CI tooling with first-run evidence collected, and Phase-2 platform, Phase-3 identity/tenancy/access-control, Phase-3.5 jurisdiction/capability/binding, Phase-4 client and build, and Phase-5 financial-platform code whose controls are IMPLEMENTED in the matrix's narrow sense — mechanisms in-repo with tests run locally and in CI, deployed nowhere. Any document or conversation representing more than that is wrong and should be corrected against this page.

**Compliance-gate status: gates have executed for Phases 1, 2, 3, 3.5, 4 and 5.** The most recent is the **Phase 5 gate, executed 2026-08-22, outcome `FAIL_WITH_BLOCKING_FINDINGS`** — the gate record is the authority and this line now quotes it. *(It read `PASS_WITH_DOCUMENTED_DEFERRED_ITEMS`, which is what the record said while it was frozen, before the independent reviews changed the outcome. This index was not re-read when it changed, so the corpus's front page reported a PASS for a gate that FAILED, in the favourable direction, in a paragraph that boasts about fixing this exact defect class. Found by an independent review at the closeout, not by a check: `compliance-current-state` derives which gates EXIST from headings and has never derived an OUTCOME. It does now.)* The Phase 4 gate executed 2026-08-18 and carries a post-merge record for PR #7; Every record is in [phase-compliance-gate.md](phase-compliance-gate.md). *(Until 2026-08-22 this paragraph denied that any Phase 4 or Phase 5 gate had run. The Phase 4 one had run four days earlier, and its record was in the very file the sentence linked to. It survived because the documentation gate exempted `docs/compliance/` wholesale; `compliance-current-state` in `scripts/checks/docs-check.mjs` now derives which gates exist from that file's own headings and fails on the contradiction.)* The Phase 5 record carries its deferred items with a reason, owner, target, residual risk and closure condition each, and it carries the evidence rows — EV-427 among them — that can cite nothing and say so.

Four Phase 3.5 facts belong here rather than buried in a register, because they are the ones most easily misread as progress toward a claim:

- **No capability is available anywhere.** One capability (`TRANSACTIONS`) is `IMPLEMENTED` because its code exists; every other is `NOT_IMPLEMENTED`. All are deployed in no environment, so the availability resolver denies all of them before reaching any later gate.
- **No policy pack and no jurisdiction is approved.** The one drafted pack, `qa/v1`, carries every legal question as an explicit `PENDING_LEGAL_REVIEW` and clears nothing. Approval is a legal act this repository cannot perform, and **no legal review has occurred**.
- **All 14 policies remain DRAFT.** Platform Owner review is required before the first non-local deployment. Nothing in this directory approves a policy on the Platform Owner's behalf, and no gate record does either.
- **Consent acceptance is unreachable, not merely gated.** `POST /consent/acceptances` answers 503 for every caller, including in `local`: a valid grant must pin jurisdiction, active pack version, operating entity, and legal-document version, and no runtime write path exists for the jurisdiction assignment or the pack activation. Refusing is correct behaviour and a real limitation, carried to Phase 4.

## How the pieces relate

```
risk-methodology ──> risk-register ──> treatment-plan ──────────┐
                                        │                       │
control-owners ──> control-matrix <── exceptions-register       │ phases
                        │   ▲                                   │ (roadmap)
   policies (14) ───────┘   └── evidence-register <── evidence-handling
                        │                                       │
        soc2/ mapping + evidence plan                           │
        iso27001/ SoA + clause mapping                          │
                        └──────────── phase-compliance-gate <───┘
```

The **[control matrix](control-matrix.md)** is the core: **116 controls** with honest statuses — 50 from Phase 1, 15 platform-foundation at Phase 2, 13 identity/tenancy/access at Phase 3, 15 jurisdiction/capability/binding at Phase 3.5, and 23 client/mobile-artifact/build at Phase 4. *(Until 2026-08-22 this sentence carried the Phase 3.5 figure of 93; the matrix had held 116 rows since Phase 4. The count is now re-derived from the matrix's own `KAR-CTL-` rows on every documentation run, so the two cannot drift again.)* Phase 5 added no control row: its work is governed by controls that already existed, and inventing a row to mark a phase would make the count a record of phases rather than of controls. Everything else either feeds it (risks, exceptions, policies) or views it (SOC 2 mapping, ISO SoA). Statuses live in the matrix only — the framework views must never fork them.

## Reading order

1. [control-matrix.md](control-matrix.md) — the control set and the status model
2. [control-owners.md](control-owners.md) — roles, the single-person reality, separation triggers
3. [risk-methodology.md](risk-methodology.md) → [risk-register.md](risk-register.md) → [treatment-plan.md](treatment-plan.md)
4. [exceptions-register.md](exceptions-register.md) — the three open deviations
5. [evidence-register.md](evidence-register.md) + [evidence-handling.md](evidence-handling.md) — what proof will look like, and what may never enter git
6. [phase-compliance-gate.md](phase-compliance-gate.md) — how each phase closes
7. [policy-index.md](policy-index.md) → [`docs/policies/`](../policies/) — the 14 DRAFT policies
8. [asset-inventory.md](asset-inventory.md), [vendor-and-subprocessor-register.md](vendor-and-subprocessor-register.md), [shared-responsibility-model.md](shared-responsibility-model.md) — and, for the one externally-held asset, the [domain and DNS runbook](../operations/domain-and-dns-runbook.md)
9. [soc2/](soc2/README.md) and [iso27001/](iso27001/README.md) — the framework views

## Relationship to the rest of the repository

Canonical security design lives in `docs/security/` (threat model, data classification, secrets, assurance claims) and the ADRs — compliance documents **reference** them and add control identity, status, ownership, and evidence on top. Two operational companions live in `docs/operations/`: [`repository-security-settings.md`](../operations/repository-security-settings.md) (the settings behind EV-007) and [`domain-and-dns-runbook.md`](../operations/domain-and-dns-runbook.md) (the ownership, renewal, and hardening posture behind EV-427). Phase gates come from `docs/roadmap.md` and `docs/architecture/environments.md`; the lessons behind many controls come from `docs/legacy/security-findings.md`. When a compliance document and a canonical design document disagree, the design document wins and the compliance document gets fixed.

## Baselines

- **ISO/IEC 27001:2022 + Amd 1:2024**, with **ISO/IEC 27002:2022** as the control reference (93 Annex A controls).
- **SOC 2** per the current AICPA Trust Services Criteria; all five categories are mapped as candidates (Security foundational; Availability, Processing Integrity, Confidentiality, Privacy), with the final examination scope to be confirmed with the chosen auditor.
