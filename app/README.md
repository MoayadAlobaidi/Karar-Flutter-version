# Flutter client

The consumer application. **Performs no authoritative financial math** (ADR-0007) — it renders values the platform computed.

Adding a capability adds a folder under `lib/features/` and a route. **Nothing else.** If a capability requires editing the shell, the seam is wrong.

## Import rules

Consumes the generated Dart SDK. Never talks to the database.

---

_Phase 0: this directory is a skeleton. No application code exists yet._
