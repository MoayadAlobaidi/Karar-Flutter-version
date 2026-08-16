# Phase 3 — Identity, tenancy and access control

**Branch:** `claude/karar-v2-phase-3-identity-tenancy-security` · **Started:** 16 August 2026 · **Status:** in progress
**Base:** Phase 2 merge commit `d65df72` on `main`.

Verification sections are filled by the phase lead after running the commands — they record executed results, never intentions.

---

## Objective

Establish who a principal is and what they may touch: identity and authentication (registration, verification, password lifecycle, MFA foundation), persisted sessions with rotating refresh-token families and reuse detection, users as a separate bounded context, tenancy with memberships and secure invitations, operating entities with relationship-scoped data-protection roles, RBAC with deny-by-default and a central PolicyService, consent with versioned immutable grants and re-consent evaluation, restrict-only kill switches, Prisma confined to infrastructure over the canonical SQL migrations, transaction-local principal context, PostgreSQL RLS enabled and FORCEd on every tenant table, and adversarial cross-tenant isolation proven on non-empty data.

## Scope

Identity · authentication · user profiles · sessions · refresh-token rotation · MFA foundation · tenancy · memberships · invitations · operating entities · relationship-scoped data-protection roles · RBAC · permissions · consent · legal documents · re-consent evaluation · kill switches · Prisma domain persistence · local DataSourceResolver foundation · PostgreSQL RLS · adversarial cross-tenant isolation · security events.

## Out of scope

Jurisdiction PolicyPacks and capability availability (Phase 3.5) · SubjectPolicySelection resolution (Phase 3.5) · consumer Flutter features · financial accounts, transactions, budgets, financial engine (Phases 5–6) · AI (Phase 7) · Zakat (Phase 9) · Amanat (Phases 13–14) · subscriptions (Phase 10) · white-label data plane (Phase 11) · control-plane UI (Phase 8) · cloud provider adapters or infrastructure of any kind.

## Agent/workstream ownership

Owners are workstream roles; the lead's ledger is authoritative, and the final completion markers are added by the phase lead at close.

| Workstream | Owner | Responsibility |
|---|---|---|
| Lead | Phase lead | Integration and composition (module wiring in `apps/api`, kill-switch guard mounting), migration-number ranges, verification runs, phase gates, final merge |
| Platform persistence substrate | Platform workstream | Prisma 7 runtime (`createPrismaClient`, driver adapter, multi-file schema, drift gate), `withPrincipalContext`, `SingleDatasourceResolver`, rate limiting, trusted-proxy http, notifications port |
| Identity | Identity workstream | `modules/identity`: accounts, verification, password lifecycle, sessions, refresh rotation, MFA, security ledger; migrations `0030`–`0034`; the `/auth` surface |
| Users and tenancy | Users/tenancy workstream | `modules/users` and `modules/tenancy`: profiles, status intent, tenants, memberships, invitations; migrations `0040`–`0044` |
| Authorization and kill switches | Authorization workstream | `modules/authorization` and the control-plane kill-switch slice; migrations `0050`–`0054` |
| Operating entity and consent | Entity/consent workstream | `modules/operating-entity` and `modules/consent`; migrations `0060`–`0065` |
| Cross-cutting security suite | Security workstream | `tests/security/` adversarial suites; `docs/security/` updates (landed in parallel) |
| Compliance | Compliance workstream | Control-matrix and evidence-register updates for Phase 3 controls (`docs/compliance/`, parallel to this report) |
| Documentation | Documentation workstream | Architecture-doc implemented-state updates, onboarding Q49–Q53, glossary, README, this report's body |
| Independent review | Reviewer | Reviews the integrated result without having built it |

All workstreams currently resolve to a single maintainer directing agent workstreams — see Known limitations.

## Deliverables

