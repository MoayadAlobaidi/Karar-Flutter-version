# Module: subject-policy

## Purpose

SubjectPolicySelection — the fourth policy dimension (jurisdiction-policy.md §7): the common
platform mechanism recording which pack-permitted profile option a subject elected per
capability, with jurisdiction, PolicyPack version, and profile version pinned at recording so
every historical resolution stays explainable under the elected conventions that produced it.
The mechanism is common; the CONTENT is capability-owned — no option content, and no generic
mutable preferences store, exists in this module by design.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 3.5_
- **Technical owner:** _unassigned — solo team, Phase 3.5_
- **Status:** ACTIVE — Phase 3.5 implemented the selection mechanism: immutable, version-pinned
  election records under tenant+user RLS (migration `0083`), restrict-only recording validated
  against the pack option set through the `SubjectOptionSource` port, temporal reads, the
  pinned-version reader for capability resolution, and audit with reference-only metadata.
- **Phase:** 3.5
- **Capability:** — (platform mechanism; each selection row REFERENCES a capability id)
- **Highest classification:** CONFIDENTIAL

## Vocabulary

- **SubjectPolicySelection** — the immutable record of one election act: subject, capability,
  opaque profile reference, and the pinned (jurisdiction, pack version, profile version).
- **Profile / option set** — capability-owned content this module never stores; the pack's
  permitted option set reaches this module as REFERENCES through `SubjectOptionSource`.
  `ZakatMethodologyProfile` content explicitly does not exist until Phase 9.
- **Supersession** — re-election inserts a NEW row and marks the prior ACTIVE row SUPERSEDED;
  the old row keeps its pinned versions and remains readable (historical reproducibility).
- **Effective at an instant** — reads resolve from the dated columns (`effective_from`,
  `effective_to`, `withdrawn_at`), never from a stale status marker; an election whose window
  closed is EXPIRED on read, fail closed.

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `subject_policy_selections` | `SUBJECT_OWNED` | record which pack-permitted profile option the subject elected per capability, with pinned jurisdiction/pack/profile versions, so historical resolutions replay under the conventions that produced them | `CONFIDENTIAL` | from PolicyPack per jurisdiction (Phase 3.5+); interim policy-configuration placeholder: life of the account plus 13 months after supersession/withdrawal, never a code constant | included — the subject's export contains their own election history with its pinned versions | `RETAIN_WITH_BASIS` |

Classification note: `CONFIDENTIAL` is the floor, not an estimate — an elected methodology can
reveal religious affiliation, and analogous elections can reveal health or risk posture
(jurisdiction-policy.md §7 rule 5). Legal basis for `RETAIN_WITH_BASIS`: the election is the
provenance that explains computations already performed under it; `user_id` is an opaque
reference that resolves to nothing once the subject's identity is erased. Canonical migration
header carries the same declarations (`packages/platform/db/migrations/0083`); the mirrored row
lives in [`packages/platform/db/DATA_LIFECYCLE.md`](../../packages/platform/db/DATA_LIFECYCLE.md).

**RLS decision:** `subject_policy_selections` is a SUBJECT table — RLS ENABLED and FORCEd on
both principal GUCs (`app.tenant_id` AND `app.user_id`, bound by the platform's
`withPrincipalContext`, never from client input), proven on non-empty data by the adversarial
suite. No rls-allow-list entry exists or is needed. **Privileged reads are deliberately
absent:** Phase 3.5 has no staff surface, so the only readers are the subject (self) and the
test suites; any future read path beyond self (support, migration tooling) must arrive as its
own audited, purpose-limited surface — it does not exist today, and that absence is the design.

## Events published

_None, deliberately (privacy rule): selections never enter event payloads — a published event
would be a side channel for CONFIDENTIAL elections. State changes are audited via
`@karar/audit` with REFERENCE-ONLY metadata (selection id, capability id, version pins — never
the profile reference, the snapshot hash, or option values), enforced by the leak-regression
suite. Future consumers integrate through `GetSelectionVersionForResolution`, not events._

## Events consumed

| Event | From | Why |
|---|---|---|
| — | — | none in Phase 3.5 |

## APIs exposed

| Route | Audience | Capability required |
|---|---|---|
| — | — | none in Phase 3.5 |

**No HTTP surface exists in this phase, deliberately.** Bootstrap does NOT return selections —
this module contributes nothing to client aggregation, and no controller exists. Subject-facing
election UI arrives with the owning capability (Zakat elections with the Zakat capability,
Phase 9), consuming this module's use cases behind its own purpose-limited surface. Admin
routes deliberately do not exist: there is nothing an operator may do to a subject's election.

## Permissions

| Permission | Role(s) |
|---|---|
| — | — |

**Permissions deliberately absent:** all of them. No role may record, withdraw, or read a
selection on a subject's behalf — no such use case, endpoint, permission, or PolicyService
port exists in this module, by design. The flows act strictly for the authenticated principal,
and the repository runs only under that principal's RLS context. Marketing, analytics,
support, and AI access are deliberately absent (purpose limitation, jurisdiction-policy.md §7
rule 5); future readers arrive with their own audited, purpose-limited surfaces or not at all.
No permission exists to delete a selection.

## Capability

