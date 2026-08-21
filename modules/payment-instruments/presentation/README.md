# payment-instruments — Presentation layer

HTTP controllers, request/response DTOs, OpenAPI decorators, and capability guards.

Thin by design: validate, resolve context, call one use case, map the result. **Business logic in a controller is a bug** (architecture test 6).

---

_This directory is empty; the module's one mounted operation lives in `apps/api/src/financial/financial-views.controller.ts`. The HTTP surface and its composition belong to the API application; nothing here assumes one. When one arrives, the rule it must carry is the module's own: a screen may list a person's instruments beside an account, and it may never render a figure against one — the balance belongs to the account, and two cards on one wallet share it._
