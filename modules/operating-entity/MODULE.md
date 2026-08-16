# Module: operating-entity

## Purpose

The legal person providing the service: relationship-scoped data-protection roles, licences as typed references, contracting capacity, entity bindings for tenants and users, and the audited EntityMigration workflow (ADR-0024).

## Ownership

- **Business owner:** _unassigned — solo team, Phase 3_
- **Technical owner:** _unassigned — solo team, Phase 3_
- **Status:** ACTIVE — Phase 3 implemented the entity register and jurisdiction permissions
  (migration `0060`), licences with a provenance-carrying status vocabulary (`0061`),
  relationship-scoped data-protection role assignments (`0062`), entity bindings and the
  EntityMigration workflow with immutable terminal history (`0063`), the use cases over
  Prisma repositories, and the PolicyService authorization port.
- **Phase:** 3
- **Capability:** —  (platform)
- **Highest classification:** INTERNAL

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `operating_entities` | `NON_PERSONAL` | legal accountability — which legal person contracts, is liable, and releases disclosed data; data_protection_contact is a role mailbox reference, not a person | `INTERNAL` | corporate/legal record — retained for the life of the platform; any bounded period comes from the PolicyPack per jurisdiction (Phase 3.5), never a code constant | n/a (no subject owns a legal-person row) | `RETAIN_WITH_BASIS` |
| `entity_jurisdiction_permissions` | `NON_PERSONAL` | record where an entity may lawfully contract/operate, with the basis reference carrying the actual claim | `INTERNAL` | with the entity register; PolicyPack owns any bound (Phase 3.5), never a code constant | n/a | `RETAIN_WITH_BASIS` |
| `entity_licences` | `NON_PERSONAL` | honest licence bookkeeping for Phase 3.5 capability gating; review accountability per claim — a row never implies a legal fact | `INTERNAL` | licence history explains why a capability was ever enabled; PolicyPack owns any bound (Phase 3.5) | n/a | `RETAIN_WITH_BASIS` |
| `data_protection_role_assignments` | `NON_PERSONAL` | stored legal decisions: who is controller/joint-controller/processor per (entity, tenant, purpose, jurisdiction) relationship and when | `INTERNAL` | controllership history makes past disclosures explainable; PolicyPack owns any bound (Phase 3.5) | n/a | `RETAIN_WITH_BASIS` |
| `operating_entity_assignments` | `SUBJECT_DERIVED` | resolve which legal person serves a tenant / contracted with a user, now and at any past instant (USER_CONTRACTING rows reference a user) | `INTERNAL` | binding history explains which entity stood behind which period of service; PolicyPack owns any bound (Phase 3.5) | included — a subject's export names the entity they contracted with and since when | `RETAIN_WITH_BASIS` |
| `entity_migrations` | `SUBJECT_DERIVED` | audited record that a binding moved, under which re-consent evaluation, with which outcome — never silent (ADR-0024 §5) | `INTERNAL` | migration history with re-consent outcomes is the Operating Entities Center's record; PolicyPack owns any bound (Phase 3.5) | included — a subject's export shows migrations of their own binding | `RETAIN_WITH_BASIS` |

Legal basis for `RETAIN_WITH_BASIS` across this module: these are records of legal
accountability (who contracted, who was responsible, what was decided and when); subject
references (`user_id`, `subject_ref`) are opaque and resolve to nothing once the referenced
subject is erased. Canonical migration headers carry the same declarations
(`packages/platform/db/migrations/0060`–`0063`); mirrored rows live in
[`packages/platform/db/DATA_LIFECYCLE.md`](../../packages/platform/db/DATA_LIFECYCLE.md).

**RLS decision:** all six tables are platform-global legal records, deliberately allow-listed
from RLS with per-table justifications and compensating controls in
[`packages/platform/db/rls-allow-list.json`](../../packages/platform/db/rls-allow-list.json) —
write paths are platform-operator-only through the PolicyService port, no table grants DELETE,
and the guard triggers make end-only correction and terminal immutability hold even for the
table owner.

## Events published

_None in Phase 3. `OperatingEntityMigrated` (INTERNAL; consumers: consent, audit, projections;
identifiers only) is planned and will enter the event catalogue with its first publisher —
state changes are audited via `@karar/audit` today._

## Permissions

| Permission | Role(s) |
|---|---|
| `entity.entity.manage` | `PLATFORM_ADMIN` |
| `entity.migration.approve` | `PLATFORM_ADMIN` |

**Permissions deliberately absent:** No role may change an entity binding on an existing
record. Migration only — and a completed migration never rewrites pinned history (enforced by
trigger). No permission exists to delete any row in this module.

## Presentation decision — entity admin HTTP deferred

The authorization port supports the platform-operator check, but entity administration is a
Super Admin surface (operating-entity.md §10) and Super Admin surfaces mount behind the
control-plane gateway (ADR-0021) — which arrives in Phase 8. Mounting entity admin on the
consumer API now would create exactly the re-plumbing ADR-0021 warns against, so **HTTP for
entity administration is deferred to the control-plane phase**. The use cases exist, are
authorization-gated, and are proven live; the authored contract for the deferred surface is
`packages/api-contracts/openapi/paths/operating-entity.yaml` (contract-first, ADR-0009).

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module** (`reconsent_evaluation_id`
on `entity_migrations` references the consent module's record; `tenant_id`/`user_id` are the
kernel's `TenantId`/`UserId`).

This module consumes `@karar/audit` (every state change is audited), `@karar/platform`
(persistence), and `@karar/shared-kernel`. The PolicyService **port** is declared in
`application/ports/policy-service.ts`; the RBAC workstream supplies the real implementation,
and only `__tests__/fakes` contains the permissive fake.

## Notes and known limitations

`entity_licences` is a typed reference with a provenance-carrying status vocabulary
(`CLAIMED_UNVERIFIED`, `EVIDENCED`, `EXPIRED`, `REVOKED`) and asserts nothing about any
regulator. **Karar claims no licence anywhere.** `EVIDENCED` without an evidence reference is
refused by the use case and by CHECK constraint. Capability/licence resolution is Phase 3.5;
nothing enables on free text.

`dataProtectionRole` is per relationship, not per entity — the same entity can be controller
for its own customers and processor for a partner's. This is what makes the white-label
inversion configuration rather than code.

Assignments are **forward-binding only**: re-binding ends the open row and inserts a
successor; records that pinned their entity at creation (consent grants in this phase) keep
it forever. The consent module's integration suite proves a grant's pinned entity survives an
assignment change and that resolution against the new entity finds no consent.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
