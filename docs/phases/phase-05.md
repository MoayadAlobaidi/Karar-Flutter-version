# Phase 5 — Financial data platform

**Branch:** `claude/karar-v2-phase-5-financial-foundation` · **Started:** 18 August 2026 · **Status:** IN PROGRESS
**Base:** Phase 4 post-merge record commit `2b0dfca` on `main`.

**This phase is part-built and reachable by nothing.** The financial account and transaction foundations exist — schema, domain, ports, repositories and tests — and no route, screen, import path or deployment reaches any of it. No field below is a completion claim. The phase's own deliverables (manual entry, CSV ingestion, categorization as a running path) are NOT built, and the retention question this data depends on is NOT resolved.

---

## Objective

Build the financial data platform named in [roadmap](../roadmap.md) row 5: institutions, connectors, accounts, transactions, normalization, deduplication, provenance and categorization, with manual and CSV entry `IMPLEMENTED` and erasure strategies enforced. It exists so that later phases have verified financial facts to compute on — Phase 6's engine and Phase 7's AI platform both read from what this phase establishes, and neither can be honest about a number this phase has not made traceable.

## Scope

The roadmap row, and nothing beyond it: institution and connector modelling; account and transaction records; normalization and deduplication; provenance for every stored value; categorization; manual and CSV ingestion as the first implemented paths; and the erasure strategies the data-lifecycle ADR requires being enforced rather than declared.

## Out of scope

Bank connections to any real provider. Budgets, goals, insights and scores. The financial engine's calculators and rulesets, which are Phase 6. AI of any kind, which is Phase 7. Zakat and Amanat. Subscriptions and billing. Super Admin and operator surfaces. Cloud, DNS, hosting, signing material and app-store records. Nothing in this list may be started here, and none of it becomes reachable in the client by being written — a capability becomes navigable only by being implemented, deployed, and then added to the navigable set.

## Agent/workstream ownership

Not yet allocated. The ownership ledger is written at the start of implementation, with non-overlapping write paths per workstream and the lead owning shared central files, as in Phases 3.5 and 4.

## Deliverables

Delivered so far — the data foundation only:

| Deliverable | State |
|---|---|
| Institution catalogue, financial accounts, balance snapshots | Built, unreachable |
| Transactions, revisions, provenance | Built, unreachable |
| Categories, merchant rules, category assignments (schema and domain) | Built, unreachable |
| Deduplication (keyed, versioned, content-only fingerprints) | Built, unreachable |
| Ingestion limit policies | Declared, unenforced (no ingestion path) |
| Manual transaction entry as a running path | **Not built** |
| CSV statement ingestion | **Not built** |
| Categorization as a running path | **Not built** |
| API surface / OpenAPI operations | **Not built** |
| Flutter surface | **Not built** |
| Erasure strategies enforced | Ports and cascade built; **retention unresolved** |

"Unreachable" is exact: no controller, no route, no composition-root wiring, no client method, no screen, and nothing deployed.

## Architecture changes

No change to the protected architecture. The foundation is ordinary Clean Architecture inside two new modules: domain and application layers that name no provider, infrastructure that implements ports declared inward, PostgreSQL as the canonical store, and RLS on every subject-owned table. No ADR was required and none was written.

One cross-module arrangement is worth naming because it is easy to get wrong: `modules/financial-accounts` must not import `modules/transactions`, but it owns two rules that depend on transaction data — an account's currency may not change while records exist, and deleting an account must take its records with it. Accounts therefore *declares* both ports and transactions *implements* them, resolved through the accounts module's `public-api`. The dependency runs one way only.
## ADRs added/amended

**[ADR-0027](../adr/0027-calendar-day-and-instant.md) — calendar days and instants are different types.** ACCEPTED, approved by the Platform Owner. A date on a statement is what an institution wrote on its books, not a moment in time; stored as an instant it shifts across day and month boundaries for readers at different offsets, so a statement for August gains or loses a line depending on where it is read.

The approval admits `CalendarDay` as the **tenth** shared-kernel universal and moves architecture test 20's export cap from nine to ten. It authorises that one semantic distinction and nothing more: an eleventh universal needs its own ADR, architecture justification, architecture-test change and Platform Owner approval. The approval is an engineering decision — no legal, regulatory or compliance position is claimed by it.

Test 20's self-test now proves the cap in **both** directions: a fixture that omits a universal and adds one that does not belong. The missing arm is what catches a rename, since a renamed universal is absent under its old name and extra under its new one — which is also how an aliasing `export { X as Y }` that changes the public surface is caught.
## Code and package changes

Two new modules, both inert:

- `modules/financial-accounts` — institution catalogue, financial accounts, balance snapshots. Holder-sensitive fields (`display_name`, `user_supplied_institution_label`, `mask`) are stored only as ciphertext/nonce/auth_tag triples through an `HsfFieldEncryptionPort` whose AAD binds tenant, user, table, row and field. 139 tests.
- `modules/transactions` — transactions, revisions, provenance, categories, merchant rules and category assignments; keyed versioned dedup fingerprints; write gates that resolve the target account through a port before accepting a write. 232 tests.

