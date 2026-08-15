# Scenario D — Dedicated everything

**Question:** a customer requires their own project, database, keys, identity provider, bank connector, and legal identity. What changes?
**Answer:** infrastructure resolution and Terraform. **No domain code.**

---

## 1. Requirement → mechanism

| Requirement | Mechanism | Code change |
|---|---|---|
| Dedicated GCP project | **L3 rung** — Terraform environment + project | none |
| Dedicated database | Tenant→datasource routing at the infrastructure edge | none |
| Dedicated encryption keys | `KeyRef` resolves a tenant-scoped KEK via `EncryptionProvider` | none |
| Own branding | `BrandConfiguration` + Flutter flavor | none (flavor is build config) |
| Own identity provider | `TenantProviderResolver` binds tenant → `IdentityProvider` adapter | **an adapter, if the IdP is new** |
| Own bank connector | Same resolver, `FinancialDataConnector` port | **an adapter** |
| Restricted AI | `ModelRoutingPolicy` per tenant, or remove the `AI_ADVISOR` entitlement entirely | none |
| Own legal identity | Own `OperatingEntity` with its controller role, licences, and document set | none |

The two adapters are **new implementations of existing ports**, added under `infrastructure/providers/`. Nothing existing is modified.

## 2. What is unchanged

| | Why |
|---|---|
| **Financial engine** | A pure package with no I/O, deployed identically everywhere |
| **Every consumer domain module** | Never names a database, provider, key, region, or legal entity |
| Tenancy core | RLS is the same PostgreSQL mechanism at every rung |
| Capability registry and policy packs | |
| API contract and generated SDKs | Surface derives from entitlements |
| Flutter application code | API base is configuration |

## 3. The three mechanisms doing the work

All three live in `infrastructure/`. **No use case knows any of them exist.**

| Mechanism | Resolves |
|---|---|
| Tenant resolution at the infrastructure edge | Which datasource this request uses |
| `TenantProviderResolver` | Which provider adapter binds at runtime |
| `KeyRef` | Which encryption key applies, per tenant and jurisdiction |

A use case that asked *"which database am I on?"* would be the thing that breaks this scenario. It cannot, because the question is not expressible in `application/`.

## 4. Sealed data at L3

The vault is **already extracted** into its own security boundary — a Phase 20 gate that applies at every rung. At L3 it additionally gets:

- A tenant-scoped KEK and its own key ring
- Its own service account and network segment
- **Its own escrow arrangement and canary**, per KEK

The port surface does not change, because it was designed **network-capable, transaction-independent, and idempotent** from the first implementation. That decision, made at Phase 13, is what makes this scenario cheap at Phase 17+.

## 5. What it actually costs

| | |
|---|---|
| Terraform project and environment | Real work, hours to days |
| Datasource routing entry | Configuration |
| Key ring, KMS setup, escrow, canary | Real work, and **security review** |
| New IdP adapter | Real work, if the IdP is unfamiliar |
| New bank connector adapter | Real work, and likely the long pole |
| Domain, engine, client, contract | **Zero** |
| Separate pipeline, branch, or fork | **None** |

## 6. Verification

```bash
git diff --name-only main... | grep -vE '^infra/terraform/|^modules/[a-z-]+/infrastructure/providers/'
```

Empty output, or something has leaked out of the infrastructure layer.

## 7. When not to do this

**No customer has asked for L3, and none should be moved there speculatively.** The ladder exists so that a genuine requirement is Terraform rather than a rewrite — not so that isolation can be offered as a default.

The plan's seam test applies: *"would retrofitting this be expensive?"* — yes, hence the seam. *"Might we want this?"* — unknown, hence no rung is built until a tenant needs one.
