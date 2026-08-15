# ADR-0001 — Clean Architecture and the Dependency Rule

**Status:** ACCEPTED · **Phase:** 1

## Context

Karar is a financial platform intended to outlive several framework generations, several providers, and at least one deployment topology. It must remain testable without cloud infrastructure and comprehensible to engineers joining a solo-to-small team.

The dominant failure mode in systems of this kind is not bad code — it is business logic that becomes inseparable from the framework that hosted it, so that changing an ORM, a provider, or a runtime means rewriting the rules.

## Decision

**Source-code dependencies point only inward.**

- `domain/` — entities, value objects, invariants. Imports `shared-kernel` and **nothing else**.
- `application/` — use cases and the **ports** they declare. No framework, no concrete adapter.
- `infrastructure/` — implementations: ORM, providers, storage. **The only layer naming a vendor.**
- `presentation/` — HTTP. Thin.

**Enforced by the compiler and CI, not by convention:** `domain/` and the pure packages declare **zero framework dependencies**, so a forbidden import does not resolve. Lint boundary rules and architecture tests catch the rest.

## Consequences

**Positive**

- The financial engine is testable with no database, container, or mocks.
- Providers, ORM, and runtime are replaceable without touching business rules.
- The sealed vault can be extracted into its own process without changing a use case.
- Onboarding is structural: every module has the same shape.

**Negative — accepted**

- More files per feature than a framework tutorial would produce.
- Explicit mapping between domain objects, persistence models, and DTOs — three shapes, deliberately.
- Indirection when reading: finding a port's implementation means following an interface.

## Alternatives rejected

**Layered/N-tier with a shared service layer.** Rejected: it permits inward dependencies on the framework, which is the exact failure mode. The legacy demonstrates the cost — an AI categorisation path that calls a provider directly, bypassing logging, metrics, provenance, and rate limiting, because nothing structurally prevented it.

**Hexagonal without a distinct domain layer.** Rejected: without a framework-free domain, purity is a habit rather than a compile error, and habits do not survive schedule pressure.

**Convention plus code review.** Rejected: a layering rule that lives in a wiki decays. **A test nobody enforces enforces nothing.**

**Vertical slices with no shared layering.** Rejected: it optimises for adding features and penalises the cross-cutting policy, classification, and audit concerns that dominate this platform.
