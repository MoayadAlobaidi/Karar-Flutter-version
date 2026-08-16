# Module: users

## Purpose

Customer profile, locale, and account-status intent. Owns the person, not the credential —
authentication lives in `identity`, and `user_profiles.user_id` IS the identity account id
(the platform `UserId`; the GUC `app.user_id` carries it).

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** ACTIVE — Phase 3 implemented profiles and status intent: `public.user_profiles`
  and `public.user_status_history` (migration `0040_user_profiles.sql`, RLS ENABLE+FORCE with
  tenant + self policies), the `UserProfileRepository` port over `withPrincipalContext`, the
  `GetOwnProfile` / `UpdateOwnProfile` / `RequestAccountDisable` use cases, the `AuditTrail`
  port onto the audit module, and the `UsersApiModule` HTTP surface (read own profile, update
  approved fields, request account disable).
- **Phase:** 3
- **Capability:** —  (platform)
- **Highest classification:** CONFIDENTIAL

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `public.user_profiles` | `SUBJECT_OWNED` | profile presentation and locale — display name, locale, account-status intent, typed residency/entity references | `CONFIDENTIAL` | from PolicyPack per jurisdiction (packs land Phase 3.5); interim policy-configuration placeholder: life of the account, never a code constant | included | `CASCADE_DELETE` |
| `public.user_status_history` | `SUBJECT_DERIVED` | account-state accountability — append-only evidence of every status transition (disable/deletion intent included) | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); interim policy-configuration placeholder 13 months after account closure | excluded (integrity record about the account, not subject content; the export coverage note names this omission) | `RETAIN_WITH_BASIS` |

Legal basis for `RETAIN_WITH_BASIS` on the history: accountability for account-state changes
survives closure for the retention period; the rows hold status labels and an opaque actor
reference that resolves to nothing once the subject is erased.

**Deliberately minimal PII.** Phase 3 approves exactly two subject-editable fields —
`display_name` and `locale`. Names, phones, and addresses are NOT stored here; a capability
that needs one declares it, with lifecycle, when that phase arrives (no speculative PII).
`residency_jurisdiction_ref` is a typed UNRESOLVED reference resolved by Phase 3.5 policy
machinery; `contracting_operating_entity_id` is a raw cross-module reference. Neither is
client-writable.

## Events published

_None in Phase 3._ Profile and status changes are recorded through the audit module
(`users.account.disable_requested`); catalogue-governed domain events (e.g. a
`UserProfileUpdated` for projections) arrive with the phase that consumes them.

## Permissions

| Permission | Role(s) |
|---|---|
| `users.profile.read` | `SUPPORT` _(granted in migration 0051; no staff surface exists in Phase 3, so nothing can exercise it yet)_ |
| `users.status.update` | `PLATFORM_ADMIN` _(granted in migration 0051; no staff surface exists in Phase 3, so nothing can exercise it yet)_ |

Phase 3 exposes a self-service surface only: a principal reads and writes their OWN profile.
**Permissions deliberately absent:** No role may read another customer's financial detail
through this module. No permission bypasses the self-write RLS policies.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module** (`user_id` = identity
account id, no FK; `contracting_operating_entity_id`, no FK).

Consumes `@karar/platform` (`withPrincipalContext`, Prisma handle), `@karar/audit`
(`RecordAuditEvent` behind this module's `AuditTrail` port), and `@karar/shared-kernel`.

## Isolation

RLS is the boundary (tenancy.md): `ENABLE` + `FORCE` on both tables, per-command policies —
tenant-scoped SELECT, self-only INSERT/UPDATE (`user_id = app.user_id`), no DELETE policy and
no DELETE grant. Every repository method runs inside one `withPrincipalContext` transaction;
its explicit filters are Layer-2 convenience. Adversarial tests
(`__tests__/users-isolation.integration.test.ts`) prove non-empty own-tenant reads FIRST,
then cross-tenant SELECT/UPDATE/DELETE/INSERT denial through direct SQL (wrong and missing
GUC), the repository, and the use cases — plus the FORCE-vs-owner probe and
pooled-connection GUC hygiene.

## Notes and known limitations

**Disable/deletion-request foundation only.** `RequestAccountDisable` records intent
(status + history + audit). Nothing acts on it in Phase 3: session revocation on disable
(legacy AUTHN-08), the disable itself, and erasure machinery are later phases consuming the
same recorded states. The status machine (`ACTIVE → DISABLE_REQUESTED → DISABLED`,
`ACTIVE → DELETION_REQUESTED`) is the contract those phases build on.

Subject-elected policy selections do **not** live here. `SubjectPolicySelection` is a platform
*mechanism* (ADR-0015); selection records are capability-scoped and stored by the owning
capability. This module never aggregates or exposes them.

Legacy MOB-04: profile fields encrypted server-side were cached in plaintext on device. The
Flutter client uses secure storage for anything CONFIDENTIAL or above.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
