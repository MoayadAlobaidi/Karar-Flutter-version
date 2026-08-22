# The ten universals

`Money` · `CalendarDay` · `Currency` · `Percentage` · `ExchangeRate` · `Clock` · `Result` · `DomainEvent` · `TenantId` · `UserId`

Nothing else. **CI caps the export surface** (architecture test 20); additions require an ADR. The tenth, `CalendarDay`, was admitted by [ADR-0027](../../docs/adr/0027-calendar-day-and-instant.md) with Platform Owner approval, for one distinction: a calendar day is not an instant. The cap is ten, and an eleventh needs the same route.

Admission rule: a type belongs here only if a module that has never heard of any other module still needs it.

## Import rules

Importable by everything. Imports nothing.

---

_Phase 1: the nine declarations exist as types in `src/index.ts`. Semantics arrive in Phase 2._
