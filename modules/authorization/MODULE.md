# Module: authorization

## Purpose

Deny-by-default RBAC: the closed permission and role catalogue, role assignments with scope
discipline, and the central `PolicyService` (Layer 1 of tenancy.md §2 — "may this actor perform
this operation?"). It owns what a principal MAY DO; identity owns who they are, tenancy owns whose
data is whose (RLS), and nothing here ever widens row visibility — a platform role is a permission
decision, never an RLS bypass.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 3_
- **Technical owner:** _unassigned — solo team, Phase 3_
- **Status:** ACTIVE — Phase 3 implemented the permission/role catalogue (`public.permissions`,
  `public.roles`, `public.role_permissions`, migrations `0050`/`0051`, migration-seeded and
  SELECT-only for the app role), role assignments (`public.role_assignments`, migration `0052`,
  RLS ENABLE+FORCE, immutable after revoke), the real `RbacPolicyService` satisfying the
  PolicyService ports the tenancy / operating-entity / consent modules declared inward, the
  `AssignRole` / `RevokeRole` use cases with the delegation rule, the `requirePermission(...)`
  controller guard plus the application-level `authorize()` helper, and grant pins (`0054`).
- **Phase:** 3
- **Capability:** —  (platform)
- **Highest classification:** CONFIDENTIAL

## Vocabulary

- **Permission** — `<capability>.<resource>.<action>` (access-control.md §2). The name IS the
  identity; the universe is CLOSED (no wildcards, structurally) and enumerated twice on purpose:
  migration seed and compile-time catalogue, test-asserted equal.
- **Role** — a reviewed bundle of permissions with a binding **scope**: `TENANT` roles bind to one
  tenant and never carry platform authority; `PLATFORM` roles bind with no tenant
  (`role_assignments.tenant_id NULL`); `BOTH` is representable for future delegated roles and
  unused in Phase 3.
- **Assignment** — one principal holding one role in one scope, from when to when, granted by whom.
  Revocation is a status transition that freezes the row into evidence.
- **Decision** — `{allowed, reason}` with a machine-readable reason on every arm. Anything but an
  explicit allow is a denial, including "the store was unreachable".

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25). The same
rows are mirrored in
[`packages/platform/db/DATA_LIFECYCLE.md`](../../packages/platform/db/DATA_LIFECYCLE.md) because
platform migrations `0050`–`0054` created the tables; full field-level headers live in those files.

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `public.permissions` | `NON_PERSONAL` | permission catalogue — the closed universe deny-by-default resolves against | `INTERNAL` | life of the platform (access-control design record); PolicyPack owns any bound (Phase 3.5) | n/a — no subject owns a catalogue row | `NON_PERSONAL_BY_DESIGN` |
| `public.roles` | `NON_PERSONAL` | role catalogue with binding scope (PLATFORM / TENANT / BOTH) | `INTERNAL` | life of the platform (access-control design record); PolicyPack owns any bound (Phase 3.5) | n/a | `NON_PERSONAL_BY_DESIGN` |
| `public.role_permissions` | `NON_PERSONAL` | the reviewed role→permission mapping; FK makes an absent permission ungrantable | `INTERNAL` | life of the platform (access-control design record); PolicyPack owns any bound (Phase 3.5) | n/a | `NON_PERSONAL_BY_DESIGN` |
| `public.role_assignments` | `SUBJECT_DERIVED` | authorization accountability and resolution — who held which role, in which scope, from when to when, granted/revoked by whom | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); interim policy-configuration placeholder 13 months after revocation, never a code constant | included — a subject's export lists the roles they held and hold; grantor/revoker references are opaque UUIDs | `RETAIN_WITH_BASIS` |

`NON_PERSONAL_BY_DESIGN`, demonstrated: catalogue rows hold permission/role names, scope labels,
and descriptions, written by migration only (`karar_app` is SELECT-only, pinned in 0054); no column
references a person and no restorable linkage exists. `RETAIN_WITH_BASIS` basis for assignments:
who held privileged authority is a security accountability record (same reasoning as
`audit.audit_events`); `user_id`/`granted_by`/`revoked_by` are opaque references with no FK that
resolve to nothing once the referenced subject is erased.

## Events published

_None in Phase 3._ Grants and revocations are recorded through the audit module
(`authorization.role.granted` / `.revoked` on SUCCESS; `.grant` / `.revoke` with DENIED outcome on
refused attempts); catalogue-governed domain events arrive with the phase that consumes them.

## Events consumed

_None._

## APIs exposed

**None — deliberately.** Phase 3 has no role-administration HTTP surface: no cross-tenant
platform-admin APIs exist this phase, so no `packages/api-contracts/openapi/paths/authorization.yaml`
fragment exists either. Grants and revocations run through the `AssignRole` / `RevokeRole` use
cases (seeds, tests, and the Phase 8 control plane later — same entrance, same rules). What IS
exported for other modules' surfaces: the `requirePermission('x.y.z')` guard for controllers and
the `authorize()` helper for use cases.

Admin routes that deliberately **do not** exist: nothing lists another principal's roles, nothing
enumerates who holds a role (that is the Phase 8 control-plane surface, on projections, audited),
and nothing accepts a role or tenant from a request body as an identity claim.

## Permissions

This module both IMPLEMENTS the checks and consumes two permissions of its own:

