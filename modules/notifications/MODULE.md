# Module: notifications

## Purpose

Delivery of notifications behind channel ports. Owns delivery, not content policy.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 9
- **Capability:** —  (platform)
- **Highest classification:** CONFIDENTIAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `notifications` | `CONFIDENTIAL` | `CASCADE_DELETE` |  |
| `delivery_attempts` | `INTERNAL` | `ANONYMIZE_IRREVERSIBLY` | subject linkage severed after retention |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `NotificationDelivered` | `INTERNAL` | projections | identifiers only |

## Permissions

| Permission | Role(s) |
|---|---|
| `notifications.notification.read` | `USER` |

**Permissions deliberately absent:** No role sends an arbitrary message to a customer outside a defined notification type.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

Ports: `NotificationChannel` with email and in-app implementations in v1. **Push is deferred** — the legacy has no FCM or APNs dependency at all.

Security-notification emails on account events are **built**, not deferred: the legacy sends none on password change, reset, lockout, admin enrolment, or recovery-code use (AUTHN-09).

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
