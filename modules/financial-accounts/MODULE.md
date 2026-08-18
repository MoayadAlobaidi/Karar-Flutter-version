# Module: financial-accounts

## Purpose

Accounts and balances. Accounts are created from statement import; there is no bank connection.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 5
- **Capability:** TRANSACTIONS — this module is an internal bounded context beneath that product capability, not a capability of its own

**Why not `FINANCIAL_ACCOUNTS`.** This file previously named a capability that does not exist. The closed production registry declares `TRANSACTIONS` and has no `FINANCIAL_ACCOUNTS` id, so the name here resolved to nothing and any reader checking it against the registry would have found a hole. Accounts are not independently purchasable, entitleable or deployable — a user who has accounts but not transactions has nothing, and the reverse is incoherent — so a second capability id would add a dimension the product does not have while widening the surface that availability, entitlement and PolicyPack clearing all have to reason about. Adding one would need an ADR, a capability-map change, a registry change, and an analysis of its bootstrap and client exposure; none of that is warranted to describe a bounded context. Module boundaries and capability ids are deliberately different things here.
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `accounts` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE_DELETE` | **only a mask is stored — no full account number column exists** |
| `institutions` | `PUBLIC` | `RETAIN_WITH_BASIS` | public catalogue |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `AccountCreated` | `HIGHLY_SENSITIVE_FINANCIAL` | projections, audit | identifier-only |

## Permissions

| Permission | Role(s) |
|---|---|
| `accounts.account.read` | `USER` |
| `accounts.account.write` | `USER` |

**Permissions deliberately absent:** No staff endpoint returns one customer's accounts.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

**Manual account create, edit, and delete are first-class `IMPLEMENTED`** (challenge C9). The legacy exposes a single GET and creates accounts only as a side effect of statement commit — while a compulsory consent document promises customers they can delete individual accounts. That contradiction (legacy C4/M7) must not ship here.

**The connect-a-bank mock is not carried forward.** The legacy's screen *inserts a fabricated account row into local state with an invented masked number and a Synced status* — its own audit calls it *the single most misleading surface in the product*. Capability state is shown honestly.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
