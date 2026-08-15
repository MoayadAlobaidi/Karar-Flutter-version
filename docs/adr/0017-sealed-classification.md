# ADR-0017 — `SEALED` classification, grant-gated vault, extractable boundary, key custody

**Status:** ACCEPTED · **Phase:** 13 (build), 20 (extraction, custody, canary gates)
**Amended:** after the Phase 0.2 legacy audit, to add key custody, rotation, and the integrity canary; refined in Phase 0.5 and the pre-merge pass to make custody **provider-independent and outcome-based** — no single custody model (escrow, BYOK, HSM, managed KMS) is universally mandated.

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

Custody is expressed as three **provider-independent** policies, implemented by whichever key-management provider a deployment profile selects. **No single implementation model is mandated** — in particular, it is **not** universally required that raw managed-KMS key material be exportable or reconstructable. A custody strategy may be:

```
CLOUD_KMS_MANAGED
BYOK_IMPORTED_WITH_EXTERNAL_CUSTODY
EXTERNAL_KEY_MANAGER
HSM_MANAGED
```

or another approved model (names illustrative).

| Policy | Declares |
|---|---|
| `KeyCustodyStrategy` | Which custody model applies, where key material lives, and the **separation of duties appropriate to that model** — for a BYOK/external model that may mean split-controlled external material; for a managed-KMS model it means IAM separation, deletion protection, and multi-region key configuration |
| `KeyRecoveryPolicy` | The documented recovery/continuity procedure **appropriate to the custody model**, its separation of duties, and the drill that exercises it **where technically applicable** |
| `KeyRotationPolicy` | Rotation cadence and mechanics — designed in from Phase 2, not retrofitted — plus **destruction safeguards** |

**The universal requirement:**

> Before production `SEALED` data exists, the selected key-custody strategy must provide an **approved and tested way to prevent unrecoverable key loss and to detect key unavailability.**

**Concretely, before any production `SEALED` data exists, all of the following hold:**

- custody strategy documented and selected
- separation of duties defined, appropriate to the provider and model
- key and version **provenance recorded** for every wrap and rotation
- rotation tested
- **destruction safeguards** in place
- recovery/continuity procedure documented, appropriate to the custody model
- recovery drill rehearsed and timed **where technically applicable**
- **sealed-integrity canary operational** — see below
- monitoring and alerting operational
- verified in **staging**
- passed a **production readiness review**

**The sealed-integrity canary** is mandatory regardless of custody model: a synthetic sealed record per jurisdiction-KEK that is **synthetic only, containing no customer-derived data**, decrypted on a schedule. It tests the **complete encryption/decryption path, key-version resolution, and access to the key provider**; it **never logs plaintext**; and it **alerts on failure**. Its implementation depends on the selected custody and provider strategy.

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
- Custody, recovery drills, and the canary are real operational burden, gated before production.

## Alternatives rejected

**Reuse `HIGHLY_SENSITIVE_FINANCIAL` with stricter permissions.** Rejected: permissions can be granted. The requirement is that no permission exists which would allow the read.

**Encrypt inside Amanat.** Rejected: guarantees a second, divergent implementation for the next sealed capability.

**Client-side-only encryption with a customer-held key.** Genuinely considered — it is the strongest confidentiality model. Rejected because **post-mortem disclosure is the capability's entire purpose**, and a key only the deceased holds cannot be used to fulfil it. The trade-off is recorded here so it is not re-proposed without addressing that.

**Grant as an optional parameter or an ambient context value.** Rejected: optional means forgettable, and ambient means invisible. A required argument is the only version the compiler enforces.

**Custody deferred to post-launch.** Rejected on the legacy's evidence — **ENC-2: the production key "has already been lost once."** For sealed data, loss is unrecoverable *and* undetectable, discovered at the worst possible moment.
