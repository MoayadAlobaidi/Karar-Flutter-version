# Pure and shared packages

Framework-free packages. `shared-kernel`, `financial-engine`, `jurisdiction-policy`, `state-machine` and `content-trust` declare **zero framework dependencies** — a forbidden import does not resolve. That list is the `PURE_PACKAGES` tier in `scripts/checks/architecture.mjs`, and the checker is what decides it.

## Import rules

Importable by anything. **These packages import nothing but each other and `shared-kernel`.**

---

_Implementations arrive with their phases; several packages are still scaffolds with placeholder types and tests, and several are not._
