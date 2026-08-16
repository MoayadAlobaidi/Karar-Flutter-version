# jurisdiction — Infrastructure layer

Prisma adapters for the ports declared in `application/ports/`: the
assignment repositories (every statement inside a `withPrincipalContext`
transaction — the assignment tables are RLS-FORCEd), the reference-register
directory and settings reader (SELECT-only tables), the append-only
activation ledger, and the UUIDv7 id source.

## Import rules

May import this module's `application/` and `domain/`, and `@karar/platform`.
Prisma types never leave this directory (architecture test 4). **Never
imported by another module** — the composition root wires these.

---

_Phase 3.5: implemented — see the module sources in this directory._
