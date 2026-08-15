# ADR-0015 — Typed PolicyPacks, restrict-only settings, extensible resolution, and subject-elected policy

**Status:** ACCEPTED · **Phase:** 3.5
**Amended:** after the Phase 0.2 legacy audit, to cover subject-elected policy (`SubjectPolicyProfile`).

## Context

Jurisdictional policy has two natures that pull in opposite directions.

Some of it has **legal and business consequence** — consent requirements, retention durations, which capabilities are lawful, disclosure and approval rules. A change to any of these must be reviewed, diffed, tested, and staged.

Some of it is **operational** — is a provider up, is a capability enabled, which legal-document version is in force. An operator must be able to change these **now**, without a deploy.

Putting both in code makes the platform unoperable. Putting both in configuration makes legal rules unreviewable.

## Decision

### The split

| | **PolicyPack** — code | **JurisdictionSettings** — database |
|---|---|---|
| Contains | Ruleset selection, consent requirements, retention, identity requirements, disclosure + approval policy, currency policy, AI-processing policy, **cleared capabilities**, resolution strategies, **permitted subject-profile options** | Capability availability, provider enablement, kill switches, legal-document version in force, plan availability, entity assignment |
| Changed by | PR → review → tests → staging → deploy | Authorized operator, audited, no deploy |

### The invariant

> **Database settings may only ever *restrict* what the code pack permits. They can never expand it.**

An operator can disable Amanat in Qatar instantly. An operator **cannot enable** it where the pack has not cleared it. Enforced in the merge function, asserted by test.

**An operational mistake, a compromised admin account, or a mis-click cannot expose a capability where it has no legal basis.**

### Resolution strategies — a registry, not an enum

Which policy version governs a long-lived record is a **legal** question, and the set of answers is open. `AT_CREATION`, `AT_EVALUATION`, and `MOST_RESTRICTIVE` are registered at launch; others can be added without touching the resolver.

> **No default is invented. An unspecified strategy is a load-time error.**

### Subject-elected policy — `SubjectPolicyProfile`

Some variation is neither geographic, legal-regime, nor legal-person: it is **elected by the subject**. Two customers in Qatar, same entity, same pack, can legitimately require different Zakat calculations — nisab basis, valuation convention, treatment of doubtful portions, calendar.

The same shape appears in accounting-basis choices, fiscal-year conventions, and risk-tolerance bands.

1. A profile may only select **among options the pack permits**. Same restrict-only invariant.
2. Its version is **pinned at record creation**.
3. Provenance records it (ADR-0011).
4. Where a capability declares no elective options, the profile is absent and costs nothing. **This is the common case.**

## Consequences

**Positive**

- Legal rules are diffable, reviewable, testable, and staged.
- Operators retain an instant kill switch without gaining the power to expand legal scope.
- The strategy registry means a new legal position is an implementation, not a resolver change.
- Subject-elected variation is representable without a fourth policy system.

**Negative — accepted**

- A capability launch in a new jurisdiction requires a deploy. **This is intended** — it is the control.
- Two places to look when answering "what applies here?", mitigated by `EffectivePolicy` being the only thing use cases consult.
- Packs must be complete; incompleteness fails at load rather than at runtime, which is louder but earlier.

## Alternatives rejected

**All policy in the database.** Rejected: legal rules would be changeable without review, diff, or test, by anyone with operator access. This is the failure the restrict-only invariant exists to prevent.

**All policy in code.** Rejected: no instant kill switch. When a provider fails or a legal question arises, waiting for a deploy is unacceptable.

**Settings that can both restrict and expand.** Rejected: it makes the code pack advisory. The entire value is that the ceiling is reviewed.

**A closed enum of resolution strategies.** Rejected: it presumes the legal question has a known, finite answer set. It does not.

**A default resolution strategy.** Rejected: a default is a legal position taken by whoever wrote the fallback branch.

**A separate ADR (0026) for subject-elected policy.** Rejected: it is the same decision about where policy lives and how it is versioned and pinned. Splitting it would create two places to look for one rule, violating the consolidation principle. **0026 is deliberately unused.**
