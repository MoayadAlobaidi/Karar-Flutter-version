# Module: transactions

## Purpose

Transactions, statement import, normalisation, deduplication, provenance, and categorisation.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** ACTIVE — Phase 5 implemented the transaction core: `public.transactions` with exact signed BIGINT minor units and per-field encrypted HSF columns, booked dates typed as calendar days rather than instants (ADR-0027), append-only revisions and provenance, category assignments with a single ACTIVE row, and the global category and merchant-rule catalogues. A manual entry is admitted only through two gates — a retention decision and an account this principal actually owns — and neither the fingerprint, the encryption, nor any write happens until both pass. **The CSV ingestion pipeline is not built yet**; the dedup-fingerprint and HSF field-encryption ports it will use are declared here with LOCAL/TEST adapters only
- **Phase:** 5
- **Capability:** TRANSACTIONS
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `transactions` | `SUBJECT_OWNED` | the canonical transaction records a subject entered manually or committed from a reviewed import | `HIGHLY_SENSITIVE_FINANCIAL` | **unresolved: a legal decision nobody here may take.** No period is written; every write fails closed until a PolicyPack decision exists (`TransactionRetentionDecisionPort`, enforced — see below), LOCAL and TEST use a synthetic fixture with no legal effect | included — the subject's export contains their own transactions | `CASCADE_DELETE` |
| `transaction_revisions` | `SUBJECT_OWNED` | append-only history keeping the imported value attributable after a user correction, so a correction never silently overwrites the source fact | `HIGHLY_SENSITIVE_FINANCIAL` | as above — unresolved, fails closed outside LOCAL/TEST | included with the transaction | `CASCADE_DELETE` |
| `transaction_provenance` | `SUBJECT_DERIVED` | the traceable origin of every stored financial fact: source kind, import and row reference, parser, mapping, normalisation and fingerprint versions | `HIGHLY_SENSITIVE_FINANCIAL` | as above | included — a subject may see where their own data came from | `CASCADE_DELETE` |
| `transaction_category_assignments` | `SUBJECT_DERIVED` | which category applies, by which source (user or deterministic rule), with supersession history | `HIGHLY_SENSITIVE_FINANCIAL` | as above | included | `CASCADE_DELETE` |
| `financial_categories` | `NON_PERSONAL` | versioned catalogue of category codes with English and Arabic labels | `PUBLIC` | the catalogue outlives any assignment referencing it | n/a | `NON_PERSONAL_BY_DESIGN` |
| `merchant_rules` | `NON_PERSONAL` | reviewed, generalised patterns mapping merchant text to a category, derived from many subjects and linked to none | `INTERNAL` | no subject-derived bound applies because no subject is linked | n/a | `NON_PERSONAL_BY_DESIGN` |

**Four statement-import datasets are deliberately NOT declared above.** This table used to carry `statement_imports`, `statement_import_sources`, `statement_import_rows` and `statement_import_row_errors`, and **this module owns none of them and creates none of them.** They were forward declarations: a lifecycle register describes what exists, and a forward declaration inside one reads as schema that is already there, leaving a reader who checks the database against it unable to tell a gap from a plan. They were removed from `packages/platform/db/DATA_LIFECYCLE.md` on exactly that reasoning and are removed here on the same grounds. Their declarations belong to whichever module owns statement import, land in the same change as the migration that creates them, and are that module's obligation rather than this one's — which is also the change that makes their retention question answerable rather than rhetorical.

## Events published

_None._ This module publishes no bus event today: it has no publish call site, and the event catalogue (`packages/api-contracts/events/catalogue.json`) carries no entry for one. `TransactionCommitted` and `StatementImported` (both `HIGHLY_SENSITIVE_FINANCIAL`, identifier-only payloads) are **planned** and enter the catalogue with their first publisher, under event-governance rules (ADR-0025) — the convention `modules/identity` and `modules/consent` already follow. This section previously listed both as though they were published, which they never have been.

## Permissions

| Permission | Role(s) |
|---|---|
| `transactions.transaction.read` | `USER` |
| `transactions.transaction.write` | `USER` |

**Permissions deliberately absent:** No staff endpoint returns one customer's transactions. **No `?userId=` parameter is accepted anywhere.**

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

### Ports this module declares and something else fills

