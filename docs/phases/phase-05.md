# Phase 5 — Financial data platform

**Branch:** `claude/karar-v2-phase-5-financial-foundation` · **Started:** 18 August 2026 · **Status:** IN PROGRESS
**Base:** Phase 4 post-merge record commit `2b0dfca` on `main`.

**This phase is part-built, and the part that is built now answers requests.** The financial data platform spans **six modules** — accounts and wallets, transactions, connections and source links, payment instruments, transfer matching, and statement imports — plus `provider-capabilities`, which owns no table and executes nothing. **27 operations over 21 `/financial/*` paths** are mounted from the composition root, manual transaction entry and CSV statement import both write real rows, and `currentPhase` has moved to **5** with architecture test 24 ACTIVE. No field below is a completion claim: **there is no Flutter financial surface, no provider connector, and nothing is deployed anywhere**; the retention question this data depends on is NOT resolved; and account deletion is deliberately not exposed over HTTP.

**Figures in this report are derived from the committed tree at `ef1d155`**, the activation commit, and were re-confirmed unchanged at `4e6f13b`, which regenerated the Dart client and edited the contract fragments without moving an operation count. Where a figure is unstable because concurrent workstreams are mid-edit, it says so instead of being rounded into confidence, and where a figure was measured at an earlier commit it names that commit rather than being restated as current.

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

Delivered so far — the data platform and its first HTTP surface:

| Deliverable | State |
|---|---|
| Issuer catalogue and per-country institution markets | Built, served (`GET /financial/institutions`) |
| Financial accounts and wallets, balance snapshots per kind | Built, served |
| Transactions, revisions, provenance | Built, served |
| Categories, merchant rules, category assignments (schema and domain) | Built; listing and per-transaction assignment served |
| Deduplication (keyed, versioned, content-only fingerprints) | Built; exercised by the CSV commit path |
| Financial connections and account source links | Built; read-only over HTTP |
| Payment instruments | Built; read-only over HTTP |
| Transfer matching | Built; list, confirm and reject served — suggestion is not |
| Ingestion limit policies | Declared centrally, validated at startup, **enforced on the mounted CSV upload** |
| Manual transaction entry as a running path | **Built** (`POST /financial/transactions`) |
| CSV statement ingestion | **Built** — draft, upload, parse, preview, commit, erase |
| Categorization as a running path | Partial: assignment is served; the automatic pipeline over merchant rules is **not built** |
| API surface / OpenAPI operations | **Built** — 27 operations over 21 paths |
| Flutter surface | **Built** — seven financial feature folders, every route capability-gated; **no file picker adapter**, so a statement cannot yet be chosen on a device |
| Account deletion over HTTP | **Deliberately not exposed** — the cross-module cascade is not atomic and its contract is unchosen |
| Provider connectors | **Not built** — `provider-capabilities` describes potential and executes nothing |
| Erasure strategies enforced | Ports and cascade built across four modules; **retention unresolved** |

"Served" is exact: a controller is registered, the composition root binds its use cases, and the runtime-conformance suite drives the route against live PostgreSQL and Redis. It is **not** a claim that anything is deployed, available, or navigable — no environment runs this, and `TRANSACTIONS` remains `NOT_IMPLEMENTED` in the capability registry.

## Architecture changes

No change to the protected architecture. The platform is ordinary Clean Architecture inside seven new modules: domain and application layers that name no provider, infrastructure that implements ports declared inward, PostgreSQL as the canonical store, RLS on every subject-owned table, and a thin `apps/api` presentation layer that constructs nothing and calls one use case per route.

One cross-module arrangement is worth naming because it is easy to get wrong, and it now repeats three times. `modules/financial-accounts` must not import `modules/transactions`, `modules/financial-connections` or `modules/payment-instruments`, yet it owns rules that depend on all three — an account's currency may not change while records exist, and deleting an account must take its records, its source links and its instruments with it. Accounts therefore *declares* every one of those ports and the other modules *implement* them, resolved through the accounts module's `public-api`. The dependency runs one way only, and architecture test 5 (ports declared inward) is what keeps it that way.

