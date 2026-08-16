# authorization — Infrastructure layer

Implementations of the ports: Prisma repositories, provider adapters, storage, key management.

**This is the only layer that names a vendor.** It is also the only layer containing the ORM — no Prisma type escapes it (architecture test 4).

## Import rules

May import this module's `application/` ports and `domain/`, plus frameworks. **Never another module's internals.**

---

_Phase 3: implemented — the catalogue, RoleAssignment rules, the RbacPolicyService, AssignRole/RevokeRole, the permission guard, and the Prisma/audit adapters live here._