| Permission | Role(s) |
|---|---|
| `authorization.role.assign` | `PLATFORM_ADMIN` |
| `authorization.role.revoke` | `PLATFORM_ADMIN` |

The full seeded catalogue (fourteen permissions, eight roles) lives in migrations `0050`/`0051`
and `domain/catalogue.ts`, each grant justified against the owning module's MODULE.md.

**Permissions deliberately absent:** no `amanat.content.read` for any role — not restricted,
ABSENT (access-control.md §2). No wildcard permission exists or can exist (grammar CHECK + code
validation). No permission grants a cross-tenant consumer-data read. `identity.account.disable` /
`identity.account.enable` are documented by the identity module but have no invoking surface in
Phase 3 and are NOT seeded — deny-by-default means their absence denies; they arrive by forward
migration with the surface that calls them. `SECURITY` and `DISCLOSURE_APPROVER` hold no grants
yet, deliberately.

**The delegation rule** (no self-escalation): an actor needs `authorization.role.assign`, and
`PLATFORM_ADMIN` is grantable only by a `PLATFORM_ADMIN` peer. Under the seeded catalogue the two
checks are the general invariant — PLATFORM_ADMIN is the only role granting role.assign — and the
peer rule keeps the invariant when a future delegated-admin role carries role.assign without
platform authority. Revocation has no peer rule: revoking only ever shrinks authority.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references carry a
raw UUID plus a reference type declared **in this module** (`user_id`, `granted_by`, `revoked_by`
= identity account ids, no FK; `tenant_id`, no FK). The in-module FKs
(`role_permissions.role_id/permission_id`, `role_assignments.role_id`) are real constraints.

Consumes `@karar/platform` (`withPrincipalContext`, Prisma handle), `@karar/audit`
(`RecordAuditEvent` behind this module's `AuditTrail` port), and `@karar/shared-kernel`.
Dev-depends on `@karar/tenancy`, `@karar/operating-entity`, and `@karar/consent` ONLY for the
port-reconciliation test that proves the real service satisfies the PolicyService ports those
modules declared inward.

## Ports declared

| Port | Implementations |
|---|---|
| `RoleAssignmentRepository` (inward) | `PrismaRoleAssignmentRepository` |
| `AuditTrail` (inward) | `RecordAuditEventAuditTrail` over `@karar/audit` |
| `PolicyService` (provided; consumers declared their own inward variants) | `RbacPolicyService` (tenancy shape: `authorize(actor, permission, resource?) → PolicyDecision`); `PrincipalRefPolicyService` (operating-entity/consent shape: `authorize({principalRef, tenantRef}, permission) → Result<void, AUTHORIZATION_DENIED>`) — one engine, two facades, reconciliation test-asserted |

## Resolution semantics (the decisions, recorded)

- **Deny by default, reasons always.** Unknown permission (including wildcards and
  future-capability names), no applicable assignment, permission not held, invalid principal, and
  store-unavailable all DENY with machine-readable reasons. A resolution store failure is a
  denial, not an exception an outer layer might mistake for permission.
- **Scope.** A tenant-scoped assignment applies only when the actor's bound tenant matches — a
  tenant role never implies platform authority and never crosses tenants. A platform-scoped
  assignment applies in every context AS A PERMISSION DECISION ONLY: RLS still scopes every row to
  the transaction's bound principal (test-asserted against a live tenancy table).
- **No cache.** Roles are re-derived from the database on every authorization
  (access-control.md §7) — revocation is immediately effective in-process, test-asserted. The only
  sanctioned memo is `RequestScopedPolicyService`, constructed per request and discarded with it.
- **Both enforcement points** (capability-registry.md §6): `requirePermission(...)` at the
  controller boundary AND `authorize()` inside use cases, because HTTP is not the only caller —
  worker jobs and AI tools invoke use cases directly.
- **Writes are RLS-bound to the target.** Grant/revoke transactions bind the TARGET principal
  (the privileged-write pattern recorded in migration 0030) after the use case authorized the
  ACTOR under the actor's own context; `granted_by`/`revoked_by` record the actor as data. Who may
  reach the write path is Layer 1's decision; RLS bounds the blast radius.

## Tests

Catalogue soundness (grammar, no wildcards, capability prefixes, grants reference the catalogue,
`amanat.content.read` absent); DB seed == code catalogue; deny-by-default including unknown
permission, unassigned role, and store-unavailable; tenant-role-cannot-cross-tenant; tenant role
never implies platform permission; platform role works across tenants while RLS still isolates
tenancy rows (non-empty first); delegation rule (peer-only PLATFORM_ADMIN, denial audited);
FK refuses an absent permission; immediate revocation (authorize → revoke → authorize in one
process); assignment RLS arms (self/tenant visibility, cross-user and cross-tenant denial,
missing-GUC emptiness, FORCE-vs-owner); immutable-after-revoke; grant/revoke audit rows; port
reconciliation against tenancy / operating-entity / consent.

## Notes and known limitations

The `resource` parameter of `authorize` is accepted and reserved; Phase 3 decisions are
permission + scope only. Role/permission administration UI, cross-tenant role listings, and staff
onboarding flows are the Phase 8 control plane, on projections. `role_hint` on tenancy membership
rows remains informational — nothing here or there authorizes off it. The bootstrap grant (the
first PLATFORM_ADMIN) is a provisioning act performed by seeds as the local bootstrap superuser,
exactly like tenant provisioning (0041 header); there is no runtime path that mints authority from
nothing.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
