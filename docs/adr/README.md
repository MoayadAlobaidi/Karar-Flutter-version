# Architecture Decision Records

Each ADR records a decision **actually made**, with its context, consequences, and the alternatives rejected. An ADR that records no rejected alternative is a description, not a decision.

**Format:** Context · Decision · Consequences · Alternatives rejected · Status

**Status values:** `ACCEPTED` · `SUPERSEDED BY nnnn` · `DEPRECATED`

An accepted ADR is not revisited without new information. If new information arrives, a new ADR supersedes the old one — the old one is never edited, because the record of what was believed at the time is the point.

---

## Index

| # | Decision | Phase |
|---|---|---|
| [0001](0001-clean-architecture.md) | Clean Architecture and the Dependency Rule | 1 |
| [0002](0002-modular-monolith.md) | Modular monolith over microservices | 1 |
| [0003](0003-monorepo-and-shared-kernel.md) | Monorepo layout, package boundaries, shared-kernel composition (9 universals incl. `UserId`) | 1 |
| [0004](0004-nestjs-typescript.md) | NestJS + strict TypeScript backend | 1 |
| [0005](0005-postgresql-prisma.md) | PostgreSQL + Prisma confined to infrastructure | 2 |
| [0006](0006-monetary-representation.md) | Monetary representation — BIGINT minor units + ISO 4217 exponent | 2 |
| [0007](0007-one-financial-engine.md) | One authoritative financial engine; Flutter performs no authoritative math | 6 |
| [0008](0008-multi-tenancy.md) | Multi-tenancy — shared DB + `tenant_id` + scoped repositories | 3 |
| [0009](0009-openapi-first.md) | OpenAPI-first contract with generated SDKs | 1 |
| [0010](0010-ai-provider-abstraction.md) | AI provider abstraction; AI is never the source of financial truth | 7 |
| [0011](0011-ruleset-versioning.md) | Financial ruleset versioning | 6 |
| [0012](0012-event-bus-outbox.md) | Event bus + transactional outbox | 2 |
| [0013](0013-worker-entrypoint.md) | Worker as a second entrypoint, not a second application | 2 |
| [0014](0014-jurisdiction-vs-country.md) | Jurisdiction vs Country, and the business-branching prohibition | 3.5 |
| [0015](0015-policy-packs.md) | Typed PolicyPacks + restrict-only settings + extensible resolution strategies + subject-elected policy | 3.5 |
| [0016](0016-capability-registry.md) | Capability Registry — compile-time, governance only | 3.5 |
| [0017](0017-sealed-classification.md) | `SEALED` classification, grant-gated vault, extractable boundary, key escrow | 13 |
| [0018](0018-disclosure-not-access.md) | Disclosure ≠ Access; configurable approval policy with Amanat default | 13 |
| [0019](0019-verified-financial-facts.md) | `VerifiedFinancialFacts` as primary AI numeric safety | 7 |
| [0020](0020-projections.md) | Projections as non-authoritative read models | 8 |
| [0021](0021-control-plane-gateway.md) | Control Plane as security gateway | 8 |
| [0022](0022-rls-phase-3.md) | RLS in Phase 3 | 3 |
| [0023](0023-deployment-topology-ladder.md) | Deployment topology ladder L0–L3 | 17+ |
| [0024](0024-operating-entity.md) | Legal / Operating Entity as a distinct platform dimension, and legal-document lifecycle | 3 |
| [0025](0025-event-governance.md) | Domain event governance and identifier-only payload rules | 2 |
| [0027](0027-data-lifecycle.md) | Data lifecycle — retention, erasure, and ownerless derived data | 5 |

**0026 is deliberately unused.** Subject-elected policy was folded into [0015](0015-policy-packs.md) rather than split across two documents, per the consolidation rule that there be exactly one authoritative rule per decision.

---

## Decisions arising from the legacy audit

ADRs 0015, 0017, 0024, and 0027 were extended or created after the Phase 0.2 audit of `MoayadAlobaidi/Qarar` gained source access. See [`../architecture/plan-v2-deltas.md`](../architecture/plan-v2-deltas.md).
