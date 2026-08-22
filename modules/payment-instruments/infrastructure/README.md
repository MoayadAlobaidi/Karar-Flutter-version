# payment-instruments — Infrastructure layer

Adapters that implement the ports the application layer declares: Prisma persistence, the local AES-256-GCM field-encryption provider, the local synthetic retention fixture, and the two adapters over `@karar/financial-accounts`' public API.

**Prisma types stop here** (architecture test 4). Every statement runs inside the platform's `withPrincipalContext` transaction, because RLS is the boundary and the principal context is what arms it.

Both local providers refuse to construct outside `KARAR_ENV=local`: they hold key material — or a labelled fixture with no legal effect — in process memory, and refusing to exist is the guarantee that a comment cannot give.

## Import rules

May import this module's `application/` ports and `domain/`. **Never imported by either.** Cross-module imports resolve through another module's `public-api.ts` only.
