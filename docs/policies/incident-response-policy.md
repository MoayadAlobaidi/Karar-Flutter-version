# Incident Response Policy

**Status:** DRAFT · **Owner:** Security Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 3.5 gate (Phase 2 gate missed)

## Scope

Security incidents affecting Karar assets — today: repository, CI, accounts, the developer workstation; later: environments, customer data, the sealed vault. Vulnerability *reports* route through the vulnerability-management-policy; an exploited vulnerability is an incident.

## Purpose

When something breaks the rules — a leaked credential, a compromised account, a data exposure — the response is prepared, proportionate, recorded, and it feeds learning rather than shame.

## Requirements

- **R1.** Severity model:
  - **SEV-1** — confirmed exposure of customer data or keys; **any sealed value appearing anywhere it must not, at n=1** (`SECURITY.md`); compromise of production credentials or the control plane.
  - **SEV-2** — compromise of a non-production credential/account with material reach (SCM admin, CI); a control found bypassed in a way an attacker could use.
  - **SEV-3** — contained rule violations: a committed secret caught by scanning before push elsewhere, a misconfigured permission with no evidence of use.
- **R2.** Roles: the Security Owner leads response; the Platform Owner is informed at SEV-2+ immediately (today the same person — the distinction still shapes the record and survives the SoD triggers).
- **R3.** Response order: contain (revoke/rotate/isolate), assess scope honestly, eradicate, recover, then write it down. Rotation of a credential presumed exposed is never deferred pending certainty.
- **R4.** Every SEV-1/SEV-2 gets a post-incident review within one week: timeline, root cause (pattern-level, per `docs/legacy/security-findings.md` §9), corrective actions into [continual-improvement.md](../compliance/iso27001/continual-improvement.md).
- **R5.** Incident records follow [evidence-handling.md](../compliance/evidence-handling.md): redacted, referenced from the evidence register, retained 13 months minimum or under legal hold.
- **R6.** External reports arrive via `SECURITY.md` and are acknowledged; there is no response SLA before an on-call rotation exists (Phase 20), and no pretense of one.
- **R7.** *Not yet operating — Phases 3/16/20:* customer and regulator breach notification duties per jurisdiction and the operating-entity's controller/processor role ([shared-responsibility model](../compliance/shared-responsibility-model.md)); in a white-label relationship Karar notifies the partner-bank controller per the DPA.
- **R8.** *Not yet operating — Phase 17:* tabletop exercises per phase once infrastructure exists; the first real environment does not get its first incident rehearsal in production.
- **R9.** *Not yet operating — Phase 20:* on-call rotation with escalation and severity-differentiated alert routing — a single recipient is not on-call (environments.md §10).
- **R10.** Suspected but unconfirmed incidents are treated as incidents until scoped — the cost asymmetry decides.

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md). None currently touch this policy.

## Evidence

Incident records and post-reviews (redacted, per handling rules); channel-test records; later: tabletop and on-call records. Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-042, 043, 041 (deferred), 039 (deferred).
