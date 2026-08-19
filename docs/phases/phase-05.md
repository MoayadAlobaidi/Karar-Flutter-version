# Phase 5 — Financial data platform

**Branch:** `claude/karar-v2-phase-5-financial-foundation` · **Started:** 18 August 2026 · **Status:** IN PROGRESS
**Base:** Phase 4 post-merge record commit `2b0dfca` on `main`.

**This phase is part-built and reachable by nothing.** The financial data foundation now spans **five modules** — accounts and wallets, transactions, connections and source links, payment instruments, and transfer matching — as schema, domain, ports, repositories and tests. No route, screen, import path or deployment reaches any of it. No field below is a completion claim. The phase's own deliverables (manual entry as a running path, CSV ingestion, categorization as a running path) are NOT built, and the retention question this data depends on is NOT resolved.

**Figures in this report are derived from the committed tree at `66ad086`** (`git rev-parse HEAD` on this branch). Where a figure is unstable because concurrent workstreams are mid-edit, it says so instead of being rounded into confidence.

---

## Objective

Build the financial data platform named in [roadmap](../roadmap.md) row 5: institutions, connectors, accounts, transactions, normalization, deduplication, provenance and categorization, with manual and CSV entry `IMPLEMENTED` and erasure strategies enforced. It exists so that later phases have verified financial facts to compute on — Phase 6's engine and Phase 7's AI platform both read from what this phase establishes, and neither can be honest about a number this phase has not made traceable.

## Scope

The roadmap row, and nothing beyond it: institution and connector modelling; account and transaction records; normalization and deduplication; provenance for every stored value; categorization; manual and CSV ingestion as the first implemented paths; and the erasure strategies the data-lifecycle ADR requires being enforced rather than declared.

## Out of scope

Bank connections to any real provider. Budgets, goals, insights and scores. The financial engine's calculators and rulesets, which are Phase 6. AI of any kind, which is Phase 7. Zakat and Amanat. Subscriptions and billing. Super Admin and operator surfaces. Cloud, DNS, hosting, signing material and app-store records. Nothing in this list may be started here, and none of it becomes reachable in the client by being written — a capability becomes navigable only by being implemented, deployed, and then added to the navigable set.

## Agent/workstream ownership

**Implementation is running as concurrent workstreams with non-overlapping write paths**, one module directory or document set per workstream, with the lead owning shared central files — the arrangement Phases 3.5 and 4 used. Named allocation is not recorded here because this is a solo team and a ledger of one name against six rows records nothing; what the arrangement is actually for is the write-path separation, and that is enforced by scoping each workstream to paths no other writes.

The cost of that arrangement is visible in *Tests executed*: several suites can be running against one machine and one local PostgreSQL at once, so a figure taken mid-phase is a figure taken under load. Where that shows, this report says so rather than re-running until the number is flattering.

## Deliverables

Delivered so far — the data foundation only:

| Deliverable | State |
|---|---|
| Issuer catalogue and per-country institution markets | Built, unreachable |
| Financial accounts and wallets, balance snapshots per kind | Built, unreachable |
| Transactions, revisions, provenance | Built, unreachable |
| Categories, merchant rules, category assignments (schema and domain) | Built, unreachable |
| Deduplication (keyed, versioned, content-only fingerprints) | Built, unreachable |
| Financial connections and account source links | Built, unreachable |
| Payment instruments | Built, unreachable |
| Transfer matching | Built, unreachable |
| Ingestion limit policies | Declared, unenforced (no ingestion path) |
| Manual transaction entry as a running path | **Not built** |
| CSV statement ingestion | **Not built** |
| Categorization as a running path | **Not built** |
| API surface / OpenAPI operations | **Not built** |
| Flutter surface | **Not built** |
| Erasure strategies enforced | Ports and cascade built across four modules; **retention unresolved** |

"Unreachable" is exact: no controller, no route, no composition-root wiring, no client method, no screen, and nothing deployed.

