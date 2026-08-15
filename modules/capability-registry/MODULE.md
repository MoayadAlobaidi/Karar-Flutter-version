# Module: capability-registry

## Purpose

Capability descriptors, availability resolution, and entitlement. Governance only — it wires nothing.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 3.5
- **Capability:** —  (platform)
- **Highest classification:** INTERNAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `capability_availability` | `INTERNAL` | `RETAIN_WITH_BASIS` | audited, restrict-only |
| `tenant_entitlements` | `INTERNAL` | `RETAIN_WITH_BASIS` |  |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `CapabilityAvailabilityChanged` | `INTERNAL` | audit, projections | payload permitted |

## Permissions

| Permission | Role(s) |
|---|---|
| `capability.availability.manage` | `OPERATOR` |

**Permissions deliberately absent:** **No permission can enable a capability the PolicyPack has not cleared.** The restrict-only invariant is in the merge function, not in form validation.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

**Deny by default: a capability with no availability row is `DISABLED`.** Code existing is never sufficient for exposure.

Every gate is AND, and every denial carries a machine-readable reason surfaced to admin and to the client as a typed state.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
