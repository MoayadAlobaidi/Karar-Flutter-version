# ADR-0010 — AI provider abstraction; AI is never the source of financial truth

**Status:** ACCEPTED · **Phase:** 7

## Context

AI is central to Karar's product experience and peripheral to its correctness. Model availability is regional and changes; providers have outages; and cross-border AI processing is the largest data-residency exposure the platform has.

The legacy is instructive twice over. Its architecture is right — figures are computed in code before the model sees them, and the system prompt forbids inventing any amount. Its failures were elsewhere: a categorisation path that **called the provider directly**, bypassing usage logging, token metrics, provenance, and per-user rate limiting (AI-4), and sending statement narratives with **no consent check** (P6). One convenience shortcut disabled four controls at once.

## Decision

**`AiProvider` is a port.** No vendor SDK appears outside `infrastructure/providers/` (architecture test 10).

**AI is never the source of financial truth:**

- The model receives `VerifiedFinancialFacts`, never raw transactions (ADR-0019).
- **The model never writes a number.**
- **The deterministic result is always returned to the user, regardless of AI outcome.**
- **`SEALED` data is structurally excluded** — `AiContext`'s input types cannot hold it.

**One path, no bypasses.** Every AI call routes through the orchestrator. **No module calls a provider directly.**

**Tools call use cases**, under the caller's authorization, through the same capability gates as HTTP. **There is no `executeSql()` under any name.**

## Consequences

**Positive**

- Provider replaceable in an afternoon; a second provider is a configuration and adapter change.
- Model region is per-tenant configuration, so a residency requirement becomes configuration rather than a rewrite.
- Usage, cost, provenance, rate limiting, and consent are enforced in exactly one place.
- `MockAiProvider` makes local development and tests deterministic and free.

**Negative — accepted**

- The port is the lowest common denominator across providers; provider-specific features need deliberate exposure.
- Routing everything through one orchestrator adds a hop.

## Alternatives rejected

**Direct provider SDK use in modules.** Rejected on the legacy's evidence — this is precisely AI-4.

**AI computes figures and the platform validates them.** Rejected: validation is exactly as leaky as the validator, and the legacy's guard *"ignores any number the model does not mark with a currency or percent token"* (AI-7). See ADR-0019.

**AI with database access, read-only.** Rejected categorically. A read-only SQL tool is an unbounded data-exfiltration surface and would make sealed exclusion unenforceable.

**Single provider, no abstraction.** Rejected: the legacy has one provider and no fallback, and its AI feature *"does not function"* without it.
