# Phase 5 — Financial data platform

**Branch:** `claude/karar-v2-phase-5-financial-foundation` · **Started:** 18 August 2026 · **Status:** IN PROGRESS
**Base:** Phase 4 post-merge record commit `2b0dfca` on `main`.

**Phase 5 is IN PROGRESS on `claude/karar-v2-phase-5-financial-foundation`, and what is built runs.** The financial data platform spans **six modules** — accounts and wallets, transactions, connections and source links, payment instruments, transfer matching, and statement imports — plus `provider-capabilities`, which owns no table and executes nothing. **27 operations over 21 `/financial/*` paths** are mounted from the composition root; `currentPhase` is **5** with architecture test 24 ACTIVE. Manual entry and CSV statement import both write real rows; the Flutter financial surface exists across seven feature folders with every route capability-gated; the system document picker is implemented natively on Android and iOS; deterministic categorisation runs on both write paths; and the platform generates internal transfer suggestions after a transaction is recorded.

**None of that is a completion claim, and these are the limits that matter.** NO BUILD HAS RUN ON A DEVICE — both native halves compile and the Dart side is exercised against a fake channel, but nothing here has been seen working on a phone. There is no real provider connector and no rail beyond `MANUAL` and `USER_FILE_UPLOAD`; nothing is deployed and no capability is AVAILABLE; the non-local retention decision is unresolved and fails closed outside LOCAL and TEST; and account deletion is deliberately not exposed over HTTP.

**Measurement provenance.** Every CURRENT figure in this report is derived from the final post-review tree of this checkpoint, identified by the evidence head recorded in *Tests executed* rather than by this document's own commit hash, which it cannot contain. Figures that belong to an earlier moment are labelled **HISTORICAL — measured at `<sha>`** and are kept because they record how something was established, not what is true now. Where a figure was unstable because concurrent workstreams were mid-edit, it says so instead of being rounded into confidence.

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
| Transfer matching | Built; list, confirm and reject served, and the platform now GENERATES suggestions internally after a transaction is recorded. A client still cannot propose one — the contract has no such verb, deliberately |
| Ingestion limit policies | Declared centrally, validated at startup, **enforced on the mounted CSV upload** |
| Manual transaction entry as a running path | **Built** (`POST /financial/transactions`) |
| CSV statement ingestion | **Built** — draft, upload, parse, preview, commit, erase |
| Categorization as a running path | **Built** — a deterministic merchant-rule pass runs on manual entry and on the CSV commit, in the same unit of work as the record |
| API surface / OpenAPI operations | **Built** — 27 operations over 21 paths |
| Flutter surface | **Built** — seven financial feature folders, every route capability-gated, and the system document picker implemented on Android and iOS. **No device execution**: both native halves compile and the Dart side is exercised against a fake channel, but nothing here has run on a phone |
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
| Neither mutation | PASS, 51 files scanned |

The first mutation is why the check is shaped the way it is. It originally scanned only files that mount a route, and **passed** while a helper carried an inline bound — a controller can dutifully reference the central policy and then call a helper that hardcodes the number, and the helper is where the bound actually bites. The scan now covers the whole ingestion surface. That hole was found by mutating the real tree, not by the seeded self-tests, which is the argument for doing both.

Seven failure shapes are additionally seeded in the runner's own self-test — path without policy, inline bypass, missing field, zero, `Infinity`, duplicate `pathId`, and a policy nothing references — taking it to 70 cases. **Five of those seven could not fail until the checkpoint**: the reader that loads the central policies applied its start offset twice and returned an empty map, so every policy-side rule was unreachable while the check went on passing. The self-test could not catch it either, because its fixture began with the registry at offset zero where a doubled offset still lands in range. The fixture now carries a header, as the real file does, and the original defect fails it.

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

**The application wiring is real, and it is ordinary.** `main.ts` builds every use case over its real ports in `apps/api/src/composition/phase5-modules.ts` and imports `FinancialApiModule.register(...)`; eight controllers are listed there, nothing is discovered by convention, and no controller constructs a repository, a provider or an encryption port. `apps/mobile` was untouched when this paragraph was written and is not any more: seven financial feature folders read those controllers through the generated client, each route gated inside its builder on the capability the platform reports.

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

