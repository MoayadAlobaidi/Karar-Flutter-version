# ADR-0023 — Deployment topology ladder L0–L3

**Status:** ACCEPTED · **Phase:** design binding from Phase 1; rungs built on demand

## Context

Partners and regulators may require isolation Karar cannot predict: a dedicated database, a dedicated deployment, or a dedicated cloud project with its own keys, identity provider, and connectors. Building all of it speculatively costs complexity for a requirement nobody has stated. Building none of it risks a rewrite when one appears.

## Decision

**Four named rungs, with the domain identical at every one.**

| Rung | Isolation |
|---|---|
| **L0** | Shared database, `tenant_id` + RLS |
| **L1** | Dedicated database, shared platform |
| **L2** | Dedicated deployment |
| **L3** | Dedicated project — own KMS, IdP, connectors |

**Three mechanisms, all in `infrastructure/`:**

1. Tenant resolution at the infrastructure edge → which datasource.
2. `TenantProviderResolver` → which provider adapter binds at runtime.
3. `KeyRef` → which encryption key applies, per tenant and jurisdiction.

**No use case knows any of them exist.** GCP names appear only in `infrastructure/providers/` (architecture test 10).

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
