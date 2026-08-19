# Module: statement-imports

## Purpose

**Turning a CSV statement a person uploaded into their financial records, with a stop in the middle where they get to look.** Four subject-owned tables: `public.statement_imports` and `public.statement_import_sources` (0100), `public.statement_import_rows` and `public.statement_import_row_errors` (0101).

The pipeline is `source → parse → normalize → stage → preview → subject review → commit`, and the arrow that matters is the one before `commit`. **Parsing never writes a financial record.** The legacy product parsed a statement and inserted transactions in the same pass, so "import this file" and "add 312 records to my ledger" were one irreversible action — and a mis-read decimal separator became 312 wrong financial facts before anybody saw a screen. Here, parsing writes staged ROWS: normalised, fingerprinted, and inert. A staged row affects no balance, appears in no total, and is not a transaction.

**This module targets exactly ONE account per import, and never infers which.** The person selects an existing account or explicitly creates one. Nothing here matches a statement to an account on `institution + type + currency` — that combination is precisely what a real person legitimately duplicates, and a rule built on it silently files one account's statement into another (ADR-0028). A file that appears to describe several accounts is `REVIEW_REQUIRED`, never silently mixed.

**Nothing here guesses.** Not a date order, not a decimal separator, not a currency, not a timezone, not the meaning of a debit column. Every genuinely ambiguous value is a typed reason code that sends the import to review. An unreadable amount is an ERROR, never a zero.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** ACTIVE — Phase 5 implemented the ingestion core: the four tables (RLS ENABLEd and FORCEd on tenant and user), the database-enforced state machine, the retention gate that refuses a durable source byte before a decision exists, the encrypted-source port with its LOCAL adapter, the streaming bounded parser, the deterministic normalisation ruleset, staging and preview, and the atomic idempotent commit. **No HTTP surface and no controller exist**, deliberately — see 'Notes and known limitations'
- **Phase:** 5
- **Capability:** TRANSACTIONS — this module is an internal bounded context beneath that product capability, not a capability of its own. The reasoning `modules/financial-accounts` records applies unchanged: a statement import is not independently purchasable, entitleable or deployable, and a second capability id would add a dimension the product does not have
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `statement_imports` | `SUBJECT_OWNED` | the lifecycle of one CSV statement import for one subject and one of their accounts — where it stands, the versions that processed it, the safe counts a review screen shows, and the balance the source itself stated | `HIGHLY_SENSITIVE_FINANCIAL` | **unresolved: the financial-data retention decision is a legal one and has not been taken.** No period is written here; the row records the decision it received. Durable SOURCE bytes are refused until that decision is `DECIDED`, **enforced by `StatementRetentionDecisionPort` in `StoreImportSource` AND by `statement_import_sources_guard` (SQLSTATE `KAR54`)** and not merely declared; LOCAL and TEST run on a clearly synthetic fixture with no legal effect | included — the state, the counts, the versions and the source-stated balance are the subject's own facts | `CASCADE_DELETE` |
| `statement_import_sources` | `SUBJECT_OWNED` | where the encrypted statement bytes live and how to verify they are unchanged — an opaque object reference, the AEAD parameters, an integrity checksum over the ciphertext, and the keyed per-subject fingerprint that recognises the same file arriving twice | `HIGHLY_SENSITIVE_FINANCIAL` | as above — unresolved, fails closed, enforced by trigger | **excluded** (see below) | `CASCADE_DELETE` |
| `statement_import_rows` | `SUBJECT_OWNED` | one line of a subject's statement after mapping and normalisation, staged and inert, with the deduplication fingerprint that says whether it is already recorded and the write-once link to the canonical transaction it produced | `HIGHLY_SENSITIVE_FINANCIAL` | as above — unresolved, inherited from the parent import, which could not have stored a source without a decision | included — a staged row is the subject's own statement line and its narrative decrypts for their export exactly as a transaction's does, **excluding** `staged_row_fingerprint`, a keyed value with no meaning outside this platform | `CASCADE_DELETE` |
| `statement_import_row_errors` | `SUBJECT_OWNED` | why a line could not be read — the row number, a safe field name and a stable reason code, and nothing else | `HIGHLY_SENSITIVE_FINANCIAL` | as above — unresolved, inherited from the parent import | included — a person is entitled to know which of their lines were refused and why | `CASCADE_DELETE` |

