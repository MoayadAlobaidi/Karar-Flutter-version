# Glossary

Terms with a specific meaning in Karar. Where a word is used differently elsewhere in the industry, that is noted.

---

## Policy and jurisdiction

**Country** — geography, ISO 3166-1 alpha-2. Keys currency defaults, languages, formatting, addresses, phone numbers. **An attribute, not the policy key** — a country row carries no business rule, consent requirement, capability clearance, or legal conclusion.

**Jurisdiction** — the legal regime governing a person or record. **The policy key.** Usually 1:1 with country and not always: UAE free zones (DIFC, ADGM) are distinct regimes, and nothing in the platform assumes one jurisdiction per country. Carries its own review lifecycle, so a declared regime is never mistaken for a reviewed one.

**OperatingEntity** — the legal person providing the service and bearing responsibility. Determines controllership, contracting party, licensing, invoicing, liability, and who releases disclosed data. Orthogonal to country and jurisdiction.

**SubjectPolicySelection** — the platform mechanism recording which pack-permitted option a subject elected per capability, with the jurisdiction, pack version, and profile version pinned at recording. The fourth policy dimension, recovered from the legacy's Zakat capability. It stores universal metadata only: the option *content* is capability-scoped (e.g. `ZakatMethodologyProfile`), there is no generic preferences store, rows are immutable with supersession, and elections are `CONFIDENTIAL` at minimum and purpose-limited.

**ZakatMethodologyProfile** — the Zakat bounded context's own elective option set (nisab basis, valuation convention, doubtful portions, calendar), elected through `SubjectPolicySelection`.

**PolicyPack** — typed, versioned, tested **code** carrying policy with legal or business consequence, keyed to one jurisdiction and semantically versioned (`qa/v1`). Changed only by pull request, review, tests, staging, deploy; a published version is immutable, so a change is a new version. The database stores which version is *operative*, never what a pack says.

**JurisdictionSettings** — audited **database** configuration carrying operational availability. Changed by an authorized operator without a deploy. Its landed shape is a capability disable list and an AI-suspension flag — there is no field that could name an enablement.

**Restrict-only invariant** — *database settings may only ever restrict what the code pack permits; they can never expand it.* The platform's central governance control. Structural in two places: the settings type cannot express an addition, and the capability resolver's ceiling gates run before any grant-like input.

**EffectivePolicy** — the single typed resolution result: the resolved pack's decisions with settings merged restrict-only, the capability ceiling with each capability's named strategy, every undecided slot surfaced as a typed reason, and full provenance. **What use cases ask.** They never read a country code and never branch on jurisdiction.

**PolicyResolutionStrategy** — how a long-lived record's governing policy version is chosen: `AT_CREATION`, `AT_EVALUATION`, `MOST_RESTRICTIVE`, and others. A registry, not an enum — extensible without touching the resolver. **No default exists anywhere** — an unnamed or unregistered strategy fails pack validation.

**Pinning** — storing `jurisdictionAtCreation`, `policyPackVersionAtCreation`, `operatingEntityAtCreation`, and `subjectPolicySelectionVersion` on a record, permanently, so it stays explainable.

**EntityMigration** — the explicit, audited operation that changes an entity binding, with a re-consent evaluation step. **Never a silent `UPDATE`.**

---

## Capabilities

**Capability** — a governed unit of platform functionality with an owner, a classification, a jurisdictional clearance, and an entitlement model. The unit of extension.

**CapabilityDescriptor** — the static, compile-time declaration of one capability: its id, the three separated state dimensions, `declaredJurisdictions`, whether it is disclosure-bearing, and its client exposure. Lives as an entry in `packages/capability-registry`, not as a per-module file, because the registry is a closed union its validator must see whole.

**declaredJurisdictions** — a descriptor's **ceiling input**, not a grant. Clearance is the intersection of this list with the PolicyPack's cleared set, so an empty list is unreachable by any pack.

**CapabilityAvailability** — the audited database record of the operator-configured exposure state per `(environment, jurisdiction?, capability)`. Configuration, not a health signal, and one gate among eight.

**Deny by default** — *a capability with no availability row is `DISABLED`, and no entitlement row denies.* Code existing is never sufficient for exposure, and the tables ship with no rows at all — the ground state is absence, not a row saying "off".

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

## Platform foundation (Phase 2)

**EventEnvelope** — the transport-neutral record every domain event travels in: event identity and name, schema version, `occurredAt`/`recordedAt`, correlation and causation ids, producer, classification, payload. Never a provider's message shape. ([`architecture/event-governance.md` §4](architecture/event-governance.md))