**Every cross-module eraser is a REQUIRED constructor dependency of `DeleteOwnAccount`.** An earlier revision made the payment-instrument eraser optional with a do-nothing default, reasoning that zero is the true answer for a deployment composing no instruments. That reasoning is wrong in the case that matters: the default cannot distinguish a deployment with no instruments from one that has them and forgot a line of wiring, and in the second it erases nothing, reports success, and leaves cards spending from an account the subject was told is gone. The default has been deleted. Focused suites that genuinely have nothing to erase inject a **named** no-op (`ERASES_NO_SOURCE_LINKS`, `ERASES_NO_INSTRUMENTS`) so the decision is visible in the test rather than absent from the production path.

**That requirement is why `DeleteOwnAccount` is not composed and has no route.** The cascade runs through four separate module transactions and nothing spans them, so a partial outcome is a real answer and the contract for reporting one has not been chosen. Wiring it with no-op erasers to get a route would report a successful deletion while the rows survive — cards still spending from an account the subject was told is gone — so the use case is left out of the bundle entirely, and the required constructor arguments make its absence a compile error rather than a silent omission. Two related use cases are out for their own reasons, recorded at the seam in `apps/api/src/financial/use-cases.ts`: `SuggestTransferMatch`, because a client asserting a relationship would bypass the equal-and-opposite rule, and `EraseAccountSourceLinks`, because as a standalone verb it would let a caller orphan an account's data routes without deleting the account.

## Phase activation — architecture test 24 and `currentPhase` 5

**The marker moved to 5 in the same commit that mounted the first real ingestion path**, which is the whole rule. Architecture test 24 (resource limits declared) activates at phase 5, and a limits test with no path to scan proves nothing — so the marker could not move earlier without making the suite claim an enforcement it was not performing.

That commit contains, together: the CSV upload and parse routes; `checkResourceLimits` implemented in `scripts/checks/architecture.mjs`; test 24 flipped to `ACTIVE` with its `implementedIn`; `currentPhase` 4 → 5; and the README status row.

**What test 24 enforces.** It discovers real ingestion paths from the tree rather than from a list somebody maintains — the same definition the pre-activation guard used, so the two controls cannot disagree about what counts — and then fails in both directions: a mounted path with no central policy, and a central policy naming a path that no longer exists. It also fails when the tree contains **no** real path at all while the registry claims phase 5, because a resource-limit test that scans nothing passes vacuously.

**Non-vacuity, proven against the real path rather than asserted.** Two mutations of the live tree:

| Mutation | Result |
|---|---|
| A helper hardcodes `maxBytes`/`maxRows` instead of reading the central policy | **FAIL**, naming `apps/api/src/financial/csv-body.ts` |
| A mounted controller stops referencing `INGESTION_LIMIT_POLICIES` | **FAIL**, naming `statement-import-source.controller.ts` |
| Neither mutation | PASS, 45 files scanned |

The first mutation is why the check is shaped the way it is. It originally scanned only files that mount a route, and **passed** while a helper carried an inline bound — a controller can dutifully reference the central policy and then call a helper that hardcodes the number, and the helper is where the bound actually bites. The scan now covers the whole ingestion surface. That hole was found by mutating the real tree, not by the seeded self-tests, which is the argument for doing both.

Seven failure shapes are additionally seeded in the runner's own self-test — path without policy, inline bypass, missing field, zero, `Infinity`, duplicate `pathId`, and a policy nothing references — taking it to 65 cases.

## ADRs added/amended

**[ADR-0027](../adr/0027-calendar-day-and-instant.md) — calendar days and instants are different types.** ACCEPTED, approved by the Platform Owner. A date on a statement is what an institution wrote on its books, not a moment in time; stored as an instant it shifts across day and month boundaries for readers at different offsets, so a statement for August gains or loses a line depending on where it is read.

The approval admits `CalendarDay` as the **tenth** shared-kernel universal and moves architecture test 20's export cap from nine to ten. It authorises that one semantic distinction and nothing more: an eleventh universal needs its own ADR, architecture justification, architecture-test change and Platform Owner approval. The approval is an engineering decision — no legal, regulatory or compliance position is claimed by it.

Test 20's self-test now proves the cap in **both** directions: a fixture that omits a universal and adds one that does not belong. The missing arm is what catches a rename, since a renamed universal is absent under its old name and extra under its new one — which is also how an aliasing `export { X as Y }` that changes the public surface is caught. The runner reports the ten exports it found: `CalendarDay`, `Clock`, `Currency`, `DomainEvent`, `ExchangeRate`, `Money`, `Percentage`, `Result`, `TenantId`, `UserId`.

