# Exceptions Register

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.4 · **Date:** 2026-08-16 · **Review:** every phase gate

**v0.4 (2026-08-16, Phase 3.5):** EXC-001, 002, 003 re-affirmed; **no exception opened, closed, or re-approved**, and no exit trigger fired — the team is still one person. EXC-001 carries an explicit note that Phase 3.5's multiple agent workstreams are **not** separation of duties. EXC-002's compensating-control facts refreshed again (a tenant switch now rotates the refresh family too). Phase 3.5 produced no new deviation warranting an exception: the residuals it surfaced — the caller-settable pin cutoff, the mislabelled-environment path, the bound-session window — are **risks with named owners** (KAR-RSK-029, 023, 030), not deviations from a stated control, and recording them as exceptions would dilute what an exception means here.

**v0.3 (2026-08-16, Phase 3):** EXC-002's compensating-control facts refreshed — the short-lived-token/server-side-revocation leg moved from Phase 3 design to Phase 3 code (KAR-CTL-067, 068). No exception opened, closed, or re-approved; re-affirmations are Phase 3 gate business.

**v0.2 (2026-08-15, Phase 2 review):** EXC-001, 002, 003 re-affirmed; no exit trigger fired; no exception opened or closed. EXC-003 carries a dated re-affirmation note.

An exception is a recorded, bounded deviation from a stated policy or control — with compensating controls and a defined exit. An unrecorded deviation is not an exception; it is a finding.

---

## Entry schema

| Field | Meaning |
|---|---|
| `id` | `EXC-###`, stable |
| `deviation` | What rule is not being met, referencing the KAR-CTL or policy section |
| `reason` | Why, honestly |
| `compensating controls` | What limits the exposure meanwhile |
| `risk link` | KAR-RSK ID carrying the residual |
| `approved by` | Role (Platform Owner for High/Critical residuals) |
| `opened` | Date |
| `exit` | The trigger or date at which the exception must close or be re-approved |
| `status` | `OPEN` · `CLOSED` (with closing event) |

## Open exceptions

### EXC-001 — Single-person approval of pull requests

| | |
|---|---|
| Deviation | KAR-CTL-017 (independent review of every change) and change-management-policy §R4: author and approver are currently the same person |
| Reason | One maintainer exists; requiring a second human approval would block all work |
| Compensating controls | Merge-blocking CI as the mechanical reviewer (KAR-CTL-016); architecture tests failing on structural violations (020 — 24 active checks at Phase 3.5, self-test 56/56); an **independent-reviewer-agent step** in the phase process, whose findings are addressed before phase close; per-gate review of merged changes |
| Risk link | KAR-RSK-002 |
| Approved by | Platform Owner |
| Opened | 2026-08-15 |
| Exit | Team reaches 2 engineers — human review becomes mandatory and this exception closes at the following gate |
| Status | OPEN |
| Re-affirmed | 2026-08-16 (Phase 3.5): OPEN, unchanged, no exit trigger fired. **Stated explicitly because Phase 3.5 was delivered by several parallel agent workstreams with a reviewer among them, and that is not separation of duties.** The workstreams are technical divisions of labour directed by one maintainer; every one of them, and the review of all of them, resolves to the same person. All review recorded anywhere in this corpus — including the independent-reviewer step, the suppression reviews, and the gate records — is **maintainer-directed technical review**, not organizational separation of duties and not independent human review. The exit trigger remains a second *engineer*, not a second agent |

### EXC-002 — No certificate pinning in v1

| | |
|---|---|
| Deviation | Transport hardening beyond platform trust stores (mobile client) is not implemented in v1 |
| Reason | Accepted risk carried from the threat model (§4, challenge C11), retained from Plan v1; pinning's operational failure modes (bricked clients on rotation) were judged worse than the marginal gain at this scale |
| Compensating controls | TLS everywhere; token lifetimes short with server-side revocation — delivered as code at Phase 3, 2026-08-16 (KAR-CTL-067, 068, IMPLEMENTED [P3]: minimal ES256 access tokens with token-version invalidation, rotating refresh families with reuse detection); refreshed 2026-08-16 (Phase 3.5): a tenant switch now revokes the session **and its refresh family** atomically before issuing the replacement, so an intercepted token's useful life is bounded by the switch as well as by expiry and reuse detection (KAR-CTL-091); no sensitive value cached client-side beyond design rules (Phase 4) |
| Risk link | KAR-RSK-013 (ACCEPTED) |
| Approved by | Platform Owner |
| Opened | 2026-08-15 (formalizing the existing threat-model acceptance) |
| Exit | Revisit at Phase 4 (Flutter network layer) and re-approve or supersede at Phase 20 |
| Status | OPEN |

### EXC-003 — Local security scans are partial

| | |
|---|---|
| Deviation | Vulnerability-management-policy and secure-development-policy expect the security scan set to run before merge; locally, only a subset (lint, type checks, optional pre-commit secret scan) runs — the full set (SCA, secret scan, SBOM, architecture tests) executes only in CI |
| Reason | Keeping the local loop fast; duplicating every scanner locally costs more than it protects, given CI is merge-blocking |
| Compensating controls | CI runs the full set on every PR and blocks merge on the required checks (KAR-CTL-016, 020, 026, 027); KAR-CTL-025 (dependency audit) is currently report-only — the blocking dependency gate at the PR boundary is dependency-review (KAR-CTL-027) |
| Risk link | KAR-RSK-004, KAR-RSK-005 (contributing condition) |
| Approved by | Security Owner |
| Opened | 2026-08-15 |
| Re-affirmed | 2026-08-15 (Phase 2): the local posture is unchanged — Phase 2 added platform unit/integration tests that do run locally against live PostgreSQL, but the security-scan set (SCA, secret scan, SBOM) still executes only in CI, which remains merge-blocking. Compensating controls unchanged; exception stands. 2026-08-16 (Phase 3.5): unchanged again. The local loop grew (full workspace suite, architecture runner, docs-check, format, and the Prisma mapping check all run locally) but the security-scan set is still CI-only, and CI is still merge-blocking. Exception stands |
| Exit | Re-evaluate when the team grows (more unmerged local work at risk) or if a merge-bypass path is ever discovered — the latter reopens this as a finding, not an exception |
| Status | OPEN |

## Closed exceptions

None yet.

**Phase 3 gate re-affirmation (2026-08-16):** EXC-001 OPEN (single maintainer; no exit trigger fired), EXC-002 compensating controls verified as delivered code, EXC-003 unchanged. Recorded in the Phase 3 gate record (phase-compliance-gate.md v0.4).

**Phase 3.5 re-affirmation (2026-08-16):** EXC-001 OPEN — single maintainer, no exit trigger fired, and the parallel agent workstreams of this phase are explicitly *not* the separation of duties the exception is about. EXC-002 OPEN with its compensating-control facts refreshed (switch-time refresh-family rotation). EXC-003 OPEN, unchanged. **No exception opened or closed**, and none was approved or re-approved on the Platform Owner's behalf. Confirmed against the Phase 3.5 residuals: none of them is a deviation from a stated control, so none of them became an exception. This re-affirmation is prepared for, and recorded by, the Phase 3.5 gate (phase-compliance-gate.md).
