# Data Model

**ADRs:** 0005, 0006, 0008, 0022, 0027 · **Phase:** 2–3

---

## 1. Money — the decision that cannot be revisited later

**Money is `BIGINT` minor units paired with a `Currency` that carries its ISO 4217 exponent.**

```sql
amount_minor   BIGINT      NOT NULL,
currency_code  CHAR(3)     NOT NULL
```

```ts
class Money {
  private constructor(
    readonly minorUnits: bigint,
    readonly currency: Currency,   // carries exponent: QAR=2, KWD=3, JPY=0
  ) {}
}
```

**No floating point anywhere in the money path.** Not in the database, not in the domain, not in the API, not in Dart. Architecture test 7 fails a build where a `number`, `float`, or `double` appears in a monetary position.

### Why the exponent lives on `Currency`

Karar's markets include **three-decimal currencies** — KWD, BHD, OMR — alongside two-decimal QAR, SAR, and AED. Code that assumes "minor units means cents" is wrong for a third of the Gulf. `Currency.exponent` makes `1000` unambiguous: ten QAR, or one KWD.

### On the wire

```json
{ "amount": { "minorUnits": "1234567", "currency": "QAR" } }
```

`minorUnits` is a **string** in JSON. A 64-bit integer does not survive JavaScript's number type, and a generated TypeScript SDK that silently truncates a balance is a defect no test would catch until the amounts got large.

### What is not money

Weights, purities, ratios, rates, and percentages are **not** `Money` and do not use minor units. Zakat's gold weight in grams and 0.875 purity are measurements; `Percentage` and `ExchangeRate` are separate kernel types. Forcing them into `Money` would corrupt both.

## 2. Identifiers

| Kind | Rule |
|---|---|
| Primary keys | UUID v7 — time-ordered, so index locality is preserved without exposing a sequence |
| Domain ID types | Declared **in the owning module**, not in `shared-kernel` |
| Cross-module references | Raw UUID + a reference type **declared in the consuming module** |
| In `shared-kernel` | Only `TenantId` and `UserId` |

See [`clean-architecture.md` §5](clean-architecture.md) for why the coupling is deliberately local and visible.

## 3. Schemas

| Schema | Contents | Writers | RLS |
|---|---|---|---|
| `public` | Domain tables | Use cases via tenant transactions | Enabled **and** FORCEd |
| `readmodel` | Projections | Projection builders only | Enabled |
| `audit` | Append-only records | Append-only writer | Enabled; UPDATE/DELETE grants revoked |
| `sealed` | Ciphertext + wrapped DEKs | `SealedRecordStore` only | Enabled + grant GUC required |

## 4. Columns every tenant-owned table carries

```sql
id           UUID        PRIMARY KEY,
tenant_id    UUID        NOT NULL,          -- RLS predicate
created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at   TIMESTAMPTZ NOT NULL
```

## 5. Pinning — records with legal consequence

A record whose legality, consent basis, or calculation depends on policy **pins the policy that produced it**, at creation, forever.

```sql
jurisdiction_at_creation        TEXT NOT NULL,
policy_pack_version_at_creation TEXT NOT NULL,
operating_entity_at_creation    UUID NOT NULL,
subject_policy_selection_version         TEXT     NULL   -- where the capability has elective options
```

**Why all four, and why never a silent `UPDATE`:**

- **Jurisdiction** — the regime that governed the record when it was made.
- **Policy pack version** — so a rule change does not retroactively rewrite history.
- **Operating entity** — consent given to Entity A is not automatically valid for Entity B. If Karar restructures, incorporates locally, or is acquired, existing contracts were made with a specific legal person. Storing it makes re-consent a query rather than an archaeology project.
- **Subject profile version** — the elective conventions in force, so a Zakat assessment remains explainable under the conventions the customer had chosen. See [`plan-v2-deltas.md` D1](plan-v2-deltas.md).

Architecture test 21 asserts the pinning columns exist on every table declared to carry legal consequence. `EntityMigration` is an explicit, audited operation with a re-consent evaluation step — never an `UPDATE`.

The legacy validates the pattern independently: its Zakat assessments snapshot the jurisprudential settings in force into every assessment, which is exactly this rule applied to one capability.