**Consumer receipt** — a `(consumer, event id)` row in `platform.event_consumer_receipts`, written inside the consumer's own transaction. What makes at-least-once delivery safe: a duplicate delivery finds the receipt and becomes a no-op.

**JobQueue / lease** — the provider-neutral port for background work. A claimed job is held under a **lease** (owner + expiry) by exactly one worker; an expired lease is recoverable by any worker. Jobs are requested *work*; events are recorded *facts*. ([`architecture/backend.md` §1](architecture/backend.md), ADR-0013)

**Dead letter** — the terminal state of an outbox event or job that exhausted `max_attempts`. Alertable by metric (`karar.outbox.dead_lettered`, `karar.jobs.dead_lettered`); a silent DLQ is the failure mode the alert exists to prevent.

**Outbox lag** — the age of the oldest unpublished outbox envelope (gauge `karar.outbox.lag_seconds`). The first-class delivery-health metric of [`architecture/backend.md` §11](architecture/backend.md).

**Connection profile** — the typed description one `PostgresPersistenceAdapter` is constructed from: host, database, role, secret-wrapped password, TLS mode, pool and timeout settings. Provider differences live here, never in adapter code. ([`architecture/database-portability.md` §2](architecture/database-portability.md))

**Migration drift** — a checksum mismatch, missing file, or renamed file among *applied* migrations. `db:migrate` and `db:verify` fail hard on it: applied history is immutable. ([`../packages/platform/db/migrations/README.md`](../packages/platform/db/migrations/README.md))

**SecretValue** — the only way a secret travels through typed configuration. Every accidental rendering path (string coercion, JSON, `console.log`) yields `[redacted]`; the real value requires an explicit, grep-able `unwrap()`.

**DATA_LIFECYCLE file** — [`packages/platform/db/DATA_LIFECYCLE.md`](../packages/platform/db/DATA_LIFECYCLE.md): the six-field lifecycle declarations (ADR-0026) for platform infrastructure tables no module owns. Module-owned tables declare theirs in `MODULE.md`; architecture test 25 parses both.

**KeyVersionRef** — `karar-ref:key-version:<keyId>@v<N>`: the opaque reference naming the exact key version that produced a wrap or ciphertext. Recorded on every encryption result, so rotation is auditable and key-version loss detectable. ([`architecture/infrastructure-portability.md` §6](architecture/infrastructure-portability.md), ADR-0017)

**Canary contract** — what a sealed-integrity canary run must satisfy: synthetic-only plaintext (mandatory `KARAR-CANARY-` marker), a verify that exercises the complete path including DEK unwrap and live key-provider access, no plaintext in logs, and an alert on failure. The contract types ship in Phase 2; the running canary is Phase 13. (See *Sealed-integrity canary* above; ADR-0017)

---

## Identity, tenancy, and access control (Phase 3)

**Bootstrap arm** — an explicit no-principal clause in an RLS policy on a table that authentication must read **before a principal exists** (you cannot know who is logging in without reading the row that identifies them). Each arm is recorded in the RLS allow-list with its justification; a transaction that *has* a user context stays confined to its own rows. Sessions and MFA tables carry none.

**Consent classification** — the reviewed decision required before a legal-document version may be published: `MATERIAL_REACCEPTANCE_REQUIRED`, `NOTICE_REQUIRED`, or `NO_USER_ACTION_REQUIRED`, with reviewer and reason recorded and **no default in either direction**. An unclassified publication is blocked by typed error and by CHECK constraint. (ADR-0024; the inversion of legacy finding P12)

**DataProtectionRoleAssignment** — a stored legal decision: which entity is controller, joint controller, or processor **per (entity, tenant, purpose, jurisdiction) relationship**, from when to when — never a property of the entity alone. What makes the white-label controller/processor inversion configuration rather than code. ([`architecture/operating-entity.md`](architecture/operating-entity.md))

**Delegation peer rule** — assigning `PLATFORM_ADMIN` requires *holding* `PLATFORM_ADMIN`; granting any role requires `authorization.role.assign`. No path exists by which an actor widens their own authority. Revocation carries no peer rule — revoking only ever shrinks authority.

**GUC** — a PostgreSQL configuration variable (grand unified configuration), settable per session or per transaction. Karar binds the principal GUCs `app.tenant_id`, `app.user_id`, `app.session_id`, and `app.request_id` **transaction-locally only** (`set_config(…, true)` = `SET LOCAL`); RLS policies read them via `NULLIF(current_setting(name, true), '')`, so an unset GUC matches no rows. `SET SESSION` on `app.*` is forbidden (architecture test 9).

**Identity vs users (bounded contexts)** — two deliberately separate contexts: `identity` owns the credential and the session (who a principal *is*); `users` owns the person (profile, locale, status intent). They share one identifier — `identity_accounts.id` **is** the platform `UserId`, the value `user_profiles.user_id` stores and `app.user_id` carries. There is no second user id.