**[ADR-0028](../adr/0028-multi-rail-financial-sources.md) — financial data arrives on many rails, and seven concepts stay separate.** ACCEPTED. A person does not have one bank and one account: they hold several institutions, more than one account of the same type at one of them, wallets, cards spending from a wallet, and cash. The ADR separates issuer, institution market, financial connection, account-source link, financial account or wallet, payment instrument, and transaction provenance, and states that none of the arrows between them is an identity.

Its consequences are the shape of migrations 0087 and 0094-0099: issuer kinds on a globally unique catalogue row with `institution_markets` carrying market presence per **country** (never per jurisdiction); wallet kinds bound by the biconditional `CHECK ((wallet_kind IS NOT NULL) = (account_type = 'WALLET'))`; `account_nature` as `ASSET`/`LIABILITY`/`UNKNOWN` with nothing summing it; `balance_kind` `NOT NULL` **with no default**, so a caller asking what can be spent cannot silently receive a settled figure; an account identified by **its id alone**, with no uniqueness over institution, type, currency or wallet kind; and an immutable `origin_kind` that says only how an account first came to exist, with the one-source shape (`source_kind` plus a bound `provider_connection_ref`) **removed** rather than reinterpreted.

**Thirteen rails are named and only two may exist.** `MANUAL` and `USER_FILE_UPLOAD` are the implemented set; every other rail is refused by `financial_connections_rail_implemented_check` at the **database**, so an unimplemented rail cannot be written even by direct SQL from `karar_app`. The vocabulary CHECK and the gate CHECK are deliberately separate, so "we can describe this rail" and "this rail works" never become one edit. **No credential of any kind is stored anywhere** — no username, password, mPIN, OTP, token, cookie, certificate or synchronisation cursor — and the absence is proved by reading `information_schema.columns` against an exhaustive expected list, because a CHECK cannot assert that a column does not exist. **No status means connected**: `impliesLiveInstitutionLink` and `impliesLiveIssuerLink` answer `false` for every value their vocabularies permit, so nothing may display "Connected" for data a person typed or uploaded.
## Code and package changes

Seven new module directories, taking `modules/` to **29 directories of which 19 have code** (`ls -d modules/*/`). **No per-module test count is given here, and that is a deliberate refusal rather than an omission.** Three workstreams are writing into these directories concurrently and sharing one local PostgreSQL; between the activation commit and this paragraph being written, two of the seven gained test files. A count taken from a directory somebody is editing measures the edit. The last counts taken against a settled tree were at `66ad086` — financial-accounts 200, transactions 305, financial-connections 135, payment-instruments 95 — and they are recorded under _Tests executed_ against that commit, where the commit they belong to is stated next to them.

- `modules/financial-accounts` — issuer catalogue, per-country institution markets, financial accounts and wallets, balance snapshots per kind. Holder-sensitive fields (`display_name`, `user_supplied_institution_label`, `mask`) are stored only as ciphertext/nonce/auth_tag triples through an `HsfFieldEncryptionPort` whose AAD binds tenant, user, table, row and field.
- `modules/transactions` — transactions, revisions, provenance, categories, merchant rules and category assignments; keyed versioned dedup fingerprints; write gates that resolve the target account through a port before accepting a write. The imported-record writer moved here at `0fd2dcc`, into the module that owns the tables.
- `modules/financial-connections` — how data arrives and which source feeds which account: the thirteen-rail vocabulary with its database-enforced implemented subset, and the keyed per-subject source-account fingerprint that lets one external account be recognised again without becoming a confirmation oracle.
- `modules/payment-instruments` — what spends from a balance-bearing account. The table has **no balance column**, and the absence is held by six independent mechanisms rather than by a display rule.
- `modules/transfer-matching` — two of a person's transactions that were one movement of their own money. The row carries **no amount**: the figures live on the transactions it names, and a copy on the relationship would be a third number free to disagree with both. The cross-side race is closed with ordered advisory locks (`a643a2b`).
- `modules/statement-imports` — a CSV statement staged behind review: draft, upload the source, parse it under a stated column mapping, review what it produced, then commit or erase. **Parsing never writes a financial record**; only a reviewed commit does, atomically and idempotently. There is no stored draft mapping and therefore no "update the mapping" operation — the mapping is an argument to the parse, and correcting it means parsing again from the stored source. The uploaded bytes are held encrypted and their locator, store kind, byte length and checksum have no field on the HTTP surface.
- `modules/provider-capabilities` — what a provider *could* do, as typed profiles. **It owns no table and it executes nothing.** A described rail is not an executable one, an app is not an API, and a capability may only read `VERIFIED` when evidence is named — each of those is a test in the directory rather than a sentence in a document. No real provider appears anywhere in it.