## 6. Data lifecycle — declared, not discovered

**Every persistent dataset declares its lifecycle at design time**, recorded in its module's `MODULE.md` and asserted by architecture test 25 ([ADR-0026](../adr/0026-data-lifecycle.md)). Six fields:

| Field | Declares |
|---|---|
| Subject relationship | `SUBJECT_OWNED` · `SUBJECT_DERIVED` · `AGGREGATE` · `NON_PERSONAL` |
| Purpose | The processing purpose the data serves |
| Classification | One of the six classes (§7) |
| Retention | Duration **from the PolicyPack, per jurisdiction — never a constant in code** |
| Export treatment | In the subject's export, excluded with a stated reason, or n/a |
| Erasure strategy | One of the four below |

| Erasure strategy | Meaning |
|---|---|
| `CASCADE_DELETE` | Deleted with the owning subject |
| `ANONYMIZE_IRREVERSIBLY` | Subject linkage severed **irreversibly**; the row survives without it |
| `RETAIN_WITH_BASIS` | Retained, with a stated legal basis and retention period |
| `NON_PERSONAL_BY_DESIGN` | Deliberately holds no personal data from creation, with a stated reason and a demonstration it cannot be re-identified |

This exists because the legacy discovered, during an erasure review, that one production table holds statement-derived data belonging to no user and **therefore cannot be erased on request** (finding P7). Phase 5 builds normalisation, dedup, and categorisation — all of which naturally produce data derived from a subject without belonging to one.

**`NON_PERSONAL_BY_DESIGN` is a decision requiring justification, not a description of an accident.** And **pseudonymization is not anonymization** — data whose subject linkage can be restored remains personal data and cannot claim `ANONYMIZE_IRREVERSIBLY` or `NON_PERSONAL_BY_DESIGN`.

## 7. Data classification on every column

Six classes: `PUBLIC` · `INTERNAL` · `CONFIDENTIAL` · `HIGHLY_SENSITIVE_FINANCIAL` · `SECRET` · `SEALED`.

| Class | At rest | In events | In projections | In logs | AI |
|---|---|---|---|---|---|
| `PUBLIC` | plain | yes | yes | yes | yes |
| `INTERNAL` | plain | yes | yes | yes | yes |
| `CONFIDENTIAL` | plain or encrypted | yes | yes | redacted | minimized |
| `HIGHLY_SENSITIVE_FINANCIAL` | encrypted | **identifier-only by default** | yes | redacted | minimized |
| `SECRET` | KMS | no | no | no | no |
| `SEALED` | **per-record DEK** | **identifier-only, mandatory** | **never** | **never** | **never** |

`HIGHLY_SENSITIVE_FINANCIAL` may carry payload in an event only with a declared `payloadExemption` naming owner, reason, and reviewer — CI fails without it. **`SEALED` has no exemption mechanism at all.** See [`event-governance.md`](event-governance.md).

## 8. Sealed storage — the split that makes it work

```
amanat_records                      sealed.sealed_payloads
─────────────────────────────       ──────────────────────────────
id, owner_user_id, tenant_id        id
jurisdiction_at_creation            ciphertext
policy_pack_version_at_creation     wrapped_dek
operating_entity_at_creation        key_ref
status, created_at, updated_at      alg, checksum
sealed_payload_ref  ──────────────► created_at
```

**Metadata is ordinary, RLS-scoped, and projectable. The payload is not.**

The platform can answer *"how many records are pending disclosure"* while having no capacity to read one. Lifecycle is queryable; substance is not.

Reading a payload requires a `SealAccessGrant` as a **compiler-required, non-nullable argument** — there is no overload without one. RLS on `sealed_payloads` additionally requires a grant GUC, so a SQL-level mistake in application code returns nothing rather than ciphertext. See [`sealed-data.md`](sealed-data.md).

### The amount is sealed

It is tempting to keep obligation amounts in metadata for reporting. **Resist it.** An amount plus a counterparty reference is most of the sensitive content. Operational dashboards show counts, states, and ages — never sums.

## 9. Encryption at rest

