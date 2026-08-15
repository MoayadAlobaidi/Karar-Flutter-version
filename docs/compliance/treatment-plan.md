# Risk Treatment Plan

**Status:** ACTIVE register · **Owner:** Security Owner · **Version:** 0.2 · **Date:** 2026-08-15 · **Review:** every phase gate

**v0.2 (2026-08-15, Phase 2):** rows 003, 009, 010 updated with delivered Phase 2 steps; rows 014, 015 added with their risks.

Maps each open risk in the [risk register](risk-register.md) to concrete treatment steps and the [roadmap](../roadmap.md) phase where each step lands. Most risks do not close by effort — they close when a named phase delivers the mechanism, or when a headcount/legal trigger fires.

---

| Risk | Treatment steps | Lands at | Closes when |
|---|---|---|---|
| KAR-RSK-001 key person | Keep every decision and procedure canonical in-repo (already the working rule); verify account-recovery paths for SCM and registries; maintain role structure for handover (control-owners.md) | Continuous | First SoD trigger fires and roles actually separate |
| KAR-RSK-002 no independent review | Merge-blocking CI (KAR-CTL-016) + architecture tests (020) as the mechanical reviewer; independent-reviewer-agent step in each phase process; EXC-001 reviewed at every gate | Phase 1 CI; per-phase | Team ≥ 2 and human review becomes mandatory (EXC-001 exit) |
| KAR-RSK-003 no alerting | Observability foundations **delivered at Phase 2** (2026-08-15): classification-aware logs/traces/metrics, truthful readiness, outbox/job metrics (KAR-CTL-058, 062, 063) — emitting, not watched; projections/ops views Phase 8; alert routing, severity model, on-call rotation as Phase 20 gates (KAR-CTL-041) | 2 done; 8, 17–20 | Phase 20 gate passes with alerts live and rotation staffed |
| KAR-RSK-004 supply chain | Lockfiles + reviewed updates (028), SCA per-PR (025 — blocking threshold pending, tracked in `docs/operations/repository-security-settings.md`), SBOM per build (027), secret-scanned CI (026); verify container digest pinning at the Phase 1 gate; registry provenance checks when publishing begins | Phase 1, verified each gate | Never fully — residual re-scored each phase; drops to Moderate once SCA blocking and digest pinning are verified |
| KAR-RSK-005 CI secret leakage | Least-privilege workflow tokens (009); no secrets in workflow logs (036); secret scanning (026); Phase-1-gate review of all workflow files against these rules | Phase 1 gate | Residual accepted at Low after first clean gate review; re-opened on any workflow change adding secrets |
| KAR-RSK-006 residency undetermined | Keep architecture provider-portable (`DeploymentProfile`, jurisdiction-scoped KEKs — already designed); obtain data-residency legal opinion; record determination in `docs/architecture/data-residency.md` | Opinion by Phase 20; posture reviewed at 17 | Legal opinion recorded and architecture confirmed against it |
| KAR-RSK-007 Sharia review absent | Engage external Sharia reviewer for Zakat methodology; hold AC-010 (never a fatwa) true in product copy; launch gate on completed review | Before Zakat launch (Phase 9 gate) | Review completed and its scope recorded |
| KAR-RSK-008 Amanat clearance absent | Per-jurisdiction legal clearance engagement; terminology review; capability ships `PENDING_LEGAL_REVIEW` until cleared | Phase 14 gate | Clearance recorded per launch jurisdiction |
| KAR-RSK-009 sealed key custody | Rotation, custody-model, provenance, and canary **contracts designed and test-pinned at Phase 2** (2026-08-15; KAR-CTL-064, 065 — DESIGNED, test-only in-memory provider, no cloud KMS, no production keys); custody strategy + recovery policy + operating canary built at Phase 13 with the vault; approved strategy, rehearsed recovery, running canary as Phase 20 gates before any production `SEALED` data (ADR-0017) | 2 done (design); 13, 20 | Phase 20 custody gates pass |
| KAR-RSK-010 documentation drift | Docs checks in CI (023) from Phase 1; assurance-claim linkage test 26 ACTIVE from Phase 2 (score re-dropped to 9 on 2026-08-15, as this row predicted); per-gate reconciliation of claims vs. built reality (phase-compliance-gate.md item 6) | 1, 2 done, per-phase | Never fully — held at bay per gate |
| KAR-RSK-011 GitHub dependence | Full-clone recoverability rule (046); per-phase evidence export; evidence-store decision (out of interim) by Phase 2 gate; mirror/second-remote assessment at Phase 17 alongside cloud onboarding | 2, 17 | Approved evidence store + recoverability check pass |
| KAR-RSK-012 accidental commits | Secret scanning (026) and synthetic-only rule (038) from Phase 1; repo-hygiene item on every phase gate; Platform Owner disposition of the pre-existing `Archive.zip` (remove, and decide whether history rewrite is warranted) at Phase 1 close | 1 close, per-phase | Archive dispositioned and two consecutive clean gate checks |
| KAR-RSK-013 no cert pinning | Accepted (EXC-002, threat model §4/C11); revisit when the Flutter network layer is built (Phase 4) and at production readiness (Phase 20) | Revisit 4, 20 | Superseding decision, or re-acceptance recorded at Phase 20 |
| KAR-RSK-014 queue exhaustion | Caps and bounded behaviour delivered with the queues at Phase 2 (bounded retries → dead-letter, payload cap, leases, stale-claim recovery — KAR-CTL-058, 059); DLQ-depth and backlog **alerting** with monitoring at Phase 20 (KAR-CTL-041); per-tenant/producer quotas assessed when tenancy exists (Phase 3+) | 2 done (caps); 3+, 20 | Never fully — standing operational risk, re-scored per gate; alerting closes the residual's detection half |
| KAR-RSK-015 schema drift | Checksums, drift detection, forward-only history, and from-zero rebuild delivered with the runner at Phase 2 (KAR-CTL-053, 054); `/readyz` reports migration status (062); re-scored when additional environments exist (Phase 17+), where drift surface multiplies | 2 done; re-score 17+ | Never fully — held by verify-per-run; re-scored per gate |

## Reading the plan

- **"Lands at"** references are to [roadmap](../roadmap.md) phases; a treatment naming Phase 17+ depends on a cloud account existing, which is itself not scheduled — that is the roadmap's honesty, not this plan's evasion.
- Treatments that say **"never fully"** are standing risks (supply chain, drift): the plan's job is to keep them scored and reviewed, not to pretend a closure.
- Every row is re-checked at the phase gate; a treatment that slipped its phase is a gate finding, and the risk's score is re-evaluated with that fact.