**Migrations `0088`, `0089` and `0090` were edited in place after being pushed at `f0b8412`.** They are unmerged and deployed nowhere, and the alternative — a corrective migration — would have preserved plaintext holder-sensitive columns that were never meant to exist. The consequence is stated rather than discovered: **any database provisioned at `f0b8412` fails checksum verification and must be recreated.** **Migration `0098` was then edited in place at this checkpoint too**, for a column comment that stated a falsehood: it said eight bytes was eight characters, which is true only while every accepted masking character is one byte, and `MASK_SHAPE` permits a three-byte one. The same recreate-the-database consequence applies, for the same reason — this branch is unmerged and deployed nowhere, and a corrective migration would have left the wrong statement standing in the catalogue.
## API changes

**Twenty-seven operations over twenty-one paths, all under `/financial/*`.** The merged contract moves from 35 operations across 34 paths at the Phase 4 close to **62 operations across 55 paths**, and from 128 declared operation/status pairs to **300**. The fragments are authored by hand under ADR-0009 and merged into `openapi.yaml` by `$ref` per path:

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

**The generated Dart client did change, and it is the one place a reader could over-read.** It is generated from the whole contract and never hand-edited, so it carries **27 financial methods** among its 62. When this paragraph was first written nothing called them, and the point it made — that a method in a generated file is the drift check working, not a capability arriving — still stands even though the callers now exist. What replaced it is a stricter line: seven feature folders call those methods, `navigableCapabilityIds` is still empty, and `TRANSACTIONS` is still `NOT_IMPLEMENTED`.

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

All runs at this checkpoint are against **PostgreSQL 16.14 (Homebrew)**, verified by `SELECT version()` rather than assumed — this section previously said 17.10, which is a version installed on the machine but not the one serving port 5432. The suite was run under **both** server default timezones and the results are identical: `Asia/Qatar` — the adversarial environment that exposed F3 below — and `UTC`, each 3085 passed / 12 skipped / 0 failed, with zero orphan scratch databases and the server returned to `Asia/Qatar` afterwards. CI builds on `postgres:17-alpine`, which runs UTC, so the local run covers the harder configuration and the CI one, but **not** the CI major version: nothing at this checkpoint was executed against PostgreSQL 17.

| Suite | Result | Measured at |
|---|---|---|
| Architecture (`pnpm arch:test`) | **27 passed, 0 failed, 3 deferred to phase 13**; registry errors 0; self-test PASS over 70 cases; all three supplementary checks pass | checkpoint |
| Documentation (`pnpm docs:check`) | **14/14**, self-test ok over 16 cases, 293 markdown files scanned | checkpoint |
| Prisma mapping (`node scripts/db/prisma-mapping-check.mjs`) | **61 mapped tables match the live database** | checkpoint |
| Workspace (`pnpm test`) | **3085 passed / 12 skipped / 0 failed (3097 total)** across 218 files (217 passed, 1 skipped) | checkpoint |
| — of which `modules/financial-accounts` | 206 passed across 11 files | checkpoint |
| — of which `modules/transactions` | 381 passed across 17 files | checkpoint |
| — of which `modules/financial-connections` | 147 passed across 12 files | checkpoint |
| — of which `modules/payment-instruments` | 99 passed across 10 files | checkpoint |
| — of which `modules/transfer-matching` | 131 passed across 10 files | checkpoint |
| — of which `modules/statement-imports` | 341 passed across 14 files | checkpoint |
| Flutter (`flutter test`) | **2070 passed / 1 skipped**; `flutter analyze` reports no issues | checkpoint |

