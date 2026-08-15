# A ~100-line pure helper

States, allowed transitions, guards, and an audit hook. **No persistence, no orchestration, no BPM engine.**

Extraction trigger for a shared Case Management capability is documented in `docs/architecture/extension-pattern.md`.

## Import rules

May import `shared-kernel`. Zero framework dependencies.

---

_Phase 1: transition-table primitive only. The full engine arrives in Phase 2._
