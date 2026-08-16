# Module: jurisdiction

## Purpose

Runtime persistence for the jurisdiction dimension: the country and legal-regime reference
registers, explicit effective-dated jurisdiction assignments for users and tenants (with
separated source and verification axes), restrict-only jurisdiction settings reads, and the
append-only PolicyPack activation ledger. The typed policy machinery itself — Country and
Jurisdiction models, PolicyPacks with their lifecycle, pack validation, the resolution-strategy
registry, and `EffectivePolicy` — lives in the pure `@karar/jurisdiction-policy` package; this
module is what stores, audits, and gates the runtime half.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 3.5_
- **Technical owner:** _unassigned — solo team, Phase 3.5_
- **Status:** ACTIVE — Phase 3.5 implemented the reference registers (migrations `0070`/`0071`),
  user and tenant jurisdiction assignments under RLS with end-only history guards (`0072`/`0073`),
  restrict-only settings (`0074`), and the append-only pack activation ledger (`0075`) with the
  activation use cases enforcing the pure lifecycle predicate.
- **Phase:** 3.5
- **Capability:** — (platform)
- **Highest classification:** CONFIDENTIAL

## Vocabulary

- **Country** — where, geographically (ISO 3166-1 alpha-2). Reference **data**: display key,
  default-currency reference, code lifecycle. A country carries **no business rule**.
- **Jurisdiction** — which legal regime governs. The **policy key**. Not assumed 1:1 with
  country: a free zone is a distinct regime inside its country's borders.
- **Assignment source** — where an assignment came from (`USER_DECLARED`, `PROVIDER_VERIFIED`,
  `OPERATOR_ASSIGNED`, `CONTRACT_DERIVED`). Says nothing about verification.
- **Verification status** — whether the assignment was verified (`UNVERIFIED`, `VERIFIED`). A
  user-selected country **never** automatically becomes a verified jurisdiction.
- **Activation** — which code-resident pack **version** is operative for a (jurisdiction,
  environment) pair. The pack's **content** is code and never enters the database.

Elsewhere in the platform, `jurisdiction_ref` on consent and operating-entity rows is a raw
typed reference to the same regime key; those modules pin it per record, and this module owns
the register those references resolve against.

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `countries` | `NON_PERSONAL` | geographic reference — ISO 3166-1 codes with display keys and default-currency formatting references; data, never policy | `PUBLIC` | life of the platform reference set; PolicyPack owns any bound (Phase 3.5), never a code constant | n/a — no subject owns a reference row | `NON_PERSONAL_BY_DESIGN` |
| `jurisdictions` | `NON_PERSONAL` | the legal-regime register runtime rows key on — the policy key, kept distinct from country so historical records never need re-derivation | `INTERNAL` | life of the platform register; PolicyPack owns any bound (Phase 3.5), never a code constant | n/a — no subject owns a register row | `NON_PERSONAL_BY_DESIGN` |
| `user_jurisdiction_assignments` | `SUBJECT_OWNED` | resolve which legal regime governs this user now and at any past instant, with source and verification provenance | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5); assignment history explains which regime governed which period of the subject's records, never a code constant | included — a subject's export names their regime bindings and since when | `RETAIN_WITH_BASIS` |
| `tenant_jurisdiction_assignments` | `NON_PERSONAL` | resolve which legal regime a tenant organisation operates under, now and at any past instant, with source and verification provenance | `INTERNAL` | from PolicyPack per jurisdiction (Phase 3.5); regime history explains which rules governed which period of the tenant's operation | n/a — no subject owns a tenant regime row | `RETAIN_WITH_BASIS` |
| `jurisdiction_settings` | `NON_PERSONAL` | restrict-only operational narrowing of the code PolicyPack — disable a capability now, suspend AI processing now | `INTERNAL` | current operational state lives with the platform; PolicyPack owns any bound (Phase 3.5) | n/a — no subject owns an operational settings row | `NON_PERSONAL_BY_DESIGN` |
| `policy_pack_activations` | `NON_PERSONAL` | append-only record of which pack VERSION was operative per (jurisdiction, environment), from when, decided by whom and why; metadata only, never pack content | `INTERNAL` | activation history explains every past policy resolution; PolicyPack owns any bound (Phase 3.5) | n/a — no subject owns an activation event | `RETAIN_WITH_BASIS` |

`NON_PERSONAL_BY_DESIGN` on `countries`, `jurisdictions`, and `jurisdiction_settings` carries its
demonstration: the rows hold ISO codes, localization keys, regime labels, capability id strings,
flags, and operator references recorded in an official capacity. No column references a person
and no linkage — restorable or otherwise — to any subject exists, so re-identification is
impossible by construction rather than by processing.

