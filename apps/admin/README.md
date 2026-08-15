# Super Admin SPA

The administrative browser application. Talks to the **control plane** over HTTP and never to the database.

## Import rules

**Carries no database driver. CI-enforced.** May import the generated TypeScript SDK only.

---

_Phase 1: static Vite shell, no framework, no data access. `pnpm --filter @karar/admin dev`._