**`CASCADE_DELETE` on `statement_import_sources` is only half of that row's erasure**, and the half the database can do. The encrypted object lives outside PostgreSQL, so the cascade reaches the row that NAMES it and cannot reach the bytes. `EraseStatementImport` therefore deletes the object through `EncryptedSourceStorePort` **first** and only then removes the rows — see 'What `CASCADE_DELETE` reaches' below.

**Why the source row is held back from an export that is otherwise complete.** `object_ref` is a storage address and `file_fingerprint` is a keyed value whose only power is saying that two uploads are the same file. Neither is a fact about the subject that the subject does not already hold — the person has their own statement — and putting either in a downloaded archive is precisely what the opaque handle and the per-subject key exist to prevent.

**Why the error table is not classified lower than the rest.** Its columns are codes, and a classification that follows column TYPES rather than the SUBJECT is how sensitive data ends up in a less protected table. "Row 14's amount could not be read" is still a statement about one specific person's specific bank statement.

**What `CASCADE_DELETE` reaches.** Deleting a `statement_imports` row takes its source row, its staged rows and its row errors with it, by `ON DELETE CASCADE` (0100, 0101). It does **not** reach the canonical transactions a committed import produced: those are the person's financial records and they survive the file that carried them, exactly as a transaction survives the connection it arrived through. **The database cascade is not the whole of erasure**, and this is the one place that matters: the encrypted object lives outside PostgreSQL, so `EraseStatementImport` deletes it through `EncryptedSourceStorePort` **first** and only then removes the rows. A dangling ciphertext nobody can name is still a subject's bank statement sitting in a store.

## The state machine, and why it is in the database

```
DRAFT ──► SOURCE_STORED ──► PARSING ──► REVIEW_REQUIRED ──► COMMITTING ──► COMMITTED
  │            │               │               │                │
  └► REJECTED  ├► DUPLICATE    ├► FAILED       ├► REJECTED      ├► FAILED
               └► REJECTED     └► DUPLICATE    └► FAILED        └► REVIEW_REQUIRED
every settled state ──► ERASED   (not COMMITTING — see below)
```

The legal moves are an **explicit list of pairs**, not an ordering, and that is the whole design. The transitions that must be impossible are not backwards ones: `PARSING → COMMITTED` advances, and so does `SOURCE_STORED → COMMITTING`. Both skip `REVIEW_REQUIRED`, which is to say both write a person's financial records from a file nobody read. An ordering rule permits exactly the failure this module exists to prevent.

The list lives in `domain/import-state.ts` **and** in `statement_imports_guard` (0100), and a test asserts the two are identical. The duplication is deliberate: the claim being made is about ORDERING, and an ordering claim enforced only in a use case says nothing about a fixture, a backfill, a repair script, or an ingestion path written later by someone who never opened the file.

`COMMITTING → REVIEW_REQUIRED` is legal because a failed commit leaves **no subset** — the transaction rolled back, so the staged rows are exactly what the person reviewed. An import stuck in `COMMITTING` would be describing work that is not in progress.

`PARSING → PARSING` is not a transition. A retried parse re-enters from `SOURCE_STORED` and **replaces** the staged rows rather than adding to them, which is what makes a retry idempotent instead of cumulative.

`COMMITTING → ERASED` is the one move erasure does not have, and that is not an oversight: a commit in flight is a database transaction that is still running, and erasing the import out from under it would race the write it is making. The commit settles first — to `COMMITTED`, to `FAILED`, or back to `REVIEW_REQUIRED` — and every one of those may then be erased.

### Custom SQLSTATEs

