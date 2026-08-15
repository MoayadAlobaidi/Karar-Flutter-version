# Module: consent

## Purpose

Consent capture keyed on (operatingEntity, purpose, jurisdiction), legal document versions, and re-consent evaluation.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 3
- **Capability:** —  (platform)
- **Highest classification:** CONFIDENTIAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `legal_documents` | `PUBLIC` | `RETAIN_WITH_BASIS` | public catalogue; no RLS, correctly |
| `legal_acceptances` | `CONFIDENTIAL` | `RETAIN_WITH_BASIS` | evidentiary; RLS FORCEd |
| `consent_grants` | `CONFIDENTIAL` | `RETAIN_WITH_BASIS` | the triple |
| `reconsent_evaluations` | `INTERNAL` | `RETAIN_WITH_BASIS` | material / non-material classification |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `ConsentGranted` | `CONFIDENTIAL` | audit, projections | identifiers only |
| `ConsentWithdrawn` | `CONFIDENTIAL` | audit, capability-registry | identifiers only |
| `LegalDocumentRepublished` | `PUBLIC` | consent, notifications | payload permitted |

## Permissions

| Permission | Role(s) |
|---|---|
| `consent.document.publish` | `PLATFORM_ADMIN` |
| `consent.status.read` | `SUPPORT` |

**Permissions deliberately absent:** No role may record an acceptance on a customer's behalf.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

**Consent gates fail closed.** No published disclosure means the capability is unavailable, not permitted — the inversion of legacy AI-5, which fails open.

Republishing a document version triggers a re-consent evaluation classified material or non-material, with **neither defaulted**; an unclassified republication blocks the version change (ADR-0024). This exists because legacy P12 — *publishing a new version asks nobody to accept it* — is why its HIGH finding P1 remains only partially remediated.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