In `packages/platform`, `src/ingestion/limits.ts` is the single registry of ingestion bounds: no optional members, no way to express "unlimited", and a validator that rejects non-finite, zero, negative and non-integer bounds. `assertMountedIngestionLimits()` runs that validator at Nest module registration, so a malformed bound stops the process rather than being discovered by the first upload that exceeds it.

`scripts/checks/architecture.mjs` still carries the supplementary check that FAILS a tree mounting an ingestion controller or use case while `currentPhase < 5`. It now scans zero files and passes trivially, because the marker has moved — it is retained as the other half of a lock whose first half, test 24, has taken over the enforcement.

**The application wiring is real, and it is ordinary.** `main.ts` builds every use case over its real ports in `apps/api/src/composition/phase5-modules.ts` and imports `FinancialApiModule.register(...)`; eight controllers are listed there, nothing is discovered by convention, and no controller constructs a repository, a provider or an encryption port. `apps/mobile` is still untouched — no feature folder, no generated client method, no route, no fixture, no screen.

## Database migrations

**Fifteen added, `0087` through `0101`, creating eighteen tables.** The sequence stands at **53 files**, `0001` through `0101` with deliberate gaps that stay gaps (`ls packages/platform/db/migrations/*.sql | wc -l`), and the schema at **66 tables** (`grep -c '^CREATE TABLE'` across every migration, which agrees with architecture test 22's own scan). Of those, **61 are mapped in Prisma and match the live database** (`node scripts/db/prisma-mapping-check.mjs`); the five unmapped ones are the platform and audit infrastructure tables no module owns.

The row-count cross-check on `packages/platform/db/DATA_LIFECYCLE.md` now needs a word of explanation rather than a bare equality: that register holds **62 rows**, and the four missing from it are the statement-import tables, whose lifecycle declarations live in `modules/statement-imports/MODULE.md` because that module owns both the tables and the decision. Architecture test 25 reads both, so the split is checked rather than trusted.

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
| `0100` | `statement_imports`, `statement_import_sources` — the import as a state machine whose arrows a trigger enforces (SQLSTATE `KAR51`), and the encryption metadata and locator for the uploaded file, whose bytes live in an object store reached through `EncryptedSourceStorePort` because no database cascade reaches a byte the database does not hold |
| `0101` | `statement_import_rows`, `statement_import_row_errors` — staged rows and the reason codes for the ones that could not be read |

Every subject-owned table carries RLS `ENABLE` + `FORCE` with principal GUCs; the three catalogue tables that sit outside the tenant boundary (`institutions`, `financial_categories`, `merchant_rules`) are named in `packages/platform/db/rls-allow-list.json` rather than given a no-op policy, so a reviewer reads them in the register instead of inferring them from an absent policy. Architecture test 22 reports the split over all 66 tables at `ef1d155`: **36 with `ENABLE` + `FORCE`, 37 allow-listed, 7 in both.**

**Migrations `0088`, `0089` and `0090` were edited in place after being pushed at `f0b8412`.** They are unmerged and deployed nowhere, and the alternative — a corrective migration — would have preserved plaintext holder-sensitive columns that were never meant to exist. The consequence is stated rather than discovered: **any database provisioned at `f0b8412` fails checksum verification and must be recreated.**
## API changes

**Twenty-seven operations over twenty-one paths, all under `/financial/*`.** The merged contract moves from 35 operations across 34 paths at the Phase 4 close to **62 operations across 55 paths**, and from 128 declared operation/status pairs to **273**. The fragments are authored by hand under ADR-0009 and merged into `openapi.yaml` by `$ref` per path:

| Fragment | Paths | Operations |
|---|---|---|
| `financial-accounts.yaml` | 4 | 6 — institutions, accounts list and create, account read and correct, balances |
| `financial-transactions.yaml` | 5 | 8 — list, create, read, correct, delete, category assignment, provenance, categories |
| `financial-statement-imports.yaml` | 6 | 7 — create, read, erase, upload source, parse, preview, commit |
| `financial-transfer-matching.yaml` | 3 | 3 — list, confirm, reject |
| `financial-connections.yaml` | 2 | 2 — connections, account source links |
| `financial-payment-instruments.yaml` | 1 | 1 — an account's instruments |

Four contract rules hold across all of them, and each is a test rather than a convention. **No operation accepts a `userId` or a `tenantId`** in a path, a query, a header or a body — the principal comes from the session's server-side tenant binding, resolved in one file, and a request carrying `?userId=`, `?tenantId=` and `x-tenant-id` naming another subject is answered byte-for-byte as the same request without them. **Money crosses as an exact minor-unit string** with its currency and exponent, never a JSON number; writes take a non-negative magnitude and a direction and the server applies the sign. **Calendar days are `format: date` and instants are `format: date-time` with an explicit offset** (ADR-0027); `CalendarDay` refuses a value carrying a time rather than truncating it. And **every response object declares `additionalProperties: false`**, with the ciphertexts, key versions, fingerprints, occurrence ordinals, external references, storage locators and retention decision asserted *absent* on real wire bodies rather than merely omitted from a schema.

The CSV upload is the only operation with a non-JSON request body. Every success body is `application/json`; every failure is `application/problem+json` from the single writer.

**The generated Dart client did change, and it is the one place a reader could over-read.** It is generated from the whole contract and never hand-edited, so it now carries **27 financial methods** among its 62 — and **nothing in `apps/mobile/lib/` calls a single one of them.** There is no financial feature folder, route, provider, fixture or screen. A method existing in a generated file is not a surface; it is the drift check doing its job.

## Security controls

Four were implemented with the data foundation. Three of them are now exercised by a real request; the fourth is not, and the difference is stated rather than averaged:

- **Holder-sensitive field encryption at rest** — AES-256-GCM with AAD binding tenant, user, table, row and field, so a ciphertext moved to another row or column fails to open rather than decoding as another subject's data. Now exercised: every account read on the mounted surface decrypts through the port, and the conformance suite asserts no ciphertext, nonce, auth tag, algorithm or key version reaches the wire.
- **Tenant scoping of every new financial table** — RLS `ENABLE` + `FORCE`, principal GUCs, and an explicit allow-list for the three tables consciously outside the boundary. Now exercised: the principal is bound per transaction from the session, and a request naming another subject's account answers 404 rather than 403, because "not yours" and "does not exist" must be one outcome.
- **Provenance integrity** — every stored transaction value carries its origin, and revisions are append-only. Now exercised: `GET /financial/transactions/{id}/provenance` reads it back.
- **Ingestion input limits** — declared centrally, validated at startup, and **enforced on a real upload**: the CSV route checks the declared length before reading and the accumulated length while reading, and refuses the moment either crosses the bound. Nothing is truncated to fit, because a silently shortened statement is a wrong financial record that looks like a right one.

**A fifth control arrived with the CSV path: nothing from the uploaded file comes back.** No raw row, no raw cell, no header text — a header can itself carry an account number — no staged amount, merchant or balance, and no object-storage handle. A row error names a 1-based data row number, one field from a closed safe vocabulary, and one reason code; a truncated error report says so, through separate `reportedErrorCount` and `totalErrorCount` fields.

**Erasure enforcement is implemented but not closed**: the ports and the cascade exist and are tested, while the retention periods they act on are unresolved (below), and **account deletion has no route at all** for the reason recorded under *Architecture changes*.

## SOC 2 mapping

Deferred to the [control matrix](../compliance/control-matrix.md) at close. **No SOC 2 attestation is claimed and no examination has been performed.**

## ISO 27001 mapping

Deferred to the [control matrix](../compliance/control-matrix.md) and the [statement of applicability](../compliance/iso27001/statement-of-applicability.md) at close. **No ISO/IEC 27001 certification is held, claimed, applied for or sought.**

## Evidence produced

None recorded yet. Phase 5 evidence rows begin at EV-469; the Phase 4 range ended at EV-468. Evidence is written at the phase's compliance gate, not at a mid-phase checkpoint, and this foundation has not reached one.
## Tests executed

Two different kinds of figure appear below, and conflating them is how a report starts lying. The **tree-derived and single-process checks were re-run at `ef1d155`** and are current. The **workspace and per-module assertion counts were measured at `66ad086`** and are left at that commit rather than restated, because three workstreams are writing to this tree and sharing one local PostgreSQL: a count taken now measures whatever is mid-edit. They are labelled with the commit they belong to.

All runs are against **PostgreSQL 17.10** with the server default timezone deliberately left at `Asia/Qatar` — the adversarial environment that exposed F3 below, and now the environment the suite is expected to pass in. CI builds on `postgres:17-alpine`, which runs UTC; the local run is therefore the *harder* of the two, which is the reverse of the gap this section used to record.

| Suite | Result | Measured at |
|---|---|---|
| Architecture (`pnpm arch:test`) | **24 of the 27 registry entries ACTIVE and passing, 0 failed, 3 deferred to phase 13**; registry errors 0; self-test PASS over 65 cases; both supplementary checks pass | `ef1d155` |
| Documentation (`pnpm docs:check`) | **13/13**, self-test ok over 14 cases, 292 markdown files scanned | `ef1d155` |
| Prisma mapping (`node scripts/db/prisma-mapping-check.mjs`) | **61 mapped tables match the live database** | `ef1d155` |
| Workspace (`pnpm test`) | **2300 passed / 12 skipped / 1 failed (2313 total)** across 174 files | `66ad086` |
| — of which `modules/financial-accounts` | 200 passed across 10 files | `66ad086` |
| — of which `modules/transactions` | 305 across 14 files — see the note below on the one that does not pass in a shared database | `66ad086` |
| — of which `modules/financial-connections` | 135 passed across 10 files | `66ad086` |
| — of which `modules/payment-instruments` | 95 passed across 9 files | `66ad086` |
| — of which `modules/transfer-matching` | not recorded — another workstream was mid-edit in that directory | `66ad086` |

**The architecture summary line and the table above disagree by one, and the difference is in the runner rather than in the tree.** `pnpm arch:test` prints `25 passed`: it adds one of the two supplementary checks to the pass count and not the other, because `phase5-ingestion-not-mounted-early` increments the failure count on a violation and increments nothing on a pass. The registry-derived figure — 24 ACTIVE entries, all passing, out of 27 — is the one to read, and the asymmetry is recorded here rather than reconciled by picking whichever number reads better.

**Three qualifications, stated rather than smoothed away.**

The **workspace failure** is a five-second timeout on `POST /auth/login` in the runtime-conformance suite, which exercises a deliberately expensive password hash. Two other workstreams were running their own suites against the same machine and the same local PostgreSQL at the time, and the assertion never ran rather than running and disagreeing. That is a resource observation, not a conformance result — and it is recorded as a failure anyway, because a report that quietly reruns until green is not evidence.

The **`transfer-matching` count is absent** because that directory was being edited by another workstream. A count taken from a directory somebody is editing measures the edit.

The **one `modules/transactions` test that did not pass** in a shared local database at `66ad086` was `financial-record-lifecycle.integration.test.ts`, which asserts against the live catalogue that no table other than `transactions` carries the dedup identity's column names. It failed when the database also held statement-import staging tables created by a concurrent workstream — which was the assertion working, not failing: it is designed to notice exactly that, and the module that adds such a table owns the decision about whether its columns may share those names. Those tables are now committed as `0101`, and the question is settled the way the assertion intended: `statement_import_rows` names its columns `staged_row_fingerprint` and `staged_row_fingerprint_version`, deliberately not `dedup_fingerprint`, `fingerprint_version` or `occurrence_ordinal`, so a staged row cannot be mistaken for a canonical one by a reader scanning the catalogue.

**Architecture test 24 is ACTIVE and passing**, scanning 45 files, and the two mutations recorded under *Phase activation* prove the pass is not vacuous. Nothing on the registry is deferred to phase 5 any longer; the three remaining deferrals all wait on phase 13.

**The ordinary parallel invocation was made reliable earlier in this phase, and that work stands.** It had failed intermittently for two separate reasons, both since closed: F4 (a real defect — a concurrent dedup loser arrived untyped) and connection exhaustion on a 12-core machine, which made suites SKIP rather than fail so the run stayed green while it had quietly stopped verifying. The worker count now derives from the connection budget, and `KARAR_INTEGRATION=1` makes an unreachable database a failure. Evidence recorded at that checkpoint: **ten consecutive `pnpm test` runs, 10/10 passed, identical 12 skips each time, zero orphan scratch databases.** That evidence is about the reasons above and is not contradicted by the timeout in this run, which is a machine under three concurrent suites rather than a flaky test — but nor does it license reading this run as green.

The 12 skipped are the whole of `apps/api/src/readiness.integration.test.ts`, which requires Redis and deliberately stops and restarts its compose containers; CI runs it as a separate step that owns those containers, and running it against a Homebrew PostgreSQL would not have been the same test.

**Flutter and mobile suites were not re-run** — this change touches no Dart or platform code. Their inherited numbers stand: Flutter 1190 passed / 19 skipped as CI runs it, goldens 4, localization 36, mobile security 113 passed / 1 skipped.
## Build results

`pnpm build` passes across the workspace. No mobile artifact was produced, no build was signed, and nothing was deployed.
## Known limitations

**Specific to this phase:**

- **The retention question is unresolved, and it is a legal decision nobody here may take.** No legal retention period is asserted anywhere. Every module that owns a durable financial dataset resolves retention through its own port; the only provider that exists is synthetic, labelled `SYNTHETIC_NO_LEGAL_EFFECT`, and **fails closed outside LOCAL and TEST**. DEV, STAGING and PRODUCTION receive a typed failure rather than a default period. **This data cannot reach any real environment until a retention decision with an approval reference exists**, and nothing in this repository decides it. The CSV path takes the same discipline further: `statement_imports` records where the retention question stands before the first durable source byte exists.
- **The Flutter financial surface exists now, and this entry used to say it did not.** `apps/mobile/lib/features/` holds seventeen folders, seven of them financial: accounts and wallets, transactions, categories, payment instruments, statement imports, transfer matching, and connections and sources. Every financial route is contributed unconditionally and gated inside its builder on an answer derived from bootstrap and re-read on every build, and a test derives the path list from the route table itself so a route added without a gate fails there rather than in production. **What has still not happened is the part that would make it a shipped capability**: `navigableCapabilityIds` is empty, `TRANSACTIONS` is `NOT_IMPLEMENTED`, nothing is deployed, and a route mounted in a local process is none of those things.
- **A statement cannot be chosen on a device.** The statement-import flow is complete and tested above a picker PORT, but no adapter implements it: the port reports itself unavailable, and the whole surface is therefore unusable for its actual purpose without one. This is deliberate rather than unfinished. A picker plugin adds a platform permission, and `test/security/platform_hardening_test.dart` asserts a real build's permissions are exactly the reviewed set; the correct implementation is a first-party channel over `ACTION_OPEN_DOCUMENT` and `UIDocumentPickerViewController`, which needs no permission and which nothing here has yet exercised on a device.
- **The design system's own button is invisible to Flutter's tap-target guideline.** A `KararPressable` rendered at 20x20 satisfies `androidTapTargetGuideline` while a plain `ElevatedButton` at the same size fails it, so every accessibility assertion written against the guideline alone — including the identity ones standing since Phase 4 — would report a surface as accessible however small its controls became. The financial surfaces now measure the rendered size directly, which closes the exposure; whether `KararPressable` should compose its semantics differently is a design-system question nobody has taken.
- **Nothing is deployed, and no capability is available.** Every entry in the capability registry is `NOT_IMPLEMENTED`, `TRANSACTIONS` included; no jurisdiction is approved; `qa/v1` clears nothing; and a mounted route in a local process is not an available capability. A request answering correctly here proves the code path, not the product.
- **No provider connector exists, and no real provider capability is `VERIFIED`.** No issuer named in the catalogue exposes an interface to Karar, no credential of any kind is stored, there is no scraping and no app automation, and `provider_access_status` is `NOT_IMPLEMENTED` everywhere. `modules/provider-capabilities` describes what a rail *could* do in types, owns no table, and executes nothing — a described rail is not an executable one. Nothing in the product may render "Connected", "Synced" or "Linked" for data a person typed or uploaded.
- **Account deletion is not exposed over HTTP**, and this is the one omission most likely to be read as an oversight. The cross-module cascade is **not atomic** — four module transactions, nothing spanning them — so a partial outcome is a real answer and the contract for reporting one has not been chosen. The use case exists, is tested, and is deliberately absent from the bundle the controllers can call.
- **Categorization is assignment, not a pipeline.** A subject can set a transaction's category over HTTP; nothing applies merchant rules automatically, and no use case reads them.

**Carried forward from Phase 4, unfixed by this work:** no build has run on a device, so the biometric prompt has never been shown to appear; no build is signed and no signing material exists; no Apple Team ID exists; the compound credential-abandonment guarantee is local-only; golden baselines are not CI-enforced; **EV-427 is `PENDING` and overdue**, with no DNS record and all seven registrar hardening rows still `TO_VERIFY`; and one maintainer holds every role. Runtime conformance still covers 82 of the 128 non-financial declared pairs — the Phase 5 surface brought its own suite covering 66 of its 145, so the merged contract's 273 pairs are 148 covered and 125 not.
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

Four items deferred at the previous checkpoint have since landed: CSV statement ingestion, manual transaction entry as a running path, the API surface with its OpenAPI operations, and the advance of `currentPhase` to 5 alongside architecture test 24.

Still deferred **by this checkpoint**, deliberately and in this order:

1. **Any Flutter surface** for financial data. It does not begin until the capability is exposable, and exposable is a stricter claim than "a route answers".
2. **The categorization pipeline.** Merchant rules are schema and domain; nothing applies them.
3. **Account deletion over HTTP**, which waits on a chosen contract for a non-atomic partial outcome rather than on more code.
4. **`SuggestTransferMatch`, `RecordReportedBalance`, `CreateManualConnection` and every payment-instrument write.** Their routes are not in the contract, so their use cases are deliberately absent from the bundle the controllers can call — a bundle carrying a use case nothing calls invites the route to appear later without the contract review that should precede it.
5. **The retention decision**, which is legal work and blocks any deployed environment.
6. **Phase 5 evidence rows and risk rows**, written at the phase's compliance gate rather than at a mid-phase checkpoint.

The eleven active deferred items from the Phase 4 gate stand, item 8 having been discharged when the artifact lanes became required checks.
## Documentation updated

This report; the root README (status block, containers, repository shape, capability map, the financial data-model diagram, the roadmap paragraph, the architecture-test figures and the conformance figures); the [roadmap](../roadmap.md) row; the [phases index](README.md); the [developer onboarding](../onboarding/developer.md) and [Flutter onboarding](../onboarding/flutter.md); the architecture set ([overview](../architecture/overview.md), [backend](../architecture/backend.md), [data model](../architecture/data-model.md), [Flutter](../architecture/flutter.md), [capability map](../architecture/capability-map.md), [capability registry](../architecture/capability-registry.md)); the security set ([threat model](../security/threat-model.md), [access control](../security/access-control.md), [secrets](../security/secrets.md)); [architecture tests](../testing/architecture-tests.md); the [glossary](../glossary.md); `apps/mobile/README.md`; the financial `MODULE.md` files; and `packages/platform/db/DATA_LIFECYCLE.md`.

**The four statement-import lifecycle rows have returned, in the right document.** They were removed from `packages/platform/db/DATA_LIFECYCLE.md` and from `modules/transactions/MODULE.md` at the previous checkpoint, on the grounds that the register documents tables that exist and that `transactions` owned neither the tables nor the decision. Migrations `0100` and `0101` now create them, and `modules/statement-imports/MODULE.md` declares all four — the module that owns the tables owning the declaration, which is what the removal was holding the place for.

**One documented claim was false and is corrected here, because it is the kind that stays false quietly.** `modules/financial-accounts/MODULE.md` recorded the payment-instrument eraser as an optional constructor argument with a do-nothing default, and `modules/payment-instruments/MODULE.md` repeated the reasoning. The default no longer exists: every cross-module eraser is required, a suite with nothing to erase injects a named no-op, and both documents now say so. A document that describes a defaulted dependency which is in fact required is worse than one that says nothing — a reader wiring a composition root would have trusted it, and the failure it describes is silent by construction.

**The long argument this section used to carry about holding the phase marker back has been discharged rather than dropped**, and its reasoning now lives under *Phase activation* above, where it records how the lock was honoured instead of asserting where the marker stands. The marker and the test moved together, in one commit, which was the whole of what that argument asked for.

## Next-phase entry criteria

Phase 6 begins only after this phase's PR merges and a new branch starts from the merge commit. It is not reachable from here, and no Phase 6 control, evidence row or capability is pre-activated by this document.
