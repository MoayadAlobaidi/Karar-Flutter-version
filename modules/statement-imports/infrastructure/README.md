# statement-imports — Infrastructure layer

Implementations of the ports: the streaming CSV parser, the Prisma repositories, the local encrypted-source store, the local retention fixture, and the adapters over other modules' public APIs.

**This is the only layer that names a vendor.** It is also the only layer containing the ORM — no Prisma type escapes it (architecture test 4) — and every cross-module import in this module lives in `adapters/`, targeting `@karar/transactions`, `@karar/financial-accounts` and `@karar/financial-connections` through their `public-api.ts` and nothing deeper.

`parsing/` holds the streaming parser. It buffers no whole file, enforces the central limit policy from `@karar/platform`'s ingestion limits at runtime, and refuses rather than truncates.

`providers/` holds the LOCAL/TEST encrypted-source store and the LOCAL retention fixture. Both refuse to construct outside `KARAR_ENV=local`, and both resolver functions throw rather than substitute in any other environment — there is no fallback and no "temporarily use the local one".

## Import rules

May import this module's `application/` ports and `domain/`, plus frameworks. **Never another module's internals.**
