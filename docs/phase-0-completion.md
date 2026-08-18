# Phase 0 — Completion and Exit-Criteria Verification

**Date:** 15 August 2026
**Branch:** `claude/karar-v2-architecture-plan-5tif8e`
**Scope:** documentation and decisions only. **No application code, no dependencies, no Docker, no migrations.**

---

## 1. Deliverables

| § | Deliverable | Status |
|---|---|---|
| **0.1** | Preserve state | COMPLETE — Recorded in [`legacy/qarar-audit.md`](legacy/qarar-audit.md) §2, **with a correction** — see §3 below |
| **0.2** | Legacy audit | COMPLETE — **Ungated and complete.** 4 documents under [`legacy/`](legacy/) |
| **0.3** | Architecture docs | COMPLETE — 22 documents + `plan-v2-deltas.md` under [`architecture/`](architecture/) |
| **0.4** | Diagrams | COMPLETE — Mermaid sources embedded in the documents they explain |
| **0.5** | ADRs | COMPLETE — **26** under [`adr/`](adr/README.md) |
| **0.6** | Security docs | COMPLETE — 5 under [`security/`](security/) |
| **0.7** | Module ownership | COMPLETE — [`MODULE_TEMPLATE.md`](MODULE_TEMPLATE.md) + **20 `MODULE.md` files** + [`capability-map.md`](architecture/capability-map.md) |
| **0.8** | Repository skeleton | COMPLETE — Directory tree, **98 READMEs**, root files, onboarding, glossary |
| **0.9** | Exit criteria | COMPLETE — Verified below |

## 2. Blocker 1 — CLOSED

Plan v2 recorded one remaining true blocker: **Qarar repo access**, gating Phase 0 sign-off and Phase 9 scoping.

**Resolved.** The restriction was specific to the MCP GitHub tool's session allow-list; the `gh` CLI reaches the repository normally as `MoayadAlobaidi`. The feature inventory is therefore **SOURCE-VERIFIED**, not USER-REPORTED, and not fabricated.

**Consequence:** the §0.9 criterion *"feature inventory complete **or** Blocker 1 formally carried into Phase 1 with Phase 9 explicitly unscoped"* is satisfied by the **first** branch. Phase 9 is scoped ([`legacy/feature-inventory.md` §18](legacy/feature-inventory.md)). **Phase 0 reaches full sign-off.**

## 3. Correction to a plan premise

Plan v2's blocking fact #1 states the target repository is empty — *"zero commits."* At the time of this work `refs/heads/main` exists at `88f16c2`, a one-line placeholder README pushed on 15 August 2026 at 17:37 +0300.

**The substance is unaffected** — a placeholder README is nothing to preserve, and §87 still has nothing to preserve. Recorded because §0.1 requires an accurate record of the starting state, and "zero commits" would not be one.

## 4. Exit criteria

### 4.1 Every §93 question plus the five new ones answerable from docs alone

PASS — [`onboarding/developer.md`](onboarding/developer.md) — 30 questions.

**Documented gap:** §93 is a question list defined in **Plan v1**, which is not reproduced in the v2 document, and the v1 list was unavailable. The questions were reconstructed to cover §93-equivalent ground; **the five new questions are quoted verbatim from Plan v2 §0.8**. This is flagged in the document itself and should be reconciled if the v1 list surfaces.

### 4.2 Scenarios A–D reproducible from the docs

PASS — [`scenarios/`](scenarios/) — four documents, each self-contained, each ending with a verifiable `git diff` check for its untouched-module claim.

### 4.3 All ADRs present

PASS — **26** — at Phase 0 sign-off, numbered 0001–0025 plus 0027, with 0026 deliberately unused (subject-elected policy was folded into ADR-0015 per the one-rule-per-decision principle). Each records context, decision, consequences, and **alternatives rejected**.

*Phase 0.5 note: the data-lifecycle ADR was subsequently renumbered 0027 → 0026, making the sequence continuous at 0001–0026. See [`phase-05-consolidation.md`](phase-05-consolidation.md).*

### 4.4 Feature inventory complete

PASS — **SOURCE-VERIFIED.** Every capability with its legacy status and Karar disposition (BUILD ‹phase› / DEFER → ‹seam› / DROP / NEW). Phase 9 scope stated.

### 4.5 Committed and pushed

PASS — Branch `claude/karar-v2-architecture-plan-5tif8e`.

## 5. Verification method