## Architecture changes

No change to the protected architecture. The foundation is ordinary Clean Architecture inside five new modules: domain and application layers that name no provider, infrastructure that implements ports declared inward, PostgreSQL as the canonical store, and RLS on every subject-owned table.

One cross-module arrangement is worth naming because it is easy to get wrong, and it now repeats three times. `modules/financial-accounts` must not import `modules/transactions`, `modules/financial-connections` or `modules/payment-instruments`, yet it owns rules that depend on all three — an account's currency may not change while records exist, and deleting an account must take its records, its source links and its instruments with it. Accounts therefore *declares* every one of those ports and the other modules *implement* them, resolved through the accounts module's `public-api`. The dependency runs one way only, and architecture test 5 (ports declared inward) is what keeps it that way.

**Every cross-module eraser is a REQUIRED constructor dependency of `DeleteOwnAccount`.** An earlier revision made the payment-instrument eraser optional with a do-nothing default, reasoning that zero is the true answer for a deployment composing no instruments. That reasoning is wrong in the case that matters: the default cannot distinguish a deployment with no instruments from one that has them and forgot a line of wiring, and in the second it erases nothing, reports success, and leaves cards spending from an account the subject was told is gone. The default has been deleted. Focused suites that genuinely have nothing to erase inject a **named** no-op (`ERASES_NO_SOURCE_LINKS`, `ERASES_NO_INSTRUMENTS`) so the decision is visible in the test rather than absent from the production path.
## ADRs added/amended

**[ADR-0027](../adr/0027-calendar-day-and-instant.md) — calendar days and instants are different types.** ACCEPTED, approved by the Platform Owner. A date on a statement is what an institution wrote on its books, not a moment in time; stored as an instant it shifts across day and month boundaries for readers at different offsets, so a statement for August gains or loses a line depending on where it is read.

The approval admits `CalendarDay` as the **tenth** shared-kernel universal and moves architecture test 20's export cap from nine to ten. It authorises that one semantic distinction and nothing more: an eleventh universal needs its own ADR, architecture justification, architecture-test change and Platform Owner approval. The approval is an engineering decision — no legal, regulatory or compliance position is claimed by it.

Test 20's self-test now proves the cap in **both** directions: a fixture that omits a universal and adds one that does not belong. The missing arm is what catches a rename, since a renamed universal is absent under its old name and extra under its new one — which is also how an aliasing `export { X as Y }` that changes the public surface is caught. The runner reports the ten exports it found: `CalendarDay`, `Clock`, `Currency`, `DomainEvent`, `ExchangeRate`, `Money`, `Percentage`, `Result`, `TenantId`, `UserId`.

**[ADR-0028](../adr/0028-multi-rail-financial-sources.md) — financial data arrives on many rails, and seven concepts stay separate.** ACCEPTED. A person does not have one bank and one account: they hold several institutions, more than one account of the same type at one of them, wallets, cards spending from a wallet, and cash. The ADR separates issuer, institution market, financial connection, account-source link, financial account or wallet, payment instrument, and transaction provenance, and states that none of the arrows between them is an identity.

Its consequences are the shape of migrations 0087 and 0094-0099: issuer kinds on a globally unique catalogue row with `institution_markets` carrying market presence per **country** (never per jurisdiction); wallet kinds bound by the biconditional `CHECK ((wallet_kind IS NOT NULL) = (account_type = 'WALLET'))`; `account_nature` as `ASSET`/`LIABILITY`/`UNKNOWN` with nothing summing it; `balance_kind` `NOT NULL` **with no default**, so a caller asking what can be spent cannot silently receive a settled figure; an account identified by **its id alone**, with no uniqueness over institution, type, currency or wallet kind; and an immutable `origin_kind` that says only how an account first came to exist, with the one-source shape (`source_kind` plus a bound `provider_connection_ref`) **removed** rather than reinterpreted.

