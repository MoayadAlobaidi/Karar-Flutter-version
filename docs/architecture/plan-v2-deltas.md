# Plan v2 — Amendments Arising from the Legacy Audit

> ## Status: RESOLVED — HISTORICAL
>
> All six deltas were **accepted and consolidated into the canonical architecture in Phase 0.5** (15 August 2026). This document is retained as the audit-time record of *why* each amendment was raised; **the authoritative rules now live in the documents below**, and where this text and a canonical document differ, the canonical document governs.
>
> | Delta | Canonical home |
> |---|---|
> | D1 — Zakat + subject-elected policy | [ADR-0015](../adr/0015-policy-packs.md) (`SubjectPolicySelection`; capability-scoped `ZakatMethodologyProfile`), [`jurisdiction-policy.md` §7](jurisdiction-policy.md), capability map, Phase 9 scope |
> | D2 — Sealed key custody | [ADR-0017](../adr/0017-sealed-classification.md) (`KeyCustodyStrategy` / `KeyRecoveryPolicy` / `KeyRotationPolicy`, provider-independent), [`sealed-data.md` §7](sealed-data.md), Phase 20 gates |
> | D3 — White-label planes | [`white-label.md`](white-label.md) — "no code changes" means **no core-domain fork**, not no activation/build work |
> | D4 — Legal-document lifecycle | [ADR-0024](../adr/0024-operating-entity.md), [`jurisdiction-policy.md` §10](jurisdiction-policy.md) — including that consent is not assumed to be every purpose's legal basis |
> | D5 — Data lifecycle | [ADR-0026](../adr/0026-data-lifecycle.md) — **renumbered from 0027 in Phase 0.5** so the sequence is continuous at 0001–0026; six-field declaration; pseudonymization ≠ anonymization |
> | D6 — Architecture tests 22–26 | [`../testing/architecture-tests.md`](../testing/architecture-tests.md) + the [Assurance Claim Registry](../security/assurance-claims.md) |
>
> Consolidation record: [`../phase-05-consolidation.md`](../phase-05-consolidation.md).

**Raised by:** Phase 0.2 legacy audit, 15 August 2026, after Blocker 1 was resolved.
**Against:** Architecture Plan v2 (consolidated), 15 August 2026.

---

## Why this document exists

Plan v2 was written with the legacy repository unreachable, and it says so honestly: the feature inventory was **BLOCKED — NO SOURCE ACCESS**, and Blocker 1 gated Phase 0 sign-off and Phase 9 scoping.

Blocker 1 is now resolved ([`../legacy/qarar-audit.md` §1](../legacy/qarar-audit.md)). Reading the legacy surfaced six items where the plan is incomplete or under-costed. Plan v2's own consolidation rule applies — **exactly one authoritative rule per decision** — so these are raised as proposed amendments to the body rather than as an appendix that would create a second place to look.

**The plan's foundation is unaffected.** Nothing here contradicts a v1 or v2 decision. Four of the six are additive; two are cost corrections.

| # | Delta | Type | Blocks | Cost if deferred |
|---|---|---|---|---|
| **D1** | Zakat is missing, and exposes a fourth policy dimension | Additive | Phase 3.5 design | **High** — retrofitting a policy dimension after `jurisdiction-policy` and `financial-engine` exist |
| **D2** | Sealed key escrow, rotation, and an integrity canary | Additive | Phase 13 | **Severe and unrecoverable** |
| **D3** | White-label data plane is not costed | Cost correction | Phase 11 estimate | Medium — schedule surprise |
| **D4** | Consent re-acceptance on document republish | Additive | Phase 3 | Medium — a live legal defect in the legacy today |
| **D5** | Erasure strategy for ownerless derived data | Additive | Phase 5 | Medium — discovered during a data-subject request |
| **D6** | Five additional architecture tests | Additive | Phase 1 | Low |

---

## D1 — Zakat, and the fourth policy dimension

### What the audit found

`com.qarar.zakat` is a production capability with a 2,028-line specification set, a full calculation engine, and nine migrations. Plan v2 does not mention it — not in the domain map (§9), not in the capability registry (§2), not in the roadmap (§11).

The inventory gap is the easy half and is already closed: Zakat is scoped into Phase 9 in [`../legacy/feature-inventory.md` §5](../legacy/feature-inventory.md).

### The architectural half

Plan v2 §1.1 opens with a claim it makes well:

> Three independent dimensions… **a precision v1 lacked entirely.** These vary independently and conflating any two becomes very expensive once records exist.

Country, Jurisdiction, OperatingEntity. **Zakat varies along none of them.**

