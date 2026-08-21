# Module: capability

## Purpose

Deny-by-default capability availability resolution: given a principal, answer "what may this
deployment offer them" as a restrict-only MEET over eight ordered gates — the compile-time
descriptor (implementation and per-environment deployment), the environment, the jurisdiction
assignment and PolicyPack ceiling, the audited availability row, the tenant entitlement, the
consent basis, the operating-entity licence, and the provider seam. The module also owns the
per-tenant entitlement dimension (without any subscription, plan, or pricing concept) and the
one place where client-safe filtering happens: hidden capabilities and hidden denial reasons
are omitted from client output here and nowhere else.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 3.5_
- **Technical owner:** _unassigned — solo team, Phase 3.5_
- **Status:** ACTIVE — Phase 3.5 implemented the gate engine, the two resolver facades, the
  availability and entitlement tables with their append-only ledgers (migrations `0076`–`0077`),
  the permission-gated operator use cases, and the consent/licence/provider port adapters.
- **Phase:** 3.5
- **Capability:** — (platform: this module RESOLVES capabilities; it is not itself one)
- **Highest classification:** INTERNAL

## Vocabulary

Terms this module owns:

- **Availability state** — the CONFIGURED exposure state stored on a `capability_availability`
  row (`AVAILABLE`, `BETA`, `INTERNAL_ONLY`, `PARTNER_ONLY`, `DISABLED`, `PENDING_PROVIDER`,
  `PENDING_LEGAL_REVIEW`, `PENDING_REGULATORY_REVIEW`). Only `AVAILABLE` and `BETA` permit
  exposure. A **missing row is `DISABLED`**.
- **Denial reason** — the RESOLVER's answer for why a capability is not exposed, modelled
  separately from stored state (a row stores state; a resolution reports a reason). Includes
  reasons no row can ever hold: `NOT_IMPLEMENTED`, `NOT_DEPLOYED`, `JURISDICTION_ABSENT`,
  `JURISDICTION_UNVERIFIED`, `JURISDICTION_NOT_CLEARED`, `POLICY_PACK_NOT_APPROVED`,
  `ENTITLEMENT_MISSING`, `ENTITLEMENT_EXPIRED`, `CONSENT_REQUIRED`, `RECONSENT_REQUIRED`,
  `PROCESSING_BASIS_UNRESOLVED`, `LICENCE_MISSING`, `LICENCE_EXPIRED`, `PROVIDER_UNAVAILABLE`,
  `WRONG_ENVIRONMENT`.
- **Ceiling** — the maximum a configuration may reach: the descriptor's
  `implementation`/`deployment`/`declaredJurisdictions` intersected with the PolicyPack's
  cleared capability set. Configuration narrows it; nothing widens it.
- **Entitlement** — a per-`(tenant, capability)` grant that satisfies gate 5 **and nothing
  else**. Distinct from *subscription* (Phase 10, elsewhere): `source_ref` is an opaque seam a
  future subscription module fills, and no plan or price concept exists here.

Terms used elsewhere with a different meaning: **jurisdiction** here is only an opaque
`scopeRef` compared structurally — the policy meaning lives in `@karar/jurisdiction-policy`.
**Availability** in `capability_availability` is configuration, not a health or uptime signal.

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `capability_availability` | `NON_PERSONAL` | audited, restrict-only capability exposure state per (environment, jurisdiction?, capability); a missing row means DISABLED (migration 0076) | `INTERNAL` | current configuration lives with the platform; PolicyPack owns any bound (Phase 3.5+), never a code constant | n/a — no subject owns configuration | `NON_PERSONAL_BY_DESIGN` |
| `capability_availability_history` | `NON_PERSONAL` | append-only ledger of every availability state that ever held — the referent of the resolver's TOCTOU provenance pins (migration 0076) | `INTERNAL` | configuration history explains every past resolution; PolicyPack owns any bound (Phase 3.5+) | n/a | `RETAIN_WITH_BASIS` |
| `tenant_capability_entitlements` | `NON_PERSONAL` | deny-by-default per-tenant capability entitlement with opaque source seam, effective window, and accountability (migration 0077) | `INTERNAL` | life of the tenant relationship plus the PolicyPack's post-termination period (Phase 3.5+), never a code constant | n/a — no subject owns a tenant entitlement | `RETAIN_WITH_BASIS` |
| `tenant_capability_entitlement_history` | `NON_PERSONAL` | append-only ledger of every entitlement state that ever held — the referent of the resolver's TOCTOU entitlement pins (migration 0077) | `INTERNAL` | entitlement history explains every past resolution; PolicyPack owns any bound (Phase 3.5+) | n/a | `RETAIN_WITH_BASIS` |

`NON_PERSONAL_BY_DESIGN` on `capability_availability`: rows hold environment, jurisdiction and
capability references, a closed state value, an operator reference string, and a reason — there
is no subject column and nothing that re-identifies a person. The two ledgers are
`RETAIN_WITH_BASIS` because the basis is exposure accountability: why the platform ever answered
AVAILABLE (or refused to) for a capability at time *t*, on whose decision, at which pinned
version. `tenant_capability_entitlements` describes a tenant organisation (tenants are
`NON_PERSONAL`, see `public.tenants`), not a person.

