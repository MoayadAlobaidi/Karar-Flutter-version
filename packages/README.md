# Pure and shared packages

Framework-free packages. `shared-kernel`, `financial-engine`, `jurisdiction-policy`, and `state-machine` declare **zero framework dependencies** — a forbidden import does not resolve.

## Import rules

Importable by anything. **These packages import nothing but each other and `shared-kernel`.**

---

_Phase 1: package scaffolds exist with placeholder types and tests. Implementations arrive with their phases._
