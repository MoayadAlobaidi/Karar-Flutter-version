# Background entrypoint

Outbox relay, projection builders, and scheduled jobs. **A second entrypoint, not a second application** (ADR-0013) — it imports the same modules and calls the same use cases.

**Jobs call use cases.** A job cannot make a transition a human path could not.

## Import rules

May import `modules/*/public-api.ts` and `packages/*`. **Contains no duplicated business logic.**

---

_Phase 0: this directory is a skeleton. No application code exists yet._