| Port | Answers | Bound by the composition root to |
|---|---|---|
| `TransactionRetentionDecisionPort` | how long a transaction record may be kept: `DECIDED` · `PENDING_LEGAL_REVIEW` · `UNAVAILABLE` | the PolicyPack retention slot for the subject's jurisdiction; in a **local environment only**, `LocalSyntheticRetentionDecisionProvider` |
| `FinancialAccountAccessPort` | the minimum about an account **visible to this principal**: existence, currency, lifecycle state, provider claim — never account narrative | an adapter over `modules/financial-accounts`' `public-api.ts`. This module imports that package root — never a subpath — in exactly two production files, both outside `domain/`: the port aliases in `application/ports/financial-record-lifecycle.ts` and the adapter in `infrastructure/persistence/`. **`modules/financial-accounts` imports nothing from here**, which is the direction that matters |
| `DedupFingerprintPort` | the keyed, per-subject, versioned content identity of a movement — definition `dedup/hmac-sha256/calendar-day/v3`, stated in full below | LOCAL/TEST: `LocalKeyedDedupFingerprintProvider`. Production: a key-management-backed adapter (ADR-0017) |
| `HsfFieldEncryptionPort` | per-field encryption of merchant, description and note | LOCAL/TEST: `LocalAesGcmFieldEncryptionProvider`. Production: as above |
| `TransferMatchEraserPort` | erase every transfer match naming one transaction, or touching one account, returning the exact count | `TransactionsTransferMatchEraser` in `modules/transfer-matching`. **This module imports nothing from that module** |

**`TransferMatchEraserPort` is the port that closes an erasure gap, and it carries BOTH scopes because this module owns both deletion paths.** `public.transfer_matches` says two of a person's transactions were ONE movement of their own money; its references are raw uuids with no foreign keys back, so nothing cascaded to it. A dangling match is not untidiness — it asserts a transfer whose other side no longer exists, so the surviving side stays explained away and a real expense stays hidden from the person's own record of what they spent. `DeleteOwnTransaction` calls `eraseTransferMatchesForTransaction` BEFORE removing a transaction, and `PrismaFinancialRecordEraser` calls `eraseTransferMatchesForAccount` before deleting an account's records. The account-scoped method is **not** derived from the per-transaction one: that eraser deletes an account's transactions in bulk without enumerating their ids, and a caller holding only the per-transaction method would have to scan a person's entire history first.

In both paths a throw or any non-`erased` outcome means the deletion does NOT happen: `DeleteOwnTransaction` answers `TRANSFER_MATCH_ERASURE_INCOMPLETE` with an honest count and leaves the transaction in place, and the record eraser answers `failed` having erased no record at all, which the accounts module reads as `erasure_incomplete` and leaves the account row standing. A match erasure that succeeded while the transaction delete then failed answers `DELETION_PARTIALLY_APPLIED` rather than `NOT_FOUND` — the latter would tell a person nothing happened to a request that really did remove rows about their money.

### Ports this module IMPLEMENTS for `modules/financial-accounts`

The accounts module owns the currency-change rule and the account deletion path;
the records those rules turn on live here, behind this module's RLS policies,
encryption and cascade. So accounts declares what it needs, this module provides
it, and **accounts never imports transactions**.

| Port | Implementation | Contract |
|---|---|---|
| `FinancialRecordPresencePort` | `PrismaFinancialRecordPresenceReader` | `hasAnyRecordForAccount` — one boolean plus an echo of the account id, never a row and never a count. A count would say how much the subject transacts; the currency rule only asks "any at all" |
| `FinancialRecordEraserPort` | `PrismaFinancialRecordEraser` | `eraseAccountScopedRecords` — erases transactions, revisions, provenance and category assignments for one account within one principal's scope, in ONE statement, answering `erased` with **exact per-kind counts**, `incomplete` with what did go, or `failed`. Atomic, idempotent, retry-safe; `erased` is the only arm a caller may report as success. It first erases the transfer matches touching the account through `TransferMatchEraserPort` and reports how many went in `financialRecordRelationshipsDeleted`, which the accounts module folds into what it tells the person; a refusal there refuses the whole erasure, so no record is ever deleted while a relationship naming it survives |

The dedup identity has no kind of its own because it has no table of its own —
fingerprint, version and ordinal are columns ON the transaction row, so they go
with `FINANCIAL_RECORD`. The eraser still compares the two counts and answers
`incomplete` if they ever diverge, and a test asserts against the live catalogue
that no other table carries a dedup column.