`KAR` is outside every class the standard and PostgreSQL assign (the convention 0090 established). `KAR01/02`, `KAR10/11`, `KAR20`–`KAR23`, `KAR30/31` and `KAR40`–`KAR43` were taken; this module claims `KAR50`–`KAR57`.

| Code | Raised by | Means |
|---|---|---|
| `KAR50` | `statement_imports_guard` | import identity rewritten — tenant, user, target account, media type or creation instant |
| `KAR51` | `statement_imports_guard` | illegal state transition |
| `KAR52` | `statement_imports_guard` | the optimistic-concurrency token did not advance by exactly one |
| `KAR53` | `statement_imports_guard` | the retention decision was withdrawn or rewritten |
| `KAR54` | `statement_import_sources_guard` | durable source bytes for an import whose retention question is still open, or for an import this principal cannot see |
| `KAR55` | `statement_import_sources_guard` | a stored source rewritten — bytes, checksum, or identity |
| `KAR56` | `statement_import_rows_guard` | a staged row's identity or its write-once transaction link rewritten |
| `KAR57` | `statement_import_rows_guard` | a staged row written for an import that is not `PARSING` |

## Retention decides before the first durable source byte

The order is fixed: **resolve retention → `DECIDED` → encrypt the source → durable write.**

It is enforced twice, from both ends. `StoreImportSource` asks `StatementRetentionDecisionPort` and refuses on anything but `DECIDED`, before it calls the store. Independently, `statement_import_sources_guard` refuses to insert a source row whose parent import has not recorded a decision (`KAR54`) — for a direct SQL `INSERT` by `karar_app`, a fixture, a backfill, or a path written later by someone who never read this file.

**That trigger is why the source is its own table.** Had the ciphertext lived on `statement_imports`, "resolve retention, then store the bytes" would be two `UPDATE`s on one row in an order only the application knows, and the evidence for the ordering claim would be a test of the application rather than of the database.

**Proven, not asserted.** `__tests__/retention-gate.integration.test.ts` drives a refusing provider through `StoreImportSource` and then counts rows in all four tables **as the bootstrap superuser with RLS bypassed** — because counting as `karar_app` would prove the rows are hidden, not that they are absent. It asserts **zero** import rows, zero source rows, zero staged rows, zero row errors, zero canonical transactions, and that the store was never called.

**No duration and no approval reference is ever fabricated.** LOCAL and TEST resolve the values from `@karar/financial-retention-local-fixtures` at runtime through `createRequire`, so a production install — which does not have the package — contains no fabricated approval reference in its emitted JavaScript, its declaration files, or its source maps. DEV, STAGING and PROD get a throw, never a fallback.

## Raw CSV security

**No plaintext statement byte is stored in PostgreSQL.** `EncryptedSourceStorePort` is provider-neutral and inward: authenticated encryption, a fresh nonce per object, a recorded key version, and an integrity checksum over the ciphertext that the commit path re-verifies before it reads a byte.

**No provider URI reaches the domain or the application.** `store` returns a `SourceObjectRef` — an opaque handle whose constructor refuses a scheme separator and whitespace, with the same refusal repeated as a `CHECK` in 0100. Moving stores is a composition change, not a rewrite of every historical row.

**No cloud object storage client is added by this module.** `modules/documents` owns object storage for this platform (architecture test 18), and a second module importing an S3 client would be a second answer to a question that already has one. The LOCAL/TEST adapter keeps ciphertext in process memory and refuses to construct outside `KARAR_ENV=local`; `resolveEncryptedSourceStorePort` throws in every other environment that has not been given an approved provider.

**No raw byte reaches a log, an event, an audit record or the outbox.** The store's single failure type carries one opaque kind, because distinguishing "wrong key" from "tampered" for a caller would leak an oracle and describing what failed to decrypt would leak the thing itself.

### Two checksums, two questions, and only one of them is keyed

`integrity_checksum` is a plain SHA-256 over the **ciphertext**. A plain digest is correct there precisely because ciphertext is indistinguishable from random: digesting it confirms nothing about the statement.

