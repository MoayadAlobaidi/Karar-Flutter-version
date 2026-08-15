# sealed-vault — Presentation layer

HTTP controllers, request/response DTOs, OpenAPI decorators, and capability guards.

Thin by design: validate, resolve context, call one use case, map the result. **Business logic in a controller is a bug** (architecture test 6).

## Import rules

May import this module's `application/`. **Never another module's `domain/`.**

---

_Phase 0: this directory is a skeleton. No application code exists yet._
