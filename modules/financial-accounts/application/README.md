# financial-accounts — Application layer

Use cases — one class per business operation — and the **ports** they declare.

Declares the interfaces it needs. **Never names an implementation.** Orchestrates domain objects, enforces authorization, re-checks capability availability (because HTTP is not the only caller), emits events, returns `Result`.

## Import rules

May import this module's `domain/`, its own ports, and `shared-kernel`. **Never `infrastructure/`.**

---

_This directory holds 19 production files. The rules above are enforced by the architecture tests, not by its emptiness._