**The architecture summary line and the registry-derived figure used to disagree by one, and no longer do.** `pnpm arch:test` prints **27 passed, 0 failed, 3 skipped**. The asymmetry that caused the old discrepancy — `phase5-ingestion-not-mounted-early` incrementing the failure count on a violation and nothing on a pass — is gone now that all three supplementary checks count on both arms. An earlier revision of this section claimed this paragraph had been removed while it was still here, saying `25 passed` and "two supplementary checks"; that claim was wrong in both figures and in the claim of its own removal, and this is what replaced it.

**Three qualifications, stated rather than smoothed away.**

**The workspace failure, the absent `transfer-matching` count and the six timeouts are all closed, and the cause of the last of them was not the one this report gave.** Every figure in the table above was taken on a settled tree with no concurrent workstream, and the suite is green: 3085 passed, 12 skipped, **0 failed**. The six timeouts previously recorded in database-provisioning suites were attributed here to "a machine under three concurrent suites". That was wrong. `pnpm test` scoped collection twice — in `vitest.config.ts` and again as `--exclude` flags in the script — and a CLI `--exclude` REPLACES the config list rather than adding to it. Neither listed `.claude`, which holds agent worktrees: checkouts of other commits whose test files were collected and run, duplicating the database-provisioning suites against one PostgreSQL. The scope now lives in one place, and the timeouts are gone.

The **one `modules/transactions` test that did not pass** in a shared local database at `66ad086` was `financial-record-lifecycle.integration.test.ts`, which asserts against the live catalogue that no table other than `transactions` carries the dedup identity's column names. It failed when the database also held statement-import staging tables created by a concurrent workstream — which was the assertion working, not failing: it is designed to notice exactly that, and the module that adds such a table owns the decision about whether its columns may share those names. Those tables are now committed as `0101`, and the question is settled the way the assertion intended: `statement_import_rows` names its columns `staged_row_fingerprint` and `staged_row_fingerprint_version`, deliberately not `dedup_fingerprint`, `fingerprint_version` or `occurrence_ordinal`, so a staged row cannot be mistaken for a canonical one by a reader scanning the catalogue.

**Architecture test 24 is ACTIVE and passing**, scanning 51 — 49 files plus the two central policies. The two mutations recorded under *Phase activation* prove the PATH side is not vacuous; they are both path-side, and for a time this document called the whole test proven on the strength of them while its policy side could not fail at all. Four further mutations now cover that side: a missing bound, a bound of zero, a policy nothing references, and two policies claiming one `pathId`. Nothing on the registry is deferred to phase 5 any longer; the three remaining deferrals all wait on phase 13.

**The ordinary parallel invocation was made reliable earlier in this phase, and that work stands.** It had failed intermittently for two separate reasons, both since closed: F4 (a real defect — a concurrent dedup loser arrived untyped) and connection exhaustion on a 12-core machine, which made suites SKIP rather than fail so the run stayed green while it had quietly stopped verifying. The worker count now derives from the connection budget, and `KARAR_INTEGRATION=1` makes an unreachable database a failure. Evidence recorded at that checkpoint: **ten consecutive `pnpm test` runs, 10/10 passed, identical 12 skips each time, zero orphan scratch databases.** That evidence is about the reasons above and is not contradicted by the timeout in this run, which is a machine under three concurrent suites rather than a flaky test — but nor does it license reading this run as green.

The 12 skipped are the whole of `apps/api/src/readiness.integration.test.ts`, which requires Redis and deliberately stops and restarts its compose containers; CI runs it as a separate step that owns those containers, and running it against a Homebrew PostgreSQL would not have been the same test.

**The Flutter numbers were inherited from Phase 4 and were badly stale**, on the reasoning that "this change touches no Dart or platform code" — which stopped being true when the client surface landed. Re-measured on the settled tree at this checkpoint: **Flutter 2070 passed / 1 skipped**. `flutter analyze` reports no issues, and `dart run tool/generate_api_client.dart --check` reports the client in sync (62 operations, 203 schemas). The goldens, localization and mobile-security splits recorded here previously — 4, 38 and 149/1 — are **HISTORICAL, measured at an earlier tree**, and are not re-derived above because the total is what the table carries.

