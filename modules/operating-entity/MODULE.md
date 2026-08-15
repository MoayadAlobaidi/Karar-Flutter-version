# Module: operating-entity

## Purpose

The legal person providing the service: controllership, licences, contracting capacity, legal document sets, and entity migration.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 3
- **Capability:** —  (platform)
- **Highest classification:** INTERNAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `operating_entities` | `INTERNAL` | `RETAIN_WITH_BASIS` | legal record |
| `entity_jurisdiction_permissions` | `INTERNAL` | `RETAIN_WITH_BASIS` |  |
| `entity_migrations` | `INTERNAL` | `RETAIN_WITH_BASIS` | audited; includes re-consent outcomes |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `OperatingEntityMigrated` | `INTERNAL` | consent, audit, projections | identifiers only |

## Permissions

| Permission | Role(s) |
|---|---|
| `entity.entity.manage` | `PLATFORM_ADMIN` |
| `entity.migration.approve` | `PLATFORM_ADMIN` |

**Permissions deliberately absent:** No role may change an entity binding on an existing record. Migration only.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

`licensesHeld` is a typed reference and asserts nothing about any regulator. **Karar claims no licence anywhere.**

`dataProtectionRole` is per relationship, not per entity — the same entity can be controller for its own customers and processor for a partner's. This is what makes the white-label inversion configuration rather than code.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
