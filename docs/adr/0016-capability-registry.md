# ADR-0016 — Capability Registry: compile-time, governance only

**Status:** ACCEPTED · **Phase:** 3.5

## Context

Karar is an extensible capability platform. It needs to answer, for any capability: who owns it, where is it legally cleared, which tenants may reach it, what does it require, and is it available to this caller right now.

It does **not** need a plugin system. Every substantial capability is a named bounded context with an owner.

## Decision

**A compile-time, typed registry that governs and does not resolve.**

- Each module declares a static `CapabilityDescriptor` in `<module>/capability.ts`. A build step collects them into a discriminated union.
- **No string-keyed lookup, no dynamic import, no runtime registration, no DI-by-name.**
- **Registering a capability wires nothing.** Wiring is ordinary NestJS module imports.

**Deny by default:**

> **A capability with no availability row is `DISABLED`. Code existing is never sufficient for exposure.**

**Every gate is AND:** declared jurisdiction → pack clearance → operating entity permitted and licensed → availability row → environment → tenant entitlement → subscription/cohort/flags → integrations and consent present.

**Every denial carries a machine-readable reason**, surfaced to admin and to the client as a typed state.

**Enforced twice** — at the controller boundary **and** inside the use case, because HTTP is not the only caller.

## Consequences

**Positive**

- The compiler knows every capability; a typo is a build error.
- "The partner must never see Amanat" is **structural** — it was never on, rather than switched off.
- A hidden capability is explainable rather than mysterious.
- Governance data (owner, classification, jurisdictions, licences) lives beside the code it describes.

**Negative — accepted**

- Adding a capability requires a deploy. Intended — the descriptor is reviewed code.
- The union grows with each capability, and every exhaustive switch over it must be updated. This is a feature: it surfaces every place that must consider the new capability.

## Alternatives rejected

**A plugin system with dynamic loading.** Rejected: it defeats the compiler, makes the dependency graph invisible, and turns a governance question into a runtime one. Karar has no third-party extension use case.

**Registry as a service locator / DI container.** Rejected: resolving dependencies by name hides the graph, which is the opposite of everything ADR-0001 buys.

**Database-only capability definitions.** Rejected: the descriptor carries legal clearance, classification, and ownership. These must be reviewed in a pull request, not edited in a form.

**Allow-by-default with explicit disabling.** Rejected on the legacy's evidence: its entitlement enforcement flag defaults false, so *"the paid-feature boundary is currently not a control."* **A boundary that must be switched on is a boundary that is off somewhere.**

**A single `features/` module for small capabilities.** Rejected: `features/`, `future/`, `services/`, and `misc/` are where bounded contexts go to die.