**Kill switch (restrict-only)** — an operational control that can only **deny** its operation. `INACTIVE`, expired, and missing all mean "no restriction recorded"; no state enables, widens, or bypasses anything. An active restriction answers 503 `OPERATION_RESTRICTED`; an unreadable switch store fails **closed** (503 `DEPENDENCY_UNAVAILABLE`) — absence of a restriction is an answer, absence of the store is not. Every change is versioned, append-only ledgered, and audited.

**Principal context** — the transaction-local binding of the caller's identity into the principal GUCs, set by `withPrincipalContext` as the transaction's first statement, from the caller's own record — **never from client input**. Required-but-missing context fails closed with a typed error before any query. RLS decides row visibility from it. ([`architecture/tenancy.md` §3](architecture/tenancy.md))

**Refresh-token family** — the rotation lineage of one session grant: each refresh consumes a one-time token (stored only as its SHA-256) and issues a successor in the same family. The family is the **unit of revocation** when reuse is detected.

**Reuse detection** — presenting an already-rotated refresh token is treated as evidence of theft, not a retry: the whole family and its session are revoked. Rotation is one-time and atomic, so a replayed token can never mint a parallel session.

**RLS allow-list** — [`../packages/platform/db/rls-allow-list.json`](../packages/platform/db/rls-allow-list.json): the only sanctioned way a table exists without tenant/user RLS policies. One entry per table with a written reason and compensating controls; architecture test 22 fails any table that is neither `ENABLE`+`FORCE` nor listed.

**Token version (`tv`)** — a per-account counter carried in every access token. Security-relevant account changes (disabling an account, resetting a password) bump it, and the request guard re-reads the account on every request, so previously issued tokens die immediately — no waiting for expiry. Access tokens carry `{sub, sid, iss, aud, iat, exp, tv}` and nothing else; roles are never in the token.

---

## Jurisdiction, capability, and policy (Phase 3.5)

**Assignment source** — where a jurisdiction assignment came from: `USER_DECLARED`, `PROVIDER_VERIFIED`, `OPERATOR_ASSIGNED`, `CONTRACT_DERIVED`. A **separate axis** from verification status, and CHECK-constrained against it: `USER_DECLARED` is bound to `UNVERIFIED`, so a user selecting a country never becomes a verified assignment by any path short of a new provider-verified row.

**Availability state** — the *configured* exposure state stored on a `capability_availability` row: `AVAILABLE`, `BETA`, `INTERNAL_ONLY`, `PARTNER_ONLY`, `DISABLED`, `PENDING_PROVIDER`, `PENDING_LEGAL_REVIEW`, `PENDING_REGULATORY_REVIEW`. Only the first two permit exposure. `INTERNAL_ONLY` and `PARTNER_ONLY` deny in this phase — no audience model exists to check a principal against, and a state that cannot be checked must not widen access. Distinct from a **denial reason**: a row stores a state, a resolution reports a reason.

**Bootstrap context** — what `GET /platform/bootstrap` returns to an authenticated client: who it is, its binding state, and the client-safe jurisdiction, operating-entity, PolicyPack, and capability view. Composed over other modules' state; the surface owns no data. Not to be confused with a **bootstrap arm** (an RLS clause) or with the pre-sign-in deployment-routing problem in [`architecture/infrastructure-portability.md`](architecture/infrastructure-portability.md).

**Ceiling** — the maximum a configuration may reach: the descriptor's implementation, deployment, and declared jurisdictions intersected with the PolicyPack's cleared set. Configuration narrows it; **nothing widens it**.

**Client exposure** — the descriptor field deciding whether a capability may appear in client output at all: `ACTIONABLE` or `HIDDEN`. A `HIDDEN` capability is **omitted in every state, including allowed** — never returned as unavailable with a reason, because naming the reason would advertise that it exists.

**Denial reason** — the resolver's answer for *why* a capability was not exposed, and at which gate. Modelled separately from availability state, and including reasons no row can hold (`NOT_IMPLEMENTED`, `JURISDICTION_NOT_CLEARED`, `ENTITLEMENT_MISSING`, …). Only four are surfaceable to a client — consent, re-consent, and the two entitlement reasons — plus `PENDING_PROVIDER` where a descriptor opts in; everything else omits the capability entirely.

**EffectiveJurisdictionState** — the three-arm value consumers read instead of a nullable assignment row: `NONE`, `UNVERIFIED`, `VERIFIED`. Three arms because a capability requiring a verified regime must deny on the first two alike, and a union makes forgetting one a compile error.