- **CapabilityId:** — (platform mechanism, not a capability; rows reference capability ids
  validated against `@karar/capability-registry`'s production union)
- **declaredJurisdictions:** n/a — jurisdiction applicability is the referenced pack's
- **Required operating-entity licences:** none
- **Required integrations:** none
- **Required consent:** none of its own — consent gating for capability processing stays with
  the consent module; elections are not consents
- **SDK exposure:** no — selections are purpose-limited to the owning capability
- **White-label eligible:** no

## Jurisdictions and availability

| Jurisdiction | State | Reason |
|---|---|---|
| all | mechanism available wherever a pack declares option sets | the pack, not this module, decides which capabilities offer elections where |

## Operating entities

Not entity-scoped: an election is the subject's own choice within pack-permitted options.
Entity accountability for the CAPABILITY's processing stays with the operating-entity and
consent dimensions; selection rows deliberately carry no `operating_entity_id`.

## Policy dependencies

Reads per-capability subject-policy OPTION SETS and the applicable PolicyPack version through
the locally-declared `SubjectOptionSource` port (the jurisdiction-policy workstream's pack
resolution binds it at composition; only `__tests__/fakes` contains fakes). Restrict-only: a
selection may only narrow among pack-permitted options — recording denies an option outside
the set, a capability with no declared subject policy, and a pack version that is not the
applicable one (including a concurrent pack change during recording, detected by re-check).
An unresolvable option set is a typed denial, fail closed. This module declares subject-elected
options as its ONLY concern; it declares no options of its own.

## Legal documents

None of its own. Documents describing a capability's elective behaviour (e.g. Zakat
methodology disclosures) belong to that capability and the consent module's catalogue; any
promise made there about elections must be reflected here when the capability lands.

## Dependencies

| Module / package | Via | Why |
|---|---|---|
| `@karar/capability-registry` | package import | the production CapabilityId union recording validates against (APIs stay generic over `Id extends string`; production pins CapabilityId) |
| `@karar/audit` | `public-api.ts` | every state change is audited (reference-only metadata) |
| `@karar/platform` | package import | persistence, `withPrincipalContext` |
| `@karar/shared-kernel` | package import | `Result`, `TenantId`, `UserId` |

Cross-module references carry a raw value plus a reference type declared **in this module**
(`ProfileRef` for the owning capability's profile, `JurisdictionRef` for the regime;
`user_id`/`tenant_id` are the kernel's `UserId`/`TenantId`; `capability_id` is a registry id).
`@karar/jurisdiction-policy` is deliberately NOT a dependency: pack types stay behind the
`SubjectOptionSource` port until the lead binds the real resolution at composition.

## Ports declared

| Port | Implementations |
|---|---|
| `SubjectOptionSource` | jurisdiction-policy workstream's pack resolution (bound at composition); test fakes in `__tests__/fakes` |
| `SubjectPolicySelectionRepository` | `PrismaSubjectPolicySelectionRepository` (infrastructure; wired by the composition root) |
| `IdSource` | `Uuidv7IdSource` (infrastructure) |

## Projections

| Projection | Carries | Must never carry |
|---|---|---|
| `SelectionVersionResolution` (pinned-version reader output) | selection id, capability id, jurisdiction ref, pack version, profile ref + version, effective-from | option CONTENT, snapshot hashes, any other subject's rows |

## Tests

Unit: temporal resolution (effective/expired/none, historical replay, withdrawal instants),
restrict-only recording denials (option outside set, unknown capability, no-subject-policy
capability, stale pack version), the pack-version race (a fake flips versions mid-flow), the
synthetic capability contract through generic typing, and the leak regression over real audit
entries and serialized outputs. Integration (live PostgreSQL, scratch database): the recording
lifecycle on real capability ids, supersession with historical reproducibility, expiry denied
on read, adversarial RLS (non-empty own reads first, cross-tenant and cross-user invisibility,
missing-GUC denial), immutability triggers held against the table owner, RLS posture, and the
audit-trail leak regression against `audit.audit_events`.

## Notes and known limitations

**Selections restrict, never expand.** Recording is validated against the pack's option set at
the applicable pack version; everything outside is a typed denial. Where a capability declares
no subject policy, absence is the designed common case — reads return
`NO_SELECTION_APPLICABLE`, recording refuses, and no row exists to cost anything.

**Rows are immutable provenance.** The only transitions are ACTIVE→SUPERSEDED (re-election
inserts a new row), ACTIVE→WITHDRAWN (row preserved, `withdrawn_at` set), and ACTIVE→EXPIRED
(a marker the read path already derives from `effective_to`; no Phase 3.5 code path writes
it — trigger-permitted for a later lifecycle job). Enforced by trigger even for the table
owner. Single-ACTIVE-per-(user, tenant, capability) is enforced by the recording use case
inside the principal-context transaction, not by a partial index (kept out of the schema so
the Prisma mapping stays exact for the drift gate); concurrent duplicate ACTIVE rows are
tolerated by resolution (latest wins) and superseded on the next recording.

**The pack-version race is detected, not transacted away.** Pack resolution is code, not a
database row, so the re-check brackets the insert rather than sharing its transaction: the row
pins exactly the version the option was validated against, a detected flip is a typed
`PACK_VERSION_MISMATCH` with nothing recorded, and historical reads replay pinned versions —
a lost race can produce a refusal, never a mis-pinned row.

**Test-21 deferrals are not resolved here.** The pinning deferrals on `consent_grants` and
`data_protection_role_assignments` (pack version, selection version) await the Phase 3.5
security workstream; this module supplies the machinery those columns will reference.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