**The workspace suite is 3085 passed / 12 skipped / 0 failed, over ten consecutive runs with identical counts and zero orphan scratch databases, under both server timezones.** A previous revision of this section recorded **six** failures — five-second timeouts in the three suites that provision and drop whole databases — and explained them as a machine under concurrent load. That explanation was wrong, and the six were not a resource observation. `pnpm test` scoped collection in two places that could disagree, and neither excluded `.claude`, so the agent worktrees under it — checkouts of other commits — had their test files collected and run, duplicating exactly those database-provisioning suites against one PostgreSQL. With collection scoped in one place the suite is green and stays green: ten runs, identical counts each time. Nothing was re-run until green and no timeout was raised to hide a failure; the earlier six are recorded here because a report that quietly drops a number it has explained away is not evidence.

**Architecture and documentation figures.** `pnpm arch:test` prints **27 passed, 0 failed, 3 skipped**, self-test **70 cases**, and test 24 scans **51** — 49 surface files plus the two central policies, which it did not read at all until the offset defect recorded under *Phase activation* was fixed. There are **three** supplementary checks, not two. `pnpm docs:check` prints **14/14**, self-test ok over **16** cases, **293** markdown files scanned. `pnpm typecheck`, `pnpm build` and `pnpm lint` all exit **0**.

`pnpm build` passes across the workspace. No mobile artifact was produced, no build was signed, and nothing was deployed.
## Known limitations

**Specific to this phase:**

- **The retention question is unresolved, and it is a legal decision nobody here may take.** No legal retention period is asserted anywhere. Every module that owns a durable financial dataset resolves retention through its own port; the only provider that exists is synthetic, labelled `SYNTHETIC_NO_LEGAL_EFFECT`, and **fails closed outside LOCAL and TEST**. DEV, STAGING and PRODUCTION receive a typed failure rather than a default period. **This data cannot reach any real environment until a retention decision with an approval reference exists**, and nothing in this repository decides it. The CSV path takes the same discipline further: `statement_imports` records where the retention question stands before the first durable source byte exists.
- **The Flutter financial surface exists now, and this entry used to say it did not.** `apps/mobile/lib/features/` holds seventeen folders, seven of them financial: accounts and wallets, transactions, categories, payment instruments, statement imports, transfer matching, and connections and sources. Every financial route is contributed unconditionally and gated inside its builder on an answer derived from bootstrap and re-read on every build, and a test walks every one of them, deriving the paths from the shell's own route table so a route added without a gate fails there rather than in production. That claim was itself once too strong: the derivation named four contributions, so an ungated route mounted straight into the composition root was visited by nothing and passed the whole suite. The table is now the concatenation of named contributions and the suite asserts the shell mounts exactly that, which the same probe now fails. **What has still not happened is the part that would make it a shipped capability**: `navigableCapabilityIds` is empty, `TRANSACTIONS` is `NOT_IMPLEMENTED`, nothing is deployed, and a route mounted in a local process is none of those things.
- **No build has run on a device.** The system document picker is implemented — `ACTION_OPEN_DOCUMENT` with `CATEGORY_OPENABLE` on Android, `UIDocumentPickerViewController` in open mode on iOS — behind a narrow platform channel that returns bounded bytes and takes no persistable URI grant, no directory access and no new permission. Both halves compile and the Dart side is exercised against a fake channel. **What has not happened is a phone.** Everything above the port is proven; the port's own two implementations have never been seen to run against a real document provider, and a build passing is not a device working.
- **Flutter's tap-target guideline is near-vacuous on a tall test surface, and an earlier entry here blamed the wrong thing.** It said the design system's own button was invisible to the guideline, citing a `KararPressable` at 20x20 passing while an `ElevatedButton` at 20x20 failed. Those two probes used different harnesses — the variable nobody controlled. Run in ONE tree the widgets behave identically: both are flagged on a phone-sized surface and neither is flagged on the feature harness's default 1000x4000 one, because the guideline skips nodes it treats as offscreen relative to the render view. `KararPressable`'s semantics are correct — `button`, `enabled`, `onTap` and a label, verified by dumping the node. **The exposure was real and the diagnosis was not**: every `meetsGuideline` assertion pumped on a tall surface, financial and identity alike, checks almost nothing. The render-tree measurement that runs beside it is the load-bearing control, because it is indifferent to surface size, and it is what catches a shrunken control.
- **Nothing is deployed, and no capability is available.** Every entry in the capability registry is `NOT_IMPLEMENTED`, `TRANSACTIONS` included; no jurisdiction is approved; `qa/v1` clears nothing; and a mounted route in a local process is not an available capability. A request answering correctly here proves the code path, not the product.
- **No provider connector exists, and no real provider capability is `VERIFIED`.** No issuer named in the catalogue exposes an interface to Karar, no credential of any kind is stored, there is no scraping and no app automation, and `provider_access_status` is `NOT_IMPLEMENTED` everywhere. `modules/provider-capabilities` describes what a rail *could* do in types, owns no table, and executes nothing — a described rail is not an executable one. Nothing in the product may render "Connected", "Synced" or "Linked" for data a person typed or uploaded.
- **Account deletion is not exposed over HTTP**, and this is the one omission most likely to be read as an oversight. The cross-module cascade is **not atomic** — four module transactions, nothing spanning them — so a partial outcome is a real answer and the contract for reporting one has not been chosen. The use case exists, is tested, and is deliberately absent from the bundle the controllers can call.
- **Categorization is now a pipeline.** Both write paths — manual entry and the CSV canonical commit — offer the narrative to a deterministic merchant-rule evaluator before the record lands, in the same unit of work. No AI, no scoring, no fallback: an unmatched transaction stays uncategorised, and a subject's own choice always wins.