**The shapes mirror the accounts-side declarations exactly**, so the composition
root binds these instances straight in. They are not shared through a package:
the only homes for a shared type would be a module both import (a dependency
cycle wearing a hat) or the platform (which owns no domain vocabulary). Drift
surfaces as a compile error at the composition root — the one place that
legitimately knows about both.

### Retention is enforced, not merely declared

`CreateManualTransaction` asks `TransactionRetentionDecisionPort` **first**, before
the account is resolved, before the fingerprint is computed, before any narrative is
encrypted, and before the repository is touched. Anything but `DECIDED` is a typed
`RETENTION_UNDECIDED` refusal, and the suite proves zero durable rows afterwards by
counting as superuser.

Retention is asked before the account for a reason: while the decision is unresolved
every account id gets the identical refusal, so an undecided legal question cannot be
turned into a probe against another context's data.

**No deployed environment gets a period from this repository.** The LOCAL/TEST fixture
refuses to be constructed outside `local` — a startup failure with a name, rather than
a wrong answer at midnight — and it labels itself `SYNTHETIC_NO_LEGAL_EFFECT` in a
typed field and in its basis string. It does not touch `qa/v1`, it mints no approval
reference, and it is not a proposal for a period.

## Notes and known limitations

**Manual entry and CSV import are intended to be first-class rather than stopgaps** (challenge C9) — and today **neither is a running path.** `CreateManualTransaction` exists as a use case with its gates and its tests; nothing calls it, because no controller, route or composition root does. The CSV pipeline does not exist at all: no parser, no staging tables, no import state machine. The normalisation rules below are therefore a specification with test cases behind it, not a description of something a person can currently use.

Rules ported from the legacy as *rules plus test cases*, not code: Arabic-Indic digit and U+066B/U+066C separator normalisation; accounting negatives and trailing minus; **unreadable rows return null, never a substituted zero**; ambiguous dates flagged rather than assumed; exact reconciliation with **no tolerance**; duplicate rejection by content hash; review before commit.

### Temporal model: a calendar day is not an instant (ADR-0027)

Every temporal column here is typed by what the value IS, not by what is convenient to store.

| Field | Kind | PostgreSQL | Domain | Rule |
|---|---|---|---|---|
| `booking_date` | calendar day | `date` | `CalendarDay` | **Required.** What the institution wrote on its books. No time, therefore no timezone, therefore nothing to shift by |
| `value_date` | calendar day | `date` | `CalendarDay \| null` | Optional. **Never inferred from `booking_date`** — copying it would assert a fact the source did not state |
| `event_occurred_at` | instant | `timestamptz` | `Date \| null` | Optional, and present **only when the source actually supplied an instant**. **Never derived from `booking_date`**: midnight on a booked day is a moment nobody observed, and manufacturing it is a fabricated financial fact |
| `source_timezone` | IANA zone | `text` | `string \| null` | Optional, and present **only when the source explicitly stated a zone or offset**. **Never guessed** from the account's country, the issuer, the server, or the device. A `CHECK` refuses it without `event_occurred_at`, because a zone with no instant qualifies nothing |
| `created_at`, `updated_at`, `recorded_at`, `captured_at`, `assigned_at`, `superseded_at` | instant | `timestamptz` | `Date` | Moments this system observed or recorded |

`event_occurred_at` and `source_timezone` are on `transactions` and on `transaction_revisions`, but they are **not correctable**: a person may correct an amount or a booked day, while restating the source's own instant would erase the fact those columns exist to keep, and adding one where the source stated none would fabricate it. The revision snapshot carries them anyway, so every revision of one transaction repeats the same pair — and a history where they differ is a history where somebody rewrote what the source said.

The row mappers are the only place a `date` column becomes a `CalendarDay`. That conversion is not a one-liner: Prisma's pg adapter yields a `Date` at midnight **UTC** while node-postgres yields one at midnight **LOCAL**, so on any non-UTC host the two are different instants naming the same day, and reading UTC components off whichever arrives is wrong by a day for one of them.

### Deduplication: three concepts, kept apart

| Concept | Where it lives | What it answers |
|---|---|---|
| **Content identity** | `transactions.dedup_fingerprint` (+ `fingerprint_version`) — a per-subject keyed MAC over normalised content | "is this the same financial content?" |
| **Legitimate repeat** | `transactions.occurrence_ordinal`, an explicit integer a person or a reviewed import supplies | "did that same content genuinely happen more than once?" |
| **Duplicate handling** | `transactions_dedup_key`, unique over `(tenant, user, account, fingerprint_version, fingerprint, occurrence_ordinal)` | "has this exact occurrence already been recorded?" |

