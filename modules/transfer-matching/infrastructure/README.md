# transfer-matching — Infrastructure layer

Adapters that implement the ports the application layer declares: Prisma persistence, the local synthetic retention fixture, and the two adapters over `@karar/transactions`' public API.

**Prisma types stop here** (architecture test 4). Every statement runs inside the platform's `withPrincipalContext` transaction, because RLS is the boundary and the principal context is what arms it.

There is **no field-encryption provider in this module**, and that is a fact about the table rather than an omission: `transfer_matches` holds no `HIGHLY_SENSITIVE_FINANCIAL` narrative at all — only identifiers, currency codes, a state and a decision instant — because a relationship between two transactions needs none. The narrative stays in the transactions the match relates, unchanged and unrewritten.

The local retention provider refuses to construct outside `KARAR_ENV=local`: it is a labelled fixture with no legal effect, and refusing to exist is the guarantee that a comment cannot give.

## Import rules

May import this module's `application/` ports and `domain/`. **Never imported by either.** Cross-module imports resolve through another module's `public-api.ts` only.
