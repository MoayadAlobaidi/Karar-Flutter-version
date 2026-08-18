# financial-connections — Infrastructure layer

Implementations of the ports: Prisma repositories, the local encryption and fingerprint providers, and the two adapters over `@karar/financial-accounts`' public API — the canonical-account reader this module needs, and the source-link eraser that module's `AccountSourceLinkEraserPort` needs.

**This is the only layer that names a vendor.** It is also the only layer containing the ORM — no Prisma type escapes it (architecture test 4), and every cross-module import in this module lives in `adapters/`, targeting `@karar/financial-accounts`' `public-api.ts` and nothing deeper.

## Import rules

May import this module's `application/` ports and `domain/`, plus frameworks. **Never another module's internals.**