`file_fingerprint` is a **keyed, per-subject, versioned** MAC over the **plaintext**, and it is what detects the same file arriving twice. Keyed, because an unkeyed digest of a document is a confirmation oracle — anyone holding a copy of a statement could test whether a given person imported it, without decrypting anything and without any access to this platform's copy. Per subject, so the same file under two people produces unrelated values rather than a cross-subject join key. Versioned, so a redefinition starts a fresh namespace.

There is deliberately **no unique index** over it: the same file may legitimately be uploaded again after a rejection or an erasure, so duplicate-file detection is a REVIEW outcome (state `DUPLICATE`) rather than a write refusal, and only a previously **COMMITTED** import counts as a duplicate.

## Limits, and where the numbers live

Every bound comes from `packages/platform/src/ingestion/limits.ts` (`csvStatementImport`), resolved at runtime through `ingestionLimitPolicyFor`. **No constant in this module restates one.** That file's own header records why: the legacy had no numbers at all, because every bound lived wherever the code happened to need one.

| Bound | Enforced where |
|---|---|
| `maxBytes` | the parser's byte counter, and the ceiling repeated as a `CHECK` on `statement_import_sources.byte_length` |
| `maxRows` | the parser's data-row counter |
| `maxColumns` | per row, as fields are split |
| `maxFieldBytes` | per field, on the decoded UTF-8 byte length |
| `maxBufferedRows` / `maxBufferedBytes` | the parser's own working set, so "streaming" is a property rather than a claim |
| `deadlineMs` | an absolute instant computed by the caller from its `Clock`, checked as rows are produced |
| `maxReportedErrors` | how many row errors a preview returns, with the true total reported separately |
| `maxBatchSize` | rows written per batch at commit |

**Reject, never truncate.** Every bound produces a typed refusal naming which bound was hit. There is no path that returns the first N rows and no path that reports success on a partial read — a silently shortened statement is a wrong financial record that looks like a right one, discovered (if ever) by a person wondering why their balance is off.

Each bound is tested at **limit−1, exactly-limit and limit+1**, because an off-by-one on a resource ceiling is the defect that only shows up in production.

## Normalisation

Deterministic and versioned (`statement-csv/normalization/v1`). The version travels into `transaction_provenance.normalization_version` on every committed transaction, so a later reader can say which rules produced a stored figure.

| Case | Rule |
|---|---|
| Arabic-Indic (U+0660–U+0669) and Persian (U+06F0–U+06F9) digits | folded to ASCII |
| U+066B / U+066C | folded to `.` and `,` — a mapping of ROLE, not appearance |
| Both `.` and `,` present | the LAST is the decimal separator; grouping cannot follow a decimal point, so no locale is involved |
| One separator, more than once | grouping — `1.234.567` has no other reading |
| One separator, once, ≤ exponent digits after | decimal separator |
| One separator, once, exactly 3 after, exponent ≠ 3 | grouping — a 3-decimal reading is impossible in a 2-decimal currency |
| One separator, once, exactly 3 after, exponent = 3 | **`AMBIGUOUS_DECIMAL_SEPARATOR`** — `1.234` is either 1234 fils or 1.234 dinar, and both are ordinary |
| More decimals than the currency has | `DECIMAL_PLACES_EXCEED_CURRENCY` — refused, never rounded |
| Grouping that is not 3-digit after the first group | `UNREADABLE_AMOUNT` — refused, not silently joined |
| Accounting negatives `(1,234.56)` | negative |
| Trailing minus `1234.56-` | negative |
| Two sign markers at once | `UNREADABLE_AMOUNT` — contradictory, not emphatic |
| Separate debit/credit columns | debit → negative, credit → positive; both present or both absent are two DIFFERENT errors |
| A sign marker inside a debit or credit column | `AMBIGUOUS_DIRECTION` — the column already said the direction |
| 0-, 2- and 3-decimal currencies | the currency's exponent decides everything above; KWD, BHD and OMR are 3 |
| Unicode composition | NFC — two visually identical merchants that differ by composition would otherwise fingerprint differently and import twice |
| BOM, C0/C1 controls, whitespace runs | removed / collapsed; whitespace is stripped entirely inside an amount, because `1 234,56` uses it as grouping |
| Empty values | absence for an optional field, `REQUIRED_FIELD_MISSING` for a required one |
| `YYYY-MM-DD` / `YYYY/MM/DD` | accepted whatever the stated order says — unambiguous by construction |
| `D/M/YYYY` with a stated order | read under the stated order |
| `D/M/YYYY` with no stated order, one reading valid | read — determined by the value, not guessed |
| `D/M/YYYY` with no stated order, both readings valid | **`AMBIGUOUS_DATE_ORDER`** |
| Two-digit years | `UNREADABLE_DATE` — a century is not in the value, and every rule for supplying one is a guess |
| An instant with no zone or offset | `UNREADABLE_INSTANT` — turning a wall clock into a moment means choosing a zone invisibly |

