# control-plane — Domain layer

Entities, aggregates, value objects, domain events, and invariants.

**May import `shared-kernel` and nothing else.** No framework, no ORM, no HTTP, no clock, no randomness, no filesystem, no network.

Time arrives as an argument via `Clock`. A domain object is testable with no mocks, no container, and no database — because it has nothing to mock.

## Import rules

Imported by `application/` and `infrastructure/` within this module. **Never by another module.**

---

_Phase 3: the kill-switch slice is implemented (registry, CheckKillSwitch/OperateKillSwitch, the operation guard, the Prisma store). The Phase 8 gateway remains planned._
