# transfer-matching — Domain layer

Entities, aggregates, value objects, domain events, and invariants.

**May import `shared-kernel` and nothing else.** No framework, no ORM, no HTTP, no clock, no randomness, no filesystem, no network.

Time arrives as an argument via `Clock`. A domain object is testable with no mocks, no container, and no database — because it has nothing to mock.

Two rules live here and nowhere else, and both are guarantees about what this module will **not** do:

- `equal-and-opposite.ts` holds **every numeric operation in the module** — one unary negation, deliberately concentrated so that "nothing here computes a total, a net figure, an insight or a category" is checkable. `__tests__/no-money-arithmetic.test.ts` pins it and refuses any other arithmetic anywhere in the module.
- `suggestion-window.ts` holds the window as a **named, versioned constant**, never a number typed at a call site. Every stored match records which window suggested it, so widening it later cannot silently reinterpret a question a person has already answered.

`transfer-match.ts` carries the two shapes that matter: `MatchCandidateSide`, which exists only while a suggestion is being decided and carries the amount and booking date the rule needs, and `MatchSide`, which is what a stored row holds — three fields, no amount, no date.

## Import rules

Imported by `application/` and `infrastructure/` within this module. **Never by another module.**