**Thirteen rails are named and only two may exist.** `MANUAL` and `USER_FILE_UPLOAD` are the implemented set; every other rail is refused by `financial_connections_rail_implemented_check` at the **database**, so an unimplemented rail cannot be written even by direct SQL from `karar_app`. The vocabulary CHECK and the gate CHECK are deliberately separate, so "we can describe this rail" and "this rail works" never become one edit. **No credential of any kind is stored anywhere** — no username, password, mPIN, OTP, token, cookie, certificate or synchronisation cursor — and the absence is proved by reading `information_schema.columns` against an exhaustive expected list, because a CHECK cannot assert that a column does not exist. **No status means connected**: `impliesLiveInstitutionLink` and `impliesLiveIssuerLink` answer `false` for every value their vocabularies permit, so nothing may display "Connected" for data a person typed or uploaded.
## Code and package changes

Five new modules, all inert. Test counts are from a scoped `vitest run` per module directory on this branch:

- `modules/financial-accounts` — issuer catalogue, per-country institution markets, financial accounts and wallets, balance snapshots per kind. Holder-sensitive fields (`display_name`, `user_supplied_institution_label`, `mask`) are stored only as ciphertext/nonce/auth_tag triples through an `HsfFieldEncryptionPort` whose AAD binds tenant, user, table, row and field. **200 tests across 10 files.**
- `modules/transactions` — transactions, revisions, provenance, categories, merchant rules and category assignments; keyed versioned dedup fingerprints; write gates that resolve the target account through a port before accepting a write. **305 tests across 14 files.**
- `modules/financial-connections` — how data arrives and which source feeds which account: the thirteen-rail vocabulary with its database-enforced implemented subset, and the keyed per-subject source-account fingerprint that lets one external account be recognised again without becoming a confirmation oracle. **135 tests across 10 files.**
- `modules/payment-instruments` — what spends from a balance-bearing account. The table has **no balance column**, and the absence is held by six independent mechanisms rather than by a display rule. **95 tests across 9 files.**
- `modules/transfer-matching` — two of a person's transactions that were one movement of their own money. The row carries **no amount**: the figures live on the transactions it names, and a copy on the relationship would be a third number free to disagree with both. Its test figure is **not recorded here**, because another workstream is mid-edit in that directory and a count taken during an edit is a number rather than a measurement.

A sixth directory, `modules/statement-imports`, is **under construction** as this is written: no `MODULE.md`, no committed migration, and **no mounted route** — nothing in `apps/api` composes it. It is named so that a reader who finds the directory knows it is in progress rather than undocumented. **Nothing about statement import or CSV ingestion may be read as implemented** until that workstream's own record says so, and this report claims nothing on its behalf.

In `packages/platform`, `src/ingestion/limits.ts` declares the ingestion limit policies that architecture test 24 will check: no optional members, no way to express "unlimited", and a validator that rejects non-finite, zero, negative and non-integer bounds.

`scripts/checks/architecture.mjs` gained a supplementary check that FAILS a tree mounting an ingestion controller or use case while `currentPhase < 5` — the opposite-direction half of the lock described under *Documentation updated*.

**No application wiring exists.** Nothing in `apps/api` composes these modules, no controller is registered, no route is served, and `apps/mobile` is untouched.
## Database migrations

**Thirteen added, `0087` through `0099`, creating fourteen tables.** The sequence stands at **51 files**, `0001` through `0099`, and the schema at **62 tables** — a figure cross-checked two ways, by counting `CREATE TABLE` across every migration and by counting the rows of `packages/platform/db/DATA_LIFECYCLE.md`, which agree. Of those, **57 are mapped in Prisma and match the live database** (`node scripts/db/prisma-mapping-check.mjs`); the five unmapped ones are the platform and audit infrastructure tables no module owns.

