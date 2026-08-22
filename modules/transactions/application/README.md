# transactions — Application layer

Use cases — one class per business operation — and the **ports** they declare.

Declares the interfaces it needs. **Never names an implementation.** Orchestrates domain objects, enforces authorization, re-checks capability availability (because HTTP is not the only caller), emits events, returns `Result`.

## Import rules

May import this module's `domain/`, its own ports, and `shared-kernel`. **Never `infrastructure/`.**

---

_Phase 5: implemented. Six use cases (list, create, read, update, delete,
assign category), none of whose inputs carry a `userId` or a `tenantId` — the
principal arrives through `PrincipalContextPort`._

_The ports here fall into three groups. **Bound elsewhere, refused through:**
`TransactionRetentionDecisionPort` (no durable write without a decision) and
`FinancialAccountAccessPort` (an account this principal actually owns, in the
account's own currency) — both consulted before the fingerprint, before any
encryption, and before the first write. **Bound by the statement-ingestion
workstream:** `DedupFingerprintPort` (keyed per subject, versioned, over
CONTENT only — occurrence is a separate column) and `HsfFieldEncryptionPort`.
**Declared here and implemented here for another module:**
`FinancialRecordPresencePort` and `FinancialRecordEraserPort`, which is how
`modules/financial-accounts` reaches these records without importing this
module._
