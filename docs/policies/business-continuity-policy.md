# Business Continuity Policy

**Status:** DRAFT · **Owner:** Operations Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 3.5 gate (Phase 2 gate missed)

## Scope

Karar's ability to continue operating — as a development effort now, as a customer-facing service after Phase 21. Pre-production, continuity risk is concentrated in two places this policy treats seriously because nothing else exists: the single maintainer and the single vendor.

## Purpose

Continuity planning proportionate to what actually runs. Writing a data-center failover plan for a project with no servers would be theater; naming what already threatens continuity — and what must exist before customers depend on the service — is the real work.

## Requirements

- **R1.** The dominant current continuity risk is key-person concentration (KAR-RSK-001). Mitigation is structural and continuous: every decision, procedure, and credential-recovery path is documented in-repo so the project is resumable by a competent successor; the [control-owners](../compliance/control-owners.md) role model makes handover a reassignment.
- **R2.** Account recovery for SCM and registries is verified (recovery codes stored per secrets rules, off the primary device) — checked at the Phase 1 gate and re-checked when accounts change.
- **R3.** Vendor-loss continuity: full-clone recoverability (backup-and-recovery-policy §R1) and per-phase evidence export mean loss of the SCM vendor suspends convenience, not the project (KAR-RSK-011).
- **R4.** Continuity obligations scale at named phases and are re-planned at each gate that adds one: cloud dependency (17), staging (19), customers (21).
- **R5.** *Not yet operating — Phase 20 gate:* a DR runbook exists and has been **executed**, with RTO measured; SLOs and alerting are live with an on-call rotation and escalation. These are launch gates (roadmap; environments.md §9) — production does not open without them.
- **R6.** *Not yet operating — Phase 20:* maximum tolerable outage and recovery objectives are set per capability with the operating entity's obligations in view — a Zakat deadline and an Amanat disclosure have different tolerance for downtime, and the numbers are decided, not discovered.
- **R7.** *Not yet operating — Phase 20:* continuity of the sealed vault follows the custody strategy (cryptography policy §R5) — continuity for sealed data means key continuity, since the data is unreadable without it.
- **R8.** *Not yet operating — post-first-hire:* succession and deputization per role; the SoD triggers in control-owners.md double as the continuity de-concentration plan.
- **R9.** Continuity assumptions are re-tested at every phase gate: what single points of failure exist right now, and which are accepted (register) versus treated (plan).

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md). None current — the single-maintainer condition is a risk (KAR-RSK-001), not a policy deviation.

## Evidence

Recovery-path verification records (Phase 1 gate); later: DR execution records with measured RTO, on-call rotation records. Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-045, 046, 044 (deferred), 041 (deferred), 002.
