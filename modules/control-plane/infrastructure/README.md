# control-plane — Infrastructure layer

Implementations of the ports: Prisma repositories, provider adapters, storage, key management.

**This is the only layer that names a vendor.** It is also the only layer containing the ORM — no Prisma type escapes it (architecture test 4).

## Import rules

May import this module's `application/` ports and `domain/`, plus frameworks. **Never another module's internals.**

---

_Phase 3: the kill-switch slice is implemented (registry, CheckKillSwitch/OperateKillSwitch, the operation guard, the Prisma store). The Phase 8 gateway remains planned._