In `packages/platform`, `src/ingestion/limits.ts` declares the ingestion limit policies that architecture test 24 will check: no optional members, no way to express "unlimited", and a validator that rejects non-finite, zero, negative and non-integer bounds.

`scripts/checks/architecture.mjs` gained a supplementary check that FAILS a tree mounting an ingestion controller or use case while `currentPhase < 5` — the opposite-direction half of the lock described under *Documentation updated*.

**No application wiring exists.** Nothing in `apps/api` composes these modules, no controller is registered, no route is served, and `apps/mobile` is untouched.
## Database migrations

Seven added, `0087` through `0093`, creating nine tables: `institutions`, `financial_accounts`, `financial_account_balance_snapshots`, `transactions`, `transaction_revisions`, `transaction_provenance`, `financial_categories`, `merchant_rules`, `transaction_category_assignments`. The sequence stands at 45 files, `0001` through `0093`.

Every subject-owned table carries RLS `ENABLE` + `FORCE` with principal GUCs; the three catalogue tables that sit outside the tenant boundary (`institutions`, `financial_categories`, `merchant_rules`) are named in `packages/platform/db/rls-allow-list.json` rather than given a no-op policy, so a reviewer reads them in the register instead of inferring them from an absent policy.

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

Executed on this branch at the remediation checkpoint, against a **PostgreSQL 16.14** database created from zero (`db:create` → `db:migrate` → `db:verify` reports `status: clean`, 93 migrations applied). CI builds on `postgres:17-alpine`, so the local run is one major version behind what CI validates — stated because it is a real gap in this evidence, not a footnote.

The workspace figure below is from a **sequential** run (`--no-file-parallelism`) started from a clean database state, which is the reliable invocation on this machine:

| Suite | Result |
|---|---|
| Workspace, sequential | 1703 passed / 12 skipped / **0 failed** (1715 total) |
| — of which `modules/financial-accounts` | 139 passed |
| — of which `modules/transactions` | 232 passed |
| Architecture | 24 passed / 0 failed / 4 phase-deferred; self-test 57 cases |
| Documentation | 13/13 |
| Format, lint, typecheck, build | all pass |

**The default parallel invocation is NOT reliably green on this machine, and that is reported rather than smoothed over.** At 12 workers it fails intermittently for two reasons that are now separated: F4 above (a real defect, reproducible with parallelism disabled) and local connection exhaustion (an environment limit, described under the environment note). A clean sequential run isolates the first from the second. CI runs on a smaller runner against its own container and is the arbiter.

The 12 skipped are the whole of `apps/api/src/readiness.integration.test.ts`, which requires Redis and deliberately stops and restarts its compose containers; CI runs it as a separate step that owns those containers, and running it against a Homebrew PostgreSQL would not have been the same test.

**Flutter and mobile suites were not re-run** — this change touches no Dart or platform code. Their inherited numbers stand: Flutter 1190 passed / 19 skipped as CI runs it, goldens 4, localization 36, mobile security 113 passed / 1 skipped.
## Build results

`pnpm build` passes across the workspace. No mobile artifact was produced, no build was signed, and nothing was deployed.
## Known limitations

**Specific to this foundation:**

- **The retention question is unresolved.** No legal retention period is asserted anywhere. Both modules resolve retention through a port; the only provider that exists is synthetic, labelled `SYNTHETIC_NO_LEGAL_EFFECT`, and refuses to construct outside LOCAL and TEST. DEV, STAGING and PRODUCTION receive a typed failure rather than a default period. **This foundation cannot be deployed to any real environment until a retention decision with an approval reference exists.**
- **The foundation is unreachable and therefore unexercised end to end.** Repositories are tested against live PostgreSQL, but no request has ever traversed a controller into these modules, because no controller exists.
- **No ingestion path exists**, so architecture test 24 (resource limits declared) remains phase-deferred and the declared limit policies are unenforced by anything.

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

**F3 (HIGH, pre-existing, outside this change set) — Prisma misreports `timestamptz` when the PostgreSQL session timezone is not UTC.** Reading the same row in one transaction, the `pg` driver returns the correct instant and Prisma returns it shifted by the server's UTC offset. Every Prisma time-window predicate is then wrong by that offset: on a UTC+3 server a fresh grant reads as not-yet-effective, and — the direction that matters — a time-bounded window reads as still open for `offset` hours after it should have closed. Explicit revocation is unaffected, because it is caught by `status` and `revoked_at` rather than by time.

