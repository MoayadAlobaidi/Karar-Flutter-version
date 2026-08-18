# financial-connections — Domain layer

Entities, aggregates, value objects, domain events, and invariants.

**May import `shared-kernel` and nothing else.** No framework, no ORM, no HTTP, no clock, no randomness, no filesystem, no network.

Time arrives as an argument via `Clock`. A domain object is testable with no mocks, no container, and no database — because it has nothing to mock.

The two values this layer refuses to let escape are `HsfField` (which redacts itself on every accidental rendering path) and the source-account reference rule in `external-account-reference.ts`, which refuses a full account number, IBAN, PAN or wallet phone number **before** anything is encrypted — a byte bound on a ciphertext cannot tell those apart from an opaque provider reference, so the rule has to live here.

## Import rules

Imported by `application/` and `infrastructure/` within this module. **Never by another module.**
