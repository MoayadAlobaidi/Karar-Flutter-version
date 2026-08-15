# Application entrypoints

Each subdirectory is a deployable or buildable entrypoint: `mobile/` (Flutter client), `api/`, `worker/`, `admin/`. **All entrypoints live here — there is no singular `app/` directory.** Entrypoints contain no business logic — they compose modules and start an adapter (the mobile client consumes the generated SDK instead).

## Import rules

`apps/*` may import `modules/*` public APIs and `packages/*`. **Nothing imports an app.**

---

_Phase 1: minimal buildable entrypoints exist (mobile, api, worker, admin). No product capabilities are implemented._