| Migration | Creates |
|---|---|
| `0087` | `institutions` — issuer catalogue, one row per issuer globally, with issuer kind |
| `0088` | `financial_accounts` |
| `0089` | `financial_account_balance_snapshots` |
| `0090` | `transactions` |
| `0091` | `transaction_revisions`, `transaction_provenance` |
| `0092` | `financial_categories`, `merchant_rules` |
| `0093` | `transaction_category_assignments` |
| `0094` | `institution_markets` — market presence per **country**, no jurisdiction column |
| `0095` | *(no table)* — adds `wallet_kind` and `account_nature` to `financial_accounts`, with the biconditional wallet CHECK |
| `0096` | `financial_connections` |
| `0097` | `account_source_links` |
| `0098` | `payment_instruments` |
| `0099` | `transfer_matches` |

Every subject-owned table carries RLS `ENABLE` + `FORCE` with principal GUCs; the three catalogue tables that sit outside the tenant boundary (`institutions`, `financial_categories`, `merchant_rules`) are named in `packages/platform/db/rls-allow-list.json` rather than given a no-op policy, so a reviewer reads them in the register instead of inferring them from an absent policy. Architecture test 22 reports the split over all 62 tables: **32 with `ENABLE` + `FORCE`, 37 allow-listed, 7 in both.**

**Migrations `0088`, `0089` and `0090` were edited in place after being pushed at `f0b8412`.** They are unmerged and deployed nowhere, and the alternative — a corrective migration — would have preserved plaintext holder-sensitive columns that were never meant to exist. The consequence is stated rather than discovered: **any database provisioned at `f0b8412` fails checksum verification and must be recreated.**
## API changes

None. The contract stands at 35 operations across 34 merged paths, exactly as merged at the end of Phase 4. No OpenAPI path, schema or generated client method was added — this foundation is not reachable over HTTP, by design, until the first ingestion path lands.
## Security controls

Four are implemented in the foundation, and are recorded here as implemented-not-yet-exercised because no path reaches them:

- **Holder-sensitive field encryption at rest** — AES-256-GCM with AAD binding tenant, user, table, row and field, so a ciphertext moved to another row or column fails to open rather than decoding as another subject's data.
- **Tenant scoping of every new financial table** — RLS `ENABLE` + `FORCE`, principal GUCs, and an explicit allow-list for the three tables consciously outside the boundary.
- **Provenance integrity** — every stored transaction value carries its origin, and revisions are append-only.
- **Ingestion input limits** — declared and validated ahead of the path that will enforce them.

**Erasure enforcement is implemented but not closed**: the ports and the cascade exist and are tested, while the retention periods they act on are unresolved (below).
## SOC 2 mapping

Deferred to the [control matrix](../compliance/control-matrix.md) at close. **No SOC 2 attestation is claimed and no examination has been performed.**

## ISO 27001 mapping

Deferred to the [control matrix](../compliance/control-matrix.md) and the [statement of applicability](../compliance/iso27001/statement-of-applicability.md) at close. **No ISO/IEC 27001 certification is held, claimed, applied for or sought.**

## Evidence produced

None recorded yet. Phase 5 evidence rows begin at EV-469; the Phase 4 range ended at EV-468. Evidence is written at the phase's compliance gate, not at a mid-phase checkpoint, and this foundation has not reached one.
## Tests executed

Executed on this branch at commit `66ad086`, against **PostgreSQL 17.10** with the server default timezone deliberately left at `Asia/Qatar` — the adversarial environment that exposed F3 below, and now the environment the suite is expected to pass in. CI builds on `postgres:17-alpine`, which runs UTC; the local run is therefore the *harder* of the two, which is the reverse of the gap this section used to record.

