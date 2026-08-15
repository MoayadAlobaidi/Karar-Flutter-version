# Module: projections

## Purpose

Non-authoritative read models for admin and operations, built from domain events.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 8
- **Capability:** —  (platform)
- **Highest classification:** INTERNAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `readmodel.*` | `INTERNAL` | `NON_PERSONAL_BY_DESIGN` | derived, rebuildable, non-authoritative |
| `projection_checkpoints` | `INTERNAL` | `NON_PERSONAL_BY_DESIGN` |  |

## Events published

_None. This module consumes events and publishes none._

## Permissions

| Permission | Role(s) |
|---|---|
| `projections.projection.rebuild` | `OPERATOR` |

**Permissions deliberately absent:** No projection may be written by anything but its builder.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

`NON_PERSONAL_BY_DESIGN` justification: projections are derived aggregates rebuilt from source events and hold no independent subject record. Erasure is achieved by erasing the source and rebuilding. Re-identification is prevented by the payload rules — **SEALED data never enters a projection** (architecture test 13), and aggregates are not published below a minimum cohort size.

**Never a source of truth.** Fully rebuildable. Every admin view shows an *as of* timestamp. Lag is monitored and alerted.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