Two customers in Qatar, contracting with the same operating entity, under `qa/v1`, can legitimately require different calculations — because they follow different scholarly positions on nisab basis (gold or silver), valuation convention, the treatment of doubtful portions, and calendar. The legacy models this correctly: a **jurisprudential settings register**, each setting named, validated, audit-logged on change, and **snapshotted into every assessment**, plus per-customer preferences.

That is a policy dimension with exactly the properties Plan v2 gives PolicyPacks — typed, versioned, pinned at record creation, provenance-bearing — but keyed on **the subject**, not the jurisdiction.

It is not exotic and not Zakat-specific. The same shape appears in accounting-basis choices, fiscal-year conventions, risk-tolerance bands, and any faith- or preference-driven financial rule. **Karar is an extensible capability platform; the second instance of this shape should not require re-deriving it.**

### Why now rather than later

Plan v2's own test for a seam: *"would retrofitting this be expensive?"* — not *"might we want this?"*

Retrofitting this one means changing `EffectivePolicy`'s resolution signature, the provenance record on every stored recommendation, and the pinning rule for every record with legal consequence — after `financial-engine` and `jurisdiction-policy` exist and after records have been created under the old shape. That is the precise scenario §1.1 warns about.

Adding it at Phase 3.5, before either package is built, is a type parameter and a resolution step.

### Proposed amendment

**§1.1 gains a fourth dimension:**

| Dimension | Question | Key for |
|---|---|---|
| **SubjectPolicySelection** | Which elective rules has *this subject* chosen, within what the jurisdiction permits? | Calculation conventions, jurisprudential settings, accounting basis, elective methodology |

**Governing rules, mirroring the existing restrict-only invariant:**

1. A `SubjectPolicySelection` may only select **among options the jurisdiction's PolicyPack permits.** It can never expand the permitted set. Same enforcement, same test, same reason as §1.3's database-settings invariant.
2. The profile version is **pinned at record creation** alongside `jurisdictionAtCreation`, `policyPackVersionAtCreation`, and `operatingEntityAtCreation` (architecture test 21 extends by one field).
3. Per-recommendation provenance records it, so §7.7's guarantee holds in full: *every historical recommendation remains explainable under the rules, jurisdiction, legal party — and elected conventions — that produced it.*
4. Where a capability declares no elective options, the profile is absent and costs nothing. **This is the common case** and must not tax capabilities that do not need it.

**§9 domain map gains** `zakat` as a consumer capability and `subject-policy` as a platform concern, most naturally a bounded part of `jurisdiction-policy` rather than a separate context — it shares the type system and the resolution registry.

**ADR-0015** extends to cover subject-elected policy, or a new **ADR-0026** records it. Recommend extending 0015: it is the same decision about where policy lives, and a separate ADR would split one rule across two documents.

---

## D2 — Sealed key escrow, rotation, and an integrity canary

### What the audit found

Legacy finding **ENC-2**: key rotation, escrow, and a second copy are **NOT BUILT**, and the production `DATA_ENCRYPTION_KEY` *"has already been lost once in production, on 11 August 2026."*

### Why this is more serious for Karar V2 than it was for Qarar

The legacy survived because production held 3 users and 45 transactions, and because encrypted columns sit beside readable metadata that makes loss **visible**.

Plan v2's `SEALED` classification removes both cushions deliberately. Sealed data is never projected, never in events, never in logs, never in analytics, never readable by support or admin, never consumed by AI, and not searchable — §4.1 lists this as a *"deliberate capability sacrifice"*, correctly.

The consequence is not stated in the plan:

- **Unrecoverable.** No second copy of the plaintext exists anywhere, by construction.
- **Undetectable.** No projection, dashboard, or support path may read the payload, so nothing can notice a KEK has stopped working.
- **Discovered at the worst possible moment.** After death verification, recipient verification, a mandatory waiting period, and human approval — at the point of releasing an Amanat record to a bereaved family.

Plan v2 §4.2 specifies per-record DEK, jurisdiction-scoped KEK, `EncryptionProvider`, and *"no proprietary cryptography"* — all correct — and is silent on escrow, rotation, and recovery.

### Proposed amendment

**§4.2 gains three binding constraints, alongside the four extractability constraints already listed:**

5. **KEK escrow with a rehearsed recovery procedure.** A second, independently controlled copy of every jurisdiction-scoped KEK, under split control (no single operator can reconstruct one alone). The recovery drill is executed and timed before any production `SEALED` data exists.

6. **Sealed-integrity canary.** A synthetic sealed record per jurisdiction-KEK, holding known plaintext and no customer data, decrypted on a schedule. Failure raises a security event. **This is the only mechanism that can detect key loss without violating the seal** — precisely because the canary's contents are known and are not a customer's.

7. **Rotation designed in from Phase 2, not retrofitted.** The legacy's rotation is entangled with statement fingerprinting — rotating the key changes every future fingerprint, so a rotation must recompute stored ones or a re-uploaded statement imports twice (legacy M9). That entanglement is what retrofitting produces.

