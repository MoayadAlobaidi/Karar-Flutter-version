# jurisdiction — Application layer

Use cases (assign/end user and tenant jurisdiction, effective-state reads,
pack activation/retirement over the append-only ledger), the ports this
module declares inward (PolicyService, IdSource, repositories), the audit
trail, and the typed error vocabulary.

Orchestrates domain objects through ports. **May import `domain/` and this
directory; never `infrastructure/` or `presentation/`** (architecture test 2).

## Import rules

Ports declared under `application/ports/` are implemented by this module's
`infrastructure/` (architecture test 5) — except PolicyService, whose real
implementation is the RBAC workstream's; only `__tests__/fakes` fakes it.

---

_Phase 3.5: implemented — see the module sources in this directory._