| Suite | Result |
|---|---|
| Workspace (`pnpm test`) | **2300 passed / 12 skipped / 1 failed (2313 total)** across 174 files |
| — of which `modules/financial-accounts` | 200 passed across 10 files |
| — of which `modules/transactions` | 305 across 14 files — see the note below on the one that does not pass in a shared database |
| — of which `modules/financial-connections` | 135 passed across 10 files |
| — of which `modules/payment-instruments` | 95 passed across 9 files |
| — of which `modules/transfer-matching` | not recorded — another workstream is mid-edit in that directory |
| Architecture (`pnpm arch:test`) | **24 passed / 0 failed / 4 deferred by activation phase**; registry errors 0; self-test ok; 2 supplementary checks pass |
| Documentation (`pnpm docs:check`) | **13/13**, self-test ok, 282 markdown files scanned |
| Prisma mapping | **57 mapped tables match the live database** |

**Three qualifications, stated rather than smoothed away.**

The **workspace failure** is a five-second timeout on `POST /auth/login` in the runtime-conformance suite, which exercises a deliberately expensive password hash. Two other workstreams were running their own suites against the same machine and the same local PostgreSQL at the time, and the assertion never ran rather than running and disagreeing. That is a resource observation, not a conformance result — and it is recorded as a failure anyway, because a report that quietly reruns until green is not evidence.

The **`transfer-matching` count is absent** because that directory is being edited by another workstream. A count taken from a directory somebody is editing measures the edit.

The **one `modules/transactions` test that does not pass** in a shared local database is `financial-record-lifecycle.integration.test.ts`, which asserts against the live catalogue that no table other than `transactions` carries the dedup identity's column names. It fails when a database also holds statement-import staging tables created by a concurrent workstream — which is the assertion working, not failing: it is designed to notice exactly that, and the module that adds such a table owns the decision about whether its columns may share those names. Against a database built only from the migrations committed at `66ad086`, it passes.

Architecture test 24 (resource limits declared) is one of the four deferred, and the reason is in *Documentation updated* below: its activation phase is 5 and `currentPhase` is still 4, because no ingestion path exists for it to scan.

**The ordinary parallel invocation was made reliable earlier in this phase, and that work stands.** It had failed intermittently for two separate reasons, both since closed: F4 (a real defect — a concurrent dedup loser arrived untyped) and connection exhaustion on a 12-core machine, which made suites SKIP rather than fail so the run stayed green while it had quietly stopped verifying. The worker count now derives from the connection budget, and `KARAR_INTEGRATION=1` makes an unreachable database a failure. Evidence recorded at that checkpoint: **ten consecutive `pnpm test` runs, 10/10 passed, identical 12 skips each time, zero orphan scratch databases.** That evidence is about the reasons above and is not contradicted by the timeout in this run, which is a machine under three concurrent suites rather than a flaky test — but nor does it license reading this run as green.

The 12 skipped are the whole of `apps/api/src/readiness.integration.test.ts`, which requires Redis and deliberately stops and restarts its compose containers; CI runs it as a separate step that owns those containers, and running it against a Homebrew PostgreSQL would not have been the same test.

**Flutter and mobile suites were not re-run** — this change touches no Dart or platform code. Their inherited numbers stand: Flutter 1190 passed / 19 skipped as CI runs it, goldens 4, localization 36, mobile security 113 passed / 1 skipped.
## Build results

`pnpm build` passes across the workspace. No mobile artifact was produced, no build was signed, and nothing was deployed.
## Known limitations

**Specific to this foundation:**

