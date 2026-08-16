# Secure Development Policy

**Status:** DRAFT · **Owner:** Engineering Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 3.5 gate (Phase 2 gate missed)

## Scope

All code and configuration produced for Karar — application, tooling, CI workflows, Terraform, tests — from Phase 1 onward. Canonical companions: [`CONTRIBUTING.md`](../../CONTRIBUTING.md) (the CI-enforced rules), [`docs/security/threat-model.md`](../security/threat-model.md), `docs/testing/architecture-tests.md`.

## Purpose

Security is a property of how Karar builds, not a review stage at the end: requirements from the threat model, invariants as merge-blocking tests, and the rule that every control ships with a test that fails when the control is removed.

## Requirements

- **R1.** Security requirements for any new surface derive from the threat model; a capability begins with its `MODULE.md` — all seventeen checklist points, including legal documents and data lifecycle — before code (KAR-CTL-024).
- **R2.** The greenfield rule is absolute: the legacy repository is a requirements and evidence source, never a code source. No file may be a port of legacy application code (AC-012).
- **R3.** Architecture tests run in CI and block merge. The Phase-1 harness enforces the structural rules from CONTRIBUTING (import boundaries, no floats in money positions, sealed-data rules as code arrives); the suite accretes toward the full 26.
- **R4.** **Every control ships a test that fails when the control is removed** — a test that the attack fails, not that the control exists. Adversarial isolation tests assert on non-empty expected data.
- **R5.** Every ingestion and rendering path declares explicit resource limits and rejects rather than degrades (threat model T7; architecture test 24). *Enforcement not yet operating — Phase 5, when such paths first exist.*
- **R6.** No secrets, credentials, or real personal data in source, tests, or fixtures — synthetic data only (KAR-CTL-038); secret scanning backs the rule (KAR-CTL-026).
- **R7.** Static analysis: lint and type checks block merge from Phase 1, and CodeQL runs from Phase 1 (KAR-CTL-029); its meaningful application coverage begins with Phase-2 code.
- **R8.** Dependencies are added deliberately: lockfile-pinned, SCA-scanned, updated via reviewed PRs (KAR-CTL-025, 028; vendor-security-policy governs the sources).
- **R9.** AI-assisted development happens inside these same controls — its output enters through the same PRs, scans, and tests as any other change, under maintainer review; it earns no bypass (SoA 8.30 note).
- **R10.** *Not yet operating — Phase 4:* the Flutter client is built, analysed, and tested in CI like the backend — the legacy's mobile blind spot (INFRA-10) is not inherited.
- **R11.** Code review by a second person is required by change-management-policy §R4 and is currently under EXC-001; its compensating controls apply to every change made under this policy.

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md). EXC-001 (review), EXC-003 (local scans partial — the full scan set runs in CI only).

## Evidence

EV-002 (architecture tests), EV-004 (SCA), EV-005 (secret scan), EV-001 (pipeline runs). Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-020, 021, 022, 023, 024, 025, 026, 028, 029, 038.
