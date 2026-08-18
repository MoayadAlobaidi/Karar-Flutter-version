# transactions — Infrastructure layer

Implementations of the ports: Prisma repositories, provider adapters, storage, key management.

**This is the only layer that names a vendor.** It is also the only layer containing the ORM — no Prisma type escapes it (architecture test 4).

## Import rules

May import this module's `application/` ports and `domain/`, plus frameworks. **Never another module's internals.**

---

_Phase 5: implemented. Prisma repositories for the transaction aggregate and
the categorisation chain, a UUID v7 id source, and two LOCAL/TEST provider
adapters that say what they are — both hold key material in process memory,
which production must not do; production binds the same ports to adapters over
the platform's key-management provider (ADR-0017)._