**Carried forward from Phase 4, unfixed by this work:** no build has run on a device, so the biometric prompt has never been shown to appear; no build is signed and no signing material exists; no Apple Team ID exists; the compound credential-abandonment guarantee is local-only; golden baselines are not CI-enforced; **EV-427 is `PENDING` and overdue**, with no DNS record and all seven registrar hardening rows still `TO_VERIFY`; and one maintainer holds every role. Runtime conformance still covers 82 of the 128 non-financial declared pairs — the Phase 5 surface brought its own suite covering 139 of its 172, so the merged contract's 300 pairs are 221 covered and 79 not.
## Review findings and their disposition

This section covers two passes, and they were not the same kind of thing.

**The earlier pass (F1 onward) was NOT independent, and this document said it was.** It was performed by the same session that wrote the tree, after three attempts to launch separate reviewers failed. A pass that reviews its own work can find the defects it did not think of at the time, and the F-numbered findings below are real, but it cannot be the check that clears a checkpoint — the reviewer and the author share every blind spot. Calling it independent was the wrong word, and it is corrected here rather than quietly dropped.

**The later pass WAS independent**, and is recorded under *Independent review* below: two fresh reviewers that had implemented none of this tree, running read-only with the write tools withheld rather than merely forbidden. Every finding was reproduced by the lead before anything was changed.

Neither pass implemented anything; every fix below was made afterwards and re-verified.

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

## Independent review

Two reviewers, neither of which had implemented any part of this tree, read it read-only in separate worktrees: one security and adversarial, one architecture and documentation honesty. Their write tools were withheld rather than forbidden, so read-only is a property of what they could do and not of what they were asked to do. Both were given the binding constraint list and told to falsify it rather than confirm it. Neither was told what the lead believed.

They also exposed a defect in the arrangement itself: the worktrees were created from `main` rather than from the branch, so the first minutes of both reviews were spent reading a tree in which none of Phase 5 exists. Both were redirected, and their reported figures were re-taken afterwards. It is recorded because a review of the wrong tree that nobody noticed would have produced a confident, worthless clean bill.

**Every BLOCKING, HIGH and MEDIUM finding was independently reproduced by the lead before any fix was written.** Two reproductions did not match the report exactly, and the difference mattered both times — recorded below rather than smoothed over.

