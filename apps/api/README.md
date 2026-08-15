# HTTP entrypoint

Serves consumer, admin, and partner surfaces. Boots the root module and starts the HTTP adapter.

## Import rules

May import `modules/*/public-api.ts` and `packages/*`. Contains no domain logic.

---

_Phase 1: boots NestJS on Fastify and serves `/healthz` and `/readyz` placeholders only. `pnpm --filter @karar/api dev`._