**An unreadable amount is `NULL` with `row_state = 'INVALID'`, never zero.** Zero is a real financial fact that reversals genuinely produce, and the column is later summed. Migration 0101 refuses an `INVALID` row that carries an amount at all.

## Deduplication

**There is no fingerprint algorithm in this module and there must never be one.** Content identity is computed through `modules/transactions`' `DedupFingerprintPort`, reached through that module's `public-api.ts` — keyed, derived per `(tenant, user)`, and versioned there. Two definitions of "the same transaction" disagree, and the disagreement surfaces as duplicated or vanished financial records.

The occurrence model is that module's too: the digest states what the content IS, and how many times that content occurred is the separate ordinal beside it. Two identical coffees in one day are one content identity occurring twice.

**Column names are local even though the algorithm is not.** `staged_row_fingerprint`, `staged_row_fingerprint_version` and `staged_row_ordinal` are deliberately not `dedup_fingerprint`, `fingerprint_version` and `occurrence_ordinal`: `public.transactions` owns those names for the dedup identity of a **canonical** transaction, and `modules/transactions` asserts against the live catalogue that no other table wears them. `modules/financial-connections` hit the same collision and renamed its own column rather than relax that assertion (0097). The rule is worth more than the convenience, and here it is also more honest — a staged row is a candidate awaiting review, not a canonical transaction.

**Concurrent commits cannot duplicate.** The `transactions_dedup_key` unique index over `(tenant, user, account, fingerprint version, fingerprint, occurrence ordinal)` and `transactions_occurrence_guard` (`KAR01`) are what settle a race; this module maps both refusals to typed outcomes rather than letting them surface as store failures.

**Source-FILE duplicate detection is separate and checksum-based**, and it discloses no plaintext — see 'Raw CSV security'.

## Review before commit

`source → parse → normalize → stage → preview → subject review → commit`. Parsing never auto-commits, and `CommitStatementImport` can only run from `REVIEW_REQUIRED`.

**What the preview exposes:** valid and invalid row counts, exact and probable duplicate counts, the account it targets, whether a source is linked, currency mismatch, date ambiguity, the reconciliation verdict, the four processing versions, and — bounded by `maxReportedErrors` — row errors as `(row number, safe field, reason code)` with the true total reported separately.

**What the preview withholds:** every value read out of the file. No cell, no header text, no amount, no merchant, no description, no balance, no source reference, no instrument mask, no fingerprint. The offending value is the one thing a person can already see by opening their own file, and the one thing that must not travel into a log, an error tracker, a support ticket or a screenshot. The safe field name is this module's own vocabulary and is never the file's header text — a header can carry an account number as easily as the word "Amount".

## Reconciliation

**Both ends of every comparison are figures the FILE stated.** Summing the parsed rows to produce a "source" balance and then comparing it to itself always matches, so it would report a reconciled statement for every file including the ones read wrongly. A control that cannot fail is a green light with no wiring behind it.

