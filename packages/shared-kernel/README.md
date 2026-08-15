# The nine universals

`Money` · `Currency` · `Percentage` · `ExchangeRate` · `Clock` · `Result` · `DomainEvent` · `TenantId` · `UserId`

Nothing else. **CI caps the export surface** (architecture test 20); additions require an ADR.

Admission rule: a type belongs here only if a module that has never heard of any other module still needs it.

## Import rules

Importable by everything. Imports nothing.

---

_Phase 0: this directory is a skeleton. No application code exists yet._
