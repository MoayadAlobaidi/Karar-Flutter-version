# ADR-0004 — NestJS + strict TypeScript backend

**Status:** ACCEPTED · **Phase:** 1

## Context

The backend must enforce Clean Architecture structurally, share a language with the generated SDK and admin SPA, and be maintainable by a very small team. The legacy system is Java/Spring Boot — a competent choice that produced a working platform, so the decision to change languages needs a reason beyond preference.

## Decision

**NestJS with TypeScript in strict mode.**

- `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`.
- **No `any`.** `unknown` at boundaries, narrowed explicitly.
- Nest is confined to `infrastructure/` and `presentation/`. **`domain/` and `application/` contain no Nest symbol.**
- Runtime validation at every boundary (`zod` or equivalent), because types vanish at runtime.

## Consequences

**Positive**

- One language across backend, generated TS SDK, and admin SPA.
- Nest's module system maps cleanly onto bounded contexts and makes wiring explicit.
- Decorators give a natural place for `@RequiresCapability` at the controller boundary.
- Strict TypeScript makes `Money`, branded IDs, and `Result` enforceable at compile time.

**Negative — accepted**

- Nest's DI is decorator-based and tempts framework types inward. Countered by architecture tests 1 and 2.
- TypeScript's type erasure means runtime validation is mandatory, not optional.
- `bigint` ergonomics are worse than a decimal library's. Accepted, because correctness beats convenience (ADR-0006).

## Alternatives rejected

**Java / Spring Boot (the legacy stack).** Rejected: it would require a second language across the stack, and a second set of tooling for a team of one to maintain. The legacy's problems were not caused by Java and would not be solved by leaving it — but there is no reason to carry a second ecosystem when the client, SDK, and admin are already TypeScript.

**Fastify or Express directly.** Rejected: modules, DI, and lifecycle would be hand-rolled. That work is real, and Nest's version of it is well understood.

**Go.** Rejected: excellent for services, but it would split the stack's language and lose the shared contract types.

**TypeScript without strict mode.** Rejected outright. Non-strict TypeScript provides the appearance of type safety in exactly the places — optional fields, index access — where financial code fails.
