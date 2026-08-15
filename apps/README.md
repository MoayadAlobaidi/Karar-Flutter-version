# Application entrypoints

Each subdirectory is a deployable or buildable entrypoint. **Entrypoints contain no business logic** — they compose modules and start an adapter.

## Import rules

`apps/*` may import `modules/*` public APIs and `packages/*`. **Nothing imports an app.**

---

_Phase 0: this directory is a skeleton. No application code exists yet._
