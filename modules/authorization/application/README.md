# authorization — Application layer

Use cases — one class per business operation — and the **ports** they declare.

Declares the interfaces it needs. **Never names an implementation.** Orchestrates domain objects, enforces authorization, re-checks capability availability (because HTTP is not the only caller), emits events, returns `Result`.

## Import rules

May import this module's `domain/`, its own ports, and `shared-kernel`. **Never `infrastructure/`.**

---

_Phase 3: implemented — the catalogue, RoleAssignment rules, the RbacPolicyService, AssignRole/RevokeRole, the permission guard, and the Prisma/audit adapters live here._
