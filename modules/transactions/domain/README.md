# transactions — Domain layer

Entities, aggregates, value objects, domain events, and invariants.

**May import `shared-kernel` and nothing else.** No framework, no ORM, no HTTP, no clock, no randomness, no filesystem, no network.

Time arrives as an argument via `Clock`. A domain object is testable with no mocks, no container, and no database — because it has nothing to mock.

## Import rules

Imported by `application/` and `infrastructure/` within this module. **Never by another module.**

---

_Phase 5: implemented. `refs.ts` declares the cross-module reference types (an
`AccountRef` is a raw UUID plus a locally-declared kind — never the
financial-accounts module's own identifier type). `sign-convention.ts` states
the one canonical sign rule and why it was chosen. `transaction.ts`,
`revision.ts`, `provenance.ts`, `category-catalogue.ts` and
`category-assignment.ts` carry the rest. `hsf-field.ts` holds
`HIGHLY_SENSITIVE_FINANCIAL` text as a value that redacts on every accidental
rendering path; encryption at rest is an infrastructure concern behind a port._
