# ADR-0018 — Disclosure ≠ Access; configurable approval policy with Amanat default

**Status:** ACCEPTED · **Phase:** 13

## Context

Amanat requires releasing a deceased person's confidential records to a verified third party. The instinct is to model this as a permission: grant the recipient read access.

That instinct is wrong in every dimension. The actor is not the data subject. The basis is not ownership. The scope is a defined package, not everything owned. There is a **legally responsible releasing party**. And the action is **irreversible**.

No RBAC system expresses any of that.

## Decision

**Disclosure is a distinct concept with its own model, workflow, and audit.**

`DisclosureRequest` → `DisclosureCase` → `DisclosurePackage`, the last carrying recipient, purpose, legal basis, scope, expiry, jurisdiction, policy version, **releasing operating entity**, and timestamps.

**Ports with manual-review local implementations** — `DeathVerificationProvider`, `RecipientVerificationProvider`, `EstateDisclosurePolicy`, `DisclosureAuthorizationService` — so the workflow is complete and testable with **no external provider and no jurisdiction assumptions**.

**Approval policy is configurable per capability per jurisdiction.**

- **Amanat's default is mandatory human review** (≥1 human approver).
- A pack omitting an approval policy for a disclosure-bearing capability **fails to load**.
- **Lowering a capability below its declared default requires an explicit override** with recorded legal basis, approving party, and effective date. The override is audited and must pass staging.

**Safety properties, tested:**

1. Mandatory waiting period, per jurisdiction, with an **enforced platform minimum**.
2. **Owner supremacy while living** — amend or revoke at any time; latest wins; open cases auto-withdraw.
3. **Existence non-disclosure** — identical responses **and timings** whether records exist or not, until authorization completes.
4. `Released` is irreversible and the most heavily audited action in the platform.
5. Rate limiting and abuse detection on death reports.

## Consequences

**Positive**

- The model generalizes to data-subject requests, legal orders, and estate processes.
- The workflow is buildable at Phase 13 without waiting for the legal answers that belong to Phase 14.
- Existence non-disclosure closes a privacy breach that requires **no data release at all**.

**Negative — accepted**

- Slow by design: verification, waiting, and human approval on a case likely raised by a grieving family.
- Manual review means operational load, and staffing it is a real cost.
- Timing-equivalence testing is fiddly and must be maintained.

## Alternatives rejected

**Model disclosure as a permission grant.** Rejected for the reasons in Context — it cannot express legal basis, releasing party, scope, or irreversibility.

**Automatic release on verified death.** Rejected: death verification can be wrong or fraudulent, and release is irreversible. Human review is the default precisely because the failure is uncorrectable.

**A generic case-management engine (BPM) first.** Rejected as premature. Each context owns its state machine on a small pure helper, with a documented extraction trigger.

**Return "no records found" when none exist.** Rejected — this is the mistake that turns the report endpoint into an oracle: *"did this person secretly record debts?"* For a capability whose premise is confidentiality, it is the failure that matters most.

**No platform minimum on the waiting period.** Rejected: a jurisdiction pack could then configure zero, removing the property entirely.