| # | Check | Result |
|---|---|---|
| 1 | Onboarding questions answerable from `docs/` alone | PASS — 30 questions, each linking its source |
| 2 | §92 clause check — each "clean only if" clause maps to an **enforceable mechanism** | PASS — [`testing/architecture-tests.md`](testing/architecture-tests.md) — 26 CI-blocking tests |
| 3 | Extension test — a reader can trace Amanat end to end and confirm the untouched list | PASS — [`scenarios/b-add-amanat.md`](scenarios/b-add-amanat.md), with a `git diff` verification |
| 4 | Scenarios derivable without the plan file | PASS — No scenario document references the plan as a source |
| 5 | ADR completeness — each records rejected alternatives | PASS — All 26 |
| 6 | Traceability — every phase marked BUILD or DEFER, each DEFER naming its seam | PASS — [`legacy/feature-inventory.md`](legacy/feature-inventory.md), [`roadmap.md`](roadmap.md) |
| 7 | Consistency — exactly one authoritative rule per decision | PASS — See §6 |
| 8 | Internal links resolve | PASS — **254 links checked, 0 broken** |
| 9 | Every module directory has `MODULE.md` | PASS — 20/20 |

## 6. Consistency — one authoritative rule per decision

Each rule below lives in exactly one place; everything else links to it.

| Rule | Authoritative location |
|---|---|
| Layering and the dependency rule | [`architecture/clean-architecture.md`](architecture/clean-architecture.md) |
| Money representation | [`adr/0006`](adr/0006-monetary-representation.md) |
| Restrict-only policy invariant | [`architecture/jurisdiction-policy.md`](architecture/jurisdiction-policy.md) §2 |
| Deny-by-default availability | [`architecture/capability-registry.md`](architecture/capability-registry.md) §3 |
| Sealed handling | [`architecture/sealed-data.md`](architecture/sealed-data.md) |
| Event payload rules | [`architecture/event-governance.md`](architecture/event-governance.md) §3 |
| Data classification matrix | [`security/data-classification.md`](security/data-classification.md) §2 |
| Data lifecycle and erasure | [`adr/0026`](adr/0026-data-lifecycle.md) |
| Architecture tests | [`testing/architecture-tests.md`](testing/architecture-tests.md) |
| Phase gates | [`roadmap.md`](roadmap.md) |

## 7. Amendments raised against Plan v2

Six, from the legacy audit. **None blocks Phases 1–8.** Full detail and recommended disposition in [`architecture/plan-v2-deltas.md`](architecture/plan-v2-deltas.md).

| # | Delta | Type | Landed in |
|---|---|---|---|
| **D1** | **Zakat is missing, and exposes a fourth policy dimension** (`SubjectPolicySelection`) | Additive | ADR-0015, §1 of jurisdiction-policy, capability map, Phase 9 scope |
| **D2** | **Sealed key escrow, rotation, and an integrity canary** | Additive | ADR-0017, sealed-data §7, secrets §5, Phase 20 gates |
| **D3** | White-label **data plane** is not costed | Cost correction | white-label §1, roadmap Phase 11 |
| **D4** | **Consent re-acceptance on document republish** | Additive | ADR-0024, jurisdiction-policy §10 |
| **D5** | **Erasure strategy for ownerless derived data** | Additive | **ADR-0026 (new)**, MODULE template, test 25 |
| **D6** | Five additional architecture tests (22–26) | Additive | testing/architecture-tests |

**ADR count moved 25 → 26.** Architecture tests moved **21 → 26**.

### The two that matter most

**D1 — the fourth dimension.** Plan v2 §1.1 claims three independent dimensions and calls this *"a precision v1 lacked entirely."* Zakat varies along **none of them**: two customers in Qatar, same entity, same PolicyPack, can legitimately require different calculations because they follow different scholarly positions. That is a policy dimension with the same versioning, provenance, and pinning requirements — keyed on **the subject**. Retrofitting it after `financial-engine` and `jurisdiction-policy` exist is exactly the scenario §1.1 warns about; adding it at Phase 3.5 is a type parameter and a resolution step.

**D2 — sealed key loss.** Legacy finding ENC-2: the production key *"has already been lost once."* The legacy survived because it held 3 users and because encrypted columns sit beside readable metadata that makes loss **visible**. `SEALED` removes both cushions by design, so loss becomes **unrecoverable and undetectable** — discovered at the point of releasing a record to a bereaved family.

## 8. What Phase 0 did not and cannot establish

| | |
|---|---|
| That the architecture works | No code exists. Every claim is a design claim |
| That the legacy's 128 findings are accurate | Only 8 carry a reviewed status. They are reported as the legacy reports them |
| Any residency, regulatory, or Sharia position | All open, all owned outside engineering |
| That the legacy test suite passes | Not run |
| Runtime behaviour of anything | No system was executed |

**No regulatory approval, licence, certification, penetration test, independent security assessment, or Sharia review exists for either system, and none is implied by any document produced in Phase 0.**

## 9. Status

> **Phase 0 COMPLETE. Blocker 1 CLOSED. Phase 9 SCOPED.**
> **Stopped before Phase 1, as authorized.**

Six amendments are raised for decision. None blocks Phase 1.

**Plan v2's verdict is unchanged: READY.** The audit strengthens the plan the same way the plan's own amendments strengthened v1 — by making a real constraint representable rather than implicit.