| Layer | Mechanism |
|---|---|
| Column-level | AES-256-GCM, fresh 12-byte IV per encryption, 128-bit tag, 32-byte key enforced, versioned prefix |
| Sealed payloads | Per-record DEK, wrapped by a jurisdiction-scoped KEK via `EncryptionProvider` |
| Keys | Local key file in development; KMS in production; per-tenant KEK at topology rung L3 |

**Startup refuses to boot** without a key, or when existing encrypted data cannot be decrypted. Inherited from the legacy, which built this well.

**Also inherited — the lesson the legacy paid for.** Key rotation, escrow, and a second copy were **NOT BUILT**, and the production key *"has already been lost once."* For `SEALED` data that failure is both unrecoverable and undetectable. Karar therefore requires, before any production sealed data exists: **KEK escrow under split control with a rehearsed recovery drill**, and a **sealed-integrity canary** — a synthetic sealed record per KEK, holding known non-customer plaintext, decrypted on a schedule. See [`plan-v2-deltas.md` D2](plan-v2-deltas.md) and `../security/sealed-access.md`.

**One known constraint, inherited:** a column that must be sorted or matched exactly cannot use random-IV GCM. The legacy hit this with `merchant_rules.pattern`, whose repository sorts on `LENGTH(pattern)`. Such columns need a different design — deterministic encryption with its own trade-offs, or a redesigned lookup — decided per column, not by default.

## 9.1 Provider-neutral references

**No provider-specific identifier is ever a domain field.** A `gs://bucket/file` URL, an `arn:aws:s3` path, a cloud key resource name, or a secret-manager ID persisted as domain identity would weld every stored row to one vendor.

| Reference | Resolves to | Resolved by |
|---|---|---|
| `ObjectRef` | Stored bytes | The active `ObjectStorage` adapter |
| `KeyRef` | An encryption key | The active key-management adapter |
| `SecretRef` | A secret | The active secret-provider adapter |

Domain and application code persist and pass the opaque reference; only the infrastructure adapter for the active deployment profile knows what it maps to. This is what makes moving a deployment between providers a data-free operation for the domain. See [`infrastructure-portability.md`](infrastructure-portability.md).

## 10. Audit

Append-only, enforced by **both** revoked grants and a trigger that raises on UPDATE and DELETE **even for the table owner**. Two mechanisms because the legacy's audit table itself carries the schema's one flagged anomaly — RLS FORCEd but not enabled — and no guard detected that shape.

Audited: every mutation; every **staff read of a customer record, including reads returning nothing**; every capability availability change; every policy and entity change; and **every attempted sealed access, successful or refused**.

Staff-read auditing is inherited from legacy finding AZ5, which the legacy's own worklist ranks as *"the only item on the whole list that gets permanently worse every day it stays open"* — unrecorded events cannot be recovered later.

## 11. Projections

`readmodel` schema. **Never a source of truth.** Fully rebuildable — `make rebuild-projection <name>` — which is what makes them safe to change. Every admin view shows an "as of" timestamp because they are eventually consistent, and lag is monitored and alerted.

**`SEALED` data never enters a projection**, asserted by architecture test 13.

## 12. RLS

Enabled **and** FORCEd on every `public` table, or on an explicit allow-list with a stated reason. The application role has no `BYPASSRLS`. Migrations run as a separate role.

Architecture test 22 detects all three failure shapes the legacy exhibits:

| Shape | Legacy instance |
|---|---|
| No RLS at all | 24 of 69 tables; 6 unexplained, `users` among them (P14) |
| Enabled but no policy | The only shape the legacy's own guard tested for |
| **FORCEd but not enabled** | The admin audit log itself (RLS-02) |

See [`tenancy.md`](tenancy.md).

## 13. Migrations

Forward-only SQL, each with a rollback script, each run in CI **as the restricted application role** rather than an owner. A migration requiring elevated privilege fails on a laptop instead of in production — a control the legacy records as having genuinely caught a defective migration.

**Environments must be distinguishable at boot.** The legacy's development and production databases carry byte-identical connection URLs, differing only in a username suffix, and its production service ran against development for four days. Karar asserts environment identity at startup and refuses to boot on a mismatch.
