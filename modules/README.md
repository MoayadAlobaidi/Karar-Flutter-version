# Bounded contexts

One directory per bounded context, each with the same shape: `public-api.ts`, `capability.ts`, `MODULE.md`, `permissions.ts`, and the four layers.

**Every module directory must contain a `MODULE.md`** — architecture test 16 fails without one.

There is no `features/`, `future/`, `services/`, or `misc/` module. Those are where bounded contexts go to die.

## Import rules

**Cross-module imports resolve to `public-api.ts` and nothing else.** Reaching into another module's `domain/`, `application/`, or `infrastructure/` fails CI.

---

_Phase 1: documentation only (`MODULE.md` per module). Module code begins at Phase 2._
