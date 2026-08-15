# Exceptions Register

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** every phase gate

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
| Compensating controls | Merge-blocking CI as the mechanical reviewer (KAR-CTL-016); architecture tests failing on structural violations (020); an **independent-reviewer-agent step** in the phase process, whose findings are addressed before phase close; per-gate review of merged changes |
| Risk link | KAR-RSK-002 |
| Approved by | Platform Owner |
| Opened | 2026-08-15 |
| Exit | Team reaches 2 engineers — human review becomes mandatory and this exception closes at the following gate |
| Status | OPEN |

### EXC-002 — No certificate pinning in v1

| | |
|---|---|
| Deviation | Transport hardening beyond platform trust stores (mobile client) is not implemented in v1 |
| Reason | Accepted risk carried from the threat model (§4, challenge C11), retained from Plan v1; pinning's operational failure modes (bricked clients on rotation) were judged worse than the marginal gain at this scale |
| Compensating controls | TLS everywhere; token lifetimes short with server-side revocation (Phase 3 design); no sensitive value cached client-side beyond design rules (Phase 4) |
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
| Exit | Re-evaluate when the team grows (more unmerged local work at risk) or if a merge-bypass path is ever discovered — the latter reopens this as a finding, not an exception |
| Status | OPEN |

## Closed exceptions

None yet.
