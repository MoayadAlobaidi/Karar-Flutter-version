# provider-capabilities — Presentation layer

HTTP controllers, request/response DTOs, OpenAPI decorators, and capability guards.

Thin by design: validate, resolve context, call one use case, map the result. **Business logic in a controller is a bug** (architecture test 6).

---

_No transport exists for this module, and when one arrives it is a **reviewer** surface rather than a customer one. A capability profile says what a document claims an interface might one day offer; it has never told a user anything and must not start. The rule any future surface carries: no screen may render a described rail, an access stage, or a `VERIFIED` assertion as available, supported, connected or synced — what a person may actually do is decided by `modules/financial-connections`, where only `MANUAL` and `USER_FILE_UPLOAD` exist._