**Entitlement** — a per-`(tenant, capability)` grant that satisfies **one gate and nothing else**. Deliberately carries no subscription, plan, or price concept: `sourceRef` is an opaque seam a future subscription module fills. Missing means denied.

**Gate order** — the eight ordered AND conditions of availability resolution: descriptor, environment, jurisdiction and pack, availability row, entitlement, consent, licence, provider. The order *is* the restrict-only control — the first four consume no grant-like input, so no entitlement, consent, licence, or provider status can flip a ceiling denial.

**Pack lifecycle** — a PolicyPack's stage: `DRAFT`, `PENDING_LEGAL_REVIEW`, `APPROVED`, `RETIRED`. Only `APPROVED` **with a non-empty `approvalReference`** may govern a non-local environment; an approved claim without evidence is refused everywhere. `RETIRED` versions never activate again but stay resolvable for the records made under them.

**PolicyDecision** — the three-arm union every decision slot in a pack holds: `DECIDED` (with the basis that carries the actual claim), `PENDING_LEGAL_REVIEW`, or `UNRESOLVED`. **A pending decision is a valid pack state**; a *required* decision absent entirely is a validation failure. The distinction between "we know we have not decided" and "nobody asked".

**Tenant binding** — the tenant a session is bound to. First bind sets it without token rotation; a **switch** revokes the session and its refresh families and issues a new session, so no token survives pointing at the previous tenant. **Binding is routing, not authority**: per-request membership checks and RLS remain the boundary.

---

## The client (Phase 4)

**Startup state** — one of twelve values the startup coordinator holds, each mapping to exactly one route and declaring one recovery action. **Protected content renders in `READY` and nowhere else**, and a feature never decides which state holds. There is exactly one router redirect, driven by these.

**Feature surface** — the single merge point where every feature's routes, startup screens and home builder are combined into provider overrides. It exists because a Riverpod override *replaces* a value: two workstreams overriding independently would leave only the last standing.

**Navigable capability set** — the client's compile-time **allowlist** of capability ids that may become a destination. An **allowlist, never a denylist**: an id the server omitted produces no destination, no count and no readable state, and there is deliberately no collection of unrecognised ids, because such a collection would disclose the names it holds. Empty today, correctly — nothing is implemented.

**Resolved-empty versus unavailable** — two different answers a client must not conflate. A bootstrap response whose capability section is `RESOLVED` with no items is an *answer*, rendered as a stated empty state inside the signed-in surface. A resolution that could not be performed is a 503, rendered as an outage screen that names no service, no entitlement and no dependency. Before Phase 4 the enrichment ports could not express the difference.

**Client-safe entity summary** — the four fields of an `OperatingEntity` a client may be told: id, registered legal name, an optional jurisdiction reference, an optional published role mailbox. Enforced by the SELECT rather than by a mapper, and **resolution-scoped** — derived from the caller's own binding, so the register can be neither named into nor enumerated.

**Self-declaration** — a subject recording their own jurisdiction. Always `USER_DECLARED` and `UNVERIFIED`, by module constant and by schema CHECK; it cannot supersede a verified assignment and **changes only which denial reason the subject sees**. It exists because both operator write paths are gated on a deliberately unseeded permission.

**Build environment guard** — the build-time check that refuses to produce a package for any environment other than `LOCAL` without an HTTPS endpoint that carries no credentials and whose host is not a developer-machine address. A **build failure**, not a runtime warning: on Android at Gradle configuration time, on iOS in a build phase that runs before code signing.

**Golden baseline** — a committed image compared pixel-for-pixel. Karar keeps four, of two design-system compositions in two locales, and they are **not CI-enforced**; they are banned outright under `test/features`, because a golden captures whatever was on screen and an MFA setup key or a recovery code must never end up in one.

---

## Evidence labels

Used on every factual claim about a system.

**CODE** — a file in the repository says so, and it was read.
**RUNTIME** — observed on a running system.
**INFRASTRUCTURE** — a provider or dashboard claim. **Not verified and not verifiable from the repository.**
**ABSENT** — searched for and not found. The absence is the evidence.

> An INFRASTRUCTURE claim must never be read as a verified one.

**ARTIFACT** is used in the Phase 4 records as a narrowing of RUNTIME: an assertion that read a real build output — a merged manifest, an unzipped APK, a packaged iOS bundle — which is stronger than reading source and **weaker than observing a device**. Where it appears, no device was involved.

---

## Legacy

**Qarar** — the legacy system at `MoayadAlobaidi/Qarar`. Java/Spring Boot backend, React Native client, PostgreSQL on Supabase, deployed on Render. **Read-only reference. Never written to.**

**Karar** — this platform. A rebuild, not a migration.