Canonical migration headers carry the same declarations
(`packages/platform/db/migrations/0076`–`0077`); mirrored rows live in
[`packages/platform/db/DATA_LIFECYCLE.md`](../../packages/platform/db/DATA_LIFECYCLE.md).

**RLS decisions, per table:** `tenant_capability_entitlements` and
`tenant_capability_entitlement_history` are TENANT-scoped — RLS ENABLED and FORCEd, keyed on the
`app.tenant_id` GUC bound transaction-locally by the platform's `withPrincipalContext`, never
from client input; proven on non-empty data by the adversarial integration suite. The history
table's policies are split SELECT/INSERT: the INSERT arm is what the SECURITY DEFINER append
trigger writes under (FORCE applies to the owner too), and the absence of UPDATE/DELETE policies
denies both before grants and the immutability trigger deny them again.
`capability_availability` and `capability_availability_history` are deliberately platform-global
(deployment-wide configuration consulted while resolving EVERY tenant's availability; no tenant
or subject column exists, and a tenant predicate would fabricate a relationship and break
resolution for all tenants at once), each allow-listed with its reason and compensating controls
in [`packages/platform/db/rls-allow-list.json`](../../packages/platform/db/rls-allow-list.json).

## Events published

_None in Phase 3.5. `CapabilityAvailabilityChanged` and `TenantEntitlementChanged` (both
INTERNAL; identifiers and states only) are planned and will enter the event catalogue with their
first publisher — state changes are audited via `@karar/audit` today, and every change also
lands in its trigger-written ledger._

## Events consumed

_None._

## APIs exposed

| Route | Audience | Capability required |
|---|---|---|
| _none_ | — | — |

**No HTTP surface exists in this module this phase, deliberately.** The authenticated client
bootstrap endpoint is the bootstrap workstream's, and it consumes
`ResolveClientCapabilityView` through `public-api.ts` — the client-safe facade — rather than
re-deriving visibility at the transport edge. Operator administration of availability and
entitlements is a Super Admin concern and follows the operating-entity module's control-plane
deferral (ADR-0021): the use cases exist and are permission-gated; **no admin route exists.**

## Permissions

| Permission | Role(s) |
|---|---|
| `capability.availability.manage` | _none — declared, deliberately unseeded_ |
| `capability.entitlement.manage` | _none — declared, deliberately unseeded_ |

Both permissions are **declared but unseeded this phase**: no role carries them, so
authorization deny-by-default means every write path is closed until a reviewed seeding
migration and an operator surface exist (Phase 8). Absence denies.

**Permissions deliberately absent:** **No permission can enable a capability the PolicyPack has
not cleared, or that has no code.** The restrict-only invariant lives in the merge function, not
in form validation — and the write path additionally refuses to even *record* an allowing state
above the descriptor ceiling (`ABOVE_CEILING`, audited with outcome `DENIED`). There is no
permission to delete an availability row, delete an entitlement, or edit either ledger; no such
use case exists to gate. There is no permission that bypasses the consent or licence gates.

## Capability

- **CapabilityId:** — this module resolves capabilities; it does not declare one.
- **declaredJurisdictions:** n/a
- **Required operating-entity licences:** none of its own. Licence REQUIREMENTS are read from the
  PolicyPack per capability — this module never invents one, and `qa/v1` declares none.
- **Required integrations:** none. The provider seam ships only
  `NoProvidersConfiguredSource`, which answers `NOT_CONFIGURED` for every kind.
- **Required consent:** none of its own; it READS consent status for capabilities whose declared
  processing basis is consent.
- **SDK exposure:** no — resolution is a server-side decision; a client receives the filtered
  result, never the inputs.
- **White-label eligible:** no (default) — availability configuration is platform-operator work.

## Jurisdictions and availability

| Jurisdiction | State | Reason |
|---|---|---|
| _none_ | n/a | This module is platform machinery, not a jurisdiction-scoped capability. |

**No capability is available anywhere.** `TRANSACTIONS` is `IMPLEMENTED` because its code exists; every other entry in the production registry is
`NOT_IMPLEMENTED` and deployed nowhere, so gate 1 denies all seven regardless of any row, pack,
or entitlement. The tables ship with **no seed rows at all**: deny-by-default means the ground
state is absence.

## Operating entities

Any entity may serve a capability once the PolicyPack declares which licence types that
capability requires and the entity's record satisfies them: an EVIDENCED licence of the required
type, in-window, with the entity permitted in the effective jurisdiction. A `CLAIMED_UNVERIFIED`
licence never satisfies a requirement — a claim is not evidence (ADR-0024).

## Policy dependencies

Reads the effective policy's **capability ceiling** through the locally-declared
`PolicyCeilingSource` port: the effective jurisdiction and its verification state, the approved
pack version, and the cleared capability ids (plain strings by design) with their per-capability
resolution strategy reference, processing basis, and required licence/provider declarations. The
`@karar/jurisdiction-policy` workstream's `resolveEffectivePolicy` binds behind this port at
composition. This module declares no subject-elected options. An unmappable policy state must
throw (`PolicyCeilingUnresolvableError`) rather than resolve — the whole resolution then fails
closed.

