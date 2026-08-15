# Module: insights

## Purpose

Derived insight: dashboard figures, financial health, category breakdown, waste finder, recurring detection.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 6
- **Capability:** INSIGHTS
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `recurring_detections` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE` | proposals until confirmed |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `RecurringChargeDetected` | `HIGHLY_SENSITIVE_FINANCIAL` | notifications | identifier-only |

## Permissions

| Permission | Role(s) |
|---|---|
| `insights.insight.read` | `USER` |

**Permissions deliberately absent:** No staff role reads a customer's insights.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

All figures come from `financial-engine`. **This module computes nothing authoritative itself.**

**Detection is a proposal, shown with its evidence** — *seen four times, about every 30 days* — not a bare assertion. Only confirmed rows appear in lists or totals. Carried forward from the legacy as a platform-wide pattern: derived claims show their basis.

Recurring detection never proposes transfer, income, cash, or housing, because **salary is not a subscription**.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