| Deliverable | Location |
|---|---|
| Prisma 7 runtime, infrastructure-only: `createPrismaClient` over `@prisma/adapter-pg` and `ConnectionProfile` pools; multi-file mapping schema; one-directional drift gate (`make prisma-drift`); client generation (`make prisma-generate`) | `packages/platform/src/db/prisma.ts`, `packages/platform/prisma/schema/`, `scripts/db/prisma-mapping-check.mjs`, `Makefile` |
| Transaction-local principal context: `withPrincipalContext` / `withTenant` binding the four `app.*` GUCs, fail-closed on missing context | `packages/platform/src/db/principal-context.ts` |
| `DataSourceResolver` seam with the Phase 3 implementation (`SingleDatasourceResolver`) | `packages/platform/src/db/datasource-resolver.ts` |
| Rate limiting (Redis sliding window, HMAC-digest keys, per-policy store-failure modes), trusted-proxy client-IP derivation, notifications port with fail-closed local mail sink | `packages/platform/src/ratelimit/`, `packages/platform/src/http/`, `packages/platform/src/notifications/` |
| Identity module: accounts, e-mail verification, argon2id with parameter versioning, sessions, rotating refresh-token families with reuse detection, non-resetting lockout, TOTP MFA with encrypted secrets and recovery codes, append-only security ledger, `IdentityApiModule` | `modules/identity/` |
| Users module (separate bounded context): profile and account-status intent, `UsersApiModule` | `modules/users/` |
| Tenancy module: tenants, memberships, secure invitations with sha256 token hashes and token-scoped RLS redemption, `TenancyApiModule` | `modules/tenancy/` |
| Authorization module: closed permission/role catalogue (14 permissions, 8 roles), role assignments, the one `PolicyService` engine satisfying the sibling modules' ports, `requirePermission(...)` guard and `authorize()` helper | `modules/authorization/` |
| Control-plane kill-switch slice: restrict-only switch registry, fail-closed read path, audited operate use case, `RequireOperationAllowed(...)` guard and `KillSwitchPort` | `modules/control-plane/` |
| Operating-entity module: entity register, licences as typed references, relationship-scoped data-protection role assignments, entity bindings, audited EntityMigration workflow; HTTP contract-only | `modules/operating-entity/` |
| Consent module: legal-document lifecycle with mandatory reviewed re-consent classification, immutable entity-pinned grants, append-only re-consent evaluations, fail-closed `AssertConsentFor`, `ConsentApiModule` | `modules/consent/` |
| RLS across every Phase 3 table: 17 ENABLE+FORCE, 27 allow-listed with written reasons, 7 deliberately both (bootstrap arms) | migrations `0030`–`0065`, `packages/platform/db/rls-allow-list.json` |
| Cross-cutting adversarial security suite: cross-tenant isolation (10 tests) and privilege abuse (9 tests) on scratch databases | `tests/security/` |
| OpenAPI contract fragments for the five module surfaces (operating-entity contract-only) | `packages/api-contracts/openapi/paths/{identity,users,tenancy,consent,operating-entity}.yaml` |
| Architecture-test activations (9, 21, 22; test 4 narrowed) and registry at `currentPhase: 3` | `scripts/checks/architecture.mjs`, `docs/testing/architecture-test-registry.json` |
| Documentation: implemented-state updates across five architecture docs, onboarding Q49–Q53, glossary Phase 3 terms | `docs/architecture/`, `docs/onboarding/developer.md`, `docs/glossary.md` |

## Architecture changes

**None to the approved architecture.** Decisions made within it, recorded explicitly:

1. **Prisma 7 arrived infrastructure-only, as a mapping — never a second migration system.** `createPrismaClient` is the sole constructor, riding the `@prisma/adapter-pg` driver adapter over the same `ConnectionProfile` pools as the raw adapter; the multi-file schema maps the SQL-migrated tables; canonical SQL migrations remain the only migration authority, with one-directional drift detection. ADR-0005 stands unamended ([`backend.md` §6](../architecture/backend.md)).
2. **Principal context is four GUCs bound transaction-locally, fail-closed.** One parameterized `set_config(…, true)` statement per transaction; policies read via `NULLIF(current_setting(name, true), '')` so unset context matches no rows; `SET SESSION` on `app.*` is forbidden. Layer 2 is explicit repository filters inside the wrapper rather than a Prisma client extension ([`tenancy.md` §2–§3](../architecture/tenancy.md)).
3. **`identity_accounts.id` IS the platform `UserId`.** One identifier across identity, users, tenancy, and the `app.user_id` GUC — there is no second user id. Identity tables are keyed by account, not tenant, with recorded bootstrap arms for pre-principal authentication reads.
4. **The control plane shipped one slice ahead of its phase.** Restrict-only kill switches landed in Phase 3 because identity and tenancy operations need an incident brake; the gateway itself (admin identities, scoped tokens) remains Phase 8 (ADR-0021).
5. **`DataSourceResolver` landed as a seam with a single-datasource implementation.** Every tenant resolves to the one shared datasource (topology rung L0); routing resolvers arrive with dedicated-database deployments and replace it at the composition root only ([`database-portability.md` §4](../architecture/database-portability.md)).

