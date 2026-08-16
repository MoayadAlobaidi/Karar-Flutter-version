# jurisdiction — Presentation layer

**Deliberately empty in Phase 3.5.** This module exposes NO HTTP surface:
assignments and pack activations are operator/system/seed-side use cases,
and the client reads its jurisdiction context through the authenticated
bootstrap endpoint another Phase 3.5 workstream owns (which consumes this
module's public API server-side). Operator HTTP surfaces arrive with the
control plane (Phase 8) behind the permissions MODULE.md declares.

## Import rules

When a surface exists it may import this module's `application/`; never any
module's `domain/` (architecture test 6).

---

_Phase 3.5: no controllers by design — see MODULE.md "APIs exposed"._
