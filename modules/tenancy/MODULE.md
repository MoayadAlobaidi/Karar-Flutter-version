# Module: tenancy

## Purpose

Tenant model, contracts, seat allocation, and the isolation boundary.

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
| `tenants` | `INTERNAL` | `RETAIN_WITH_BASIS` | contractual record |
| `tenant_contracts` | `INTERNAL` | `RETAIN_WITH_BASIS` | contractual record |
| `tenant_members` | `CONFIDENTIAL` | `CASCADE` | RLS-scoped; policy required for TENANT_ADMIN |
| `tenant_invitations` | `CONFIDENTIAL` | `CASCADE` | holds a bearer code — RLS mandatory |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `TenantCreated` | `INTERNAL` | projections, audit | payload permitted |
| `TenantContractExpired` | `INTERNAL` | notifications, projections | identifiers only |

## Permissions

| Permission | Role(s) |
|---|---|
| `tenancy.tenant.manage` | `PLATFORM_ADMIN` |
| `tenancy.member.read` | `TENANT_ADMIN` |

**Permissions deliberately absent:** TENANT_ADMIN never receives platform authority.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

`app.tenant_id` is bound from the caller's own record inside the transaction, never from client input. Carried forward from the legacy.

Inherited defects to avoid: `tenant_invitations` with no RLS at all and redemption elevating the whole transaction rather than the three reads that need it (RLS-04); `tenant_users` with no bank-admin policy, returning an empty roster for everyone (AZ2) — and *an empty roster is indistinguishable from correct isolation*, so tests assert non-empty expected data.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
