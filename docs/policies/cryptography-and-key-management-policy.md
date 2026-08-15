# Cryptography and Key Management Policy

**Status:** DRAFT · **Owner:** Security Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 2 gate

## Scope

All cryptographic use in Karar: encryption at rest and in transit, key hierarchy and custody, rotation, and the sealed-data machinery. **Canonical detail lives in [`docs/security/secrets.md`](../security/secrets.md) and [ADR-0017](../adr/0017-sealed-classification.md)** — this policy binds the organization to those documents and adds the rules of use.

## Purpose

Cryptography that is boring, standard, and owned — because the legacy's decisive finding is not an algorithm flaw but a custody one: a production key with no rotation, no second copy, already lost once (ENC-2). For sealed data, key loss is unrecoverable and undetectable by design; custody is therefore a launch gate, not a preference.

## Requirements

- **R1.** Approved primitives only: AES-256-GCM with fresh random 12-byte IVs, 128-bit tags, 32-byte keys, versioned prefixes; passwords hashed with a modern KDF, never reversibly encrypted. **No proprietary cryptography, ever** (secrets.md §4, §11).
- **R2.** Key hierarchy per secrets.md: KMS-held KEKs (per jurisdiction; per tenant at rung L3) wrapping per-record DEKs for `SEALED`; column keys for `HIGHLY_SENSITIVE_FINANCIAL`. KEKs never leave the KMS boundary.
- **R3.** Every environment has its own keys; **production's keys are never reused anywhere** (environments.md §5).
- **R4.** *Not yet operating — Phase 2:* rotation is designed in from the first encrypted column — including identifying every key-derived value (fingerprints, dedup hashes) before rotation is designed, not during one (the legacy's M9 trap). Rotation procedure per secrets.md §9, rehearsed and timed in staging before production.
- **R5.** *Not yet operating — Phases 13/20:* custody is expressed as the three provider-independent policies of ADR-0017 — `KeyCustodyStrategy`, `KeyRecoveryPolicy`, `KeyRotationPolicy`. An **approved and tested custody strategy** (preventing unrecoverable loss, detecting unavailability) precedes any production `SEALED` data. Hard gate; no waiver path exists.
- **R6.** *Not yet operating — Phase 20:* the sealed-integrity canary — a synthetic sealed record per jurisdiction-KEK whose plaintext contains no customer data (asserted by test) — decrypts on schedule in staging and production, alerting on failure.
- **R7.** *Not yet operating — Phase 2:* encryption coverage is measured, not assumed: a tool counts plaintext rows in columns declared encrypted, in CI against seeded data and operationally (secrets.md §8). An unmeasured encryption claim is a claim, not a control.
- **R8.** *Not yet operating — Phase 2:* startup guards — refuse to boot without a key, with an undecryptable dataset, or on environment-identity mismatch.
- **R9.** Columns needing sort or exact match cannot use random-IV GCM; the resolution (deterministic encryption, redesigned lookup, or a documented accepted residual) is decided per column at design time, never defaulted (secrets.md §7).
- **R10.** TLS everywhere in transit; database connections authenticate the server (`verify-full`), not merely encrypt (*Phase 17, with real connections*).
- **R11.** No key, or value derived from one, appears in code, config files, logs, events, or error messages; `SecretRef`/`KeyRef` indirection keeps provider key names out of application code (secrets.md §2).

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md). None current; any custody-related exception would require Platform Owner approval and could not cross the Phase 20 gate.

## Evidence

Later: coverage-tool output (counts only), rotation rehearsal records, custody approval and drill records, canary results. Today: none exists, and none is claimed. Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-034, 035, 036, 032 (transport, deferred), 012.
