# Module: transactions

## Purpose

Transactions, statement import, normalisation, deduplication, provenance, and categorisation.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** ACTIVE — Phase 5 implemented the transaction core: `public.transactions` with exact signed BIGINT minor units and per-field encrypted HSF columns, append-only revisions and provenance, category assignments with a single ACTIVE row, and the global category and merchant-rule catalogues. A manual entry is admitted only through two gates — a retention decision and an account this principal actually owns — and neither the fingerprint, the encryption, nor any write happens until both pass. **The CSV ingestion pipeline is not built yet**; the dedup-fingerprint and HSF field-encryption ports it will use are declared here with LOCAL/TEST adapters only
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
| `statement_imports` | `SUBJECT_OWNED` | one ingestion attempt and its state, from draft through reviewed commit or refusal | `HIGHLY_SENSITIVE_FINANCIAL` | as above | included as import metadata, never raw source bytes | `CASCADE_DELETE` |
| `statement_import_sources` | `SUBJECT_OWNED` | the uploaded statement bytes, **encrypted before durable storage**, with key reference and integrity metadata only | `HIGHLY_SENSITIVE_FINANCIAL` | **unresolved and materially so** — whether an original statement is retained, and for how long, is exactly the decision counsel owes. Nothing here retains by default outside LOCAL/TEST | **excluded** — the subject's export contains their transactions, not a re-download of the source file | `CASCADE_DELETE` |
| `statement_import_rows` | `SUBJECT_OWNED` | staged rows awaiting review, with encrypted source text and typed parse results | `HIGHLY_SENSITIVE_FINANCIAL` | as above; staging is transient by intent | excluded (superseded by committed transactions) | `CASCADE_DELETE` |
| `statement_import_row_errors` | `SUBJECT_DERIVED` | typed, non-echoing validation failures naming row, field and reason code | `HIGHLY_SENSITIVE_FINANCIAL` | as above | excluded — these are diagnostics about an import attempt, not facts about the subject; the rows they describe are either committed as transactions (and exported as such) or discarded, so exporting the error list would add process detail without adding anything the subject holds | `CASCADE_DELETE` |
| `financial_categories` | `NON_PERSONAL` | versioned catalogue of category codes with English and Arabic labels | `PUBLIC` | the catalogue outlives any assignment referencing it | n/a | `NON_PERSONAL_BY_DESIGN` |
| `merchant_rules` | `NON_PERSONAL` | reviewed, generalised patterns mapping merchant text to a category, derived from many subjects and linked to none | `INTERNAL` | no subject-derived bound applies because no subject is linked | n/a | `NON_PERSONAL_BY_DESIGN` |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `TransactionCommitted` | `HIGHLY_SENSITIVE_FINANCIAL` | insights, budgets, projections | identifier-only |
| `StatementImported` | `HIGHLY_SENSITIVE_FINANCIAL` | audit, projections | identifier-only |

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
| `FinancialAccountAccessPort` | the minimum about an account **visible to this principal**: existence, currency, lifecycle state, provider claim — never account narrative | a composition adapter over `modules/financial-accounts`' `public-api.ts`. **This module imports nothing from that module** |
| `DedupFingerprintPort` | the keyed, per-subject, versioned content identity of a movement | LOCAL/TEST: `LocalKeyedDedupFingerprintProvider`. Production: a key-management-backed adapter (ADR-0017) |
| `HsfFieldEncryptionPort` | per-field encryption of merchant, description and note | LOCAL/TEST: `LocalAesGcmFieldEncryptionProvider`. Production: as above |

### Ports this module IMPLEMENTS for `modules/financial-accounts`

The accounts module owns the currency-change rule and the account deletion path;
the records those rules turn on live here, behind this module's RLS policies,
encryption and cascade. So accounts declares what it needs, this module provides
it, and **accounts never imports transactions**.

| Port | Implementation | Contract |
|---|---|---|
| `FinancialRecordPresencePort` | `PrismaFinancialRecordPresenceReader` | `hasAnyRecordForAccount` — one boolean plus an echo of the account id, never a row and never a count. A count would say how much the subject transacts; the currency rule only asks "any at all" |
| `FinancialRecordEraserPort` | `PrismaFinancialRecordEraser` | `eraseAccountScopedRecords` — erases transactions, revisions, provenance and category assignments for one account within one principal's scope, in ONE statement, answering `erased` with **exact per-kind counts**, `incomplete` with what did go, or `failed`. Atomic, idempotent, retry-safe; `erased` is the only arm a caller may report as success |

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

**Manual entry and CSV import are first-class `IMPLEMENTED`** (challenge C9), not stopgaps.

Rules ported from the legacy as *rules plus test cases*, not code: Arabic-Indic digit and U+066B/U+066C separator normalisation; accounting negatives and trailing minus; **unreadable rows return null, never a substituted zero**; ambiguous dates flagged rather than assumed; exact reconciliation with **no tolerance**; duplicate rejection by content hash; review before commit.

### Deduplication: three concepts, kept apart

| Concept | Where it lives | What it answers |
|---|---|---|
| **Content identity** | `transactions.dedup_fingerprint` (+ `fingerprint_version`) — a per-subject keyed MAC over normalised content: account, booking day, signed minor units, currency, normalised narrative | "is this the same financial content?" |
| **Legitimate repeat** | `transactions.occurrence_ordinal`, an explicit integer a person or a reviewed import supplies | "did that same content genuinely happen more than once?" |
| **Duplicate handling** | `transactions_dedup_key`, unique over `(tenant, user, account, fingerprint_version, fingerprint, occurrence_ordinal)` | "has this exact occurrence already been recorded?" |

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

**Explicit ingestion limits** — bytes, rows, wall-clock, memory — rejecting rather than degrading (legacy FILES-2, HIGH).

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
