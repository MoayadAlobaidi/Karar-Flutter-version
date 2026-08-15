# Secrets and Key Management

---

## 1. Classification

Secrets are `SECRET`: **never in events, never in projections, never in logs, never in AI context, never in the repository.**

## 2. Where secrets live

| Environment | Store |
|---|---|
| LOCAL | `.env`, git-ignored. `.env.example` committed with **placeholder values only** |
| DEV / STAGING / PRODUCTION | Secret manager, rotatable, access-controlled per environment |

**Every environment has its own secrets.**

> **Never reuse production's encryption key anywhere.** A staging leak would otherwise decrypt production data.

**Application code holds `SecretRef` and `KeyRef` — never a provider's secret ID or key resource name.** The opaque reference resolves through the active deployment profile's secret and key-management adapters, so moving a deployment between providers re-points references without touching application code or stored data ([`../architecture/infrastructure-portability.md`](../architecture/infrastructure-portability.md)).

The legacy makes this concrete: its staging plan requires its own `DATA_ENCRYPTION_KEY`, its own `JWT_SECRET`, and a separate AI key with a **capped spend**.

## 3. Environments must be distinguishable at boot

The legacy's development and production databases carry **byte-identical connection URLs** — the pooler host is regional, and only a project-reference suffix on the username selects the project. Its production service ran against development for four days, and an audit read development's rows and reported them as production's.

**Karar asserts environment identity at startup and refuses to boot on a mismatch.** The check is cheap; the failure mode is not.

## 4. Key hierarchy

```
KMS
 └── KEK (per jurisdiction; per tenant at rung L3)
      └── DEK (per sealed record)
```

| Layer | Purpose |
|---|---|
| **KEK** | Wraps DEKs. Never leaves the KMS boundary |
| **DEK** | One per sealed record. Stored wrapped, alongside the ciphertext |
| Column keys | Field-level AES-256-GCM for `HIGHLY_SENSITIVE_FINANCIAL` |

**Algorithms:** AES-256-GCM, fresh 12-byte random IV per encryption, 128-bit tag, 32-byte key enforced, versioned prefix. **No proprietary cryptography.**

## 5. Escrow, rotation, and the canary — mandatory

The most important lesson in the legacy audit. Finding **ENC-2**:

> Key rotation, escrow or a second copy: **NOT BUILT**. The key is a one-way door and **has already been lost once in production, on 11 August 2026.**

The legacy survived because production held 3 users and 45 transactions, and because encrypted columns sit beside readable metadata that makes loss visible. **`SEALED` removes both cushions by design** — loss is unrecoverable *and* undetectable.

Custody is expressed as three **provider-independent** policies — `KeyCustodyStrategy`, `KeyRecoveryPolicy`, `KeyRotationPolicy` — implemented by whichever key-management provider the deployment profile selects (ADR-0017). No single cloud's escrow product is mandated.

| Requirement | Detail | Gate |
|---|---|---|
| **KEK escrow under split control** | No single operator can reconstruct a KEK alone. Documented, rehearsed, **timed** recovery drill | Phase 20 |
| **Sealed-integrity canary** | Synthetic sealed record per jurisdiction-KEK, **known plaintext containing no customer data**, decrypted on a schedule, alerting on failure | Phase 20 |
| **Rotation designed in from Phase 2** | Not retrofitted | Phase 2 |

**Architecture test:** the canary's plaintext is asserted to contain no customer-derived data, so the detection mechanism cannot itself become a leak.

### The rotation trap, inherited

Rotating the legacy's key **also changes every future statement fingerprint**, so a rotation must recompute stored ones or a re-uploaded statement imports twice (legacy M9). Any value derived from a key — fingerprints, deterministic tokens, dedup hashes — must be identified **before** rotation is designed, not discovered during one.

## 6. Startup guards

Carried forward from the legacy, which built these well:

- Production **refuses to start without a key**.
- Staging **refuses to start without its own key**.
- A startup check **refuses to boot when existing encrypted data cannot be decrypted**.
- Environment identity is asserted.

## 7. Known constraint: encryption breaks sorting and matching

A column that must be sorted or matched exactly **cannot** use random-IV GCM.

The legacy hit this with `merchant_rules.pattern`, whose repository sorts on `LENGTH(pattern)` and matches it exactly — so the column holds narrative text lifted from statements, unencrypted and permanent, and the team's own note is that it *"cannot use the current converter"*.

**Decide per column**, at design time: deterministic encryption with its own trade-offs, a redesigned lookup, or an accepted and documented residual. **Not by default.**

## 8. Coverage is not assumed

The legacy encrypts **on write only**, and *"no tool counts how many rows are still plaintext"* (ENC-3). It has 22 known plaintext rows in production awaiting a backfill (ENC-13).

**Karar requires a coverage tool** that counts unencrypted rows in columns declared encrypted, run in CI against a seeded database and available as an operational check. A claim of encryption that cannot be measured is a claim, not a control.

## 9. Rotation procedure

1. Generate the new key version in KMS.
2. Identify every value derived from the old key (§5).
3. Dual-write / dual-read window.
4. Re-wrap DEKs under the new KEK.
5. Verify coverage with the tool from §8.
6. Retire the old version, retaining escrow.

**Rehearsed in staging before production, and timed.**

## 10. Transport

`verify-full` for database connections — **authenticate the server, not merely encrypt the channel.** The legacy uses `sslmode=require` everywhere, which encrypts without authenticating (ENC-1).

## 11. Prohibited

| | |
|---|---|
| Secrets in the repository, logs, or error messages | |
| Sharing a key across environments | |
| A key with no escrow, once sealed data exists | |
| Proprietary cryptography | |
| Reversible "encryption" of passwords | Passwords are hashed, salted, with a modern KDF |
| Claiming encryption coverage without measuring it | §8 |
