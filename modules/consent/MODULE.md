# Module: consent

## Purpose

Consent capture keyed on the (operatingEntity, purpose, jurisdiction) triple, the legal-document version lifecycle with mandatory re-consent classification, and fail-closed consent resolution (ADR-0024).

## Ownership

- **Business owner:** _unassigned — solo team, Phase 3_
- **Technical owner:** _unassigned — solo team, Phase 3_
- **Status:** ACTIVE — Phase 3 implemented the legal document catalogue and version lifecycle
  with the publication rule (migration `0064`), immutable entity-pinned consent grants under
  tenant+user RLS with append-only re-consent evaluations and typed processing-basis
  references (`0065`), the use cases over Prisma repositories, the fail-closed
  `AssertConsentFor` helper, and the §49 subject endpoints (`ConsentApiModule`).
- **Phase:** 3
- **Capability:** —  (platform)
- **Highest classification:** CONFIDENTIAL

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `legal_documents` | `NON_PERSONAL` | public catalogue: which document kinds exist per (entity, jurisdiction) pair, covering which purposes | `PUBLIC` | the catalogue must outlive any single version; PolicyPack owns any bound (Phase 3.5), never a code constant | n/a (no subject owns a catalogue row) | `RETAIN_WITH_BASIS` |
| `legal_document_versions` | `NON_PERSONAL` | the exact text a consent was given to, verifiable by content hash, with its reviewed re-consent classification | `PUBLIC` | grants pin version ids — deleting a version orphans consent evidence; PolicyPack owns any bound (Phase 3.5) | n/a | `RETAIN_WITH_BASIS` |
| `consent_grants` | `SUBJECT_OWNED` | evidentiary record of the subject's own acceptance and withdrawal acts; the resolution source for the (entity, purpose, jurisdiction) triple | `CONFIDENTIAL` | consent evidence must outlive the consent itself; period from the PolicyPack per jurisdiction (Phase 3.5), never a code constant | included — the subject's export contains their own grant and withdrawal history | `RETAIN_WITH_BASIS` |
| `reconsent_evaluations` | `NON_PERSONAL` | reviewed material/notice/no-action decision per republished version and purpose, with the recorded affected-subject query (ADR-0024, legacy P12) | `INTERNAL` | the decision explains every RECONSENT_REQUIRED ever returned; PolicyPack owns any bound (Phase 3.5) | n/a | `RETAIN_WITH_BASIS` |
| `processing_basis_references` | `NON_PERSONAL` | typed reference naming the declared legal basis per (purpose, jurisdiction) — consent is one basis among several; resolution is Phase 3.5 | `INTERNAL` | basis history explains past gating; PolicyPack owns any bound (Phase 3.5) | n/a | `RETAIN_WITH_BASIS` |

Legal basis for `RETAIN_WITH_BASIS` on `consent_grants`: defence of processing already
performed under the recorded consent; `user_id` resolves to nothing once the subject's
identity is erased. Canonical migration headers carry the same declarations
(`packages/platform/db/migrations/0064`–`0065`); mirrored rows live in
[`packages/platform/db/DATA_LIFECYCLE.md`](../../packages/platform/db/DATA_LIFECYCLE.md).

**Pinning block on `consent_grants` (migration 0086, data-model.md §5).** The row pins four
dimensions at creation and none of them can be rewritten afterwards — the guard trigger now
covers the pin columns as well as the original content. `jurisdiction_ref` and
`operating_entity_id` came with Phase 3; `policy_pack_version` and
`subject_policy_selection_version` complete the block, each paired with a NOT NULL
`*_pin_state` column so an absent version always says why (`PINNED`, `NOT_APPLICABLE` where
the purpose declares no elective option set, or `PRE_*` for rows predating the machinery,
which a cutoff CHECK refuses for anything created from Phase 3.5 on). The added columns are
policy version strings and typed states — no new subject data, so the lifecycle row above is
unchanged. `RecordOwnAcceptance` takes the provenance as input
(`RecordOwnAcceptanceInput.policyPin`) and the edge obtains it through
`ConsentPolicyPinSource`: this module resolves no policy and invents no version.

**RLS decisions, per table:** `consent_grants` is a SUBJECT table — RLS ENABLED and FORCEd on
both principal GUCs (`app.tenant_id` AND `app.user_id`, bound by the platform's
`withPrincipalContext`, never from client input), proven on non-empty data by the adversarial
suite. `legal_documents`, `legal_document_versions`, `reconsent_evaluations`, and
`processing_basis_references` are deliberately platform-global (the catalogue is what subjects
must read BEFORE consenting; evaluations are decisions about versions, not subjects), each
allow-listed with justification and compensating controls in
[`packages/platform/db/rls-allow-list.json`](../../packages/platform/db/rls-allow-list.json).

The legacy plan's `legal_acceptances` table is subsumed by `consent_grants`: the grant row IS
the acceptance record (version-pinned, evidence-carrying, immutable), so a second table would
store the same fact twice.

