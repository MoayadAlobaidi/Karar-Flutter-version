# financial-connections — Presentation layer

HTTP controllers, request/response DTOs, OpenAPI decorators, and capability guards.

Thin by design: validate, resolve context, call one use case, map the result. **Business logic in a controller is a bug** (architecture test 6).

---

_No transport exists for this module yet. The HTTP surface and its composition belong to the API application; nothing here assumes one._
