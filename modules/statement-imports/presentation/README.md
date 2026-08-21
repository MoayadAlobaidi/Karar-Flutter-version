# statement-imports — Presentation layer

HTTP controllers, request/response DTOs, OpenAPI decorators, and capability guards.

Thin by design: validate, resolve context, call one use case, map the result. **Business logic in a controller is a bug** (architecture test 6).

---

_This directory is empty, and the module's transport is not missing: controllers live in the API application, and seven operations over six `/financial/statement-imports` paths are mounted in `apps/api/src/financial`. Mounting them was one commit with architecture test 24's activation, its limit-policy registration and the phase move, because `phase5-ingestion-not-mounted-early` fails the build on a controller that appears while the registry still reads an earlier phase._
