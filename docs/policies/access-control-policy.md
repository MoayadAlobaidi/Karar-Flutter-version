# Access Control Policy

**Status:** DRAFT · **Owner:** Security Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 3.5 gate (Phase 2 gate missed)

## Scope

All access to Karar assets: the repository and CI today; application, database, environments, control plane, and sealed vault as phases deliver them. Canonical design: [`docs/security/access-control.md`](../security/access-control.md) (the five-layer model) and [`docs/security/sealed-access.md`](../security/sealed-access.md).

## Purpose

Access is deny-by-default, least-privilege, reviewed, and layered — availability before authorization, authorization before data, grants before sealed payloads. A permission that should not exist is not created rather than carefully guarded.

## Requirements

- **R1.** Repository and CI access is limited to authorized accounts with MFA. The Security Owner verifies and exports the settings (EV-007); until that export exists, this requirement is asserted, not evidenced.
- **R2.** The default branch is protected: PRs only, required status checks, no force pushes or deletions. Verification per EV-007.
- **R3.** CI workflow credentials are least-privilege: read-only default token, per-job permission elevation, no long-lived cloud credentials stored in CI. Reviewed at the Phase 1 gate against the merged workflows.
- **R4.** Access rights are reviewed at every phase gate and on any role change (KAR-CTL-014). Today's review is trivial — one identity — and is still recorded, because the habit is the control.
- **R5.** *Not yet operating — Phase 3:* application access follows the layered model — authentication, capability availability, RBAC (`<capability>.<resource>.<action>` permissions re-derived from the database per request), tenant isolation via FORCEd RLS, with adversarial cross-tenant tests asserting on non-empty data (ADR-0022).
- **R6.** *Not yet operating — Phase 3:* authentication hardening per threat model T4 — lockout that does not reset its counter on lock, client IP from a trusted-proxy allow-list, rate policy selected on the normalised decoded path, short-lived access tokens with rotating refresh and server-side revocation.
- **R7.** *Not yet operating — Phase 13:* sealed payload reads require a compiler-enforced `SealAccessGrant` (`OWNER` · `DISCLOSURE` · `LEGAL_ORDER` only). No `SUPPORT`, `ADMIN`, `ANALYTICS`, or `AI` grant type exists or may be introduced; there is no exemption mechanism to invoke.
- **R8.** *Not yet operating — Phases 8/20:* human access to environments goes through the control plane: short-lived, single-environment, purpose-scoped tokens; the browser never holds an environment credential; production adds reason capture, reauthentication, and optional second approval (ADR-0021).
- **R9.** *Not yet operating — Phases 2/8:* every staff read of a customer record is audited, including reads returning nothing; admin surfaces read projections, never domain tables (ADR-0020).
- **R10.** Nobody grants themselves elevated access outside these mechanisms; solo reality makes this presently unverifiable by a second person, which is exactly why EXC-001 exists and the control plane is the Phase 20 answer.

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md). EXC-001 qualifies review independence.

## Evidence

EV-007 (settings export); access-review records at gates; later: control-plane audit records. Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-007, 008, 009, 010, 011, 012, 013, 014.
