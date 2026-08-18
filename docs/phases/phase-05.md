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

None. Nothing in this foundation changed a decision that an ADR records.
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

Executed on this branch at commit `095b3e8`, against a PostgreSQL 17 database created from zero (`db:create` → `db:migrate` → `db:verify` reports `status: clean`, 93 migrations applied):

| Suite | Result |
|---|---|
| Workspace (`pnpm test`) | 1696 passed / 12 skipped (1708 total) |
| — of which `modules/financial-accounts` | 139 passed |
| — of which `modules/transactions` | 232 passed |
| Architecture | 24 passed / 0 failed / 4 phase-deferred; self-test 57 cases |
| Documentation | 13/13 |
| Format, lint, typecheck, build | all pass |

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