### R1 (BLOCKING) — a 200 KB upload stalled every tenant for 48 seconds

`StreamingCsvParser` measured the in-progress record by re-encoding it on every character, which is O(n²) in record length. Because a record is not bounded until one of those byte counters trips, the whole quadratic cost was paid before any bound could refuse the input. Reproduced against the real parser, not a re-implementation: 12,500 characters 566 ms, 25,000 1,125 ms, 50,000 4,000 ms, 100,000 13,794 ms, 200,000 **48,713 ms** — for a body of 200 KB, 2% of the declared 10 MB ceiling, carrying no delimiter and no newline.

Two reported details were wrong, and both understated the problem in one way and overstated it in another. `maxFieldBytes` **is** reached — at end-of-input, during finalisation — so the parse does refuse rather than run to the 8 MB buffer ceiling; the report's extrapolation to ~20 hours does not apply. But the deadline is worse than described: the 200,000-character parse ran **48.7 seconds against a 30-second deadline** and ended in `FIELD_TOO_LARGE`, not `DEADLINE_EXCEEDED`, because the deadline is checked only at chunk and record boundaries and a single-chunk unterminated record reaches neither. Node runs one thread and the parse route awaits the drain inline, so this was every tenant's requests stalled by one authenticated upload.

Fixed: byte counters maintained incrementally, the field bounded as it grows, and time checked on a character stride. Same input, same refusal, **0 ms**. Three tests pin it, each run against the pre-fix parser to prove it fails there — they took 206 s, 287 s and 50 s and failed.

### R2 (HIGH) — the lane that ran the database suites never required a database

The main CI `Test` step did not set `KARAR_INTEGRATION`, so `skipUnlessDatabaseRequired` turned an unreachable database into a skip across 40+ integration suites and the lane passed having run none of them. `connection-budget.ts` records this exact regression happening before.

Reproducing it found the reason it had been left that way: the flag was doing two incompatible jobs. It also enables `readiness.integration.test.ts`, which stops and restarts the compose containers and kills the other suites' connections mid-test — so the main lane could not declare the database required without also turning that suite loose on it. The readiness suite now gates on `KARAR_READINESS_SUITE`.

### R3 (HIGH) — the published test totals were a function of who had an agent running

`pnpm test` scoped collection twice, in `vitest.config.ts` and again as `--exclude` flags in the script, and a CLI `--exclude` REPLACES the config list rather than adding to it. Neither listed `.claude`, which holds agent worktrees — checkouts of other commits whose test files were collected and run. Verified directly: a test file placed under `.claude/` was collected and executed.

This is also the real cause of the six timeouts this report previously recorded and attributed to concurrent workstreams. That attribution was wrong: the duplicated suites were provisioning databases against one PostgreSQL. With collection scoped in one place the suite is green over ten consecutive runs with identical counts.

The same defect had already been found and fixed for `docs:check` during this checkpoint — 293 markdown files became 821 with two agents running — but the fix was not carried to the vitest invocation or to eslint, where nested checkouts made **every** file in the tree unparseable.

### R4 (HIGH) — the documents denied code that had been running for weeks

Six `MODULE.md` files and five layer READMEs denied an HTTP surface that is mounted and conformance-tested; three current-state documents denied a Flutter financial surface that exists in seven feature folders; one document contradicted itself ten lines apart; and this report asserted it had removed a paragraph that was still present, whose figures were also wrong. Eighteen further layer READMEs called themselves skeletons while holding between 1 and 20 production files. All corrected against measurement, and listed in *Documentation updated*.

The reviewer's sharpest point was about the guard added earlier in this same checkpoint to prevent exactly this: `checkDerivedFacts` was a blacklist of six phrases over eight named files, and the commit adding it claimed it scanned every current-state document. It did not, which is why it missed all of the above. Two derived rules replace that claim — a module the API app wires may not carry a transport denial, and a directory holding code may not call itself a skeleton — both keyed per module and per directory, so the 42 genuinely empty ones stay legal.

### R5 (MEDIUM) — eight characters is not eight bytes

