# transfer-matching — Presentation layer

HTTP controllers, request/response DTOs, OpenAPI decorators, and capability guards.

Thin by design: validate, resolve context, call one use case, map the result. **Business logic in a controller is a bug** (architecture test 6).

---

_No transport exists for this module yet. The HTTP surface and its composition belong to the API application; nothing here assumes one. When one arrives, the rule it must carry is the module's own: a `SUGGESTED` match is a QUESTION and must be rendered as one — never as a fact, never folded into a figure, and never applied to what the person is shown they earned and spent until they have answered it._
