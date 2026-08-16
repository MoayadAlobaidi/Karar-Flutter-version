# Data Model

**ADRs:** 0005, 0006, 0008, 0022, 0026 · **Phase:** 2–3

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
| `platform` | Infrastructure bookkeeping: migration metadata, outbox, jobs | Migration runner; producers, relay, and job queue | Not tenant-scoped; access bounded by role grants |

**As implemented in Phases 2–3** — 26 migrations (`0001`–`0065`, number ranges owned per workstream with deliberate gaps), 37 tables. Phase 2 created the `platform` and `audit` schemas and their five infrastructure tables; Phase 3 created the first 32 domain tables in `public`, every one RLS-enabled and FORCEd or allow-listed with a written reason (§12; architecture test 22 is active). Full six-field lifecycle declarations: each owning module's `MODULE.md`, mirrored with [`packages/platform/db/DATA_LIFECYCLE.md`](../../packages/platform/db/DATA_LIFECYCLE.md). `readmodel` and `sealed` arrive with their phases.

| Table | Purpose | Classification |
|---|---|---|
| `platform.schema_migrations` | Migration bookkeeping — the database's verifiable history | `INTERNAL` |
| `platform.outbox_events` | Transactional outbox rows until published or dead-lettered | mirrors the envelope; at most `CONFIDENTIAL` in Phase 2 |
| `platform.event_consumer_receipts` | Consumer idempotency — `(consumer, event id)` receipts | `INTERNAL` |
| `platform.jobs` | Background jobs with lease, retry, and dead-letter semantics | mirrors the payload; at most `CONFIDENTIAL` in Phase 2 |
| `audit.audit_events` | Append-only accountability record | `CONFIDENTIAL` |

The Phase 3 domain tables, by owning module (purpose, classification, and lifecycle are declared per table in the linked `MODULE.md`; the migration files carry the same headers):

| Module | Tables (migrations) |
|---|---|
| [`identity`](../../modules/identity/MODULE.md) | `identity_accounts`, `password_credentials`, `email_verifications`, `password_reset_requests`, `sessions`, `refresh_token_families`, `refresh_tokens`, `mfa_enrolments`, `mfa_recovery_codes`, `authentication_security_events` (`0030`–`0034`) |
| [`users`](../../modules/users/MODULE.md) | `user_profiles`, `user_status_history` (`0040`) |
| [`tenancy`](../../modules/tenancy/MODULE.md) | `tenants`, `tenant_members`, `tenant_invitations` (`0041`–`0044`) |
| [`authorization`](../../modules/authorization/MODULE.md) | `permissions`, `roles`, `role_permissions`, `role_assignments` (`0050`–`0052`, `0054`) |
| [`control-plane`](../../modules/control-plane/MODULE.md) | `kill_switches`, `kill_switch_history` (`0053`) |
| [`operating-entity`](../../modules/operating-entity/MODULE.md) | `operating_entities`, `entity_jurisdiction_permissions`, `entity_licences`, `data_protection_role_assignments`, `operating_entity_assignments`, `entity_migrations` (`0060`–`0063`) |
| [`consent`](../../modules/consent/MODULE.md) | `legal_documents`, `legal_document_versions`, `consent_grants`, `reconsent_evaluations`, `processing_basis_references` (`0064`–`0065`) |

## 4. Columns every tenant-owned table carries

```sql
id           UUID        PRIMARY KEY,
tenant_id    UUID        NOT NULL,          -- RLS predicate
created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at   TIMESTAMPTZ NOT NULL
```

The Phase 2 `platform` and `audit` tables are platform infrastructure, not tenant-owned domain tables — they carry opaque tenant *references* where an envelope or audit row concerns one, never the RLS-predicate `tenant_id` column above. The first tenant-owned tables arrived in Phase 3 (`user_profiles`, `tenant_members`, `consent_grants`, and their siblings) and carry these columns. Two recorded variations, decided per table in the owning migration: identity's tables are keyed by **account** rather than tenant (their RLS predicate is `app.user_id` — [`modules/identity/MODULE.md`](../../modules/identity/MODULE.md)), and the platform-global legal/reference tables (operating entities, legal documents, the RBAC catalogue, kill switches) carry no `tenant_id` because no tenant owns them — each is allow-listed with its reason (§12).

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

**As implemented in Phase 3:** two tables carry declared legal consequence — `consent_grants` and `data_protection_role_assignments` — and both pin the jurisdiction reference and the operating entity at creation, so an assignment change never silently migrates a consent (proven by the consent module's integration suite). The policy-pack-version and subject-selection dimensions of the pinning block above cannot exist before PolicyPacks do; architecture test 21 carries an explicit activation gate that begins requiring them at Phase 3.5.

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

**Implemented in Phase 2:** `audit.audit_events` (migration `0010_audit_events.sql`) grants `karar_app` `SELECT, INSERT` only, and its statement-level trigger raises on UPDATE, DELETE, and TRUNCATE including for the owning `karar_migrator` role — both mechanisms are proven by integration tests, owner path included. The writer is the audit module ([`modules/audit/MODULE.md`](../../modules/audit/MODULE.md)), whose metadata guard keeps payloads and secrets out of `before/after_metadata`.

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

**Active since Phase 3** (CODE): 37 tables scanned — 17 RLS-enabled and FORCEd, 27 allow-listed in [`packages/platform/db/rls-allow-list.json`](../../packages/platform/db/rls-allow-list.json) with written reasons, 7 deliberately both (identity's bootstrap-armed tables). Policies read their GUCs through the fail-closed `NULLIF(current_setting(name, true), '')` pattern, bound transaction-locally by `withPrincipalContext`. The landed mechanism is canonical in [`tenancy.md` §3–§4](tenancy.md).

## 13. Migrations

Forward-only SQL, applied by the platform's real runner as of Phase 2 (`packages/platform/src/db/migrations.ts`; policy in [`db/migrations/README.md`](../../packages/platform/db/migrations/README.md)): strict filename order, one transaction per file, sha256 checksums in `platform.schema_migrations` with hard failure on drift, and a mandatory `-- rollback:` recovery block per file. The runner connects **as the restricted `karar_migrator` role** — never a superuser; `karar_app` gets minimal per-table DML and no DDL. A migration requiring elevated privilege fails on a laptop instead of in production — a control the legacy records as having genuinely caught a defective migration. Runner semantics and the from-zero flow are summarized in [`backend.md` §6](backend.md).

**Environments must be distinguishable at boot.** The legacy's development and production databases carry byte-identical connection URLs, differing only in a username suffix, and its production service ran against development for four days. Karar asserts environment identity at startup and refuses to boot on a mismatch.
