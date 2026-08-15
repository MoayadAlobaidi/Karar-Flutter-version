# The one authoritative financial engine

All authoritative financial math (ADR-0007). Pure: no I/O, no clock read, no randomness, no framework. Owns `FinancialPeriod`, because calendar boundaries are business rules rather than universals.

**Jurisdiction differences enter as typed policy inputs, never as branches.**

## Import rules

May import `shared-kernel`. **Imports nothing else.**

---

_Phase 1: package boundary and build only. The engine arrives in Phase 2._
