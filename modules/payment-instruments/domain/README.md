# payment-instruments — Domain layer

Entities, aggregates, value objects, domain events, and invariants.

**May import `shared-kernel` and nothing else.** No framework, no ORM, no HTTP, no clock, no randomness, no filesystem, no network.

Time arrives as an argument via `Clock`. A domain object is testable with no mocks, no container, and no database — because it has nothing to mock.

The most important property of this layer is a field that is not in it. `PaymentInstrument` has **no balance, no amount, no limit, no available figure and no currency**, and it may never gain one: a card is not a balance, and two virtual cards on one wallet are two instruments pointing at ONE account (ADR-0028). The only number here is the concurrency token.

The two values this layer refuses to let escape are `HsfField` (which redacts itself on every accidental rendering path) and the mask rule in `instrument-mask.ts`, which refuses a card number, an account number or a phone number **before** anything is encrypted — migration 0098's eight-byte ciphertext bound is the other half of the same guarantee, and neither half alone would do.

## Import rules

Imported by `application/` and `infrastructure/` within this module. **Never by another module.**
