# Module: budgets

## Purpose

Budgets and spending limits.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 9
- **Capability:** BUDGETS
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `budgets` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE` |  |
| `budget_periods` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE` |  |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `BudgetExceeded` | `HIGHLY_SENSITIVE_FINANCIAL` | notifications, projections | identifier-only |

## Permissions

| Permission | Role(s) |
|---|---|
| `budgets.budget.read` | `USER` |
| `budgets.budget.write` | `USER` |

**Permissions deliberately absent:** No staff role reads a customer's budgets.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

References transactions by raw UUID plus a locally-declared `TransactionRef`. It does not import `TransactionId`.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
