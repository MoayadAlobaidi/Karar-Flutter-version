# transactions — Presentation layer

HTTP controllers, request/response DTOs, OpenAPI decorators, and capability guards.

Thin by design: validate, resolve context, call one use case, map the result. **Business logic in a controller is a bug** (architecture test 6).

## Import rules

May import this module's `application/`. **Never another module's `domain/`.**

---

_This directory is empty. The module holds production code in its other layers, and its controllers live in the API application: `apps/api/src/financial/financial-transactions.controller.ts` and `financial-transaction-detail.controller.ts` mount eight operations over five `/financial/transactions` paths._