- **The retention question is unresolved, and it is a legal decision nobody here may take.** No legal retention period is asserted anywhere. Every module that owns a durable financial dataset resolves retention through its own port; the only provider that exists is synthetic, labelled `SYNTHETIC_NO_LEGAL_EFFECT`, and refuses to construct outside LOCAL and TEST. DEV, STAGING and PRODUCTION receive a typed failure rather than a default period. **This foundation cannot be deployed to any real environment until a retention decision with an approval reference exists**, and nothing in this repository decides it.
- **The foundation is unreachable and therefore unexercised end to end.** Repositories are tested against live PostgreSQL, but no request has ever traversed a controller into any of these modules, because no controller exists.
- **No ingestion path exists**, so architecture test 24 (resource limits declared) remains phase-deferred and the declared limit policies are unenforced by anything. `currentPhase` stays at **4** for the same reason.
- **No provider is connected and no real institution API exists.** No issuer named in the catalogue exposes an interface to Karar, no credential of any kind is stored, and `provider_access_status` is `NOT_IMPLEMENTED` everywhere. Nothing in the product may render "Connected", "Synced" or "Linked" for data a person typed or uploaded.
- **CSV ingestion is not implemented.** There is no parser, no staging table created by any migration committed here, no import state machine, and nothing mounted. Manual transaction entry exists as a use case with its gates and its tests, and is called by nothing.

**Carried forward from Phase 4, unfixed by this work:** no build has run on a device, so the biometric prompt has never been shown to appear; no build is signed and no signing material exists; no Apple Team ID exists; the compound credential-abandonment guarantee is local-only; golden baselines are not CI-enforced; runtime conformance covers 82 of 128 declared pairs; **EV-427 is `PENDING` and overdue**, with no DNS record and all seven registrar hardening rows still `TO_VERIFY`; and one maintainer holds every role.
## Review findings and their disposition

An independent review pass was run over the remediated foundation. It implemented nothing; every fix below was made afterwards and re-verified.

### Fixed

**F1 (HIGH) — the synthetic retention values shipped in every build.** The values were constants inside each module's `infrastructure/providers/`, guarded by an environment check in the same file. The guard was real, but the values were in both modules' emitted JavaScript, declaration files and source maps, in every environment that installed either module. A fabricated approval reference is shaped exactly like the real thing and names an approval nobody gave; shipping one is worse than shipping fixture prose.

Fixed by the pattern `modules/consent` already established: the values moved to `@karar/financial-retention-local-fixtures`, a private package that is a **devDependency only** and is resolved at runtime inside the local-only branch, so a production install simply does not have it. `modules/financial-accounts/__tests__/retention-fixture-closure.test.ts` asserts the property against the artefacts — production closure walked through `dependencies` only, every `dist/` scanned including compiled test output and source maps, a positive control against the fixture package's own build, and no static import edge.

Two things that fix found on the way, both of which would have made it fake:

- The first attempt still leaked, through four test files that had typed the values out and one doc comment that quoted the marker — `tsc` emits comments and compiled tests into the same `dist/` a deployment ships. The needles are now imported, never typed, and the comments describe the values instead of reproducing them.
- The fixture values were initially composed by interpolating the marker. That emits a runtime expression, so no value would have appeared contiguously in any build and the scanner would have searched for strings that exist nowhere while passing. They are contiguous literals now, with the marker relation asserted separately. The positive control is what caught this.

The test was mutation-checked: a probe constant added to an unrelated module source fails it and names the exact file.

**F2 (MEDIUM) — architecture test 5 rejected the collapsed lifecycle ports.** Collapsing the duplicated presence/eraser ports left `modules/transactions` re-exporting them, and the rule requires an adapter's port to be *declared* under its own module's `application/ports/`. Fixed in the code rather than by relaxing the rule: the module now declares the ports as aliases of the accounts-side declarations, so its application layer names what its infrastructure implements while the single definition stays in the module that owns it.

### Deferred, with reasons

**F3 (HIGH) — CLOSED. Prisma misreported `timestamptz` when the PostgreSQL session timezone was not UTC.** Reading the same row in one transaction, the `pg` driver returns the correct instant and Prisma returns it shifted by the server's UTC offset. Every Prisma time-window predicate is then wrong by that offset: on a UTC+3 server a fresh grant reads as not-yet-effective, and — the direction that matters — a time-bounded window reads as still open for `offset` hours after it should have closed. Explicit revocation is unaffected, because it is caught by `status` and `revoked_at` rather than by time.