A net movement is not a balance, so a comparison is only possible when the file supplies a second anchor: per-line running balances (continuity is then checkable line by line, and the last must equal the stated closing figure) or a stated opening balance. With neither, the verdict is `RECONCILIATION_NOT_AVAILABLE` — and that **does not block a commit**, because a statement with no balance column is not a defective statement.

Comparison is `Money.equals` over exact minor units: no epsilon, no rounding allowance, no "within one minor unit". A tolerance is a decision that some wrongness is acceptable, taken on behalf of somebody whose money it is. Two figures in different currencies are not compared at all — converting one needs a rate this platform did not observe.

**`MISMATCHED` blocks the commit.** Not a warning and not a badge: the file says the account ended at one figure and its own lines say another, so at least one is being read wrongly.

## Atomic, idempotent commit

`CommitStatementImport` **revalidates everything** before it writes — the principal, the import's visibility and state and version, the account's ownership, lifecycle and currency, the retention decision, the stored source's integrity checksum, the source link, the parser/mapping/normalisation/fingerprint versions, the dedup state of every row, and the reconciliation verdict. An import can sit in review for days, and in that time an account can be closed and a key can be rotated.

**One database transaction** then writes: the canonical transactions, their revision 1, their provenance, the deterministic category assignments where an exact reviewed rule applied, the staged rows' write-once links back to what they produced, the source freshness observation, the identifier-only outbox notice, and the `COMMITTED` state. **Any failure leaves no subset.**

**A retry after an ambiguous response produces no duplicate and the same result.** The implementation re-reads the import inside the transaction; if it is already `COMMITTED` it writes nothing and answers with the transaction ids the first commit produced. The write-once row link (`KAR56`) is what makes that possible and what stops anyone forging a second first-commit.

Nothing in the commit calls a key provider, a policy pack or another service: everything is resolved before the transaction opens, because holding a database transaction open across a network call is how a connection pool starves under load, and this is the widest transaction in the module.

## Ports this module declares

| Port | Answers | Implemented by |
|---|---|---|
| `StatementRetentionDecisionPort` | `DECIDED` \| `PENDING_LEGAL_REVIEW` \| `UNAVAILABLE` \| `NOT_APPLICABLE`, per dataset | a labelled synthetic fixture in LOCAL only; a policy-pack reader elsewhere. `NOT_APPLICABLE` is a refusal for both datasets — a subject's bank statement is not outside retention law |
| `EncryptedSourceStorePort` | where the encrypted statement is, and is it unchanged | `infrastructure/providers` locally (ciphertext in process memory); a key-management-backed adapter elsewhere. `resolveEncryptedSourceStorePort` **throws** in dev, staging and production when no approved provider is wired |
| `SourceFileFingerprintPort` | the keyed, per-subject, versioned value that recognises the same file twice | `infrastructure/providers` locally (root key in process memory) |
| `HsfFieldEncryptionPort` | encrypt/decrypt one HSF field, binding tenant, user, table, row id and field as associated data | `infrastructure/providers` locally; a key-management-backed adapter (ADR-0017) elsewhere |
| `CsvParserPort` | a stream of bytes into a stream of field arrays, inside declared bounds | `infrastructure/parsing` |
| `CanonicalAccountAccessPort` | does this account exist for this principal, is it writable, what currency? **No narrative, no institution, no type** | `infrastructure/adapters`, over `@karar/financial-accounts`' `public-api.ts` |
| `StatementCommitPort` | the atomic unit of work — everything, or nothing | `infrastructure/persistence` today; **belongs in `modules/transactions`** (see below) |
| `DeterministicCategoryPort` | the category an exact reviewed rule assigns, or `null` | `infrastructure/adapters`, over `@karar/transactions`' `public-api.ts` |
| `StatementImportRepository`, `IdSource` | persistence and identity | `infrastructure/persistence` |

**One port this module CONSUMES rather than declares:** `DedupFingerprintPort`, declared by `@karar/transactions` and exported from its `public-api.ts` for exactly this purpose. It is not restated here — a second declaration of the same contract is how two definitions of "the same transaction" begin.

