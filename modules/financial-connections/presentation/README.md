# financial-connections — Presentation layer

HTTP controllers, request/response DTOs, OpenAPI decorators, and capability guards.

Thin by design: validate, resolve context, call one use case, map the result. **Business logic in a controller is a bug** (architecture test 6).

---

_This directory is empty; the module's two read operations are mounted in `apps/api/src/financial/financial-views.controller.ts`. The HTTP surface and its composition belong to the API application; nothing here assumes one._
