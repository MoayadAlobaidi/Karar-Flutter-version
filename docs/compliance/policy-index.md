# Policy Index

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.2 · **Date:** 2026-08-16 · **Review:** every phase gate

**v0.2 (2026-08-16, Phase 3.5):** two date corrections raised by the Phase 3.5 independent review, both recording a miss rather than erasing one. The **approval target** now names the standing deadline the Phase 2 and Phase 3 gates actually set, with the missed original left visible. The **next-review** column, which read "Phase 2 gate" for all 14 policies two gates after that gate closed, now names the Phase 3.5 gate. **No policy was approved and no status changed** — all 14 remain DRAFT at version 0.1.

**Resolved at Phase 3.5 integration:** the 14 policy files in [`docs/policies/`](../policies/) each carried a header stamped `**Review:** Phase 2 gate`, with the same staleness this index had. That correction fell outside the compliance workstream's write scope and was handed to the phase lead, who updated all 14 headers to `Phase 3.5 gate (Phase 2 gate missed)` — recording the cadence and the miss rather than quietly restamping. This index and the policy headers now agree; the underlying fact is unchanged and unflattering, which is the point: a review cadence written in fourteen files went unperformed for two gates, logged as CI-006 in [continual-improvement.md](iso27001/continual-improvement.md).

The 14 policies in [`docs/policies/`](../policies/). All are **DRAFT**: written, internally consistent, **not formally approved by anyone**. Approval is a recorded act by the Platform Owner and by nobody else; until it happens no policy is represented as in force, and controls citing them stay at DESIGNED in the [control matrix](control-matrix.md).

**Standing approval deadline: Platform Owner review is required before the first non-local deployment** (set at the Phase 2 gate, re-affirmed at the Phase 3 gate, and carried into the Phase 3.5 gate checklist). The per-row "Phase 2 gate" target below is the *original* target and was not met — it is superseded by that deadline and left visible rather than quietly rewritten, because a slipped date that disappears is how deadlines stop meaning anything. Each gate records either the owner's approval or the re-affirmed deadline; silence fails the gate.

---

| Policy | Owner (role) | Status | Version | Approval target (original — superseded, see above) | Next review |
|---|---|---|---|---|---|
| [information-security-policy.md](../policies/information-security-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [access-control-policy.md](../policies/access-control-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [secure-development-policy.md](../policies/secure-development-policy.md) | Engineering Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [change-management-policy.md](../policies/change-management-policy.md) | Engineering Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [vulnerability-management-policy.md](../policies/vulnerability-management-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [incident-response-policy.md](../policies/incident-response-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [logging-and-monitoring-policy.md](../policies/logging-and-monitoring-policy.md) | Operations Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [cryptography-and-key-management-policy.md](../policies/cryptography-and-key-management-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [backup-and-recovery-policy.md](../policies/backup-and-recovery-policy.md) | Operations Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [business-continuity-policy.md](../policies/business-continuity-policy.md) | Operations Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [vendor-security-policy.md](../policies/vendor-security-policy.md) | Compliance Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [data-classification-and-handling-policy.md](../policies/data-classification-and-handling-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [retention-and-erasure-policy.md](../policies/retention-and-erasure-policy.md) | Privacy Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |
| [acceptable-use-policy.md](../policies/acceptable-use-policy.md) | Security Owner | DRAFT | 0.1 | Phase 2 gate (missed) | **Phase 3.5 gate**, then every gate touching its scope |

## Conventions

- Policies state **requirements**, numbered `R1…Rn`, and link canonical design documents rather than duplicating them. Where a requirement cannot yet be true, the policy says so with a "not yet operating — Phase N" marker instead of pretending.
- Deviations go through the [exceptions register](exceptions-register.md); no policy carries private carve-outs.
- After approval, versioning is semantic-lite: 0.x drafts, 1.0 at first approval, minor bumps for clarifications, major for requirement changes (which re-trigger approval).
- Review cadence after Phase 2: every phase gate touching the policy's scope, and at least annually once phases stretch longer than a year.
