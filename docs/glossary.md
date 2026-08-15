# Glossary

Terms with a specific meaning in Karar. Where a word is used differently elsewhere in the industry, that is noted.

---

## Policy and jurisdiction

**Country** — geography, ISO 3166-1 alpha-2. Keys currency defaults, languages, formatting, addresses, phone numbers. **An attribute, not the policy key.**

**Jurisdiction** — the legal regime governing a person or record. **The policy key.** Usually 1:1 with country and not always: UAE free zones (DIFC, ADGM) are distinct regimes.

**OperatingEntity** — the legal person providing the service and bearing responsibility. Determines controllership, contracting party, licensing, invoicing, liability, and who releases disclosed data. Orthogonal to country and jurisdiction.

**SubjectPolicySelection** — the platform mechanism recording which elective option-set version a subject chose, with versioning, pinning, and provenance. The fourth policy dimension, recovered from the legacy's Zakat capability. The option *content* is capability-scoped (e.g. `ZakatMethodologyProfile`), and elections are potentially sensitive and purpose-limited.

**ZakatMethodologyProfile** — the Zakat bounded context's own elective option set (nisab basis, valuation convention, doubtful portions, calendar), elected through `SubjectPolicySelection`.

**PolicyPack** — typed, versioned, tested **code** carrying policy with legal or business consequence. Changed only by pull request, review, tests, staging, deploy.

**JurisdictionSettings** — audited **database** configuration carrying operational availability. Changed by an authorized operator without a deploy.

**Restrict-only invariant** — *database settings may only ever restrict what the code pack permits; they can never expand it.* The platform's central governance control.

**EffectivePolicy** — the merged result of pack, settings, and subject profile. **What use cases ask.** They never read a country code and never branch on jurisdiction.

**PolicyResolutionStrategy** — how a long-lived record's governing policy version is chosen: `AT_CREATION`, `AT_EVALUATION`, `MOST_RESTRICTIVE`, and others. Registered, extensible. **No default exists** — an unspecified strategy is a load-time error.

**Pinning** — storing `jurisdictionAtCreation`, `policyPackVersionAtCreation`, `operatingEntityAtCreation`, and `subjectPolicySelectionVersion` on a record, permanently, so it stays explainable.

**EntityMigration** — the explicit, audited operation that changes an entity binding, with a re-consent evaluation step. **Never a silent `UPDATE`.**

---

## Capabilities

**Capability** — a governed unit of platform functionality with an owner, a classification, a jurisdictional clearance, and an entitlement model. The unit of extension.

**CapabilityDescriptor** — the static, compile-time declaration in `<module>/capability.ts`.

**declaredJurisdictions** — the **maximum** legally-cleared set. Configuration may restrict it; nothing may exceed it.

**CapabilityAvailability** — the audited database record of `(capability × jurisdiction × environment × tenant) → AvailabilityState`.

**Deny by default** — *a capability with no availability row is `DISABLED`.* Code existing is never sufficient for exposure.

**Registered seam** — an append-only extension point: a union member, a policy clause, a nav entry, a module import, a route. **Nothing existing is modified.**

---

## Data and classification

**`SEALED`** — data intentionally inaccessible **to Karar itself** until specific conditions and authorizations are satisfied. Never projected, never in events, never in logs, never in analytics, never readable by support or admin, never consumed by AI, not searchable. **Categorically different from the other five classes, not merely stricter.**

**`SealAccessGrant`** — the required, non-nullable argument to a sealed read. Types: `OWNER`, `DISCLOSURE`, `LEGAL_ORDER`. **`SUPPORT`, `ADMIN`, `ANALYTICS`, and `AI` do not exist.**

**Sealed-integrity canary** — a synthetic sealed record per jurisdiction-KEK holding known non-customer plaintext, decrypted on a schedule. **The only mechanism that detects key loss without violating the seal.**

**KEK / DEK** — key-encryption key (per jurisdiction, per tenant at rung L3) and data-encryption key (per sealed record).

**Lifecycle declaration** — six fields every persistent dataset declares (ADR-0026): subject relationship, purpose, classification, retention, export treatment, erasure strategy.

**Erasure strategy** — one lifecycle field: `CASCADE_DELETE`, `ANONYMIZE_IRREVERSIBLY`, `RETAIN_WITH_BASIS`, or `NON_PERSONAL_BY_DESIGN`. The last **requires justification, not description** — and **pseudonymization is not anonymization**.

---

## Disclosure

**Disclosure** — release of a defined package to a **third party**, on a legal basis, after a verified event and authorization, by a **named releasing entity**, **irreversibly**. Not access.

**Access** — the data subject reading their own data under an ordinary session.

**DisclosurePackage** — the scope-limited artefact released, naming its recipient, purpose, legal basis, scope, expiry, jurisdiction, policy version, and **releasing operating entity**.