Legal basis for `RETAIN_WITH_BASIS` on `user_jurisdiction_assignments`: every
jurisdiction-pinned record elsewhere in the platform must stay explainable — which regime
governed the subject when the record was made, on what source, verified or not. `user_id` and
`tenant_id` are opaque cross-module references with no foreign key, so the accountability fact
survives erasure of the subject's identity and then resolves to nothing. Canonical migration
headers carry the same declarations (`packages/platform/db/migrations/0070`–`0075`); mirrored
rows live in [`packages/platform/db/DATA_LIFECYCLE.md`](../../packages/platform/db/DATA_LIFECYCLE.md).

**RLS decisions, per table:** `user_jurisdiction_assignments` is a SUBJECT table — RLS ENABLED
and FORCEd on **both** principal GUCs (`app.tenant_id` AND `app.user_id`, bound by the platform's
`withPrincipalContext`, never from client input), proven on non-empty data by the adversarial
suite (own reads first, then cross-tenant, same-tenant-different-user, tenant-GUC-only, and
missing-GUC probes). `tenant_jurisdiction_assignments` is ENABLED and FORCEd on the tenant GUC
with the same adversarial coverage. `countries`, `jurisdictions`, `jurisdiction_settings`, and
`policy_pack_activations` are deliberately global — reference registers, per-jurisdiction
operational configuration, and a deployment-wide ledger, none of which has a tenant or subject
column to scope on — each allow-listed with its precise reason and compensating grants in
[`packages/platform/db/rls-allow-list.json`](../../packages/platform/db/rls-allow-list.json):
`karar_app` is **SELECT-only** on the three configuration/reference tables (writes are reviewed
migrations this phase; the operator write path for settings arrives with the Phase 8 control
plane) and **SELECT+INSERT only** on the ledger, whose immutability trigger raises on
UPDATE/DELETE/TRUNCATE even for the table owner.

## Events published

_None in Phase 3.5. `JurisdictionAssigned` and `PolicyPackActivated` are plausible future
entries and will join the event catalogue with their first publisher — state changes are
audited via `@karar/audit` today._

## Events consumed

_None._

## APIs exposed

| Route | Audience | Capability required |
|---|---|---|
| _none_ | — | — |

**This module deliberately exposes NO HTTP surface in Phase 3.5.** Assignments and pack
activations are operator/system/seed-side use cases, and the client reads its jurisdiction
context through the authenticated bootstrap endpoint another Phase 3.5 workstream owns, which
consumes this module's public API server-side. Operator surfaces (assignment administration,
settings writes, activation control) arrive with the control plane in Phase 8, behind the
permissions below — the same deferral the operating-entity module records (ADR-0021).

## Permissions

| Permission | Role(s) |
|---|---|
| `jurisdiction.assignment.manage` | _none — unseeded in Phase 3.5_ |
| `jurisdiction.pack.activate` | _none — unseeded in Phase 3.5_ |

**Both permissions are declared here and deliberately NOT seeded in the RBAC catalogue this
phase**, because no operator surface exists to exercise them. Deny-by-default means their
absence **denies**: against the real `PolicyService` every mutating use case in this module
currently refuses, and that is the honest state — recorded here exactly as the identity module
records its unseeded disable/enable precedent. Seeding is a reviewed migration that lands with
the operator surface. Only `__tests__/fakes` holds permissive and deny-all fakes.

**Permissions deliberately absent:** none exists to edit the country or jurisdiction
**registers** — those change by reviewed migration only, so no use case, permission, or grant
can alter a regime declaration at runtime. None exists to delete an assignment or an activation
event; history is ended and superseded, never removed.

## Capability

- **CapabilityId:** — (platform module, not a product capability)
- **declaredJurisdictions:** n/a
- **Required operating-entity licences:** n/a
- **Required integrations:** none
- **Required consent:** none (the module stores assignments; it processes no subject content)
- **SDK exposure:** no — jurisdiction context reaches clients through the bootstrap endpoint,
  never as a directly callable surface
- **White-label eligible:** no

## Jurisdictions and availability

| Jurisdiction | State | Reason |
|---|---|---|
| `QA` | DRAFT, PENDING_LEGAL_REVIEW | Declared alongside the `qa/v1` draft pack and submitted for legal review; no approval recorded, so it is not production-activatable |
| `AE` | DRAFT, NOT_SUBMITTED | Reference structure only; not submitted for review |
| `AE-DIFC` | DRAFT, NOT_SUBMITTED | Models a free-zone regime distinct from its country (the country≠jurisdiction case); not submitted for review |

No seeded jurisdiction is `APPROVED`. Approval is a legal decision this repository cannot take.

## Operating entities

Orthogonal dimension — which legal person serves a principal is
[`modules/operating-entity`](../operating-entity/MODULE.md)'s. A jurisdiction assignment never
implies an entity binding, and neither rewrites the other's pins.

## Policy dependencies

This module **stores and gates**; it decides nothing. It reads `@karar/jurisdiction-policy`'s
pure predicates:

- `canActivate(pack, environment)` gates every activation — DRAFT and unapproved packs never
  activate outside `local`, and an `APPROVED` lifecycle without a real `approvalReference` is
  refused everywhere.
- `validatePack(pack, …)` gates the same path structurally — an invalid pack never activates.
- `canResolveExplicitVersion` is what keeps retired packs resolvable for historical records.

