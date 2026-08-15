# ADR-0024 — Legal / Operating Entity as a distinct platform dimension

**Status:** ACCEPTED · **Phase:** 3
**Amended:** after the Phase 0.2 legacy audit, to cover legal-document version lifecycle and re-consent.

## Context

Plan v1 left the legal-person question implicit, which in practice means "Karar" — one entity, forever, everywhere.

That assumption breaks at the first white-label deal. A partner bank contracting through **its own entity** inverts the data-protection roles: **the bank becomes controller and Karar becomes processor.** That inversion changes who answers a data-subject request, who notifies a breach, whose privacy notice applies, and who legally releases disclosed data.

It cannot be represented by tenant or jurisdiction. A tenant is a brand and product boundary; an entity is a legal person.

## Decision

**`OperatingEntity` is a first-class dimension**, orthogonal to Country, Jurisdiction, and Tenant.

```
OperatingEntity
  legalName · registrationNumber · registeredJurisdiction
  permittedJurisdictions · dataProtectionRole (per relationship)
  licensesHeld · contractingCapacity · legalDocumentSet
  billingProfileRef · dataProtectionContact · status
```

**Pinned bindings:** tenant `defaultOperatingEntity`; user `contractingOperatingEntity` + version at signup; record `operatingEntityAtCreation`.

**Keyed on the entity:** consent as the **triple** `(operatingEntity, purpose, jurisdiction)`; legal documents as an `(entity, jurisdiction)` **pair**; disclosure packages naming their **releasing entity**.

**`EntityMigration`** is an explicit, audited operation with a re-consent evaluation step. **Never a silent `UPDATE`.** Historical records keep their original pinned entity.

### Legal-document version lifecycle

A change to the in-force legal document version for an `(entity, jurisdiction)` pair **triggers a re-consent evaluation**, classified as:

| Classification | Effect |
|---|---|
| **Material** | Re-acceptance required before the affected purpose may continue |
| **Non-material** | Notice only |

**Neither is a default. An unclassified republication blocks the version change.** A subject with an outstanding material re-consent is treated as consent-absent, so the capability resolver returns `CONSENT_REQUIRED` — **failing closed**.

**`licensesHeld` asserts nothing about any regulator.** It is a typed reference so capabilities can require one. Karar claims no licence anywhere.

## Consequences

**Positive**

- The controller/processor inversion is **configuration, not code** — no branch, no fork, no separate deployment.
- Re-consent after restructuring or acquisition is a **query, not an archaeology project**.
- Disclosure has a named legally responsible releasing party.
- Document republication cannot silently leave stale acceptances in force.

**Negative — accepted**

- A fourth dimension to resolve at the edge and to explain at onboarding.
- Every record with legal consequence carries another pinning column.
- Classifying every document republication is real editorial work, and it blocks the change until done.

## Alternatives rejected

**Entity implicit as "Karar" (v1).** Rejected: cannot express the white-label inversion, which is the central legal fact of the deals Karar intends to do.

**Entity as an attribute of tenant.** Rejected: one entity may serve several tenants, and one tenant's entity may change over time. Collapsing them loses both facts.

**Entity as an attribute of jurisdiction.** Rejected: one jurisdiction may be served by different entities over time, and one entity may operate in several jurisdictions.

**Resolve entity at evaluation rather than pinning it.** Rejected: consent given to Entity A is not automatically valid for Entity B. Without pinning, re-consent scope is unknowable.

**Handling document republication by re-prompting everyone.** Rejected: a typo fix should not invalidate every acceptance. Hence the material/non-material classification — with **no default**, because defaulting either way is a legal position taken by whoever wrote the branch.

**Leaving republication unhandled (the legacy's position).** Rejected: finding **P12** — *"publishing a new version of the terms or privacy policy asks nobody to accept it, which contradicts the terms themselves"* — and it is why the legacy's HIGH finding P1 remains only partially remediated.
