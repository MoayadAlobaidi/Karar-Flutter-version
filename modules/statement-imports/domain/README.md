# statement-imports — Domain layer

Entities, aggregates, value objects, and invariants.

**May import `shared-kernel` and nothing else.** No framework, no ORM, no HTTP, no clock, no randomness, no filesystem, no network.

Time arrives as an argument via `Clock`. A domain object is testable with no mocks, no container, and no database — because it has nothing to mock.

Three rules live here because nowhere else can hold them honestly:

- **`import-state.ts`** carries the legal-transition list as an explicit set of pairs rather than an ordering, because the moves that must be impossible are not backwards ones — `PARSING → COMMITTED` advances, and it writes a person's financial records from a file nobody read.
- **`normalization.ts`** refuses every genuinely ambiguous value instead of choosing a convention. An unreadable amount is a typed reason code, never a zero: zero is a real financial fact, and a column that is later summed must not conflate it with "we could not read this".
- **`reconciliation.ts`** compares only figures the FILE stated. Summing the rows to produce a "source" balance and then comparing it to itself is a control that cannot fail, which is the same thing as no control.

`HsfField` redacts itself on every accidental rendering path, and `SourceObjectRef` refuses a URI so no provider address ever reaches this layer.

## Import rules

Imported by `application/` and `infrastructure/` within this module. **Never by another module.**