- **Evidence:** eleven integration tests across `authorization`, `control-plane` and `subject-policy` fail on a server set to `Asia/Qatar` and all 116 pass with the session set to UTC. **Reproduced identically on `main` at `2b0dfca`**, so it is not introduced by Phase 5. It is invisible in CI because the `postgres:17-alpine` container runs UTC.
- **Why deferred rather than fixed here:** the fix is a one-line pin of the session timezone in the platform connection layer, but it changes time semantics for all 57 tables and 15 modules at once, including `::date` casts and `date_trunc`. That belongs in its own change with its own review, not as a ride-along in a financial-foundation checkpoint that was explicitly scoped for external review.
- **Owner:** Platform. **Target:** before any environment other than a developer's machine exists. **Residual risk until then:** a developer machine on a non-UTC server sees wrong time-window results and may chase them as product bugs, as happened here. **Closure condition:** the connection layer pins `TimeZone=UTC`, a startup assertion fails loudly if the session reports anything else, and the eleven tests above pass on a deliberately non-UTC server.

**F4 (MEDIUM, root-caused, not fixed) — a concurrent dedup loser is refused with an untyped `STORE_FAILURE`.**

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
- **Why deferred rather than fixed here:** the honest fix changes the trigger's error contract — giving the ordinal guard its own SQLSTATE so the repository can match it structurally rather than by prose — which means editing migration `0090` again and reworking the repository's error translation. That is a change to the dedup mechanism itself, which is the part of this foundation most in need of the external review this checkpoint was frozen for. Matching on the message text instead would be a fix shaped like a defect.
- **Owner:** Financial. **Target:** with the first ingestion path, before any bulk import can hit it. **Residual risk until then:** an intermittently red suite, which is corrosive on its own — a tolerated flake teaches a reader to ignore a real failure. **Closure condition:** the ordinal guard raises a distinct SQLSTATE, the repository maps it to `OCCURRENCE_ORDINAL_NOT_NEXT` structurally, and the concurrent test passes 50 consecutive runs.
- **Action taken now:** `transactions.integration.test.ts` carries a diagnostic that fires only on the failure path and prints which invariant broke, so the next occurrence is diagnosable rather than re-chased from zero.

### An environment note that is not a finding

The verification runs below were slowed and occasionally disrupted by two things local to this machine, neither of which is a repository defect, both recorded so a reader does not mistake them for one. First, the local PostgreSQL server ran with `TimeZone=Asia/Qatar`, which is F3 above. Second, on a 12-core machine the suite provisions enough concurrent databases and pools to exhaust a default `max_connections = 100`; when it does, whole suites SKIP rather than fail (the fixtures probe the server and skip when it is unreachable), and the skip count rises from 12 to 25. A run whose skip count is not 12 has not verified what it appears to have verified.

## Accepted risks

None accepted by this phase yet; the register carries 41 rows at the Phase 4 close. Phase 5 risk rows are written at the phase's gate, once the surface they describe exists.
## Deferred work

Deferred **by this checkpoint**, deliberately and in this order: CSV statement ingestion; manual transaction entry as a running path; the categorization pipeline; the API surface and its OpenAPI operations; any Flutter surface; and the advance of `currentPhase` to 5, which lands with the first ingestion path.

The eleven active deferred items from the Phase 4 gate stand, item 8 having been discharged when the artifact lanes became required checks.
## Documentation updated

This report, the root README status block and branch-model row, the [roadmap](../roadmap.md) row, the [phases index](README.md), the [developer onboarding](../onboarding/developer.md) current-phase and out-of-scope answers, both new `MODULE.md` files, and `packages/platform/db/DATA_LIFECYCLE.md`.

Four rows were **removed** from the data-lifecycle register: `statement_imports`, `statement_import_sources`, `statement_import_rows` and `statement_import_row_errors`. They classified CSV staging tables that no migration creates and no code references. The register documents tables that exist; a forward declaration in it reads as schema that is already there. Those rows land again with the migration that creates the tables.

**The architecture-test registry's `currentPhase` is deliberately still 4, and that is a decision rather than an oversight.** Setting it to 5 makes architecture test 24 (resource limits declared) a live obligation, because the runner treats `currentPhase >= activationPhase` with no implementation as a registry error. Test 24's own activation criterion is that a first ingestion path — manual or CSV — exists, and none does: this foundation stores and reads financial records, but nothing ingests them. Implementing the test against an empty tree would make it scan nothing and pass vacuously, which is the exact failure this repository has already been bitten by three times. The lock now runs in both directions: test 24 refuses a phase-5 tree whose ingestion paths declare no limits, and a supplementary check in `scripts/checks/architecture.mjs` refuses a pre-phase-5 tree that mounts an ingestion path at all. Neither the marker nor the path can move without the other. **`currentPhase` moves to 5 in the same change that lands the first ingestion path**, which is the moment test 24 becomes both required and meaningful.

## Next-phase entry criteria

Phase 6 begins only after this phase's PR merges and a new branch starts from the merge commit. It is not reachable from here, and no Phase 6 control, evidence row or capability is pre-activated by this document.
