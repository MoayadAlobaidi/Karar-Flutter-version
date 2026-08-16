# jurisdiction — Domain layer

Entities, value objects, and invariants: assignment history with the
source/verification axes, the typed effective-jurisdiction state
(NONE | UNVERIFIED | VERIFIED — the capability resolver's fail-closed input),
and the activation-ledger derivation.

**May import `shared-kernel` and the pure packages (here:
`@karar/jurisdiction-policy`) and nothing else.** No framework, no ORM, no
HTTP, no clock, no randomness, no filesystem, no network. Time arrives as an
argument.

## Import rules

Imported by `application/` and `infrastructure/` within this module. **Never
by another module.**

---

_Phase 3.5: implemented — see the module sources in this directory._
