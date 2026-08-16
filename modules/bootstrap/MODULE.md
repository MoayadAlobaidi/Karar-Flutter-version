# Module: bootstrap

## Purpose

The authenticated client bootstrap surface: one GET that tells a signed-in client who it is,
which tenant its session is bound to (or that it must select one), and the client-safe
jurisdiction / operating-entity / PolicyPack / capability view — plus one POST that binds or
switches the session's tenant. Owns the composition of those views; owns none of the underlying
state.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 3.5_
- **Technical owner:** _unassigned — solo team, Phase 3.5_
- **Status:** ACTIVE — Phase 3.5 implements `GET /platform/bootstrap` (with the documented
  auto-bind side effect) and `POST /platform/tenant-binding` (first bind without rotation;
  switch with full session rotation), closing the KAR-RSK-021 dormant surface together with the
  identity/tenancy binding seams.
- **Phase:** 3.5
- **Capability:** — (platform)
- **Highest classification:** CONFIDENTIAL (session/tenant context in flight; nothing at rest)

## Vocabulary

- **Binding state** — what the client learns about its session's tenant context: `UNBOUND`,
  `BOUND(tenant)`, or `TENANT_SELECTION_REQUIRED(choices)`. Reported state reflects binding
  VALIDITY: a session bound to a disabled tenant or a revoked membership reports
  UNBOUND/selection, never a working tenant.
- **Auto-bind** — the GET side effect: an unbound session with EXACTLY ONE usable membership is
  bound to it (no token rotation), verified again, compensated (session revoked) if the
  membership vanished in the race window, and audited. Documented in the OpenAPI contract.
- **Switch** — the POST path for a bound session: the tenancy seam verifies the target, the
  identity seam atomically revokes the session + refresh families and issues a new bound
  session; the response carries the NEW tokens.
- **Client-safe view** — the only data this surface emits: pre-filtered capability output from
  the client-safe resolver, PolicyPack version/status (never content), operating-entity id/name
  (never licence detail), jurisdiction assignment + verification status.

## Data owned

This module owns NO persistent datasets: it composes views over state owned by identity
(sessions), tenancy (tenants, memberships), and the Phase 3.5 jurisdiction/capability
workstreams. The six-field table (ADR-0026) is present for the structural check; the placeholder
row declares that emptiness deliberately.

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
| ----- | -------------------- | ------- | -------------- | --------- | ---------------- | ---------------- |
| —     | —                    | —       | —              | —         | —                | —                |

### Row-level security stance

No tables, no policies of its own. Every read this module's use cases trigger runs through the
owning modules' repositories under `withPrincipalContext` (identity's account scope; tenancy's
0080/0081 self/member arms), so RLS remains the boundary beneath this surface.

## Events published

_None._

## Events consumed

_None._

## APIs exposed

| Route | Audience | Capability required |
|---|---|---|
| `GET /platform/bootstrap` | consumer (session) | — (platform) |
| `POST /platform/tenant-binding` | consumer (session) | — (platform) |

No admin write endpoints exist on this surface. Contract: authored OpenAPI-first in
`packages/api-contracts/openapi/paths/platform.yaml` (the lead merges into `openapi.yaml`).

**MUST-NOT-RETURN list (§48, leak-regression tested):** hidden capability ids, unimplemented or
pending-legal capabilities beyond what the client-safe resolver already emits, Amanat existence,
internal licence details, full PolicyPack content, raw consent evidence, internal audit or
configuration data, synthetic test capabilities. Enforcement is structural: the response
serializer emits a CLOSED field set (extra fields from any port are dropped at the edge), and
capability output passes through the capability workstream's CLIENT-SAFE resolver port
unenriched — bootstrap never re-filters ids, so the filter cannot drift into two
implementations.

## Permissions

_None._ Both routes are session-scoped self-service: the caller reads and mutates only their own
session's context. Tenant selection is authorized by MEMBERSHIP (server-verified, RLS-bounded),
not by a PolicyService permission. Kill switches: deliberately none — the switch-id registry is
closed this phase and no existing id covers tenant binding.

## Dependencies

Cross-module dependencies resolve through PORTS THIS MODULE DECLARES (`application/ports/`);
the composition root binds:

- `ResolveTenantContextPort` / `SwitchTenantPort` — tenancy's `ResolveTenantContext` /
  `SwitchTenant` use cases (structural match).
- `BindSessionPort` / `RevokeSessionPort` — identity's `BindSessionTenant` / `RevokeSession`
  use cases (structural match).
- `JurisdictionContextPort`, `OperatingEntityReferencePort`, `PolicyPackStatusPort`,
  `ClientCapabilitiesPort` — the parallel Phase 3.5 workstreams' client-safe resolvers; tested
  here with fakes, bound by the lead.
- `AuditTrail` — `@karar/audit`'s `RecordAuditEvent` behind the locally declared port.

Package dependencies: `@karar/shared-kernel` (branded ids, Result) and the NestJS presentation
runtime. Identity/tenancy/platform/audit appear as devDependencies ONLY (integration tests
compose the real seams); runtime code imports neither.

## Notes and known limitations

- **Binding is ROUTING, not authority.** The bootstrap view (and the session's
  `tenant_binding`) selects context; authority remains per-request membership verification and
  RLS in the owning modules. The compensating checks here narrow — not replace — that guarantee.
- **Audit posture: FAIL CLOSED, by reversing.** The accountability record is part of the
  operation, not a side effect — the same stance as identity's `auditOrFail` and the capability
  module's `AUDIT_APPEND_FAILED`. Every `AuditTrail.record` result is inspected. When the record
  for a completed auto-bind, first bind, or switch cannot be written, the session carrying that
  binding is **revoked** and the caller is failed with `context_unavailable` (503
  `BOOTSTRAP_UNAVAILABLE`). Binding is one of the few security-relevant state changes with a
  clean undo (session revocation, already built for the membership race), so it fails closed by
  reversing rather than by leaving a live tenant scope no one can account for. On a denial path
  nothing is bound, so there is nothing to reverse — but the failure is still returned rather
  than swallowed, so an unrecorded event never yields a settled answer. Cost, stated: an audit
  outage signs affected callers out instead of silently binding them. Evidence:
  `__tests__/bootstrap-use-cases.test.ts` (three fail-closed cases asserting the revocation).
- **Auto-bind compensation revokes the session.** When a membership is revoked exactly inside
  the bind race window, the freshly bound session is revoked (fail closed): the caller signs in
  again. Rare by construction, safe by design.
- **Enrichment ports may return null** while the jurisdiction/capability workstreams land;
  the response shape carries explicit nulls rather than fabricated defaults.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
