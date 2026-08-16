# control-plane — Presentation layer

HTTP controllers, request/response DTOs, OpenAPI decorators, and capability guards.

Thin by design: validate, resolve context, call one use case, map the result. **Business logic in a controller is a bug** (architecture test 6).

## Import rules

May import this module's `application/`. **Never another module's `domain/`.**

---

_Phase 3: the kill-switch slice is implemented (registry, CheckKillSwitch/OperateKillSwitch, the operation guard, the Prisma store). The Phase 8 gateway remains planned._
