# transactions — Application layer

Use cases — one class per business operation — and the **ports** they declare.

Declares the interfaces it needs. **Never names an implementation.** Orchestrates domain objects, enforces authorization, re-checks capability availability (because HTTP is not the only caller), emits events, returns `Result`.

## Import rules

May import this module's `domain/`, its own ports, and `shared-kernel`. **Never `infrastructure/`.**

---

_Phase 5: implemented. Six use cases (list, create, read, update, delete,
assign category), none of whose inputs carry a `userId` or a `tenantId` — the
principal arrives through `PrincipalContextPort`. Two of the ports here exist
for the statement-ingestion workstream to bind: `DedupFingerprintPort` (keyed
per subject and versioned, never a plain hash of predictable fields) and
`HsfFieldEncryptionPort`._
