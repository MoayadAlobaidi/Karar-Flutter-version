# operating-entity — Presentation layer

HTTP controllers, request/response DTOs, OpenAPI decorators, and capability guards.

Thin by design: validate, resolve context, call one use case, map the result. **Business logic in a controller is a bug** (architecture test 6).

## Import rules

May import this module's `application/`. **Never another module's `domain/`.**

---

_Phase 3: deliberately empty. Entity administration is a Super Admin surface
(operating-entity.md §10) and mounts behind the control-plane gateway when
that phase lands (ADR-0021) — the authorized use cases exist in
`application/use-cases/`, and the authored contract for the deferred surface
is `packages/api-contracts/openapi/paths/operating-entity.yaml`. Decision
recorded in [`../MODULE.md`](../MODULE.md)._
