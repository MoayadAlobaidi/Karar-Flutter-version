# transactions — Infrastructure layer

Implementations of the ports: Prisma repositories, provider adapters, storage, key management.

**This is the only layer that names a vendor.** It is also the only layer containing the ORM — no Prisma type escapes it (architecture test 4).

## Import rules

May import this module's `application/` ports and `domain/`, plus frameworks. **Never another module's internals.**

---

_Phase 5: implemented. Prisma repositories for the transaction aggregate and
the categorisation chain, the two account-scoped adapters
`modules/financial-accounts` consumes (record presence and record erasure), a
UUID v7 id source, and three LOCAL/TEST provider adapters that say what they
are — two hold key material in process memory, which production must not do,
and production binds the same ports to adapters over the platform's
key-management provider (ADR-0017). The third,
`LocalSyntheticRetentionDecisionProvider`, refuses to be constructed outside a
local environment at all: it carries no legal effect, so it must not be able
to govern real data._