- **Evidence:** eleven integration tests across `authorization`, `control-plane` and `subject-policy` fail on a server set to `Asia/Qatar` and all 116 pass with the session set to UTC. **Reproduced identically on `main` at `2b0dfca`**, so it is not introduced by Phase 5. It is invisible in CI because the `postgres:17-alpine` container runs UTC.
**How it was closed.** Every session is pinned to UTC by a connection STARTUP parameter, so a pool cannot hand out a session that missed it and no per-checkout round trip is needed. Both pools now share one session configuration; the Prisma factory previously set none of the raw adapter's defaults. Readiness pings with `SHOW TimeZone` rather than `SELECT 1`, so a session that would misreport time reads as `postgres: down`. Verified on **PostgreSQL 17.10 with the server default deliberately left at Asia/Qatar**: the eleven tests that failed under exactly those conditions pass, 116 of 116, with the earlier role-level workaround removed. Mutation-checked — removing the startup parameter fails four of the seven new tests, including the regression that compares a pg read and a Prisma read of one instant.

**F4 (MEDIUM) — CLOSED. A concurrent dedup loser was refused with an untyped `STORE_FAILURE`.**

Two commits of identical content, in flight at once, are correctly resolved to exactly one winner and exactly one stored row — that invariant held in every observed failure and is not in question. What is wrong is the SHAPE of the loser's refusal.

The mechanism is deliberately two-layered: the repository checks the occurrence rule before it inserts, and a database trigger enforces the same rule as defence in depth. Under a race the repository's pre-check passes (it reads `max(occurrence_ordinal)` before the winner commits, so it computes the same next ordinal the winner is about to take) and the TRIGGER is what fires. The repository maps its own pre-check to `OCCURRENCE_ORDINAL_NOT_NEXT` and maps Prisma's `P2002` to `DUPLICATE_TRANSACTION`, but it does not map the trigger's `P0001` to anything — so the braces fire and the caller is handed a generic `STORE_FAILURE`.

Captured from a reproduction:

```
kind: STORE_FAILURE
Database error. Code: `P0001`.
Message: `occurrence_ordinal 1 is not the next occurrence of this content identity
          (the next unused ordinal is 2). ...`
```

- **Why it matters even though the data is correct:** the next thing built on this is CSV import, where duplicates are expected in bulk and must be skippable. A caller cannot distinguish "this row is a duplicate, skip it" from "the store is broken, stop" if both arrive as `STORE_FAILURE`.
- **Frequency:** three failures in roughly thirty-five full-suite runs, and reproduced deterministically enough with a targeted loop (one in six). It is NOT file-parallelism — it reproduces with `--no-file-parallelism`, because the race is inside the test, between two concurrent commits.
**How it was closed.** The guards now raise dedicated SQLSTATEs — `KAR01` for the occurrence rule and `KAR02` for a rewritten dedup identity — outside every class the standard and PostgreSQL assign. The repository reads the SQLSTATE structurally from the driver-adapter cause, never from the message, because prose is rewritten by a later edit and a mapping that depends on it fails silently the day someone improves the wording. One test had pinned a single arm: both `DUPLICATE_TRANSACTION` and `OCCURRENCE_ORDINAL_NOT_NEXT` are correct refusals and which fires is a property of the race, so it now accepts either and asserts directly that `STORE_FAILURE` is not among them. Evidence: **50 consecutive runs of the two concurrency suites, zero failures and zero `STORE_FAILURE` occurrences.** Mutation proof — restoring the generic SQLSTATE fails the suite; changing the human diagnostic while keeping the SQLSTATE fails it; removing the trigger fails it; removing the unique dedup constraint fails it.

### An environment note that is not a finding

