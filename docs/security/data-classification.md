# Data Classification

**Six classes.** Every column, every event field, every log statement, and every projection column carries one.

---

## 1. The classes

| Class | Definition | Example |
|---|---|---|
| `PUBLIC` | Safe to disclose to anyone | Bank directory, currency reference data, published legal document text |
| `INTERNAL` | Non-sensitive operational data | Feature flag state, job run outcomes |
| `CONFIDENTIAL` | Personal data, not financial detail | Name, email, locale, Amanat record **metadata** |
| `HIGHLY_SENSITIVE_FINANCIAL` | The customer's financial position | Transactions, balances, account masks, statement content, Zakat assessments |
| `SECRET` | Platform credentials | Encryption keys, provider API keys, JWT signing keys |
| `SEALED` | **Intentionally inaccessible to Karar itself** until specific conditions and authorizations are met | Amanat obligation payloads |

## 2. Handling matrix

| | `PUBLIC` | `INTERNAL` | `CONFIDENTIAL` | `HIGHLY_SENSITIVE_FINANCIAL` | `SECRET` | `SEALED` |
|---|---|---|---|---|---|---|
| At rest | plain | plain | plain or encrypted | **encrypted** | KMS | **per-record DEK** |
| In transit | TLS | TLS | TLS | TLS | TLS | TLS |
| In events | yes | yes | yes | **identifier-only by default** | **never** | **identifier-only, mandatory** |
| In projections | yes | yes | yes | yes | **never** | **never** |
| In logs | yes | yes | **redacted** | **redacted** | **never** | **never** |
| In AI context | yes | yes | minimized | minimized | **never** | **never** |
| Support may view | yes | yes | with permission + audit | with permission + audit | **never** | **never** |
| Admin may view | yes | yes | with permission + audit | with permission + audit | **never** | **never** |
| Analytics | yes | yes | aggregates | aggregates | **never** | **never, not even aggregates** |
| Searchable | yes | yes | yes | yes | no | **no** |
| Access requires | — | authn | authn + authz | authn + authz | service identity | **a `SealAccessGrant`** |

## 3. `SEALED` is categorically different

Every other class assumes that authorized staff can, with permission and audit, read the data. **`SEALED` denies that assumption.**

There is no permission an operator could be granted, no role that could be created, and no support escalation that would produce a read. `SealAccessGrant` types are `OWNER`, `DISCLOSURE`, and `LEGAL_ORDER` — **`SUPPORT`, `ADMIN`, `ANALYTICS`, and `AI` do not exist as types.**

Two consequences worth naming because they are costs, not benefits:

- **No search over sealed content.** An index would be an unsealed copy.
- **No analytics, not even aggregates.** An aggregate over a small number of sealed records leaks membership.

## 4. The exemption asymmetry

`HIGHLY_SENSITIVE_FINANCIAL` may carry payload in an event **only** with a declared `payloadExemption` naming owner, reason, and reviewer. CI fails without it. The mechanism exists because there are legitimate cases, and it makes each one a named decision.

**`SEALED` has no exemption mechanism at all.** Not one requiring approval — none. There is no field to set and no process to invoke, so there is no conversation in which someone argues for one.

## 5. Declaring classification

Classification is declared:

| Where | For |
|---|---|
| Prisma schema comments + a classification map | Columns |
| Event catalogue | Event fields |
| `CapabilityDescriptor` | The capability's highest class |
| `MODULE.md` | Data owned, with classes |

**A module's classification is not uniform.** Amanat is `CONFIDENTIAL` metadata and `SEALED` payload in the same aggregate — which is exactly what makes lifecycle queryable while substance is not.

## 6. Enforcement

| Control | Test |
|---|---|
| `SEALED` never in projections, events, logs, analytics, or AI context | 13 |
| Sealed reads require a grant, type-level | 14 |
| Event payload rules by classification | 15 |
| Log redaction of `CONFIDENTIAL` and above | 13 |
| AI context types cannot hold sealed data | 13, structural |
| Every persistent dataset declares its lifecycle | 25 |

## 7. Reclassification

Raising a class is always permitted. **Lowering one requires an ADR**, because data already written under the lower expectation may have reached logs, events, or projections that cannot be recalled.

**Nothing may ever be reclassified out of `SEALED`.** Data written under a seal was collected under a promise, and the promise does not have a downgrade path.