Resolution strategy: none of its own. Each capability names its strategy in the pack, and no
default exists anywhere. This module declares **no** subject-elected options; the
`SubjectPolicySelection` mechanism is another workstream's.

## Legal documents

None describe this module to customers directly. The jurisdiction a subject is assigned to
determines which `(entity, jurisdiction)` legal documents the consent module resolves, so an
assignment change is visible to subjects through that module's disclosures.

## Dependencies

| Module / package | Via | Why |
|---|---|---|
| `@karar/jurisdiction-policy` | package import | The pure Country/Jurisdiction/PolicyPack types and the activation and validation predicates |
| `@karar/audit` | `public-api.ts` | Every state change is audited (`RecordAuditEvent`) |
| `@karar/platform` | package import | Persistence, `withPrincipalContext`, Prisma handle |
| `@karar/shared-kernel` | package import | `Result`, `TenantId`, `UserId` |

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references carry
raw UUIDs (`user_id`, `tenant_id`) with no foreign key across the boundary (data-model.md §2).
The `PolicyService` **port** is declared in `application/ports/policy-service.ts`; the RBAC
workstream supplies the real implementation.

## Ports declared

| Port | Implementations |
|---|---|
| `PolicyService` | RBAC workstream (real); `__tests__/fakes` (permissive, deny-all) |
| `IdSource` | `infrastructure/persistence/uuidv7-id-source.ts` |
| `UserJurisdictionAssignmentRepository` | `PrismaUserJurisdictionAssignmentRepository` |
| `TenantJurisdictionAssignmentRepository` | `PrismaTenantJurisdictionAssignmentRepository` |
| `JurisdictionDirectory` | `PrismaJurisdictionDirectory` |
| `JurisdictionSettingsReader` | `PrismaJurisdictionSettingsReader` |
| `PackActivationLedger` | `PrismaPackActivationLedger` |

## Projections

| Projection | Carries | Must never carry |
|---|---|---|
| `EffectiveJurisdictionState` | the effective assignment with its verification state (`NONE` / `UNVERIFIED` / `VERIFIED`) | any pack decision — capability clearance comes from `EffectivePolicy`, never from an assignment row |

## Tests

Unit (`__tests__/jurisdiction-domain.test.ts`): the source/verification axes, temporal
resolution with `[from, to)` window semantics, the three-arm effective state, ledger derivation,
and the deny-by-default posture (both use cases refuse before touching any store).

Integration on live PostgreSQL (`__tests__/jurisdiction.integration.test.ts`): honest register
seeding, supersede-on-assign, typed refusals for unknown jurisdictions and illegal
(source, verification) pairs backed by the schema CHECK, RLS isolation for **both** assignment
tables asserted on non-empty data first, end-only history guards proven against the owner,
temporal effective reads, the activation gates (DRAFT denied for production, unapproved denied,
ledger untouched by denials), activation/retirement history, append-only enforcement against
`karar_app` **and** the table owner, restrict-only settings grants, the RLS posture and
allow-list cross-check, and audit coverage for every state change.

Pack validation, restrict-only property tests, historical resolution, and the `qa/v1` honesty
assertions live with the pure package (`packages/jurisdiction-policy/src/**`).

## Notes and known limitations

**Nothing here decides a legal question.** Every seeded jurisdiction is `DRAFT`, the `qa/v1` pack
clears no capability, and no row asserts a regulator fact. `provenance` on a register row says
who declared it and on what footing — a declaration, not a claim.

**Assignments fail closed on verification.** A capability that requires a verified jurisdiction
must deny on `NONE` and on `UNVERIFIED` alike, which is why the effective state is a three-arm
union rather than a nullable row with a boolean. `USER_DECLARED` is structurally `UNVERIFIED`
(CHECK-constrained), so a user-selected country cannot become a verified jurisdiction by any
path short of a new `PROVIDER_VERIFIED` row.

**Settings can only restrict.** `jurisdiction_settings` has no column that could express an
enablement, and the resolver's merge is subtractive. An operator can turn a capability off
immediately; turning one on where the pack has not cleared it requires reviewed, deployed code.

**The ledger stores versions, never packs.** Pack content is code. A database write can change
which reviewed version is operative; it can never change what a pack says.

**Concurrency:** ending the open assignment and inserting its successor happen in two
statements inside one principal-context transaction; a concurrent double-assign could
transiently leave two open rows, which `pickEffectiveAssignment` resolves deterministically
(latest `effective_from` wins) and the next assignment ends. A partial unique index would be the
stricter fix and is deliberately not added, because it is outside the Prisma schema language and
would break the exactness the drift gate depends on — the same trade-off the consent module
records for single-ACTIVE-per-triple.

**Deliberately not built:** any HTTP surface (see APIs exposed), any register-editing use case,
any settings write path (Phase 8), and any cross-subject assignment read — an operator learns a
subject's assignment by acting in that subject's principal context, not by enumerating the
table.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
