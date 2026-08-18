# Change Management Policy

**Status:** DRAFT · **Owner:** Engineering Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 4 gate (Phase 2 target missed; re-affirmed but not content-reviewed at Phase 3.5)

## Scope

Every change to the repository — code, documentation, CI workflows, Terraform, and the compliance corpus itself — and, once environments exist, every deployment. Canonical companions: [`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`docs/architecture/environments.md`](../architecture/environments.md) (staging passage, §4).

## Purpose

Changes are proposed, checked, reviewed, and traceable. The legacy's lesson is precise: gates that block a workflow run but not the merge protect nothing (INFRA-07) — Karar's gates block the merge.

## Requirements

- **R1.** All changes reach the default branch through pull requests from branches; direct pushes are denied by branch protection (verification pending, EV-007).
- **R2.** Required CI checks must pass before merge: lint/type checks, architecture tests, dependency scan, secret scan, docs checks — the merge is blocked, not merely the run (KAR-CTL-016).
- **R3.** A change's intent is stated in its PR; architectural decisions are captured as ADRs, and an accepted ADR is superseded by a new one, never edited (KAR-CTL-019).
- **R4.** Every change is reviewed by someone other than its author before merge. **Currently under EXC-001** — one maintainer exists; the compensating controls are the mechanical gates in R2 plus the independent-reviewer-agent step per phase. This exception closes when the team reaches two engineers.
- **R5.** Changes to security-relevant surfaces (CI workflows, branch protection, `docs/compliance/**`, `docs/policies/**`, secrets handling, crypto design) are named as such in the PR and get gate-level review at phase close.
- **R6.** *Not yet operating — Phase 19:* sensitive change classes pass staging before production: database migrations, financial rules and ruleset versions, AI prompts/models/routing, bank connectors, subscription and entitlement changes, white-label configuration, mobile releases, country/jurisdiction policy, capability availability, operating-entity changes, sealed vault and key operations (environments.md §4).
- **R7.** *Not yet operating — Phase 17:* infrastructure changes go through Terraform PRs; no production resource is created or modified through a console by hand (KAR-CTL-031).
- **R8.** *Not yet operating — Phase 20:* production deployments require the control-plane path with reason capture; emergency changes follow the incident-response policy and are retroactively reviewed at the next gate.
- **R9.** Reverts are changes: same PR path, same checks; what they revert and why is stated.
- **R10.** Dependency and toolchain updates follow secure-development-policy §R8 — reviewed PRs, never auto-merged.

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md). EXC-001 is this policy's material open exception.

## Evidence

EV-001 (pipeline run gating a PR), EV-007 (branch protection), PR history; later: staging-passage and deployment records. Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-015, 016, 017, 018, 019, 031.