`MASK_SHAPE` permits U+2022, which is three bytes; `MAX_INSTRUMENT_MASK_LENGTH` counted characters; migration 0098 bounds the column at eight **octets**. An ordinary four-bullet mask was accepted by the domain at 16 bytes and refused by the column as an unhandled constraint violation. Latent — only the list operation is mounted and no create route exists in Phase 5 — and it would have fired the day a write route landed. The security direction was never wrong: the byte bound is the stricter of the two.

The test that claimed to pin the two bounds used `****1234`, pure ASCII, where characters and bytes cannot disagree. It passed for the wrong reason and could never have caught this.

### R6 (LOW) — a catch-all body parser answered for the whole service

`registerCsvContentTypeParser` registers `/^.*$/` on the shared Fastify instance, so any request to any route carrying a media type Fastify has no exact parser for stopped getting Fastify's 415 and started getting the `UNSUPPORTED_BODY` sentinel as its body. No route was found that would proceed on such a body, so nothing was exploitable — but that is a property of every other route rather than of this file. Now scoped to the one upload route.

### R7 (LOW) — two guards that agreed with themselves

The Flutter route-derivation test never descended into `route.routes`, and asserted its length against a count using the same top-level-only filter, so a nested financial route would have been absent from both sides and the check would still have agreed. The non-financial conformance suite pinned only its covered list, with no partition, so a status added to a contract fragment landed in neither ledger silently. Both closed, and both proved on the real scenario rather than by adjusting a number.

### Reported and not changed

**No rate limiting on the financial routes.** Confirmed: those controllers carry only `FinancialCapabilityGuard`, and the Redis sliding-window limiter composed in `phase3-modules.ts` is not applied to them. It is not fixed here because it is a design decision about the whole surface rather than a defect in one path, and R1 — which is what made it a sustained outage rather than a single stall — is fixed. Recorded in *Deferred work*.

**`phase5-ingestion-not-mounted-early` cannot fail again.** Correct: `currentPhase` is 5 and moves only forward, so the check scans zero files and its pass is counted in the headline 27. This was already disclosed here; it was NOT disclosed in `README.md` or `docs/testing/architecture-tests.md`, which presented the supplementary checks as passing controls. Both now say so.

**Architecture test 7 does not scan the layers where a float would enter.** Correct: it covers the pure packages and every module `domain` and `application`, not `infrastructure/persistence/row-mappers.ts` or `apps/api/src/financial/transaction-input.ts`. The reviewer checked both by hand and found them correct today, so this is a scope gap rather than a violation. AC-001's claim has been narrowed to the scope its evidence actually covers, which is what was overstated.

**Categorization is proven end-to-end through a stub the test configures.** Correct, and the test says so. The default wiring uses the real evaluator over an empty rule corpus, so no test exercises real rule matching on the live commit path. Recorded in *Deferred work* rather than papered over.

## Accepted risks

None accepted by this phase yet; the register carries 41 rows at the Phase 4 close. Phase 5 risk rows are written at the phase's gate, once the surface they describe exists.
## Deferred work

Four items deferred at the previous checkpoint have since landed: CSV statement ingestion, manual transaction entry as a running path, the API surface with its OpenAPI operations, and the advance of `currentPhase` to 5 alongside architecture test 24.

Still deferred **by this checkpoint**, deliberately and in this order:

