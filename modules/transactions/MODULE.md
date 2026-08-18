# Module: transactions

## Purpose

Transactions, statement import, normalisation, deduplication, provenance, and categorisation.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 5
- **Capability:** TRANSACTIONS
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `transactions` | `SUBJECT_OWNED` | the canonical transaction records a subject entered manually or committed from a reviewed import | `HIGHLY_SENSITIVE_FINANCIAL` | **unresolved: a legal decision nobody here may take.** No period is written; non-local ingestion fails closed until a PolicyPack decision exists, LOCAL and TEST use a synthetic fixture with no legal effect | included — the subject's export contains their own transactions | `CASCADE_DELETE` |
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

## Notes and known limitations

**Manual entry and CSV import are first-class `IMPLEMENTED`** (challenge C9), not stopgaps.

Rules ported from the legacy as *rules plus test cases*, not code: Arabic-Indic digit and U+066B/U+066C separator normalisation; accounting negatives and trailing minus; **unreadable rows return null, never a substituted zero**; ambiguous dates flagged rather than assumed; exact reconciliation with **no tolerance**; duplicate rejection by content hash; review before commit.

`merchant_rules` `NON_PERSONAL_BY_DESIGN` justification: a curated pattern corpus derived from many subjects, retained without subject linkage. **It must not hold narrative text lifted verbatim from a single customer's statement** — the legacy's does, unencrypted and permanent, and cannot use its own converter because the repository sorts on `LENGTH(pattern)` (legacy C12). Patterns here are reviewed and generalised before entry.

**Explicit ingestion limits** — bytes, rows, wall-clock, memory — rejecting rather than degrading (legacy FILES-2, HIGH).

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