**ApprovalPolicy** — declared per capability per jurisdiction: approvers, roles, separation of duties, waiting period, reauthentication, expiry. **Amanat's default is mandatory human review.** A pack omitting one for a disclosure-bearing capability **fails to load**.

**Existence non-disclosure** — identical responses **and timings** whether records exist or not, until authorization completes. Without it, the report endpoint becomes an oracle.

---

## Financial

**Money** — `BIGINT` minor units + a `Currency` carrying its ISO 4217 exponent. **No floating point anywhere.**

**Minor units** — the smallest unit of a currency. **Not "cents"** — KWD, BHD, and OMR have three decimal places.

**Ruleset** — an immutable, versioned set of financial rules selected per `(capability, jurisdiction, version)`. **A correction is a new version, never an edit.**

**VerifiedFinancialFacts** — typed values with label keys, ruleset version, and calculation timestamp, emitted by the engine and consumed by the AI layer. **The model receives facts and never raw transactions.**

**Provenance** — ruleset version, jurisdiction, operating entity, subject profile version, calculation time, and input hash, stored per recommendation.

---

## Zakat

**Nisab** — the threshold above which zakat is due. 85 g of pure gold, or 595 g of silver where the basis selects it.

**Hawl** — the lunar year a holding must be held. Twelve Hijri months via Umm al-Qura — **354 or 355 days, not a fixed count.**

**Jurisprudential settings** — named, validated, audit-logged settings covering points of scholarly disagreement, **snapshotted into every assessment**. In Karar these are `SubjectPolicySelection` elections.

> **No Sharia review, board, scholar, or certificate exists.** The Zakat work is engineering against a written specification and nothing more should be inferred from it.

---

## Architecture

**Bounded context** — a module with its own vocabulary, owner, and data. The unit of decomposition.

**`public-api.ts`** — a module's **only** legal import surface.

**Port / adapter** — an interface declared in `application/`, implemented in `infrastructure/`. Every external dependency is a port.

**shared-kernel** — exactly nine universals. A type belongs only if a module that has never heard of any other module still needs it.

**Projection / read model** — a non-authoritative, rebuildable view in `readmodel`, built from events. **Never a source of truth.** Always shows an "as of" timestamp.

**Transactional outbox** — state change and event enqueue committed in one transaction, relayed asynchronously.

**Topology ladder (L0–L3)** — shared SaaS → dedicated database → dedicated deployment → dedicated cloud account/project/subscription. **Domain code is identical at every rung, on any approved provider.**

**DeploymentProfile** — a typed, provider-independent description of one deployment: provider, region, database, storage, cache, messaging, secrets, key management, identity, AI routing, analytics, observability, network, residency classification. Distinct from Country, Jurisdiction, Tenant, OperatingEntity, and Brand.

**DeploymentRouter** — the Karar-edge component that answers *which deployment receives this request*, by consulting the `DeploymentDirectory` — **before any business data access. Domain code never invokes it.**

**DeploymentDirectory** — the minimal, versioned, audited lookup: assignment (tenant × jurisdiction × environment × contract × isolation requirement) → `DeploymentId` → `DeploymentProfile`. **Routing metadata only — never financial data.** Assignments support controlled moves (`ACTIVE → MIGRATING → CUTOVER_PENDING → ROLLBACK_WINDOW`).

**DataSourceResolver** — the *within-runtime* mechanism selecting the tenant's shared or dedicated PostgreSQL datasource inside the already-selected deployment. A different problem from deployment routing, deliberately.

**ObjectRef / SecretRef / KeyRef** — opaque, provider-neutral references persisted by the application; the active profile's adapters resolve them. **A `gs://` URL or `arn:` path is never a domain field.**

**KeyCustodyStrategy / KeyRecoveryPolicy / KeyRotationPolicy** — provider-independent key custody policies (ADR-0017). No single cloud's escrow product is mandated.

**Assurance Claim Registry** — the mechanism behind architecture test 26: every technical or legal capability claim maps to an entry with an evidence pointer and a named owner. CI asserts the link; humans verify the substance.

**Greenfield Rule** — Karar V2 is built from scratch. The legacy is a requirements, evidence, and test-case source — never a code, schema, or architecture source. Reuse the knowledge, not the implementation.

**Control plane** — the security gateway for administrative access. The browser holds a session with it and **never an environment credential**.

---

## Evidence labels

Used on every factual claim about a system.

**CODE** — a file in the repository says so, and it was read.
**RUNTIME** — observed on a running system.
**INFRASTRUCTURE** — a provider or dashboard claim. **Not verified and not verifiable from the repository.**
**ABSENT** — searched for and not found. The absence is the evidence.

> An INFRASTRUCTURE claim must never be read as a verified one.

---

## Legacy

**Qarar** — the legacy system at `MoayadAlobaidi/Qarar`. Java/Spring Boot backend, React Native client, PostgreSQL on Supabase, deployed on Render. **Read-only reference. Never written to.**

**Karar** — this platform. A rebuild, not a migration.