**Phase 20's existing gate extends:**

> the vault must be extracted into a dedicated security boundary before any production `SEALED` data exists

becomes

> …**and KEK escrow must be in place with a rehearsed, timed recovery drill, and the sealed-integrity canary must be running in staging and production.**

**Architecture test:** the canary's plaintext is asserted to contain no customer-derived data, so the detection mechanism cannot itself become a sealed-data leak.

**ADR-0017** extends to record escrow, rotation, and canary as part of the sealed-vault decision.

---

## D3 — White-label data plane is not costed

### What the audit found

The legacy's framing is exact and worth quoting rather than paraphrasing:

> the **control plane** is the ability for Qarar to configure a bank tenant. The **data plane** is the ability for that configuration to change what a customer sees. The first is built. The second is not.
> …Nothing in the mobile app consumes tenant branding. A bank can be configured in the console and no customer would see any difference. **Qarar is not white-label ready.**

The legacy built tenants, contracts, seat allocations, per-tenant branding, feature flags, domains, integrations, and legal documents — all of it control plane — and shipped a client that consumes none of it.

### What this does and does not change

**Scenario C's conclusion stands.** *"Zero code changes"* is a correct statement about Karar V2's architecture: deny-by-default entitlements, `BrandConfiguration`, and capability-scoped SDK surfaces genuinely make the *capability-scoping* half configuration-only. That should not be softened, and the controller/processor inversion via `OperatingEntity` is a real advance over the legacy, which could not represent it at all.

**What Scenario C does not cost is the client work that makes configuration visible.** Design tokens threaded through a Flutter theme, per-tenant flavors, bundle identifiers, sender identity, branded builds, and the release pipeline that produces them. Plan v2 §8.3 lists *"Brand → `BrandConfiguration` → design tokens, logo, legal docs, support, domains; Flutter flavor"* in a single table row. The legacy is evidence that this row is where the effort actually lives.

### Proposed amendment

**§8.3 gains a note** distinguishing the two planes and stating that Scenario C's "zero code changes" applies to the platform and capability-scoping, **not** to the client build pipeline, which is Phase 11 delivery work.

**Phase 11 in §11 becomes explicit:**

> White label — brand config, tokens, flavors, tenant entitlements, demo bank tenant **— control plane *and* data plane. The data plane is the larger half: Flutter theming from tokens, per-tenant flavors and bundle identifiers, sender identity, and the branded release pipeline. The legacy built the control plane alone and was not white-label ready.**

No ADR change. This is an estimate correction, not a design change.

---

## D4 — Consent re-acceptance on document republish

### What the audit found

Legacy finding **P12**: publishing a new version of the terms or privacy policy **asks nobody to accept it**, which contradicts the terms themselves. The flag `qarar.consent.enforce-reacceptance` is `false` with no override.

This is live and consequential: it is why the V43 correction of the AI processing notice — the remediation of HIGH finding **P1** — is only *partially* effective. Customers holding a version-1 acceptance still hold an acceptance of text that described a redaction behaviour the code did not implement.

### What Plan v2 covers, and what it misses

Plan v2 keys consent on the triple `(operatingEntity, purpose, jurisdiction)`, pins the operating entity at creation, and makes `EntityMigration` an audited operation **with a re-consent evaluation step**. That is a genuine advance and handles the restructuring case well.

**But document-version republication happens within a stable triple.** Same entity, same purpose, same jurisdiction — new text. Plan v2 places `legalDocumentSet` on the `OperatingEntity` and the in-force version in `JurisdictionSettings` (database, audited, restrict-only), and nowhere states what happens to existing acceptances when that version changes.

The legacy proves this is not the rare case. It is the case that occurs.

### Proposed amendment

**§1.2/§1.3 gain an explicit rule:**

> A change to the in-force legal document version for an `(entity, jurisdiction)` pair triggers a **re-consent evaluation** for every affected subject, on the same audited footing as `EntityMigration`. The evaluation classifies the change as **material** (re-acceptance required before the affected purpose may continue) or **non-material** (notice only), and that classification is recorded with its author. **Neither outcome is a default** — an unclassified republication blocks the version change, in the same way §1.4 makes an unspecified resolution strategy a load-time error rather than a silent fallback.

**Consequence for the capability resolver:** a subject with an outstanding material re-consent is treated as consent-absent for that purpose, so §2.2's gate D8 returns `CONSENT_REQUIRED`. **This is the fail-closed behaviour that legacy finding AI-5 got wrong** — the legacy's consent gate fails *open* when no disclosure document is published.

**ADR-0024** (Legal / Operating Entity as a distinct platform dimension) extends to cover document-version lifecycle. Alternatively **ADR-0018**, but 0024 is the better home: this is about the entity's document set, not about disclosure.