#### The fingerprint definition, in full

Current version identifier: **`dedup/hmac-sha256/calendar-day/v3`**. It is stored on every row it produces and it participates in the unique key.

```
subjectKey = HMAC-SHA256(rootKey, "karar/transactions/dedup/v1" | tenantId | userId)
value      = HMAC-SHA256(subjectKey, canonicalEncoding)   rendered as hex
```

`canonicalEncoding` is the `|`-joined sequence of exactly these six strings, each prefixed with its own length so no field-boundary shift can collide:

1. `accountRef.referenceType`
2. `accountRef.accountId`
3. the source booking day, as its `YYYY-MM-DD` string (a `CalendarDay`; no timezone is consulted)
4. the signed amount in minor units, base 10
5. the ISO 4217 alphabetic currency code
6. the deterministic normalised narrative

**Nothing else participates, in either direction:**

- not `occurrence_ordinal` — that is a legitimate repeat, not a different content;
- not `event_occurred_at` and not `source_timezone` — *when* a movement happened is not *what* it is, and one export of a statement may carry a time where the next does not; folding the instant in would import the second copy as a new transaction;
- not ciphertext, nonce, or any key material — they change on rotation and on every fresh nonce, so identity derived from them would silently change (`packages/platform` keys/custody.ts);
- not the database row id — that would make every row unique and the constraint useless;
- not the server timezone, the device timezone, or any inferred midnight timestamp — the encoding reads no clock and consults no zone, which is what makes the same statement row digest identically in Doha and in Toronto.

**Why the identifier moved.** The version names the whole definition, so any change to it changes the string, and a bump starts a fresh namespace instead of colliding with values computed under the old rules. `v1` folded the occurrence ordinal into the digest. `v2` (`dedup/hmac-sha256/utc-day/v2`) dropped it but took a booking *instant* and truncated it to a UTC day — a rule with a timezone hidden inside it, so one statement line could digest two ways depending on where it was parsed. `v3` takes a `CalendarDay` and uses it as it stands. Both moves changed what the input IS, and reusing an identifier for a changed definition is exactly the silent redefinition this versioning exists to prevent.

**Occurrence is not part of the digest.** Two identical coffees are one content
identity that occurred twice. Folding the ordinal into the fingerprint would give the
second one an unrelated identity, after which "have I seen this content before?" could
not be asked without guessing every ordinal it might have been filed under — and the
unique key would be enforcing something the digest no longer described.

**An arbitrary ordinal is not an escape hatch.** If any integer were acceptable,
duplicate review would be one field away from optional: submit the same statement row
as occurrence 1 and then as occurrence 9999, and both commit, because the second
collides with nothing. **The rule: an inserted ordinal must be exactly one more than
the highest already recorded for its content identity, or 1 when none is.** So
occurrence 2 is reachable only once occurrence 1 exists, and the only ordinal a caller
can ever choose is the next one. `max` is taken over surviving rows, so erasing a
repeat makes its ordinal claimable again — deletion stays reversible.

It is enforced twice, deliberately: `transactions_occurrence_guard` (migration 0090)
holds it against every writer including raw SQL and the ingestion pipeline that is not
built yet, and the repository repeats the check inside the writing transaction so the
refusal can name the ordinal that *would* be accepted. The same trigger freezes the
identity columns on UPDATE — a correction moves values and appends a revision, it never
relabels which content or which occurrence a row is.

`merchant_rules` `NON_PERSONAL_BY_DESIGN` justification: a curated pattern corpus derived from many subjects, retained without subject linkage. **It must not hold narrative text lifted verbatim from a single customer's statement** — the legacy's does, unencrypted and permanent, and cannot use its own converter because the repository sorts on `LENGTH(pattern)` (legacy C12). Patterns here are reviewed and generalised before entry.

**Explicit ingestion limits are declared and enforced by nothing yet.** `packages/platform/src/ingestion/limits.ts` states them — bytes, rows, wall-clock, memory — with no optional members and no way to express "unlimited", and its validator refuses non-finite, zero, negative and non-integer bounds. The rule they encode is reject rather than degrade (legacy FILES-2, HIGH). There is no ingestion path to apply them to, which is also why architecture test 24 (resource limits declared) stays phase-deferred: a test scanning an empty tree passes vacuously, and a limit nothing consults is a declaration rather than a control.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
