# ADR-0017 — `SEALED` classification, grant-gated vault, extractable boundary, key escrow

**Status:** ACCEPTED · **Phase:** 13 (build), 20 (extraction, custody, canary gates)
**Amended:** after the Phase 0.2 legacy audit, to add key escrow, rotation, and the integrity canary; refined in Phase 0.5 to make key custody **provider-independent** — no single cloud's escrow product is mandated.

## Context

Amanat records confidential obligations disclosed only after death, verification, a waiting period, and human approval. This data is more sensitive than ordinary financial data in a way that is **categorical, not gradual**: it must be inaccessible **to Karar itself** until specific conditions are met.

Karar's five existing classifications all assume authorized staff can, with permission and audit, read the data. That assumption is exactly what must not hold here.

## Decision

### A sixth classification

`SEALED` — never projected, never in events, never in logs, never in analytics (**not even aggregates**), never readable by support or admin, never consumed by AI, not searchable.

### A grant as a required argument

```ts
read(ref: SealedPayloadRef, grant: SealAccessGrant): Promise<SealedPayload>
```

**There is no overload without a grant.** Minting one is an audited, policy-checked, approval-bearing operation. **Compiler-enforced, not policy-enforced.**

Grant types: `OWNER` · `DISCLOSURE` · `LEGAL_ORDER`. **Never `SUPPORT`, `ADMIN`, `ANALYTICS`, or `AI`** — these do not exist as types.

### Metadata / payload split

Lifecycle is queryable; substance is not. The platform can answer *"how many records are pending disclosure"* with no capacity to read one. **The amount is sealed.**

### Extractable from the first implementation

Network-capable port surface, **no participation in the caller's transaction**, idempotent with caller-supplied keys, no shared state or pool. The write path is therefore a saga with outbox-driven compensation.

**Gate:** extracted into a dedicated security boundary **before any production `SEALED` data exists**.

### Key custody, recovery, rotation, and the canary — provider-independent

Custody is expressed as three **provider-independent** policies, implemented by whichever key-management provider a deployment profile selects. **No single cloud's escrow product is mandated** — a deployment on a different provider satisfies the same policies with different infrastructure:

| Policy | Declares |
|---|---|
| `KeyCustodyStrategy` | Where KEK material and its second copy live, and under whose split control — no single operator can reconstruct a KEK alone |
| `KeyRecoveryPolicy` | The documented, rehearsed, **timed** recovery procedure and its separation of duties |
| `KeyRotationPolicy` | Rotation cadence and mechanics — designed in from Phase 2, not retrofitted |

**Before any production `SEALED` data exists, all of the following hold:**

- custody strategy selected and implemented
- rotation tested
- recovery documented **and the drill rehearsed and timed**
- separation of duties defined
- **sealed-integrity canary operational** — a synthetic sealed record per jurisdiction-KEK holding **known plaintext containing no customer data**, decrypted on a schedule, alerting on failure
- monitoring operational
- key and version **provenance recorded** for every wrap and rotation

## Consequences

**Positive**

- A developer cannot accidentally read sealed data — the code does not compile.
- A SQL-level mistake returns nothing rather than ciphertext (RLS grant GUC).
- The vault can move to its own process without touching a use case.
- Key loss becomes **detectable**, which it otherwise is not.

**Negative — accepted**

- **No search over sealed content.** A deliberate capability sacrifice; an index would be an unsealed copy.
- **No atomic write** across metadata and payload. The saga's failure mode is loss of a record, never exposure of one.
- Support cannot diagnose content issues. That is the point.
- Escrow and canary are real operational burden, gated before production.

## Alternatives rejected

**Reuse `HIGHLY_SENSITIVE_FINANCIAL` with stricter permissions.** Rejected: permissions can be granted. The requirement is that no permission exists which would allow the read.

**Encrypt inside Amanat.** Rejected: guarantees a second, divergent implementation for the next sealed capability.

**Client-side-only encryption with a customer-held key.** Genuinely considered — it is the strongest confidentiality model. Rejected because **post-mortem disclosure is the capability's entire purpose**, and a key only the deceased holds cannot be used to fulfil it. The trade-off is recorded here so it is not re-proposed without addressing that.

**Grant as an optional parameter or an ambient context value.** Rejected: optional means forgettable, and ambient means invisible. A required argument is the only version the compiler enforces.

**Escrow deferred to post-launch.** Rejected on the legacy's evidence — **ENC-2: the production key "has already been lost once."** For sealed data, loss is unrecoverable *and* undetectable, discovered at the worst possible moment.
