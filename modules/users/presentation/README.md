# users — Presentation layer

HTTP controllers, request/response DTOs, OpenAPI decorators, and capability guards.

Thin by design: validate, resolve context, call one use case, map the result. **Business logic in a controller is a bug** (architecture test 6).

## Import rules

May import this module's `application/`. **Never another module's `domain/`.**

---

_This directory holds 5 production files. The rules above are enforced by the architecture tests, not by its emptiness._
