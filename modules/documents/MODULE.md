# Module: documents

## Purpose

Document and evidence references. The only module that touches object storage.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 13
- **Capability:** —  (platform)
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `document_references` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE_DELETE` | bytes live behind ObjectStorage |
| `document_verifications` | `CONFIDENTIAL` | `CASCADE_DELETE` |  |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `DocumentAttached` | `HIGHLY_SENSITIVE_FINANCIAL` | audit | identifier-only |

## Permissions

| Permission | Role(s) |
|---|---|
| `documents.document.read` | `USER` |

**Permissions deliberately absent:** No admin role reads document bytes.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

**No domain touches ObjectStorage directly** — architecture test 18.

Documents classified `SEALED` route through `SealedRecordStore`, not the ordinary path.

Ingestion declares explicit limits — bytes, pages, wall-clock, memory — and **rejects rather than degrades** (legacy FILES-2, FILES-3, FILES-7).

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
