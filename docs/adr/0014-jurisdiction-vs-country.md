# ADR-0014 — Jurisdiction vs Country, and the business-branching prohibition

**Status:** ACCEPTED · **Phase:** 3.5

## Context

Plan v1 modelled country as a `CountryConfig` value object. That conflates two things that vary independently:

- **Country** — geography. Currency defaults, languages, formatting, addresses, phone numbers.
- **Jurisdiction** — the legal regime governing a person or record. Policy, consent, retention, rulesets, disclosure.

Usually 1:1, and not always: **UAE free zones (DIFC, ADGM) operate distinct legal regimes**, and a Qatari national resident in Saudi Arabia may fall under a different regime than nationality suggests.

Unpicking this after records exist means re-deriving the governing regime for every historical record from data that no longer distinguishes the two.

## Decision

**Jurisdiction is the policy key. Country is an attribute of a jurisdiction.**

Records with legal consequence pin `jurisdictionAtCreation` (with pack version, operating entity, and subject profile — ADR-0015, ADR-0024).

**The branching prohibition:**

> Country- or jurisdiction-keyed **business branching** outside `packages/jurisdiction-policy` is prohibited in `domain/`, `application/`, and `presentation/`.

| Permitted | Prohibited |
|---|---|
| Country codes in localization, currency and reference tables, address/phone formatting, seed data, test fixtures, ISO data | `if (country === 'QA')` / `switch (jurisdiction)` **that changes business behavior** |

Architecture test 12 targets **conditionals and pattern matches on country/jurisdiction identifiers in business layers** — not the appearance of a literal.

## Consequences

**Positive**

- Free zones and residency-vs-nationality mismatches are representable without a special case.
- Adding a jurisdiction adds an answer, not a branch.
- The rule is enforceable without false positives, so engineers trust it.

**Negative — accepted**

- Two concepts where teams are used to one, requiring explanation at onboarding.
- Jurisdiction resolution for an individual can be genuinely ambiguous, and the ambiguity is now visible rather than hidden — which is correct but is real work.

## Alternatives rejected

**Country as the policy key (v1).** Rejected: cannot express DIFC/ADGM, and cannot express residency-vs-nationality.

**Ban country-code literals outright.** Rejected deliberately: it would fire constantly on legitimate reference data and would train engineers to suppress the rule. **A test nobody trusts enforces nothing.**

**Allow branching but require a comment or annotation.** Rejected: annotations decay, and the point is that the branch should not exist.

**Resolve jurisdiction lazily at evaluation.** Rejected: it makes historical records unexplainable. Pinning is the whole mechanism.