---

## D5 — Erasure strategy for ownerless derived data

### What the audit found

Legacy finding **P7**: one production table holds statement-derived data belonging to no user and **therefore cannot be erased on request**. Compounding it, **P5**: the data export omits whole categories of the customer's own data while its coverage block claims to name everything it omits. **P8**: nothing but the raw statement file has a retention schedule.

### Why Plan v2 is exposed to the same shape

Plan v2's retention and erasure design assumes records have owners — reasonable for transactions, budgets, goals, and Amanat records. But Phase 5 (financial data platform) explicitly builds **normalisation, dedup, provenance, and categorisation**, and Phase 8 builds **projections**. Both routinely produce data that is derived from a subject's records without belonging to one: merchant rule corpora, dedup fingerprints, normalisation dictionaries, aggregate projections.

The legacy did not decide to create ownerless data. It discovered it during an erasure review.

### Proposed amendment

**Every table declares an erasure strategy at design time**, recorded in `MODULE.md` and asserted in CI:

| Strategy | Meaning |
|---|---|
| `CASCADE_DELETE` | Deleted with the owning subject |
| `ANONYMIZE_IRREVERSIBLY` | Subject linkage severed; the row survives without it |
| `RETAIN_WITH_BASIS` | Retained, with a stated legal basis and a retention period |
| `NON_PERSONAL_BY_DESIGN` | Deliberately owner-less from creation, with a stated reason and a demonstration that it cannot be re-identified |

**`NON_PERSONAL_BY_DESIGN` is a decision requiring justification, not a description of an accident.** That distinction is the whole amendment.

Adds **architecture test 25** (§D6). Touches Phase 0.7's `MODULE.md` template, so it is cheap now and expensive at Phase 16.

**ADR-0025** (domain event governance) is adjacent but not the right home. Recommend a new **ADR-0026 — Data lifecycle: retention, erasure, and ownerless derived data**, because it governs tables rather than events.

---

## D6 — Five additional architecture tests

Plan v2 §13 specifies 21 tests. The audit produces five more, each traceable to a legacy finding. Rationale is in [`../legacy/security-findings.md` §6](../legacy/security-findings.md).

| # | Test | From |
|---|---|---|
| 22 | **RLS coverage guard** — every table RLS-enabled and FORCEd, or on an explicit allow-list with a stated reason. Detects *no RLS*, *enabled-without-policy*, **and** *FORCEd-without-enabled* | RLS-01, RLS-02, P14 |
| 23 | **No declared guard without a call site** | AZ3 — two of three documented protections were unreachable |
| 24 | **Ingestion and rendering paths declare explicit limits** — bytes, rows, pages, wall-clock, memory | FILES-2, FILES-7, API-05 |
| 25 | **Every table declares an erasure strategy** | P7, P8 (see D5) |
| 26 | **Capability promises reconcile with legal documents** | P1, P4, P12, C4 |

Test 26 cannot verify prose against code and does not claim to. It asserts that the *link* exists and that a declared promise has a named owner — which is exactly what was missing when the legacy's AI notice and its redaction code diverged.

Test 22 subsumes nothing in the existing 21; tests 12–21 are unaffected.

---

## Recommended disposition

| Delta | Recommendation | Where it lands |
|---|---|---|
| **D1** | **Accept.** Amend §1.1, §9; extend ADR-0015. Design at Phase 3.5, alongside the PolicyPack work it parallels | Phase 3.5 |
| **D2** | **Accept.** Amend §4.2 and the Phase 20 gate; extend ADR-0017 | Phase 2 design, Phase 13 build, Phase 20 gate |
| **D3** | **Accept as an estimate correction.** Amend §8.3 note and Phase 11 wording. No ADR | Phase 11 |
| **D4** | **Accept.** Amend §1.2/§1.3; extend ADR-0024 | Phase 3 |
| **D5** | **Accept.** New ADR-0026; extend the `MODULE.md` template now | Phase 0.7, enforced Phase 5 |
| **D6** | **Accept.** §13 becomes 26 tests | Phase 1 |

**ADR count moves from 25 to 26.** (At the time this was raised, the new ADR was numbered 0027 with 0026 left unused so that D1 stayed inside ADR-0015; the Phase 0.5 consolidation renumbered it to 0026, making the sequence continuous.)

**None of these blocks Phases 1–8.** D1, D2, D4, and D5 all touch Phase 0.7 and Phase 3.5 artefacts that do not yet exist, which is exactly why raising them now is cheap.

**The verdict of Plan v2 is unchanged: READY, Phase 0 authorized.** The audit strengthens the plan in the same way the plan's own amendments strengthened v1 — by making a real constraint representable rather than implicit.
