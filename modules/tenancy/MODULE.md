# Module: tenancy

## Purpose

Tenant model, memberships, secure invitations, and the isolation boundary.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** ACTIVE — Phase 3 implemented tenants, memberships, and invitations:
  `public.tenants`, `public.tenant_members`, `public.tenant_invitations` (migrations
  `0041`–`0044`, all RLS ENABLE+FORCE), the repository ports over `withPrincipalContext`,
  the `PolicyService` port (implemented by the authorization module), the
  `GetOwnTenant` / `ListMembers` / `CreateInvitation` / `RevokeInvitation` /
  `RedeemInvitation` use cases, and the `TenancyApiModule` HTTP surface.
- **Phase:** 3
- **Capability:** —  (platform)
- **Highest classification:** CONFIDENTIAL

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `public.tenants` | `NON_PERSONAL` | tenant registry and contractual record — kind (first-party / white-label / internal), status, entity binding | `INTERNAL` | life of the contract plus the PolicyPack's post-termination period (Phase 3.5); interim policy-configuration placeholder 6 years | n/a | `RETAIN_WITH_BASIS` |
| `public.tenant_members` | `SUBJECT_OWNED` | tenant membership and seat state — who belongs to which tenant, from when, in what state | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); interim policy-configuration placeholder: life of membership plus 13 months | included | `CASCADE_DELETE` |
| `public.tenant_invitations` | `SUBJECT_DERIVED` | secure membership invitation and its redemption evidence — normalized invitee email, sha256 token hash, expiry/attempt/revocation state | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); interim policy-configuration placeholder 13 months from terminal state | excluded (operational security record holding a third party's email; the export coverage note names this omission) | `CASCADE_DELETE` |
| `tenant_contracts` (planned, Phase 10/11) | `NON_PERSONAL` | commercial contract terms per tenant — plans, seats, billing linkage | `INTERNAL` | life of the contract plus the PolicyPack's post-termination period; same placeholder discipline as tenants | n/a | `RETAIN_WITH_BASIS` |

Basis notes: `tenants` / `tenant_contracts` — `RETAIN_WITH_BASIS`: contractual and audit
obligations; the rows name organizations, not subjects. `tenant_members` rows belong to the
member subject and cascade with them. `tenant_invitations` rows derive from the creator and
carry a third party's email; they cascade with the tenant relationship and never outlive the
retention placeholder.

**Email at rest, the decision recorded (Phase 3 minimal):** redemption must match the invited
email against the identity-verified email of the authenticated redeemer, and creators must see
whom they invited — a one-way digest can do neither. The NORMALIZED email is therefore stored
as text, classified `CONFIDENTIAL`, and revisited when column-encryption machinery arrives
(deterministic-match columns need their own design; data-model.md §9).

**Token discipline:** the invitation token is 32 CSPRNG bytes, returned ONCE to the creator;
only its sha256 is stored (`token_hash`, UNIQUE). The raw token never reaches the database,
logs, events, or audit metadata.

## Events published

_None in Phase 3._ Membership and invitation changes are recorded through the audit module
(`tenancy.invitation.created` / `.revoked` / `.redeem` with SUCCESS and DENIED outcomes);
catalogue-governed domain events (e.g. `TenantCreated` for projections) arrive with the
control-plane/projection phases. Membership state history is deliberately audit-events plus
state columns — no shadow history table.

## Permissions

Checked through the `PolicyService` PORT declared in `application/ports/policy-service.ts`
(deny-by-default; implemented by the authorization module; `role_hint` is informational and
never authorizes anything):

| Permission | Role(s) |
|---|---|
| `tenancy.member.read` | `TENANT_ADMIN` |
| `tenancy.invitation.create` | `TENANT_ADMIN` |
| `tenancy.invitation.revoke` | `TENANT_ADMIN` |
| `tenancy.tenant.manage` | `PLATFORM_ADMIN` _(planned — tenant provisioning arrives with the control plane, Phase 8)_ |

**Permissions deliberately absent:** TENANT_ADMIN never receives platform authority. No
permission grants cross-tenant reads — platform-level views arrive with the control plane,
through projections, under audited elevation.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module** (`user_id`,
`created_by`, `redeemed_by` = identity account ids, no FK; `default_operating_entity_id`,
no FK). In-module FKs (`tenant_members.tenant_id`, `tenant_invitations.tenant_id` →
`tenants.id`) are real constraints.

Consumes `@karar/platform` (`withPrincipalContext`, Prisma handle), `@karar/audit`
(`RecordAuditEvent` behind this module's `AuditTrail` port), and `@karar/shared-kernel`.
Declares ports for the authorization module (`PolicyService`), the identity module
(`RedeemerEmailSource`), and the control-plane's kill switches
(`presentation/http/operation-gate.ts` — dependency inversion, no module dependency); the
composition root wires all three. `POST /tenancy/invitations` and
`POST /tenancy/invitations/redeem` carry `RequireOperationAllowed('TENANT_INVITATIONS')`;
`TenancyApiModuleOptions` makes the gate REQUIRED so the routes cannot mount unguarded
(restriction proven in `__tests__/tenancy.controller.test.ts`).

## Isolation

`app.tenant_id` is bound from the caller's own record inside the transaction, never from
client input — controllers never read tenant identity from query, body, or header, and tests
attack all three at once. `public.tenants` is the recorded global-table decision (0041): RLS
ENABLE+FORCE with a self-row policy (`id = app.tenant_id`) instead of an allow-list hole;
`karar_app` holds SELECT only, and provisioning stays with the control plane.

Inherited defects, now guarded by tests rather than avoided by intent:

- **AZ2** — *an empty roster is indistinguishable from correct isolation.* The adversarial
  suite (`__tests__/tenancy-isolation.integration.test.ts`) asserts each tenant's own roster
  is NON-EMPTY first, at SQL, repository, and use-case layers, before any denial is proven,
  and exercises SELECT/INSERT/UPDATE/DELETE cross-tenant plus the FORCE-vs-owner probe.
- **RLS-04** — the legacy redemption *"elevates the whole transaction."* Redemption here runs
  in the redeemer's own principal context: a token-scoped lookup (migration 0044 policies on
  `app.invitation_token_hash` expose exactly one row), then the one-time conditional UPDATE
  and a membership INSERT that RLS itself binds to the authenticated redeemer (0042 WITH
  CHECK `user_id = app.user_id`). The repository reads back the transaction's ACTUAL GUCs
  and role, fails closed on anything but the narrow context, and returns the evidence —
  asserted by `__tests__/invitation-redemption.integration.test.ts`.

## Notes and known limitations

Redemption denial answers avoid oracles: unknown token, other tenant's token, and terminal
invitations are indistinguishable to the caller. Failed redemptions are attempt-capped per
invitation and audited with DENIED outcomes.

**The tenant-bound surface is dormant until sessions carry a tenant binding.** This module's
principal source contract takes tenant identity ONLY from server-side session state
(`identity_sessions.tenant_binding`); Phase 3 issues sessions unbound and redemption does not
bind them, so `/tenancy/tenant`, `/tenancy/members`, and invitation create/revoke answer 401
for every caller — only redemption (tenantless by design) is reachable. The binding mechanism
belongs to the phase that first needs the surface live (phase-03 Known limitations;
KAR-RSK-021).

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
