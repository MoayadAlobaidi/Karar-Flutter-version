# statement-imports — Application layer

Use cases — one class per business operation — and the **ports** they declare.

Declares the interfaces it needs. **Never names an implementation.** Orchestrates domain objects, enforces the gates, returns `Result`.

Two ports carry the module's central claims. `StatementRetentionDecisionPort` is asked, and answered `DECIDED`, **before** `EncryptedSourceStorePort` is called for the first time — that ordering is the whole of "retention decides before the first durable source byte", and the database enforces the same thing from the other side. `CanonicalTransactionCommitPort` is how staged rows become financial records: declared here, satisfied by an adapter over `@karar/transactions`' public API, and never called from anywhere but `CommitStatementImport`.

Deduplication reuses that module's `DedupFingerprintPort` through the same seam. **There is no second fingerprint algorithm in this module and there must never be one** — two definitions of "the same transaction" disagree, and the disagreement surfaces as duplicated or vanished financial records.

## Import rules

May import this module's `domain/`, its own ports, and `shared-kernel`. **Never `infrastructure/`.**