## ADRs added/amended

None. The record stands at ADR-0001–0026. Phase 3 implements ADR-0008 (multi-tenancy), ADR-0022 (RLS in Phase 3), and ADR-0024 (operating entity and consent), and applies the ADR-0021 deferral to its admin surfaces.

## Code and package changes

- `packages/platform` — new source areas: `db/prisma.ts` (sanctioned Prisma constructor), `db/principal-context.ts`, `db/datasource-resolver.ts`, `ratelimit` (policies with explicit per-endpoint store-failure modes, Redis and in-process limiters), `http` (trusted-proxy client-IP derivation), `notifications` (port; `LocalMailSink` fails closed outside `KARAR_ENV=local`); `prisma/schema/*.prisma` mapping files per module; generated client git-ignored under `prisma/client/`.
- `modules/identity`, `modules/users`, `modules/tenancy`, `modules/authorization`, `modules/operating-entity`, `modules/consent`, `modules/control-plane` — first real code: domain/application/infrastructure per the module anatomy, Prisma repositories under `withPrincipalContext`, per-module adversarial integration suites, `MODULE.md` files written by their workstreams. HTTP presentation exists in identity, users, tenancy, and consent; authorization and the kill-switch slice deliberately expose none.
- `packages/api-contracts` — five OpenAPI path fragments authored contract-first (ADR-0009).
- `tests/security` — new workspace project `@karar/security-tests`: the cross-cutting adversarial suite over scratch databases.
- `scripts/db/prisma-mapping-check.mjs` — the drift gate; `scripts/checks/architecture.mjs` — checks for the newly activated tests.
- `Makefile` — `prisma-generate` and `prisma-drift` targets.

## Database migrations

All forward-only, each with a mandatory `-- rollback:` recovery block and its lifecycle declarations in the file header; runner semantics unchanged from Phase 2 ([`packages/platform/db/migrations/README.md`](../../packages/platform/db/migrations/README.md)). Number ranges are allocated per workstream; `0045` and `0055` are deliberately unused — gaps stay gaps, never backfilled.

| Range | Workstream | Creates |
|---|---|---|
| `0030`–`0034` | Identity | `identity_accounts`, `password_credentials`, `email_verifications`, `password_reset_requests` (0030); `sessions`, `refresh_token_families`, `refresh_tokens` (0031); `mfa_enrolments`, `mfa_recovery_codes` (0032); `authentication_security_events` (0033); grants/policies cleanup (0034) |
| `0040`–`0044` | Users/tenancy | `user_profiles`, `user_status_history` (0040); `tenants` with self-row RLS policy (0041); `tenant_members` (0042); `tenant_invitations` (0043); token-scoped invitation-redemption policies (0044) |
| `0050`–`0054` | Authorization/kill-switch | `permissions` (0050); `roles`, `role_permissions` (0051); `role_assignments` (0052); `kill_switches`, `kill_switch_history` (0053); grants/policies cleanup and pins (0054) |
| `0060`–`0065` | Entity/consent | `operating_entities`, `entity_jurisdiction_permissions` (0060); `entity_licences` (0061); `data_protection_role_assignments` (0062); `operating_entity_assignments`, `entity_migrations` (0063); `legal_documents`, `legal_document_versions` (0064); `consent_grants`, `reconsent_evaluations`, `processing_basis_references` (0065) |

