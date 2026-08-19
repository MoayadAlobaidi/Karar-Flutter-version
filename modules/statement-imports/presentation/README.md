# statement-imports — Presentation layer

HTTP controllers, request/response DTOs, OpenAPI decorators, and capability guards.

Thin by design: validate, resolve context, call one use case, map the result. **Business logic in a controller is a bug** (architecture test 6).

---

_No transport exists for this module yet, deliberately. Mounting an ingestion route is a separate, later commit: architecture test 24 (resource limits) activates at phase 5, and the `phase5-ingestion-not-mounted-early` control fails the build on a controller that appears while the registry still reads an earlier phase. The route, its limit-policy registration and the phase move belong in one commit._
