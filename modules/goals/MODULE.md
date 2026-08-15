# Module: goals

## Purpose

Savings goals, plans, and affordability.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 9
- **Capability:** GOALS
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `goals` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE` |  |
| `savings_plans` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE` | **typed, not unvalidated JSON** |
| `loans` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE` | customer-entered debts; bank name encrypted |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `GoalReached` | `HIGHLY_SENSITIVE_FINANCIAL` | notifications | identifier-only |

## Permissions

| Permission | Role(s) |
|---|---|
| `goals.goal.read` | `USER` |
| `goals.goal.write` | `USER` |

**Permissions deliberately absent:** No origination, disbursement, credit decision, or credit scoring exists.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

Savings plans are **typed**. The legacy stores the plan as an unvalidated JSON document bound straight into a `jsonb` column (API-08).

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