**RLS summary (CODE):** 37 tables now exist across `public`, `platform`, and `audit` — 17 RLS ENABLE+FORCE, 27 allow-listed with written reasons in [`rls-allow-list.json`](../../packages/platform/db/rls-allow-list.json), 7 deliberately both (identity's bootstrap-armed tables). Policies read GUCs via the fail-closed `NULLIF(current_setting(name, true), '')` pattern. Append-only ledgers (`authentication_security_events`, `kill_switch_history`, plus trigger-guarded immutability on consent grants, entity migrations, and revoked role assignments) hold even against the table owner.

## API changes

All additive — the Phase 2 surface was health endpoints only. Contract fragments are authored contract-first in `packages/api-contracts/openapi/paths/`; module HTTP surfaces are exported through each module's `public-api.ts` and are composed into `apps/api` during lead integration.

| Module | Surface |
|---|---|
| identity | 17 endpoints under `/auth`: register, verify-email, resend-verification, login, refresh, logout, forgot/reset/change password, MFA enroll/confirm/challenge/recovery/disable, session list/revoke/revoke-others |
| users | `/users/me` (read, update approved fields), `/users/me/disable-request` |
| tenancy | `/tenancy/tenant`, `/tenancy/members`, `/tenancy/invitations` (create), `/tenancy/invitations/{id}/revoke`, `/tenancy/invitations/redeem` |
| consent | 4 subject endpoints: `/consent/documents`, `/consent/acceptances`, `/consent/withdrawals`, `/consent/status` |
| operating-entity | **Contract-only** — `operating-entity.yaml` authored; entity-admin HTTP deferred to the control-plane phase (ADR-0021) |
| authorization | **None, deliberately** — no role-administration HTTP this phase; grants run through use cases |
| control-plane | **None** — the kill-switch read path is a port and guard, not an endpoint; clients learn of a restriction by the guarded operation answering 503 |

No route returns credential material to any caller; no admin route lists or searches accounts. Deliberately absent surfaces are recorded per module in `MODULE.md`.

## Security controls

Phase 3 controls, each canonical in the linked document; framework mapping lives in the [control matrix](../compliance/control-matrix.md) (updated by the compliance workstream in parallel):

- **RLS enabled and FORCEd on every table, or allow-listed with a written reason** — fail-closed GUC predicates, no `BYPASSRLS` on the app role, architecture test 22 active ([`tenancy.md` §4](../architecture/tenancy.md), ADR-0022).
- **Transaction-local principal context** — `withPrincipalContext` binds identity from the caller's own record, never client input; missing context fails closed before any query; session-scoped `app.*` bindings forbidden (architecture test 9) ([`tenancy.md` §3](../architecture/tenancy.md)).
- **Adversarial isolation proof on non-empty data** — per-module suites plus `tests/security/`: cross-tenant SELECT/INSERT/UPDATE/DELETE denial, FORCE-vs-owner probes, pooled-connection GUC hygiene across both persistence paths, escalation probes ([`tenancy.md` §2](../architecture/tenancy.md)).
- **Credential storage and rotation discipline** — argon2id with versioned parameters and rehash-on-login; refresh tokens random 32 bytes stored as sha256 only, one-time atomic rotation with family revocation on reuse; TOTP secrets and recovery codes encrypted via `EncryptionProvider`; no route or permission returns credential material ([`../security/access-control.md`](../security/access-control.md), [`modules/identity/MODULE.md`](../../modules/identity/MODULE.md)).
- **Minimal tokens, immediate revocation** — ES256 access tokens carry `{sub, sid, iss, aud, iat, exp, tv}` only; roles re-derived per request; token-version bump kills issued tokens ([`../security/access-control.md`](../security/access-control.md)).
- **Deny-by-default RBAC with a closed catalogue** — no wildcards (grammar CHECK plus code validation), delegation peer rule, denials audited, store failure denies ([`../security/access-control.md`](../security/access-control.md)).
- **Restrict-only kill switches, fail-closed on outage** — no state enables anything; store outage answers 503 rather than silently enabling; versioned append-only history ([`modules/control-plane/MODULE.md`](../../modules/control-plane/MODULE.md)).
- **Fail-closed consent resolution** — `AssertConsentFor` denies on no grant, withdrawal, unresolvable entity, or outstanding material re-consent; unclassified publication blocked by typed error and CHECK constraint ([`modules/consent/MODULE.md`](../../modules/consent/MODULE.md), ADR-0024).
- **Edge protections** — trusted-proxy-gated client IP (never the header alone), Redis sliding-window rate limits fail-closed on every credential-guessing surface, invitation tokens stored only as sha256 with oracle-free denials ([`backend.md` §10](../architecture/backend.md)).
- **Local-only providers fail closed** — `LocalDevEncryptionProvider`, `LocalDevKeyProvider`, and `LocalMailSink` throw at construction outside `KARAR_ENV=local`; a deployment profile must wire real providers ([`../security/secrets.md`](../security/secrets.md)).

## SOC 2 mapping

Deferred to the [control matrix](../compliance/control-matrix.md), which the compliance workstream updates for Phase 3 in parallel with this report — mapping is readiness work; **no SOC 2 attestation is claimed**.

## ISO 27001 mapping

As above: authoritative control IDs live in the [control matrix](../compliance/control-matrix.md); **no ISO/IEC 27001 certification is claimed**.

## Evidence produced

Evidence artifacts are registered in the [evidence register](../compliance/evidence-register.md) (EV-301 through EV-317; EV-301–316 COLLECTED against the lead's executed local runs of 16 August 2026, EV-317 PENDING until the Phase 3 PR has a CI run URL). The integration-run references below are the executed results those rows point at; CI artifact URLs are added when the PR pipeline runs.

## Tests executed

Executed by the phase lead on 16 August 2026, after full integration (module wiring in `apps/api`, kill-switch gates bound, shared local database rebuilt from zero), on the local gate (`POSTGRES_PORT=5433`, `REDIS_PORT=6380`, `KARAR_ENV=local`):

| Suite | Command | Result |
|---|---|---|
| Workspace (vitest, all packages/modules/apps) | `pnpm test` | **82 test files passed, 1 skipped (83); 806 tests passed, 5 skipped (811)**; the skipped file is the `KARAR_INTEGRATION`-gated readiness suite (runs in CI), the skipped tests are its cases |
| Cross-cutting security suite | within `pnpm test` (`@karar/security-tests`) | Cross-tenant isolation 10 passed; privilege abuse 9 passed — non-empty own-tenant seeding proven before every denial |
| Kill-switch mount proofs | within `pnpm test` | Identity register/login/refresh answer 503 `OPERATION_RESTRICTED` under an active restriction and reach no use case; tenancy invitation issue/redeem likewise; unrestricted paths reach their use cases |
| Architecture tests | `pnpm arch:test` | **23 passed, 0 failed, 5 skipped** (deferred by registry activation phase); registry errors 0; self-test **35/35**; tests 9/21/22 ACTIVE and passing; test 4 narrowed to `packages/platform/src/db/**` and the generated client |
| Documentation checks | `pnpm docs:check` | **7/7** (256 markdown files) |
| Prisma drift | `make prisma-drift` | **32 mapped tables match the live database** (run against the from-zero rebuilt local database) |
| Flutter | CI `mobile` job | Unchanged mobile foundation; verified in the PR pipeline |

## Build results

Executed by the phase lead on 16 August 2026 via `make verify` (fail-fast chain), all green:

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` — clean across all 19 workspace projects. The platform package's `build`/`typecheck` scripts now run `prisma generate --schema prisma/schema` first, so a clean clone (and CI) always has the git-ignored generated client before compiling.
- Database from zero: `make db-reset-local` dropped and recreated the local `karar` database and applied **26 migrations** in canonical order (this also resolved the mid-phase apply-order skew between the `0040` and `0060` ranges on the shared local database — scratch/test databases were never affected); `make db-migrate` afterwards reports nothing pending.
- Boot proof: the api's spawned-process lifecycle test boots `dist/main.js` with the full Phase 3 composition (identity runtime, Prisma handle, Redis rate-limit client, all six module registrations, enrichment guard), reaches `api listening` without PostgreSQL/Redis connections being required at boot, and exits cleanly on SIGTERM after draining the Prisma handle, the Redis client, the pool, and telemetry — with empty stderr.

## Documented deviations

Decisions taken during the phase that deviate from, or defer, something a reader of the plans or module documents might expect — recorded here rather than discovered later:

1. **Entity-admin, role-admin, and kill-switch-operate HTTP surfaces are deferred to the control-plane phase** (ADR-0021). Super Admin surfaces mount behind the control-plane gateway; mounting them on the consumer API now would create the re-plumbing ADR-0021 warns against. The use cases exist, are authorization-gated, and are proven by tests; the operating-entity OpenAPI fragment is contract-only.
2. **`identity.account.disable` / `identity.account.enable` are documented in the identity MODULE.md but deliberately unseeded** — they have no invoking surface this phase, and deny-by-default means absence denies. Recorded in the migration `0050` header; they arrive by forward migration with the surface that calls them.
3. **`reconsent_evaluations` is allow-listed rather than tenant/user-RLS'd** — it is a decision record about a document version, with no tenant or user columns; per-subject effects resolve through the RLS'd `consent_grants`. Justified in the migration `0065` header and the allow-list entry.
4. **The consent-grant immutability trigger permits `ACTIVE → SUPERSEDED`** so the documented supersession vocabulary is reachable — a re-grant inserts a new row and supersedes the old one; nothing edits a grant.
5. **`SUPPORT` is additionally granted `consent.status.read`**, matching the consent MODULE.md's documented permission table.
6. **Kill-switch enforcement lands through consumer-declared ports, not a module dependency.** The control-plane module ships the switches, the fail-closed read path, and its own guard; identity and tenancy each declare their OWN `OperationGate` port and guard in their presentation layer (`modules/identity/presentation/http/operation-gate.ts`, `modules/tenancy/presentation/http/operation-gate.ts`) — dependency inversion that keeps the module graph acyclic (a direct dependency on the control-plane module would close a devDependency cycle through the authorization module's port-reconciliation tests). `POST /auth/register` carries `NEW_REGISTRATIONS`, `POST /auth/login` `PASSWORD_LOGIN`, `POST /auth/refresh` `SESSION_REFRESH`, and both invitation routes `TENANT_INVITATIONS`; the module options make the gate REQUIRED, so the routes cannot mount unguarded, and the composition root binds the one `CheckKillSwitch` instance to all of them. Mount proofs: `modules/identity/__tests__/kill-switch-mounts.test.ts`, the restriction case in `modules/tenancy/__tests__/tenancy.controller.test.ts`.
7. **No catalogue-governed domain events were published this phase.** Modules record state changes through the audit module; events such as `UserRegistered`, `ConsentGranted`, and `OperatingEntityMigrated` enter the catalogue with their first consumer, under event-governance rules.

## Known limitations

- **Sessions are issued without a tenant binding, so the tenant-bound HTTP surface is not yet reachable end-to-end.** `identity_sessions.tenant_binding` is the ONLY tenant source the fail-closed RLS design permits at the edge (every tenant table requires `app.tenant_id` to read, so membership cannot be discovered from a bare user id), identity surfaces it opaquely on `AuthenticatedPrincipal`, and the composition resolves principals from it — but issuance writes `null` and no binding mechanism exists this phase. Consequence: `/auth/*` and `POST /tenancy/invitations/redeem` work for any authenticated caller; the ten tenant-bound endpoints (`/users/me`, `/users/me/disable-request`, `/tenancy/tenant`, `/tenancy/members`, invitation create/revoke, and the four `/consent/*` endpoints) answer 401 until a session carries a binding. Every layer of the pipeline below the binding is proven by tests; the binding mechanism (bind-at-login for single-membership accounts, or an explicit tenant-selection step) is the entry work of the first phase that needs the surface live. Recorded in the identity and tenancy MODULE.md files, the OpenAPI description, and risk KAR-RSK-021.
- **Every bearer-carrying request performs one session-row write.** Request enrichment authenticates through `AuthenticateRequest`, which slides the session idle window (`touchSession`) on success — deliberate sliding-idle semantics, at the cost of one UPDATE per authenticated request on a hot row. Making the touch conditional (skip when the idle window is far from expiry) is deferred to the first performance-sensitive phase; owner: identity workstream; residual until then: write amplification only, no correctness effect.
- **Admin/staff surfaces do not exist.** Entity administration, role administration, kill-switch operation, and account search are use cases without HTTP; they arrive with the Phase 8 control plane, on projections, audited.
- **Policy resolution does not exist yet.** No jurisdiction PolicyPacks, capability availability, or `SubjectPolicySelection` resolution (all Phase 3.5); retention durations are interim policy-configuration placeholders, never code constants, pending PolicyPack ownership; architecture test 21 gates policy-version pinning to Phase 3.5.
- **Account disable/deletion is intent-recording only.** `RequestAccountDisable` records status, history, and audit; nothing acts on the intent this phase — the disable itself and erasure machinery are later phases consuming the recorded states.
- **Local-only providers are per-process.** The local signing keypair and encryption keys do not survive a restart: a local restart signs everyone out and requires local MFA re-enrolment — a stated cost. All local providers fail closed outside `KARAR_ENV=local`.
- **The control plane runs in-process.** For LOCAL and DEV it is a module inside `apps/api`; a separately deployed control plane with independent credentials is a hard Phase 20 gate.
- **Invitation emails are stored as normalized text**, classified `CONFIDENTIAL` — redemption must match the invited address and creators must see whom they invited, which a one-way digest cannot do; revisited when column-encryption machinery arrives.
- **Single maintainer.** Every workstream role resolves to one person; independent review is a role, not yet a separate party.

## Accepted risks

Carried with named owners; register entries are maintained by the compliance workstream in the [risk register](../compliance/risk-register.md):

| Risk | Owner |
|---|---|
| Single-maintainer bus factor across all roles (carried from Phases 1–2) | Maintainer |
| Invitation emails at rest as normalized text until a deterministic-match column-encryption design exists | Maintainer |
| Concurrent duplicate ACTIVE consent grants are tolerated by resolution (latest wins, superseded on next acceptance) — single-ACTIVE is enforced by the use case, not a partial unique index, to keep the Prisma mapping exact for the drift gate | Maintainer |
| Refresh rate limiting fails open to a per-process fallback during a Redis outage — deliberate, bounded, metered; every credential-guessing surface fails closed | Maintainer |

## Deferred work

- **Phase 3.5:** jurisdiction PolicyPacks and capability availability; `SubjectPolicySelection` resolution; processing-basis resolution (a purpose with no declared basis fails closed there); policy-pack-version pinning (architecture test 21's activation gate); PolicyPack ownership of every interim retention placeholder.
- **Phase 8 (control plane):** entity-admin, role-admin, and kill-switch-operate HTTP surfaces; account search and cross-tenant listings on projections; seeding `identity.account.disable`/`.enable` with their invoking surface; staff onboarding flows.
- **Later phases:** catalogue-governed domain events with their first consumers; column encryption for deterministic-match columns (invitation emails); routing `DataSourceResolver`s with dedicated-database deployments (L1+); retention/purge jobs consuming the PolicyPack numbers; session revocation acting on recorded disable intent (legacy AUTHN-08 end-to-end).

## Documentation updated

Per the [phase-end ritual](README.md):

- Root `README.md` — module count and `authorization` row, quick start (`make prisma-generate`), adversarial-testing bullet, roadmap paragraph; status block already carried Phase 3.
- [`../roadmap.md`](../roadmap.md) — Phase 3 row marked in progress at phase start; marked complete by the lead at close.
- This report — body complete; verification sections filled by the lead at close.
- [`../onboarding/developer.md`](../onboarding/developer.md) — Q6/Q13/Q14/Q22/Q38/Q39 updated; Q49–Q53 added for principal context, Prisma workflow, the security suite and scratch-database pattern, permission checks, and kill switches.
- [`../glossary.md`](../glossary.md) — Phase 3 identity/tenancy/access-control terms added.
- Architecture docs — implemented-state notes: [`tenancy.md`](../architecture/tenancy.md), [`backend.md`](../architecture/backend.md), [`data-model.md`](../architecture/data-model.md), [`database-portability.md`](../architecture/database-portability.md), [`capability-map.md`](../architecture/capability-map.md).
- The seven Phase 3 `MODULE.md` files — written by their module workstreams.
- `docs/security/` — security workstream, landed in parallel.
- [`../compliance/evidence-register.md`](../compliance/evidence-register.md) and control matrix — compliance workstream, parallel to this report.
- [`../README.md`](../README.md) documentation-index phase header and the phase-report rows here and in [`README.md`](README.md) — completed by the phase lead at close.

## Next-phase entry criteria

Phase 3.5 (jurisdiction and capability foundation: Country/Jurisdiction, PolicyPack `qa/v1`, resolution-strategy registry, the `SubjectPolicySelection` mechanism, capability registry, availability model, entitlements — [roadmap row 3.5](../roadmap.md)) may start when:

- The Phase 3 PR is merged to `main` with required CI checks green, and this report's verification sections are filled.
- The Phase 3 compliance gate is passed per [`../compliance/phase-compliance-gate.md`](../compliance/phase-compliance-gate.md).
- The identity/tenancy/authorization/consent substrate is consumable: principal context, the `PolicyService`, consent resolution, and the operating-entity register are what Phase 3.5 binds jurisdictional policy and capability availability onto — it must not introduce parallel identity or authority plumbing.
- The activation gates are understood: architecture test 21 begins requiring policy-pack-version pinning when PolicyPacks exist, and test 19 (approval policy) activates at Phase 3.5 per the registry.
- The interim policy-configuration retention placeholders (identity, users, tenancy, consent, authorization tables) are inventoried so PolicyPacks take ownership of the numbers rather than rediscovering them.
