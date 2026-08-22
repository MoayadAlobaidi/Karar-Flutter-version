# users — Domain layer

Entities, aggregates, value objects, domain events, and invariants.

**May import `shared-kernel` and nothing else.** No framework, no ORM, no HTTP, no clock, no randomness, no filesystem, no network.

Time arrives as an argument via `Clock`. A domain object is testable with no mocks, no container, and no database — because it has nothing to mock.

## Import rules

Imported by `application/` and `infrastructure/` within this module. **Never by another module.**

---

_This directory holds 1 production file. The rules above are enforced by the architecture tests, not by its emptiness._