1. **A build on a device.** The picker adapter is no longer deferred — it is implemented natively on Android and iOS, over `ACTION_OPEN_DOCUMENT` with `CATEGORY_OPENABLE` and over `UIDocumentPickerViewController` with `asCopy:false`, adding no platform permission. What is still deferred is running any of it on hardware: **no build has run on a device**, so the picker, the surface and the whole import path are verified by test and by inspection only.
2. **Real merchant-rule matching on the live commit path.** The categorization pipeline is no longer deferred — it runs on both write paths. What no test exercises is the real `MerchantRuleEvaluator` deciding a category during a live CSV commit: the default wiring uses the real evaluator over an empty rule corpus, and the test that asserts a committed row's category configures a stub that always matches. The stub says so, and the seam is proven; the decision is not.
3. **Account deletion over HTTP**, which waits on a chosen contract for a non-atomic partial outcome rather than on more code.
4. **`SuggestTransferMatch`, `RecordReportedBalance`, `CreateManualConnection` and every payment-instrument write.** Their routes are not in the contract, so their use cases are deliberately absent from the bundle the controllers can call — a bundle carrying a use case nothing calls invites the route to appear later without the contract review that should precede it.
5. **The retention decision**, which is legal work and blocks any deployed environment.
6. **Phase 5 evidence rows and risk rows**, written at the phase's compliance gate rather than at a mid-phase checkpoint. The four Phase 5 assurance-claim rows (AC-032 to AC-035) were added at this checkpoint and carry no `EV-` reference for the same reason.
7. **Rate limiting on the financial routes.** Those controllers carry only `FinancialCapabilityGuard`; the Redis sliding-window limiter exists and is composed in `phase3-modules.ts` but is not applied to them. Raised by independent review. Deferred because it is a decision about the whole surface rather than a defect in one path — and because the finding that made its absence an outage rather than a single stall, the quadratic parser, is fixed.
8. **Widening architecture test 7 to the boundary layers.** It scans the pure packages and every module `domain` and `application`, not the DB-to-domain and wire-to-domain mappers where a float would actually enter. Both were read by hand at this checkpoint and are correct; AC-001's claim has been narrowed to the scope its evidence covers rather than left overstated.

The eleven active deferred items from the Phase 4 gate stand, item 8 having been discharged when the artifact lanes became required checks.
## Documentation updated

This report; the root README (status block, containers, repository shape, capability map, the financial data-model diagram, the roadmap paragraph, the architecture-test figures and the conformance figures); the [roadmap](../roadmap.md) row; the [phases index](README.md); the [developer onboarding](../onboarding/developer.md) and [Flutter onboarding](../onboarding/flutter.md); the architecture set ([overview](../architecture/overview.md), [backend](../architecture/backend.md), [data model](../architecture/data-model.md), [Flutter](../architecture/flutter.md), [capability map](../architecture/capability-map.md), [capability registry](../architecture/capability-registry.md)); the security set ([threat model](../security/threat-model.md), [access control](../security/access-control.md), [secrets](../security/secrets.md)); [architecture tests](../testing/architecture-tests.md); the [glossary](../glossary.md); `apps/mobile/README.md`; the financial `MODULE.md` files; and `packages/platform/db/DATA_LIFECYCLE.md`.

**The four statement-import lifecycle rows have returned, in the right document.** They were removed from `packages/platform/db/DATA_LIFECYCLE.md` and from `modules/transactions/MODULE.md` at the previous checkpoint, on the grounds that the register documents tables that exist and that `transactions` owned neither the tables nor the decision. Migrations `0100` and `0101` now create them, and `modules/statement-imports/MODULE.md` declares all four — the module that owns the tables owning the declaration, which is what the removal was holding the place for.

**One documented claim was false and is corrected here, because it is the kind that stays false quietly.** `modules/financial-accounts/MODULE.md` recorded the payment-instrument eraser as an optional constructor argument with a do-nothing default, and `modules/payment-instruments/MODULE.md` repeated the reasoning. The default no longer exists: every cross-module eraser is required, a suite with nothing to erase injects a named no-op, and both documents now say so. A document that describes a defaulted dependency which is in fact required is worse than one that says nothing — a reader wiring a composition root would have trusted it, and the failure it describes is silent by construction.

**The long argument this section used to carry about holding the phase marker back has been discharged rather than dropped**, and its reasoning now lives under *Phase activation* above, where it records how the lock was honoured instead of asserting where the marker stands. The marker and the test moved together, in one commit, which was the whole of what that argument asked for.

## Next-phase entry criteria

Phase 6 begins only after this phase's PR merges and a new branch starts from the merge commit. It is not reachable from here, and no Phase 6 control, evidence row or capability is pre-activated by this document.
