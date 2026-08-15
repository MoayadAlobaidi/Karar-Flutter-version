# Policy Index

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** every phase gate

The 14 policies in [`docs/policies/`](../policies/). All are **DRAFT**: written, internally consistent, not yet formally approved. Approval is a recorded act by the Platform Owner, targeted at the Phase 2 gate; until then no policy is represented as in force, and controls citing them stay at DESIGNED in the [control matrix](control-matrix.md).

---

| Policy | Owner (role) | Status | Version | Approval target | Next review |
|---|---|---|---|---|---|
| [information-security-policy.md](../policies/information-security-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [access-control-policy.md](../policies/access-control-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [secure-development-policy.md](../policies/secure-development-policy.md) | Engineering Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [change-management-policy.md](../policies/change-management-policy.md) | Engineering Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [vulnerability-management-policy.md](../policies/vulnerability-management-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [incident-response-policy.md](../policies/incident-response-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [logging-and-monitoring-policy.md](../policies/logging-and-monitoring-policy.md) | Operations Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [cryptography-and-key-management-policy.md](../policies/cryptography-and-key-management-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [backup-and-recovery-policy.md](../policies/backup-and-recovery-policy.md) | Operations Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [business-continuity-policy.md](../policies/business-continuity-policy.md) | Operations Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [vendor-security-policy.md](../policies/vendor-security-policy.md) | Compliance Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [data-classification-and-handling-policy.md](../policies/data-classification-and-handling-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [retention-and-erasure-policy.md](../policies/retention-and-erasure-policy.md) | Privacy Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |
| [acceptable-use-policy.md](../policies/acceptable-use-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate | Phase 2 gate |

## Conventions

- Policies state **requirements**, numbered `R1…Rn`, and link canonical design documents rather than duplicating them. Where a requirement cannot yet be true, the policy says so with a "not yet operating — Phase N" marker instead of pretending.
- Deviations go through the [exceptions register](exceptions-register.md); no policy carries private carve-outs.
- After approval, versioning is semantic-lite: 0.x drafts, 1.0 at first approval, minor bumps for clarifications, major for requirement changes (which re-trigger approval).
- Review cadence after Phase 2: every phase gate touching the policy's scope, and at least annually once phases stretch longer than a year.