## Legal documents

None describe this module directly. It ENFORCES what documents elsewhere promise: where a
capability's basis is consent, an absent published document denies (`CONSENT_REQUIRED`) rather
than permitting — the inversion of legacy AI-5.

## Dependencies

| Module / package | Via | Why |
|---|---|---|
| `@karar/capability-registry` | package import | the closed id union, descriptors, and registry validation |
| `@karar/jurisdiction-policy` | dev-only (tests) | branded `JurisdictionId` for synthetic fixtures |
| `@karar/consent` | `public-api.ts` | `GetOwnConsentStatus` behind the local `ConsentGate` port |
| `@karar/operating-entity` | `public-api.ts` | effective-entity resolution and licence records behind the local `LicenceDirectory` port |
| `@karar/audit` | `public-api.ts` | every state change and every security-relevant denial |
| `@karar/platform` | package import | persistence, `withPrincipalContext` |
| `@karar/shared-kernel` | package import | `Result`, `TenantId`, `UserId` |

Cross-module dependencies go through `public-api.ts`. Nothing else.

## Ports declared

| Port | Implementations |
|---|---|
| `PolicyCeilingSource` | jurisdiction-policy resolver (bound at composition); test fakes |
| `ConsentGate` | `ConsentGateAdapter` over `@karar/consent`; test fakes |
| `LicenceDirectory` | `LicenceDirectoryAdapter` over `@karar/operating-entity`; test fakes |
| `ProviderAvailabilitySource` | `NoProvidersConfiguredSource` **only**; test fakes |
| `CapabilityAvailabilityRepository` | `PrismaCapabilityAvailabilityRepository`; in-memory fake |
| `TenantCapabilityEntitlementRepository` | `PrismaTenantCapabilityEntitlementRepository`; in-memory fake |
| `PolicyService` | the RBAC workstream's central service; permissive/denying test fakes |
| `IdSource` | `Uuidv7IdSource` |

## Projections

| Projection | Carries | Must never carry |
|---|---|---|
| `ClientCapabilityView` | visible capability ids with `available: true` + state, or an ACTIONABLE denial reason | HIDDEN capabilities in any state; `NOT_IMPLEMENTED`, `NOT_DEPLOYED`, `PENDING_LEGAL_REVIEW`, `PENDING_REGULATORY_REVIEW`, `JURISDICTION_NOT_CLEARED`; provenance pins; any input fact |

A hidden capability is **absent entirely** — never `available: false`. An actionable denial
invites an action; a legal or jurisdictional denial must not advertise the capability's
existence at all.

## Tests

Domain gate cases (each gate separately and in combination), the client-exposure omission suite
(§48), the seeded restrict-only property harness (exhaustive ceiling core plus randomized grant
sweeps proving resolved ≤ ceiling and that no grant-like row flips a ceiling denial),
management use-case tests (authorization, above-ceiling refusal, optimistic versioning,
audit), and a live-PostgreSQL integration suite (RLS isolation on non-empty entitlement data,
trigger-enforced append-only ledgers, version-increment guards, and TOCTOU pin behaviour).

## Notes and known limitations

**Nothing is available.** `TRANSACTIONS` is `IMPLEMENTED`, every other real capability is `NOT_IMPLEMENTED`, and all are deployed nowhere; the
positive resolution path is exercised only over SYNTHETIC test registries whose ids
(`TEST_SYNTH`, `TEST_HIDDEN`) never enter the production union, the production registry, client
output, or a database row — the write use cases validate ids against the production registry and
both migrations CHECK-constrain the same closed set.

**Restrict-only is structural, not procedural.** Gates 1–4 (descriptor, environment,
jurisdiction/pack, availability) run before any grant-like input is consulted, so an entitlement,
consent grant, licence, or provider status cannot widen what code and policy have not permitted.
The property harness asserts this over generated configurations rather than asserting it in
prose.

**`INTERNAL_ONLY` and `PARTNER_ONLY` deny in this phase.** No internal or partner audience model
exists to check a principal against, and a state that cannot be checked must not widen access.
When such a model lands, these become checkable rather than silently permissive.

**The provider gate never fabricates a connection.** The only shipped source answers
`NOT_CONFIGURED`, so a pack-required provider yields `PENDING_PROVIDER` — explainable to a client
only where a descriptor opts in via `providerPendingExplainable`, which no production descriptor
does.

**TOCTOU is pinned, not locked.** Each resolution reads one snapshot per dimension and records
the pack version, availability row id + version, and entitlement id + version it used. A
concurrent change therefore lands wholly in a later resolution and is detectable from the pins;
resolutions are never half-applied mixes. This is provenance, not serialization — two
resolutions racing a change may legitimately disagree, and the pins say why.

**No operator surface, no HTTP surface.** Both permissions are declared and unseeded; the
Super Admin Capability Management screen is Phase 8. The bootstrap endpoint consumes the
client-safe facade from `public-api.ts`.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