## Events published

_None in Phase 3. `ConsentGranted` / `ConsentWithdrawn` (CONFIDENTIAL; identifiers only) and
`LegalDocumentRepublished` (PUBLIC) are planned and will enter the event catalogue with their
first publisher — state changes are audited via `@karar/audit` today._

## Permissions

| Permission | Role(s) |
|---|---|
| `consent.document.publish` | `PLATFORM_ADMIN` |
| `consent.status.read` | `SUPPORT` |

**Permissions deliberately absent:** No role may record an acceptance on a customer's behalf —
no such use case, endpoint, or permission exists in this module, by design. The §49 endpoints
act strictly for the authenticated principal, and the grant repository runs only under that
principal's RLS context. No permission exists to delete a grant, an evaluation, or a published
version.

## Presentation

`ConsentApiModule` (NestJS, exported via `public-api.ts`) mounts the §49 subject endpoints —
list applicable documents, record own acceptance, withdraw own consent, read own status —
authored contract-first in `packages/api-contracts/openapi/paths/consent.yaml`. Document
lifecycle administration (create/draft/classify/publish) ships as authorized use cases only;
its HTTP surface is a Super Admin concern and follows the operating-entity module's
control-plane deferral (ADR-0021).

**Document CONTENT (Phase 4).** `ConsentDocumentContentApiModule` mounts
`GET /consent/documents/{documentId}/content`, which returns the text of the version in force
together with the LANGUAGE of that text. It exists because the listing previously returned
`storage_ref` — an internal locator no client can fetch — which the listing no longer emits:
a consent gate that cannot show its document fails closed into uselessness, so the subject
needs the text itself, and the platform must be the one supplying it.

Why a route rather than a field on the listing: the catalogue records no language, so a
`language` field on the listing could only be invented, whereas content and its language are
retrieved together and cannot disagree; the listing is a control-flow surface consulted far
more often than the text is read; and the bytes are verified against the version's pinned
`content_hash` before anything is served, a guarantee that belongs where the bytes are handled.
The caller names a document, never a version — the server chooses the one in force — and a
document outside the caller's effective entity answers exactly as an unknown id does.

**The bytes do not exist yet, and the module says so.** `LegalDocumentContentSource` is
declared inward; the only shipped implementation (`NoContentSourceConfigured`) retrieves
nothing, because no document store exists this phase and no legal text has been drafted or
reviewed to place in one. The endpoint reports that absence as a typed
`DOCUMENT_CONTENT_UNAVAILABLE`; it never approximates, substitutes, or generates legal prose,
and neither may a client. A real source arrives with the document store and a reviewed
publication path that records content alongside the version it belongs to.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module** (`OperatingEntityRef` for
the entity a document belongs to and a grant pins; `user_id`/`tenant_id` are the kernel's
`UserId`/`TenantId`).

This module consumes `@karar/operating-entity` (effective-entity resolution through its
public API, behind the locally-declared `OperatingEntityDirectory` port), `@karar/audit`
(every state change is audited), `@karar/platform` (persistence, `withPrincipalContext`), and
`@karar/shared-kernel`. The PolicyService **port** is declared in
`application/ports/policy-service.ts`; the RBAC workstream supplies the real implementation,
and only `__tests__/fakes` contains the permissive fake.

## Notes and known limitations

**Consent gates fail closed.** No published disclosure means the status is `NO_GRANT` and
`AssertConsentFor` returns a typed denial — the inversion of legacy AI-5, which fails open.
An unresolvable operating entity, a withdrawn grant, and an outstanding material re-consent
all deny the same way.

Republishing a document version requires an explicit reviewed classification —
`MATERIAL_REACCEPTANCE_REQUIRED`, `NOTICE_REQUIRED`, or `NO_USER_ACTION_REQUIRED`, with
**neither direction defaulted**; an unclassified publication is blocked by typed error AND by
CHECK constraint (ADR-0024). This exists because legacy P12 — *publishing a new version asks
nobody to accept it* — is why its HIGH finding P1 remains only partially remediated.

Grants are immutable evidence: the only transitions are ACTIVE→WITHDRAWN (row preserved) and
ACTIVE→SUPERSEDED (re-grant inserts a new row), enforced by trigger even for the table owner.
The (entity, purpose, jurisdiction) triple is a RESOLUTION dimension, not the row's identity.
Single-ACTIVE-per-triple is enforced by the acceptance use case inside the principal-context
transaction rather than by a partial unique index (kept out of the schema so the Prisma
mapping stays exact for the drift gate); concurrent duplicate ACTIVE rows are tolerated by
resolution (latest wins) and superseded on the next acceptance.

Consent is one legal basis among several (ADR-0024): `processing_basis_references` holds typed
references only, invents no jurisdictional conclusion, and basis RESOLUTION is Phase 3.5 — a
purpose with no declared basis fails closed there.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