## Events published

None, yet. `StatementCommitPort` enqueues an **identifier-only** notice — the import id and the account id, and nothing else — through the composition root's outbox binding, on the commit's own transaction (ADR-0012). **The catalogue entry does not exist**, and this module cannot create it: `packages/api-contracts/events/catalogue.json` belongs to the platform. Until the lead adds it, the notice is recorded through a port whose LOCAL implementation is exercised against a synthetic in-memory catalogue, and no production path can publish an uncatalogued event because `makeEnvelope` refuses one.

**Not even a count**, and that was a correction rather than a design choice made up front. The first version carried `committedTransactionCount`, and the platform's own `assertEventPayloadAllowed` refused it: for a `HIGHLY_SENSITIVE_FINANCIAL` event, `identifier-only` means an id field or an occurred-at field, and everything else needs a catalogue exemption naming an owner, a reason and a reviewer. That rule is right — "this import produced 312 transactions" is a fact about a person's spending volume, and it would travel into a relay, a bus, a consumer and a log — so the notice carries less rather than declaring an exemption for convenience. The count still reaches the caller, in `StatementCommitReceipt`, which does not leave the process.

## Permissions

| Permission | Role(s) |
|---|---|
| `transactions.import.read` | `USER` |
| `transactions.import.write` | `USER` |

**Permissions deliberately absent:** no staff endpoint returns one customer's statement, staged rows, or row errors, and none may be added. A staged row is a line of somebody's bank statement, and a row error names which line of it could not be read.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. This module imports `@karar/transactions` (the dedup fingerprint port, the occurrence model, the domain vocabulary its commit writes), `@karar/financial-accounts` (account access) and `@karar/financial-connections` (the source link a committed import refreshes). No module imports this one.

Cross-module references carry a raw UUID plus a reference type declared **in this module** (`domain/refs.ts`): `CanonicalAccountRef`, `ConnectionRef`, `CommittedTransactionRef`. None is another module's identifier type, and no foreign key crosses a module boundary.

## Notes and known limitations

**No transport, no controller, deliberately.** There is no HTTP surface here and mounting one is a separate, later commit. Architecture test 24 (resource limits) activates at phase 5, and the `phase5-ingestion-not-mounted-early` control fails the build on a controller that appears while the registry still reads an earlier phase. The route, its limit-policy registration and the phase move belong in **one** commit, so a path cannot become reachable with its bounds unenforced by the suite.

**`StatementCommitPort`'s implementation is in the wrong module, and it is here on purpose.** The rows it writes into `public.transactions`, `public.transaction_revisions`, `public.transaction_provenance` and `public.transaction_category_assignments` belong to `modules/transactions`, so the natural home is there — exactly as `PrismaFinancialRecordEraser` lives in that module and satisfies a port `modules/financial-accounts` declares. It is not there because `PrismaTransactionRepository.commit` opens its OWN transaction, and a commit that spanned two transactions would not be atomic, which is the one property this port exists to guarantee. **The lead owns the move:** the implementation should become `PrismaStatementCommitWriter` in `modules/transactions`, satisfying this port, and this module should delete its copy. Until then this module writes another module's tables, which is a real boundary debt and is recorded here rather than left to be discovered.

**The outbox catalogue entry is missing** — see 'Events published'.

**Nothing here scores, ranks or guesses.** Categorisation on an imported statement is an exact reviewed rule or nothing. A manual entry mislabelled by a guess is one wrong label a person notices; an import mislabelled by a guess is four hundred wrong labels applied in one action, on records the person did not type.

**Multi-account files are refused, not split.** A file that describes a current account and the credit card printed beneath it is ordinary, and this phase targets one account. Splitting it correctly needs an account-selection flow per detected account, which is its own design.

**All fixtures are synthetic.** No real bank, telco, wallet provider or exchange house is named anywhere in this module, and no real statement data appears in any fixture. Every synthetic statement is obviously synthetic.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
