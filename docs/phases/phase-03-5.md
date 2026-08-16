# Phase 3.5 — Jurisdiction and capability foundation

**Branch:** `claude/karar-v2-phase-3-5-jurisdiction-capabilities` · **Started:** 16 August 2026 · **Status:** COMPLETE (closed 16 August 2026)
**Base:** Phase 3 merge commit `fe3864a` on `main`.

Verification sections are filled by the phase lead after running the commands — they record executed results, never intentions.

## Close-out record

- **Completion date:** 16 August 2026.
- **Final branch:** `claude/karar-v2-phase-3-5-jurisdiction-capabilities`, merged into `main` through PR #6 (merge commit recorded in the PR; the branch was deleted after ancestry verification).
- **Final implementation head:** `5411b0d` — the last commit before the documentation-only close-out commit that completes this report.
- **CI and Security runs:** all 12 checks green at `5411b0d` — CI run [31953306622](https://github.com/MoayadAlobaidi/Karar-Flutter-version/actions/runs/31953306622) and Security run [31953306623](https://github.com/MoayadAlobaidi/Karar-Flutter-version/actions/runs/31953306623); 8 of the 12 are branch-protection-required. Re-verified green on the close-out head before merge.
- **Final canonical counts** (clean-clone run at `5411b0d`, 16 August 2026): workspace **1109 passed / 5 skipped (1114)** across **105 passed / 1 skipped (106)** files; readiness suite run separately **5 passed**; architecture **24 passed / 0 failed / 4 skipped**, registry errors 0, self-test **56/56**; documentation checks **7/7**; Prisma drift **43 mapped tables match**; **38 migrations**, all applied from zero; **48 tables** = 22 RLS ENABLE+FORCE + 33 allow-listed (7 both); **30 merged OpenAPI paths**; 24 module directories (12 with code) and 7 packages.
- **Clean-clone verification:** PASS. A fresh clone of `5411b0d` reused nothing — no `node_modules`, `dist`, generated Prisma client, database, Docker volume, Redis data, environment file, or local key material. Pinned toolchain verified (Node 25.9.0, pnpm 11.18.0, Flutter 3.47.0); frozen-lockfile install; the full compose stack (PostgreSQL, Redis, MinIO, OpenTelemetry) started from empty volumes; roles, database and all 38 migrations applied from zero with checksums verified and drift clean; the whole `make verify` gate green; the readiness suite run in isolation; the worker booted and drained cleanly on SIGTERM. Three phase-specific invariants were proven directly rather than inferred: `qa/v1` is DRAFT with an empty cleared-capability set and a null approval reference, and `canActivate` **denies production, staging and dev while permitting only local**; all seven capabilities are NOT_IMPLEMENTED and deployed nowhere, with Amanat hidden, declaring no jurisdiction, and its descriptor frozen; and the local-only encryption and mail providers **refuse to construct in production, staging and dev** while constructing in local. Stack removed with volumes. Window 16:10–16:12 UTC. This is maintainer reproducibility verification, not independent organizational testing.
- **Security-suppression review:** PR #6 introduced **no new suppressions**. `.gitleaksignore` is unchanged from Phase 3 (two exact-fingerprint entries reviewed at that close as EV-318), there are zero open code-scanning alerts, and the single dismissed alert also predates this phase. Both pre-existing suppressions were re-confirmed as narrow and correct.
- **Compliance gate:** recorded in [`../compliance/phase-compliance-gate.md`](../compliance/phase-compliance-gate.md) with its outcome and every deferred item's reason, owner, target, residual risk, and closure condition.
- **Evidence:** EV-401–EV-429 reconciled against the executed runs; nothing is OPERATING or EVIDENCED.
- **Independent review:** 0 BLOCKING / 7 HIGH / 11 MEDIUM / 13 LOW. Every HIGH and MEDIUM was resolved before the PR. Agent review is technical review, not organizational independence.
- **Carried risks and limitations:** consent acceptance is unreachable until a jurisdiction assignment and pack activation have a write path; bootstrap cannot yet distinguish a resolution failure from a legitimate empty capability set; the bootstrap response carries no safe operating-entity summary; the capability-clearance bridge fails closed and must be completed before any real capability is marked implemented or deployed. All four are Phase 4 entry work.
- **Scope confirmation:** no Phase 4 implementation, no financial, AI, Zakat, Amanat or subscription scope, and no cloud or DNS configuration was created in Phase 3.5. `apps/mobile/lib` still contains only its Phase 1 placeholder. No legacy Qarar code was copied — a repository-wide scan finds zero occurrences in any source file.

---

## Objective

Make "where does this principal operate, and what may this deployment offer them" a typed, versioned, restrict-only question: Country as reference data separate from Jurisdiction as the policy key; explicit audited jurisdiction assignments for users and tenants; pure typed PolicyPacks with a lifecycle and the Qatar `qa/v1` draft (DRAFT / PENDING_LEGAL_REVIEW, never production-activatable, no fabricated legal decisions); an extensible resolution-strategy registry and one `EffectivePolicy` resolution result; the `SubjectPolicySelection` mechanism with capability-owned content; a compile-time capability registry with separated lifecycle/implementation/deployment states and deny-by-default availability resolution; tenant capability entitlements without subscription logic; consent, operating-entity/licence, and provider gates; secure session tenant binding resolving the Phase 3 dormant surface (KAR-RSK-021); and one authenticated client bootstrap endpoint that hides what must not be seen.

## Scope

Country reference model · Jurisdiction model · user and tenant jurisdiction assignments · typed versioned PolicyPacks with lifecycle and provenance · `qa/v1` draft pack · resolution-strategy registry · `EffectivePolicy` resolver · processing-basis declarations and unresolved retention states · identity-requirement and AI-processing policy seams · `SubjectPolicySelection` · capability-owned profile contracts · compile-time Capability Registry · lifecycle/implementation/deployment states · deny-by-default availability · tenant capability entitlements · operating-entity and licence gates · consent/re-consent integration · provider availability seam · environment-aware resolution · session tenant binding, switching, and first-party bootstrap · authenticated client bootstrap API · audit and provenance across all of it.

## Out of scope

Flutter consumer UI (Phase 4) · financial accounts, transaction ingestion, budgeting, goals, financial calculations (Phases 5–6) · AI provider/model integration (Phase 7) · Zakat calculation logic and methodology profile content (Phase 9) · Amanat (Phases 13–14) · subscriptions, prices, plans (Phase 10) · white-label UI/data plane (Phase 11) · Super Admin UI (Phase 8) · cloud provider adapters, Cloudflare DNS records or services, GCP/AWS infrastructure, and any DEV/STAGING/PRODUCTION deployment.

## Agent/workstream ownership

Owners are workstream roles; the lead's ledger is authoritative.

| Workstream | Owner | Responsibility |
|---|---|---|
| Lead | Phase lead | Integration and composition (module wiring in `apps/api`, port binding at the composition root, OpenAPI merge), migration-number ranges, verification runs, phase gates, final merge |
| Jurisdiction and PolicyPacks | Jurisdiction workstream | `packages/jurisdiction-policy` and `modules/jurisdiction`; migrations `0070`–`0075` |
| Capability registry and availability | Capability workstream | `packages/capability-registry` and `modules/capability`; migrations `0076`–`0077` |
| Subject policy | Subject-policy workstream | `modules/subject-policy`; migration `0083` |
| Tenant binding and bootstrap | Bootstrap workstream | `modules/bootstrap`, the identity and tenancy binding seams; migrations `0080`–`0081`; `platform.yaml` contract |
| Security | Security workstream | Threat-model and access-control updates; the legal-consequence pinning migration `0086` |
| Compliance | Compliance workstream | Control-matrix, risk-register, and evidence-register updates for Phase 3.5 |
| Documentation | Documentation workstream | Architecture-doc landed-state updates, onboarding Q54–Q59, glossary, README, this report's body |
| Independent review | Reviewer | Reviews the integrated result without having built it |

All workstreams resolve to a single maintainer directing agent workstreams — see Known limitations.

## Deliverables

| Deliverable | Location |
|---|---|
| Pure jurisdiction-policy package: Country reference data, the Jurisdiction model with its review lifecycle, the `PolicyDecision` union, the typed `PolicyPack` contract, `canActivate`/`canResolveExplicitVersion`, `validatePack`/`validatePackSet`, the resolution-strategy registry, `resolveEffectivePolicy` | `packages/jurisdiction-policy/src/` |
| The `qa/v1` draft pack — DRAFT / PENDING_LEGAL_REVIEW, empty `clearedCapabilities`, every decision slot an explicit `PENDING_LEGAL_REVIEW` with its open question, `approvalReference: null` | `packages/jurisdiction-policy/src/packs/qa-v1.ts` |
| Jurisdiction module: the country and jurisdiction registers, effective-dated user and tenant assignments with separated source and verification axes, restrict-only settings reads, the append-only pack-activation ledger, `EffectiveJurisdictionState` | `modules/jurisdiction/` |
| Compile-time capability registry: the closed `CapabilityId` union, the descriptor shape with three separated state dimensions, the reviewed production registry, structural validation generic over the id type | `packages/capability-registry/src/` |
| Capability module: the eight-gate resolution engine as one pure function, availability rows and tenant entitlements with trigger-written ledgers, permission-gated management use cases, the consent/licence/provider port adapters, the one client-safe projection | `modules/capability/` |
| Subject-policy module: immutable, version-pinned selection records under tenant+user RLS, restrict-only recording validated against the pack option set, temporal reads, the pinned-version reader, reference-only audit | `modules/subject-policy/` |
| Session tenant binding seams: `BindSessionTenant` (first bind, no rotation) and `RebindSessionTenant` (switch, full session and refresh-family rotation) | `modules/identity/application/use-cases/session-tenant-binding.ts` |
| Tenancy binding surface: `ListOwnMemberships`, `ResolveTenantContext` (UNBOUND / AUTO_BIND / TENANT_SELECTION_REQUIRED), `SwitchTenant` with verify→act→re-verify→compensate, `GrantFirstPartyMembership` as an explicit audited use case | `modules/tenancy/application/use-cases/` |
| Bootstrap module: `GET /platform/bootstrap` with its documented auto-bind side effect, `POST /platform/tenant-binding`, and the closed-field-set response serializer that is the leak boundary | `modules/bootstrap/` |
| First-party tenant as typed configuration (`KARAR_FIRST_PARTY_TENANT_ID`, required outside `local`) plus the local seed script | `packages/platform/src/config/config.ts`, `scripts/db/seed-local-first-party.mjs` |
| OpenAPI contract fragment for the platform surface, authored contract-first | `packages/api-contracts/openapi/paths/platform.yaml` |
| Eleven new tables, two policy-only migrations, and the legal-consequence pinning migration | `packages/platform/db/migrations/0070`–`0086` |
| Documentation: landed-state rewrites of `jurisdiction-policy.md` and `capability-registry.md`, the tenant-binding and bootstrap sections of `tenancy.md`, updates across `data-model.md`, `capability-map.md`, `operating-entity.md`, `extension-pattern.md`, `backend.md`, `overview.md`, onboarding Q54–Q59, glossary Phase 3.5 terms, README, and the new domain/DNS ownership-and-renewal runbook | `docs/`, `README.md`, `docs/operations/domain-and-dns-runbook.md` |

## Architecture changes

**None to the approved architecture.** ADRs 0014, 0015, and 0016 are implemented as written. Decisions made within the architecture, recorded explicitly:

1. **Country and Jurisdiction are separate models with separate registers, and nothing assumes one jurisdiction per country.** The seeded set carries `AE` and `AE-DIFC` specifically so the free-zone case is structural rather than hypothetical. Registers change by reviewed migration only; no runtime write path, use case, or permission exists for either ([`jurisdiction-policy.md` §1](../architecture/jurisdiction-policy.md)).
2. **A pending policy decision is a first-class typed state.** `PolicyDecision` has three arms — `DECIDED` with its basis, `PENDING_LEGAL_REVIEW`, `UNRESOLVED` — so a pack can honestly carry an undecided question, while a *required* decision that is absent entirely fails validation. This is what let `qa/v1` exist without fabricating a single legal answer.
3. **Restrict-only became structural rather than checked.** `JurisdictionRuntimeSettings` has no field capable of expressing an enablement, and migration `0074` has no such column, so "settings widening" is not expressible before any merge logic runs.
4. **Capability state is three separated dimensions, not one `status`.** Lifecycle (intent), implementation (does the code exist), and per-environment deployment are independent, because they legitimately disagree. Earlier documentation's single `status: 'ALPHA'` field and its "GA (planned)" registry rows are superseded ([`capability-registry.md` §3](../architecture/capability-registry.md)).
5. **The gate order is the restrict-only control.** Gates 1–4 (descriptor, environment, jurisdiction/pack, availability) consume no grant-like input and run before gates 5–8 (entitlement, consent, licence, provider), so no grant can widen a ceiling denial. The property harness proves the monotonicity over generated configurations rather than asserting it in prose.
6. **Client exposure is decided in exactly one place, deny-by-default.** Hidden capabilities and non-actionable denial reasons are omitted from client output entirely rather than returned as `available: false` with a reason. The bootstrap surface consumes the client-safe projection unenriched, so the filter cannot drift into two implementations.
7. **Capability descriptors live centrally, not in `<module>/capability.ts`.** The registry is a closed compile-time union whose validator must see every descriptor at once; scattering them would make "what exists" a build step rather than a readable reviewed constant. Documentation describing a per-module descriptor file is superseded ([`extension-pattern.md` §5](../architecture/extension-pattern.md)).
8. **Entitlements gate; they do not price.** `tenant_capability_entitlements` carries no plan, price, or subscription concept — `source_ref` is an opaque seam a future subscription module fills by minting its own references (Phase 10).
9. **Binding is routing; per-request checks remain authoritative.** A session's tenant binding selects context. Membership verification and RLS decide authority and visibility on every request, and the switch path's verify→act→re-verify→compensate sequence narrows a race window rather than replacing that guarantee ([`tenancy.md` §6](../architecture/tenancy.md)).
10. **First bind and switch are deliberately different doors.** First bind sets a null binding with no token rotation (nothing exists to invalidate); a switch atomically revokes the session and its refresh families and issues a new session, so no token survives pointing at the previous tenant.

## ADRs added/amended

None. The record stands at ADR-0001–0026. Phase 3.5 implements ADR-0014 (jurisdiction vs country), ADR-0015 (typed PolicyPacks, restrict-only settings, extensible resolution, subject-elected policy), and ADR-0016 (capability registry, governance only), reads ADR-0024's processing-basis rule into the pack shape, and applies the ADR-0021 deferral to every operator surface it would otherwise have needed.

## Code and package changes

- **`packages/jurisdiction-policy`** — replaced the Phase 1 placeholder with the real package: `country.ts`, `jurisdiction.ts`, `jurisdiction-id.ts`, `environment.ts`, `decision.ts`, `policy-pack.ts`, `lifecycle.ts`, `validation.ts`, `packs/qa-v1.ts`, `resolution/strategies.ts`, `resolution/effective-policy.ts`. Framework-free; its only dependency is `@karar/shared-kernel`.
- **`packages/capability-registry`** — new package: the closed id union, descriptor shape, production registry, and `validation.ts`. Its only dependency is `@karar/jurisdiction-policy` (it imports `JurisdictionId`; the reverse import would close a package cycle, which is why capability ids travel through the policy package as plain strings generic over `Id extends string`).
- **`modules/jurisdiction`, `modules/capability`, `modules/subject-policy`, `modules/bootstrap`** — four new modules with the standard anatomy, Prisma repositories under `withPrincipalContext`, per-module test suites, and their own `MODULE.md`. None exposes HTTP except `bootstrap`.
- **`modules/identity`** — the two session-tenant-binding use cases and the atomic `rebindSession` repository operation; exported through `public-api.ts` for the tenancy and bootstrap seams to consume behind ports they declare.
- **`modules/tenancy`** — `list-own-memberships.ts`, `resolve-tenant-context.ts`, `switch-tenant.ts`, `grant-first-party-membership.ts`, and the session-binding ports.
- **`packages/platform`** — business configuration section with the first-party tenant reference and the documented `LOCAL_FIRST_PARTY_TENANT_ID` local default.
- **`packages/api-contracts`** — `paths/platform.yaml`, merged by the lead into `openapi.yaml`.
- **`scripts/db/seed-local-first-party.mjs`** — the local/dev first-party tenant seed, guarded to `local` and `dev`.

## Database migrations

All forward-only, each with a mandatory `-- rollback:` recovery block and its lifecycle declarations in the file header; runner semantics unchanged ([`packages/platform/db/migrations/README.md`](../../packages/platform/db/migrations/README.md)). Number ranges are allocated per workstream; `0078`, `0079`, `0082`, `0084`, and `0085` are deliberately unused — gaps stay gaps, never backfilled.

| Range | Workstream | Creates |
|---|---|---|
| `0070`–`0075` | Jurisdiction | `countries` (0070); `jurisdictions` (0071); `user_jurisdiction_assignments` (0072); `tenant_jurisdiction_assignments` (0073); `jurisdiction_settings` (0074); `policy_pack_activations` (0075) |
| `0076`–`0077` | Capability | `capability_availability` + `capability_availability_history` (0076); `tenant_capability_entitlements` + `tenant_capability_entitlement_history` (0077) |
| `0080`–`0081` | Bootstrap | **No tables.** A self-arm SELECT policy on `tenant_members` (0080) and a member-arm SELECT policy on `tenants` (0081), so an authenticated-but-unbound principal can answer "which tenants do I belong to?" without any tenant GUC being fabricated |
| `0083` | Subject policy | `subject_policy_selections` |
| `0086` | Security | **No tables.** Completes the legal-consequence pinning block on `consent_grants` and `data_protection_role_assignments` |

**Table and RLS summary (CODE):** 48 tables now exist across `public`, `platform`, and `audit` — 22 RLS ENABLE+FORCE, 33 allow-listed with written reasons in [`rls-allow-list.json`](../../packages/platform/db/rls-allow-list.json), 7 deliberately both. The five new ENABLE+FORCE tables are the ones with a subject or tenant column (both assignment tables, subject policy selections, and the entitlement table with its history); the six new allow-list entries are reference and deployment-wide configuration with no such column (the two registers, jurisdiction settings, the activation ledger, and capability availability with its history), each `SELECT`-only or `SELECT`+`INSERT`-only for `karar_app`.

Three new append-only ledgers hold against the table owner as well as `karar_app`: `policy_pack_activations` (insert-only grant plus a statement-level immutability trigger) and the two `*_history` tables (written `SECURITY DEFINER` by trigger, with `karar_app` holding no `INSERT` at all, and `UNIQUE (row_id, version)` forbidding skipped or forked history). `subject_policy_selections` and both assignment tables are immutable by trigger with supersession, or end-only history, as their only lifecycle.

## API changes

Additive. Two new endpoints, both session-scoped self-service; contract authored first in `packages/api-contracts/openapi/paths/platform.yaml` and merged into `openapi.yaml` by the lead.

| Module | Surface |
|---|---|
| bootstrap | `GET /platform/bootstrap` — identity, binding state, and the client-safe jurisdiction / operating-entity / PolicyPack / capability view, with a **documented auto-bind side effect**; `POST /platform/tenant-binding` — first bind (no rotation) or switch (new session and refresh family; the response carries the new tokens) |
| jurisdiction | **None, deliberately** — assignments and pack activations are operator/system/seed-side use cases; the client reads jurisdiction context through bootstrap |
| capability | **None, deliberately** — bootstrap consumes the client-safe resolver through `public-api.ts` rather than re-deriving visibility at the transport edge; operator administration follows the ADR-0021 deferral |
| subject-policy | **None, deliberately** — subject-facing election UI arrives with the owning capability, behind its own purpose-limited surface |

Phase 3's ten dormant tenant-bound endpoints become reachable once a session carries a binding; no route contract changed to make that true.

**What the bootstrap surface must never return** is enforced structurally rather than by review: the response serializer emits a closed field set picked name by name, so hidden capabilities, unimplemented or pending-legal capabilities, Amanat's existence, internal licence detail, full PolicyPack content, raw consent evidence, internal audit or configuration data, and synthetic test capabilities are all outside it. A leak-regression suite drives fakes that try to leak through every port.

## Security controls

Each canonical in the linked document; framework mapping lives in the [control matrix](../compliance/control-matrix.md), updated by the compliance workstream in parallel.

- **Restrict-only, structurally.** Jurisdiction settings cannot express an enablement (type and table both), and the capability resolver's ceiling gates run before any grant-like input, proven by a property harness rather than by assertion ([`jurisdiction-policy.md` §2](../architecture/jurisdiction-policy.md), [`capability-registry.md` §4](../architecture/capability-registry.md)).
- **Deny by default, with absence as the ground state.** A missing availability row is `DISABLED`; a missing entitlement denies; both tables ship with no rows. The write path additionally refuses to *record* an allowing state above the descriptor ceiling (`ABOVE_CEILING`, audited as `DENIED`).
- **Fail-closed jurisdiction verification.** `EffectiveJurisdictionState` is a three-arm union so `NONE` and `UNVERIFIED` deny alike, and `USER_DECLARED` assignments are CHECK-bound to `UNVERIFIED` — a user-selected country cannot become a verified jurisdiction by any path.
- **Unapproved policy never governs production.** `canActivate` refuses DRAFT and pending packs outside `local`, and refuses an `APPROVED` lifecycle with no `approvalReference` everywhere; the runtime activation use case enforces the same predicate before writing a ledger row.
- **Client exposure is deny-by-default and single-sourced.** Only actionable denial reasons reach a client; hidden capabilities and legal, jurisdictional, and not-yet-built reasons are omitted entirely ([`capability-registry.md` §5](../architecture/capability-registry.md)).
- **Session switching rotates everything.** A tenant switch atomically revokes the session and its refresh-token families and issues a new session, so no token survives pointing at the previous tenant; membership is verified server-side before and after, and a concurrent revocation revokes the replacement session ([`tenancy.md` §6](../architecture/tenancy.md)).
- **Tenant selection widens nothing else.** Migrations `0080`/`0081` add read-only self and member arms so an unbound principal can list only their own memberships and only the tenants they actively belong to; the register is never enumerable, and INSERT/UPDATE policies are untouched.
- **Purpose limitation on subject elections.** `subject_policy_selections` is `CONFIDENTIAL`, RLS'd on both principal GUCs, publishes no events, exposes no HTTP, and grants no staff read path; audit metadata is reference-only, enforced by a leak-regression suite.
- **Deny-by-default authorization on every write path.** All four declared permissions (`jurisdiction.assignment.manage`, `jurisdiction.pack.activate`, `capability.availability.manage`, `capability.entitlement.manage`) are deliberately unseeded, so against the real `PolicyService` every mutating use case in these modules currently refuses.

## SOC 2 mapping

Deferred to the [control matrix](../compliance/control-matrix.md), which the compliance workstream updates for Phase 3.5 in parallel with this report — mapping is readiness work; **no SOC 2 attestation is claimed**.

## ISO 27001 mapping

As above: authoritative control IDs live in the [control matrix](../compliance/control-matrix.md); **no ISO/IEC 27001 certification is claimed**.

## Evidence produced

_Filled by the phase lead at close, against the [evidence register](../compliance/evidence-register.md)._

## Tests executed

Executed by the phase lead on 16 August 2026, after integration and after the independent review's findings were resolved, on the local gate (`POSTGRES_PORT=5433`, `REDIS_PORT=6380`, `KARAR_ENV=local`):

| Suite | Command | Result |
|---|---|---|
| Workspace (all packages, modules, apps) | `pnpm test` | **1109 passed / 5 skipped (1114)** across **105 passed / 1 skipped** files; the skipped file is the `KARAR_INTEGRATION`-gated readiness suite, which runs in its own CI step |
| Architecture tests | `pnpm arch:test` | **24 passed / 0 failed / 4 skipped** (deferred by registry activation phase); registry errors **0**; built-in self-test **56/56** seeded cases |
| Documentation checks | `pnpm docs:check` | **7/7** |
| Prisma drift | `make prisma-drift` | **43 mapped models match the live database** |
| Cross-cutting security suite | within `pnpm test` | `tests/security/__tests__/phase-3-5-policy-surface.integration.test.ts`, 16 tests, non-empty own reads proven before every denial |
| Flutter | CI `mobile` job | Unchanged mobile foundation; verified in the PR pipeline |

Architecture tests **12, 17, 19, 21, 22 and 26** are all active and passing. Test 19 was implemented this phase; test 21's Phase 3.5 deferral machinery was **removed** rather than extended, and pinning is now enforced against the schema.

The suites behind those totals, and what each covers:

| Suite | Covers |
|---|---|
| `@karar/jurisdiction-policy` | Country/Jurisdiction data honesty, the decision union, pack validation findings, the lifecycle gate (DRAFT never activates outside `local`; approval without evidence refused everywhere; retired versions still resolve historically), the strategy registry, `EffectivePolicy` resolution and its restrict-only merge, and the `qa/v1` honesty assertions |
| `@karar/capability-registry` | Registry structural invariants over both the production registry and synthetic registries |
| `@karar/jurisdiction` | Source/verification axes, temporal resolution, the three-arm effective state, ledger derivation, deny-by-default posture; live-PostgreSQL RLS isolation on non-empty data, end-only history guards against the owner, activation gates, append-only enforcement against `karar_app` and the owner, audit coverage |
| `@karar/capability` | Each gate separately and in combination, the client-exposure omission suite, the seeded restrict-only property harness, management use-case authorization and above-ceiling refusal, and live-PostgreSQL RLS, trigger-ledger, version-guard, and TOCTOU-pin behaviour |
| `@karar/subject-policy` | Temporal resolution, restrict-only recording denials, the pack-version race, the synthetic-capability generic contract, the audit leak regression; live-PostgreSQL supersession, expiry-on-read, adversarial RLS, and owner-proof immutability |
| `@karar/bootstrap` | Bootstrap composition, binding and switching, controller behaviour, and the closed-field-set leak regression |
| `@karar/identity`, `@karar/tenancy` | The binding and switching seams, including the concurrent-revocation compensation paths |

## Build results

Executed by the phase lead on 16 August 2026 via `make verify` (fail-fast chain), all green:

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` — clean across the workspace, including the two new packages and the four new modules.
- Database from zero: a fresh scratch database applied the full canonical history through `0086` cleanly, `db:verify` reported `clean` with nothing pending, and the Prisma mapping check matched all 43 mapped models. The shared local database was not used for this proof.
- Boot proof: the api's spawned-process lifecycle test boots the built `dist/main.js` with the whole Phase 3.5 composition mounted (jurisdiction reads, the capability resolver over its eight gates, the bootstrap surface, and the consent policy-pin source), reaches `api listening` without requiring PostgreSQL or Redis connections at boot, and exits cleanly on SIGTERM with empty stderr.
- Database posture at this head: **48 tables — 22 with RLS ENABLE+FORCE, 33 allow-listed with written reasons, 7 deliberately both.**

_The close-out record above is completed when the phase closes; these are the pre-PR verification runs._

## Documented deviations

Decisions taken during the phase that deviate from, or defer, something a reader of the plans or module documents might expect — recorded here rather than discovered later.

1. **No module in this phase exposes an operator HTTP surface, and all four declared permissions are unseeded.** Assignment administration, pack activation control, settings writes, availability management, and entitlement management exist as permission-gated use cases with no route, following ADR-0021. Deny-by-default means the absence *denies*: against the real `PolicyService` those use cases currently refuse, which is the honest state. Seeding is a reviewed migration that lands with the operator surface in Phase 8.
2. **`FUNDRAISING` is deliberately absent from the runtime registry.** It has no id, no descriptor, and nothing in the platform can reference it; it remains a documentation-only future concept. Earlier registry tables listing it as "not planned" implied a registry entry that does not exist.
3. **Capability descriptors live in `packages/capability-registry`, not in `<module>/capability.ts`.** No module carries a `capability.ts` or `permissions.ts` file; permissions are declared in `MODULE.md` and seeded by migration against the authorization module's closed catalogue. The architecture documents describing per-module files have been corrected.
4. **`modules/capability` holds the implementation; the `modules/capability-registry` Phase 0 placeholder was retired.** The placeholder carried no code — only a `MODULE.md` describing what `modules/capability` now implements, naming a `tenant_entitlements` table that does not exist. Two directories covering the same ground, one of them wrong, is worse than none: the lead deleted it at integration. The concept now lives in exactly two places, `packages/capability-registry` (compile-time types and the reviewed registry) and `modules/capability` (runtime resolution).
5. **`INTERNAL_ONLY` and `PARTNER_ONLY` deny in this phase.** No internal or partner audience model exists to check a principal against, and a state that cannot be checked must not widen access. When such a model lands they become checkable rather than silently permissive.
6. **The provider gate never fabricates a connection.** The only shipped source answers `NOT_CONFIGURED` for every kind, so a pack-required provider yields `PENDING_PROVIDER` — explainable to a client only where a descriptor opts in, which no production descriptor does.
7. **TOCTOU is pinned, not locked.** Each resolution reads one snapshot per dimension and records the pack version, availability row id and version, and entitlement id and version it used. Two resolutions racing a change may legitimately disagree; the pins say why. This is provenance, not serialization.
8. **Positive availability resolution is exercised only over synthetic registries.** Every production capability is `NOT_IMPLEMENTED`, so the allowed path is proven over test-local registries whose ids never enter the production union, the production registry, client output, or a database row — enforced by the write use cases validating against the production view and by the migrations' CHECK constraints.
9. **`packages/capability-registry` is not in architecture test 17's pure-package list.** It is framework-free by declaration (its only dependency is `@karar/jurisdiction-policy`) but the checker's list was not extended, so the property is not yet CI-enforced. Carried as deferred work.
10. **Single-row-per-key uniqueness is enforced by use case, not by a partial unique index**, in three places: one open jurisdiction assignment per subject, single-`ACTIVE` per `(user, tenant, capability)` selection, and the equivalent consent rule inherited from Phase 3. A partial unique index sits outside the Prisma schema language and would break the exactness the drift gate depends on. Concurrent duplicates are tolerated by resolution (latest wins) and superseded on the next write — the same trade-off the consent module recorded.
11. **The subject-policy pack-version race is detected, not transacted away.** Pack resolution is code, not a database row, so the re-check brackets the insert rather than sharing its transaction: a detected flip is a typed `PACK_VERSION_MISMATCH` with nothing recorded. A lost race produces a refusal, never a mis-pinned row.
12. **`subject_policy_selections` permits an `EXPIRED` status transition that no Phase 3.5 code path writes.** Expiry is derived on read from `effective_to`; the trigger permits the marker for a later lifecycle job.
13. **`GET /platform/bootstrap` has a documented side effect.** An unbound session with exactly one usable membership is auto-bound during the GET, without token rotation, verified again, and compensated by revoking the session if the membership vanished in the race window. The side effect is declared in the OpenAPI contract rather than left for a reader to discover, and both outcomes are audited.
14. **Auto-bind compensation revokes the session.** When a membership is revoked exactly inside the bind race window, the freshly bound session is revoked and the caller signs in again — fail closed, rare by construction.
15. **The bootstrap module holds identity, tenancy, platform, and audit as devDependencies only.** Runtime code imports none of them; every cross-module dependency resolves through ports the module declares, bound by the composition root. Integration tests compose the real seams.
16. **No kill switch guards the binding routes.** The switch-id registry is closed this phase and no existing id covers tenant binding; adding one is a control-plane change, not a side effect of this phase.
17. **Enrichment ports may return null.** The bootstrap response carries explicit nulls for an unresolved operating entity or PolicyPack rather than fabricated defaults, and the jurisdiction state is the typed three-arm value whose `NONE` arm is the fail-closed case.
18. **No catalogue-governed domain events were published this phase.** `JurisdictionAssigned`, `PolicyPackActivated`, `CapabilityAvailabilityChanged`, and `TenantEntitlementChanged` are plausible future entries and will join the catalogue with their first publisher. `subject-policy` publishes none *by rule*: a published event would be a side channel for a `CONFIDENTIAL` election.
19. **The legal-consequence pinning columns are a value/state pair, not a bare version column.** Migration `0086` adds a `NOT NULL` pin-state column beside each nullable version column, so a row must declare *why* a version is absent — a real pin, a capability with no elective options, or a record predating the machinery — rather than leaving a bare NULL or a sentinel string that would read like a version.

## Known limitations

- **Consent acceptance is unreachable this phase, and that is a regression from Phase 3.** `POST /consent/acceptances` now answers 503 `DEPENDENCY_UNAVAILABLE` for every caller. Migration 0086 requires a new grant to pin the PolicyPack version it was accepted under, the composition resolves that pin from the caller's effective jurisdiction assignment and the active pack activation, and neither record has a runtime write path in Phase 3.5 (jurisdiction assignment and pack activation are operator use cases with no HTTP surface and deliberately unseeded permissions). Refusing is correct — a grant whose provenance nobody resolved must not be written, and the schema refuses it independently — but the endpoint published in Phase 3 stopped working, including in `local`, until those rows exist. Documented in the OpenAPI contract and carried as a risk; closing it needs the operator surface or a seeded local path, which is Phase 4 entry work.
- **Nothing is available, anywhere.** Every entry in the capability registry is `NOT_IMPLEMENTED` and deployed nowhere, so gate 1 denies all seven regardless of any row, pack, or entitlement. The availability and entitlement tables ship with no rows. This is the designed state, not an outage.
- **No jurisdiction is approved and no pack is approved.** Every seeded jurisdiction is `DRAFT`; `qa/v1` is DRAFT / PENDING_LEGAL_REVIEW with `approvalReference: null`, clears no capability, and is refused activation outside `local`. Approval is a legal decision this repository cannot take.
- **`qa/v1` decides nothing.** Every decision slot is `PENDING_LEGAL_REVIEW` with its open question stated, so consent requirements, processing bases, retention periods, identity requirements, disclosure obligations, currency policy, and AI-processing permission for Qatar all remain undecided and fail closed. Retention placeholders elsewhere in the platform stay placeholders until legal review supplies numbers.
- **The two activation-gated architecture tests are the phase's outstanding verification items.** Test 19 (approval policy) reaches its activation phase this phase and test 21 (pinning) gates on the legal-consequence columns migration `0086` added. Their state at close, and any checker work they require, is the lead's verification record — the pack validator enforces the approval-policy rule independently through `MISSING_APPROVAL_POLICY`.
- **No operator or staff surface exists for any of it.** Availability, entitlements, assignments, settings, and pack activation are use cases without HTTP; they arrive with the Phase 8 control plane, on projections, audited.
- **Subject elections have no reader beyond the subject.** No staff, support, migration-tooling, or analytics path exists; any future reader must arrive as its own audited, purpose-limited surface.
- **The provider dimension is a seam with no implementation.** `NoProvidersConfiguredSource` answers `NOT_CONFIGURED` for every kind, which is honest rather than useful — a port with no implementation, per the platform rule.
- **`ZAKAT` and `AMANAT` carry non-engineering gates that no code can discharge.** No Sharia review, board, scholar, or certificate exists for Zakat; Amanat has no per-jurisdiction legal clearance and declares no jurisdiction, so it is unreachable by any pack. Neither gate is an engineering task.
- **Single maintainer.** Every workstream role resolves to one person; independent review is a role, not yet a separate party.

## Accepted risks

Carried with named owners; register entries are maintained by the compliance workstream in the [risk register](../compliance/risk-register.md).

| Risk | Owner |
|---|---|
| Single-maintainer bus factor across all roles (carried from Phases 1–3) | Maintainer |
| Concurrent duplicate open jurisdiction assignments and duplicate `ACTIVE` subject selections are tolerated by resolution (latest wins, superseded on the next write) — single-row uniqueness is enforced by the use case, not a partial unique index, to keep the Prisma mapping exact for the drift gate | Maintainer |
| Two resolutions racing an availability or entitlement change may legitimately disagree; the outcome is pinned and explainable, not serialized | Maintainer |
| A membership revoked inside the auto-bind or switch race window revokes the caller's session, requiring a fresh sign-in | Maintainer |
| `packages/capability-registry`'s framework-free property is declared but not yet CI-enforced (architecture test 17's list was not extended) | Maintainer |

## Deferred work

- **Phase 4 (Flutter foundation):** consuming the bootstrap surface — binding state, tenant selection UI, and capability-aware navigation driven by the client-safe capability view.
- **Phase 8 (control plane):** operator surfaces for jurisdiction assignments, pack activation, jurisdiction settings writes, capability availability, and tenant entitlements, with the reviewed migration that seeds the four declared permissions.
- **Phase 9 (Zakat):** `ZakatMethodologyProfile` content and the subject-facing election UI, consuming the subject-policy mechanism behind the capability's own purpose-limited surface.
- **Phase 10 (subscriptions):** a subscription module becoming an entitlement source through the `source_ref` seam. No plan, price, or billing concept enters the capability module.
- **Legal review:** every `PENDING_LEGAL_REVIEW` slot in `qa/v1`, and jurisdiction approval itself. A decision lands as a new pack version with its approval reference; published versions are immutable.
- **Housekeeping identified this phase:** add the internal/partner audience model that would make `INTERNAL_ONLY` and `PARTNER_ONLY` checkable rather than denying; add a kill-switch id covering tenant binding if the control plane wants one; complete the operating-entity safe id/name read surface the bootstrap response reports as absent today; and complete the clearance-facts mapping in the composition's policy-ceiling source, which currently fails closed when a pack clears a capability (unreachable while `qa/v1` clears nothing and every capability is unimplemented). The `modules/capability-registry` placeholder was retired at integration rather than carried.
- **Later phases:** catalogue-governed domain events with their first consumers; retention and purge jobs consuming PolicyPack numbers once they exist; an operator-facing view of resolution provenance pins.

## Documentation updated

Per the [phase-end ritual](README.md):

- Root `README.md` — module and package inventory, the domain and capability map, the country/jurisdiction summary, the quick start's first-party tenant note, and the testing section (property and leak-regression suites); status block and roadmap paragraph completed by the lead at close.
- [`../roadmap.md`](../roadmap.md) — Phase 3.5 row, by the lead at close.
- This report — body complete; verification sections filled by the lead at close.
- [`../onboarding/developer.md`](../onboarding/developer.md) — Q1, Q2, Q17, Q38, Q39 updated; Q54–Q59 added for adding a jurisdiction, adding a capability, adding a capability-scoped profile, reading an availability denial, running the new suites, and the local first-party tenant.
- [`../glossary.md`](../glossary.md) — Phase 3.5 terms added; the policy and capability entries brought to landed state.
- Architecture docs — [`jurisdiction-policy.md`](../architecture/jurisdiction-policy.md) and [`capability-registry.md`](../architecture/capability-registry.md) rewritten to landed state; [`tenancy.md`](../architecture/tenancy.md) gained the tenant-binding and bootstrap sections; [`data-model.md`](../architecture/data-model.md), [`capability-map.md`](../architecture/capability-map.md), [`operating-entity.md`](../architecture/operating-entity.md), [`extension-pattern.md`](../architecture/extension-pattern.md), [`backend.md`](../architecture/backend.md), and [`overview.md`](../architecture/overview.md) updated where Phase 3.5 made them stale.
- The four Phase 3.5 `MODULE.md` files — written by their module workstreams.
- `docs/security/` — security workstream, landed in parallel.
- [`../compliance/evidence-register.md`](../compliance/evidence-register.md), the control matrix, and the risk register (KAR-RSK-021 closure) — compliance workstream, parallel to this report.
- The documentation-index phase header and the phase-report rows in [`README.md`](README.md) — completed by the phase lead at close.

## Next-phase entry criteria

Phase 4 (Flutter foundation: bootstrap, routing, design system, Arabic RTL first-class, network, auth, secure storage, biometric lock, capability-aware navigation — [roadmap row 4](../roadmap.md)) may start when:

- The Phase 3.5 PR is merged to `main` with required CI checks green, and this report's verification sections are filled.
- The Phase 3.5 compliance gate is passed per [`../compliance/phase-compliance-gate.md`](../compliance/phase-compliance-gate.md), and KAR-RSK-021 is closed with the binding mechanism's adversarial and concurrency tests as its closure evidence.
- The bootstrap contract is stable and merged into `openapi.yaml`, because Phase 4's client is generated against it: the binding state machine (`UNBOUND` / `BOUND` / `TENANT_SELECTION_REQUIRED`), the auto-bind side effect, and the switch response's new tokens are all contract facts the client must handle.
- The client-exposure rule is understood before any navigation work begins: a capability absent from the bootstrap response is **not** a capability that is unavailable — it is one the client must not know exists. A client that renders "coming soon" for an omitted id defeats the filter.
- The first-party tenant path works end to end locally — seed, membership grant, bind — because every tenant-scoped screen depends on a bound session.
- It is understood that **no capability will resolve as available**, so Phase 4 builds against the denial and omission paths, with positive paths exercised against synthetic fixtures exactly as this phase's suites do.
