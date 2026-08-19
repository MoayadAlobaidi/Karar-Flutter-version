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

### The mobile client holds none of them

Since Phase 4 there is a second place a secret could be misplaced, and the rule is that it cannot go there at all. **A shipped mobile artifact is a public artifact**: anything compiled into it is readable by anyone who has the file, so "the client needs a credential" always means the platform needs an endpoint instead.

Three mechanisms hold it, and none of them is review:

- **Build configuration refuses a secret-shaped name.** The client's configuration loader rejects any compile-time define whose *name* contains `secret`, `password`, `private`, `credential`, `token`, `apikey`, `service_account`, `kms`, `signing`, or `keystore`, and reports the violation **by key name, never by value**. What the client legitimately holds is the API base URL, the environment identifier, public build metadata, and a public brand identifier.
- **The built artifact is scanned, not just the source.** A CI step unzips the built APK and greps it for credential material, and the Security workflow's mobile secret scan runs **before Flutter is installed** — deliberately, so a scan cannot be influenced by what a package resolution pulled in. Signing material is supplied through environment variables or an ignored properties file, never committed, and its absence is asserted for iOS by test.
- **An absent signing input fails the build rather than defaulting.** The Android release signing configuration is created only when all four pieces of material are present, so **an unsigned release is the intended failure** and there is no debug-key fallback — a release artifact is asserted to be unsigned rather than debug-signed, because a signature here would mean the debug key had been substituted. On iOS the Apple Team ID is a build input (`KARAR_IOS_TEAM_ID`) consumed by the generated data-extraction rules; LOCAL uses a test-only sentinel and **any deployed profile without a configured value is refused**. **No real Apple Team ID exists, none is invented, and none is committed** — which is why the cross-platform transfer path is configured but unverified on a device ([`../phases/phase-04.md`](../phases/phase-04.md)).
- **Only one thing is written to secure storage.** The session's tokens, their expiries, and the session id — nothing else. A failure to read that store is a typed failure the application treats as "no credential", never as an empty store, and on failure only the key name is logged, never the value and never the platform's error message, which can echo the entry. Non-sensitive preferences live in a separate unencrypted store whose key type refuses a credential-shaped name at construction. See [`../architecture/flutter.md` §7](../architecture/flutter.md).

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

### What the Phase 5 financial modules do with column keys, and the secret they deliberately do not hold

`HsfFieldEncryptionPort` is declared by every financial module that stores a holder-sensitive value — an account display name, a user-supplied institution label, an account or instrument mask, a connection label, an external account reference. Each is stored **only** as a ciphertext / nonce / auth-tag triple with `hsf_algorithm` and `hsf_key_version` per row; no plaintext column exists for any of them. The **AAD binds tenant, user, table, row id and field**, so a ciphertext moved to another row or another column fails to open rather than decoding as another subject's data. `resolveHsfFieldEncryptionPort` **throws** in dev, staging and production when no approved provider is wired: the local development provider refuses to construct outside `KARAR_ENV=local`, so the failure is a named startup error rather than a wrong answer at midnight.

**No institution credential is stored anywhere in this platform, and the absence is structural rather than procedural.** No username, password, mPIN, OTP, recovery code, security answer, cookie, session token, access or refresh token, client secret, certificate, device binding, scraping state or synchronisation cursor exists in any financial table, and there is no free-text or JSON column one could be hidden inside. Because a `CHECK` cannot assert that a column does not exist, the guarantee is asserted by reading `information_schema.columns` against an exhaustive expected list — any column added, credential-shaped or not, fails the test until someone edits the list deliberately. This is the one secret this product would most like to have and most cannot afford: only `MANUAL` and `USER_FILE_UPLOAD` rails may exist, so there is nothing to authenticate to.

**One equality value is derived rather than stored, and its derivation is a key decision.** `account_source_links.source_account_fingerprint` is `HMAC-SHA256` under a **per-subject** key derived from a root key, versioned so a ruleset change starts a fresh namespace. A plain `sha256` of an account reference would be a confirmation oracle over a real account number; a single platform key would make the same reference under two people produce the same digest, which is a cross-subject join key inside a shared table derivable without decrypting anything. Non-correlation is proven across two members of one tenant, not merely across tenants.

**Synthetic values must not reach a production install, and "guarded by an environment check" was not enough.** The financial retention fixtures were once constants inside each module's `infrastructure/providers/`, guarded by an environment check in the same file. The guard was real and the values still shipped — in the emitted JavaScript, the declaration files and the source maps of every environment that installed the module. A fabricated approval reference is shaped exactly like a real one and names an approval nobody gave. The values now live in `@karar/financial-retention-local-fixtures`, a **devDependency-only** package resolved at runtime inside the local-only branch, so a production install simply does not have it, and a closure test walks the production dependency graph and scans every `dist/` — including compiled test output and source maps — with a positive control against the fixture package's own build.

## 5. Custody, rotation, and the canary — mandatory

The most important lesson in the legacy audit. Finding **ENC-2**:

> Key rotation, escrow or a second copy: **NOT BUILT**. The key is a one-way door and **has already been lost once in production, on 11 August 2026.**

The legacy survived because production held 3 users and 45 transactions, and because encrypted columns sit beside readable metadata that makes loss visible. **`SEALED` removes both cushions by design** — loss is unrecoverable *and* undetectable.

Custody is expressed as three **provider-independent** policies — `KeyCustodyStrategy`, `KeyRecoveryPolicy`, `KeyRotationPolicy` — implemented by whichever key-management provider the deployment profile selects (ADR-0017). No single cloud's escrow product is mandated.

| Requirement | Detail | Gate |
|---|---|---|
| **Approved `KeyCustodyStrategy`** | A named custody model (managed KMS, BYOK + external custody, external key manager, HSM, …) with separation of duties appropriate to it, destruction safeguards, and a tested recovery/continuity procedure — drill rehearsed and timed **where technically applicable** | Phase 20 |
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
6. Retire the old version, retaining recoverability per the custody strategy.

**Rehearsed in staging before production, and timed.**

## 10. Transport

`verify-full` for database connections — **authenticate the server, not merely encrypt the channel.** The legacy uses `sslmode=require` everywhere, which encrypts without authenticating (ENC-1).

## 11. Prohibited

| | |
|---|---|
| Secrets in the repository, logs, or error messages | |
| Sharing a key across environments | |
| A key under no approved custody strategy, once sealed data exists | |
| Proprietary cryptography | |
| Reversible "encryption" of passwords | Passwords are hashed, salted, with a modern KDF |
| Claiming encryption coverage without measuring it | §8 |
