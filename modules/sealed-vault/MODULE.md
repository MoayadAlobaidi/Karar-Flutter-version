# Module: sealed-vault

## Purpose

Grant-gated storage for SEALED payloads. Designed from day one to be extracted into its own security boundary.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 13
- **Capability:** —  (platform)
- **Highest classification:** SEALED

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `sealed.sealed_payloads` | `SEALED` | `CASCADE_DELETE` | ciphertext, wrapped DEK, key ref, checksum |
| `seal_access_grants` | `CONFIDENTIAL` | `RETAIN_WITH_BASIS` | audited, approval-bearing |
| `seal_canaries` | `INTERNAL` | `RETAIN_WITH_BASIS` | known plaintext, no customer data |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `SealedPayloadWritten` | `SEALED` | audit | identifier and status only — mandatory |

## Permissions

_None. Access is not permission-mediated in this module — see below._

**Permissions deliberately absent:** **There is no permission that reads a sealed payload.** Access requires a `SealAccessGrant`, which is a required, non-nullable argument. `SUPPORT`, `ADMIN`, `ANALYTICS`, and `AI` do not exist as grant types.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

Extractability constraints binding from the first implementation: network-capable port surface; **operations never join the caller's transaction**; idempotent with caller-supplied keys; no shared state, pool, or cache. The write path is therefore a saga with outbox-driven compensation.

**Phase 20 gates before any production SEALED data:** vault extracted to its own boundary; an **approved `KeyCustodyStrategy`** (ADR-0017 — managed KMS, BYOK + external custody, external key manager, HSM, or another approved model) with tested recovery/continuity, its drill rehearsed where technically applicable; sealed-integrity canary running in staging and production.

Origin: legacy ENC-2 — *the key is a one-way door and has already been lost once in production*. For sealed data, loss is unrecoverable **and** undetectable.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
