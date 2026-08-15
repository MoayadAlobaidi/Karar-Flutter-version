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

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `transactions` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE` | merchant and note encrypted at rest |
| `statement_imports` | `HIGHLY_SENSITIVE_FINANCIAL` | `RETAIN_WITH_BASIS` | raw file **encrypted from the start** |
| `statement_import_rows` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE` |  |
| `merchant_rules` | `INTERNAL` | `ORPHANED_BY_DESIGN` | curated corpus; see notes |

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

`merchant_rules` `ORPHANED_BY_DESIGN` justification: a curated pattern corpus derived from many subjects, retained without subject linkage. **It must not hold narrative text lifted verbatim from a single customer's statement** — the legacy's does, unencrypted and permanent, and cannot use its own converter because the repository sorts on `LENGTH(pattern)` (legacy C12). Patterns here are reviewed and generalised before entry.

**Explicit ingestion limits** — bytes, rows, wall-clock, memory — rejecting rather than degrading (legacy FILES-2, HIGH).

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
