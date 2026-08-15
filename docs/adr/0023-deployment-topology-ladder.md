# ADR-0023 — Deployment topology ladder L0–L3, and deployment profiles

**Status:** ACCEPTED · **Phase:** design binding from Phase 1; rungs built on demand
**Amended:** in Phase 0.5 — the ladder is **cloud-neutral** (any rung may run on any approved provider), and `DeploymentProfile` is the named mechanism that binds a deployment to its provider stack.

## Context

Partners and regulators may require isolation Karar cannot predict: a dedicated database, a dedicated deployment, or a dedicated cloud account with its own keys, identity provider, and connectors. Building all of it speculatively costs complexity for a requirement nobody has stated. Building none of it risks a rewrite when one appears.

Different jurisdictions may also require **different cloud providers**: Qatar on one, the UAE on a locally-available alternative, a partner bank on its own mandated infrastructure. A ladder that hard-codes one vendor answers the isolation question and fails the portability one.

## Decision

**Four named rungs, with the domain identical at every one — on any approved infrastructure provider.**

| Rung | Isolation |
|---|---|
| **L0** | Shared database, `tenant_id` + RLS |
| **L1** | Dedicated database, shared platform |
| **L2** | Dedicated deployment — own runtime and database |
| **L3** | **Dedicated cloud account / project / subscription boundary** (the provider's own top-level isolation unit) — own KMS, IdP, connectors |

L3 is deliberately **not** defined as "a GCP project." It is whatever the selected provider's account-isolation boundary is.

**`DeploymentProfile` is the binding mechanism** — a typed, provider-independent description of one deployment: provider, region, database profile, storage, cache, messaging, secrets, key management, identity, AI routing, analytics, observability, network, and residency classification. Tenants map to profiles through a `DeploymentResolver` at the infrastructure edge; resolution may depend on tenant, jurisdiction, environment, contract, and isolation requirement — **not country alone**. Full specification: `docs/architecture/infrastructure-portability.md`.

**Three runtime mechanisms, all in `infrastructure/`:**

1. Tenant resolution at the infrastructure edge → which deployment profile and datasource.
2. `TenantProviderResolver` → which provider adapter binds at runtime.
3. `KeyRef` → which encryption key applies, per tenant and jurisdiction.

**No use case knows any of them exist.** Cloud-provider names and SDKs appear only in `infrastructure/providers/` (architecture test 10). Provider assignments per jurisdiction are **configuration and examples, never domain assumptions**.

**Not doing project-per-country.** No regulatory, isolation, customer, or operational reason exists yet.

## Consequences

**Positive**

- A genuine isolation requirement becomes Terraform and IAM work, not a rewrite.
- The financial engine and every consumer domain module are unchanged at every rung.
- Residency requirements have a defined answer path (see `data-residency.md`).

**Negative — accepted**

- Three indirections exist before anyone uses them. Each is small, and two are needed anyway — provider resolution for mock providers in tests, and `KeyRef` for jurisdiction-scoped KEKs.
- Terraform carries three environment directories from Phase 1, mostly unprovisioned.

## Alternatives rejected

**Build L3 for every tenant.** Rejected: N projects, N key rings, N migration paths, N monitoring setups, for a product with no customers.

**Build only L0 and refactor later.** Rejected: retrofitting datasource and key resolution means touching every repository and every encryption call site — the retrofit ADR-0022 exists to prevent, applied to a different axis.

**Project-per-country now.** Rejected: no stated requirement. The seam exists; the rung does not.

**Per-tenant Terraform modules ahead of demand.** Rejected: pure speculation. **No routing table, per-tenant Terraform, or migration tooling exists until a tenant needs a rung.**