Both conditions below have since been closed in code; they are kept because they explain why earlier figures in this report differ from the current ones. First, the local PostgreSQL server ran with `TimeZone=Asia/Qatar`, which is F3 above. Second, on a 12-core machine the suite provisions enough concurrent databases and pools to exhaust a default `max_connections = 100`; when it does, whole suites SKIP rather than fail (the fixtures probe the server and skip when it is unreachable), and the skip count rises from 12 to 25. A run whose skip count is not 12 has not verified what it appears to have verified.

## Accepted risks

None accepted by this phase yet; the register carries 41 rows at the Phase 4 close. Phase 5 risk rows are written at the phase's gate, once the surface they describe exists.
## Deferred work

Deferred **by this checkpoint**, deliberately and in this order: CSV statement ingestion; manual transaction entry as a running path; the categorization pipeline; the API surface and its OpenAPI operations; any Flutter surface; and the advance of `currentPhase` to 5, which lands with the first ingestion path.

The eleven active deferred items from the Phase 4 gate stand, item 8 having been discharged when the artifact lanes became required checks.
## Documentation updated

This report; the root README (status block, containers, repository shape, capability map, the financial data-model diagram, the roadmap paragraph and the ADR count); the [roadmap](../roadmap.md) row; the [phases index](README.md); the [developer onboarding](../onboarding/developer.md) and [Flutter onboarding](../onboarding/flutter.md); the architecture set ([overview](../architecture/overview.md), [backend](../architecture/backend.md), [data model](../architecture/data-model.md), [Flutter](../architecture/flutter.md), [capability map](../architecture/capability-map.md), [capability registry](../architecture/capability-registry.md)); the security set ([threat model](../security/threat-model.md), [access control](../security/access-control.md), [secrets](../security/secrets.md)); [architecture tests](../testing/architecture-tests.md); the [glossary](../glossary.md); `apps/mobile/README.md`; all five financial `MODULE.md` files; and `packages/platform/db/DATA_LIFECYCLE.md`.

Four rows were **removed** from the data-lifecycle register: `statement_imports`, `statement_import_sources`, `statement_import_rows` and `statement_import_row_errors`. They classified CSV staging tables that no migration in this phase creates and no code in these modules references. The register documents tables that exist; a forward declaration in it reads as schema that is already there. The same four were removed from `modules/transactions/MODULE.md` on the same grounds, because that module owns neither the tables nor the decision. They are declared again by whichever module creates them, in the same change as the migration that does.

**One documented claim was false and is corrected here, because it is the kind that stays false quietly.** `modules/financial-accounts/MODULE.md` recorded the payment-instrument eraser as an optional constructor argument with a do-nothing default, and `modules/payment-instruments/MODULE.md` repeated the reasoning. The default no longer exists: every cross-module eraser is required, a suite with nothing to erase injects a named no-op, and both documents now say so. A document that describes a defaulted dependency which is in fact required is worse than one that says nothing — a reader wiring a composition root would have trusted it, and the failure it describes is silent by construction.

**The architecture-test registry's `currentPhase` is deliberately still 4, and that is a decision rather than an oversight.** Setting it to 5 makes architecture test 24 (resource limits declared) a live obligation, because the runner treats `currentPhase >= activationPhase` with no implementation as a registry error. Test 24's own activation criterion is that a first ingestion path — manual or CSV — exists, and none does: this foundation stores and reads financial records, but nothing ingests them. Implementing the test against an empty tree would make it scan nothing and pass vacuously, which is the exact failure this repository has already been bitten by three times. The lock now runs in both directions: test 24 refuses a phase-5 tree whose ingestion paths declare no limits, and a supplementary check in `scripts/checks/architecture.mjs` refuses a pre-phase-5 tree that mounts an ingestion path at all. Neither the marker nor the path can move without the other. **`currentPhase` moves to 5 in the same change that lands the first ingestion path**, which is the moment test 24 becomes both required and meaningful.

## Next-phase entry criteria

Phase 6 begins only after this phase's PR merges and a new branch starts from the merge commit. It is not reachable from here, and no Phase 6 control, evidence row or capability is pre-activated by this document.
