# Phase 0.5 — Final Architecture Consolidation

**Date:** 15 August 2026
**Branch:** `claude/karar-v2-architecture-plan-5tif8e`
**Nature:** consolidation of the approved architecture — **not Plan v3, no redesign.** After this document there is exactly one authoritative architecture; [`architecture/plan-v2-deltas.md`](architecture/plan-v2-deltas.md) is marked RESOLVED — HISTORICAL.

**Scope discipline held:** no application code, no legacy code copied, no cloud provisioned, Phase 1 not started.

---

## 1. D1–D6 — RESOLVED

| Delta | Resolution | Canonical home |
|---|---|---|
| **D1** Zakat + subject-elected policy | **RESOLVED.** Platform mechanism `SubjectPolicySelection` (version/provenance/pinning); profile *content* capability-scoped — `ZakatMethodologyProfile` belongs to the Zakat bounded context. Elections are sensitive and purpose-limited: never marketing, analytics, or unrelated AI. Zakat is a registered capability and Phase 9 feature; outputs are deterministic estimates, **never represented as a fatwa**; Sharia review required before public launch | [ADR-0015](adr/0015-policy-packs.md) · [`jurisdiction-policy.md` §7](architecture/jurisdiction-policy.md) · [`modules/zakat/MODULE.md`](../modules/zakat/MODULE.md) |
| **D2** Sealed key recovery | **RESOLVED.** Provider-independent `KeyCustodyStrategy` / `KeyRecoveryPolicy` / `KeyRotationPolicy` — no cloud-specific escrow mandated. Before production `SEALED` data: custody selected, rotation tested, recovery documented and rehearsed, separation of duties, canary operational (no customer data), monitoring, key/version provenance | [ADR-0017](adr/0017-sealed-classification.md) · [`sealed-data.md` §7](architecture/sealed-data.md) · [`secrets.md`](security/secrets.md) |
| **D3** White-label planes | **RESOLVED.** Control plane and data plane explicitly distinguished; Phase 11 builds both; *"no code changes" means no core-domain fork, not no activation/build work* | [`white-label.md`](architecture/white-label.md) |
| **D4** Legal-document changes | **RESOLVED.** Republication triggers explicit material/non-material classification, no silent default; material re-acceptance fails closed. **Consent is not assumed to be the legal basis for every purpose or jurisdiction** — each purpose declares its basis; no declared basis fails closed | [ADR-0024](adr/0024-operating-entity.md) · [`jurisdiction-policy.md` §8/§10](architecture/jurisdiction-policy.md) |
| **D5** Data lifecycle | **RESOLVED.** Six-field declaration per persistent dataset: subject relationship, purpose, classification, retention, export treatment, erasure strategy (`CASCADE_DELETE` · `ANONYMIZE_IRREVERSIBLY` · `RETAIN_WITH_BASIS` · `NON_PERSONAL_BY_DESIGN`). **Pseudonymization is not anonymization.** ADR renumbered **0027 → 0026**; sequence continuous **0001–0026** | [ADR-0026](adr/0026-data-lifecycle.md) · [`data-model.md` §6](architecture/data-model.md) · [MODULE template](MODULE_TEMPLATE.md) |
| **D6** Architecture tests | **RESOLVED.** Canonical 22–26: RLS coverage · declared-guard call sites · ingestion/rendering resource limits · lifecycle declaration · **claims evidence traceability via the Assurance Claim Registry** (CI asserts the link; humans verify substance — no pretence that CI reads legal prose) | [`testing/architecture-tests.md`](testing/architecture-tests.md) · [`security/assurance-claims.md`](security/assurance-claims.md) |

The 128 legacy findings are additionally grouped by **ten systemic root causes**, each mapped to architecture control / regression test / deferred risk / not-applicable — no 128 arbitrary checks: [`legacy/security-findings.md` §9](legacy/security-findings.md).

## 2. New in Phase 0.5

| Addition | Document |
|---|---|
| **Greenfield Rule** — absolute; legacy is knowledge, never code; Phase 1 starts from zero | [`architecture/greenfield-rule.md`](architecture/greenfield-rule.md) |
| **`DeploymentProfile` + `DeploymentResolver`** — typed, provider-independent, distinct from Country/Jurisdiction/Tenant/OperatingEntity/Brand; resolution by tenant × jurisdiction × environment × contract × isolation, not country alone | [`architecture/infrastructure-portability.md`](architecture/infrastructure-portability.md) |
| Provider-port catalogue (15 ports), opaque references (`ObjectRef`/`SecretRef`/`KeyRef`/`EventEnvelope`/`CacheKey`), provider capability verification, AI-routing independence, OTel observability, DR-vs-migration contract, config separation, definition of portable | same |
| **PostgreSQL provider portability** — engine commitment + the honest limit; connection resolution; migrations-from-zero; contract test suite | [`architecture/database-portability.md`](architecture/database-portability.md) |
| **Country deployment matrix** — decisions tracked separately from code, unknowns marked TBD/UNVERIFIED/PENDING_*, new-country bootstrap workflow | [`architecture/country-deployment-matrix.md`](architecture/country-deployment-matrix.md) |
| **Assurance Claim Registry** — 15 seed entries, honest statuses (technical entries PENDING at Phase 0.5) | [`security/assurance-claims.md`](security/assurance-claims.md) |
| Terraform multi-provider structure — `modules/contracts/` · `providers/{gcp,aws}/` · `deployments/qa/{dev,staging,production}/` | [`../infra/terraform/README.md`](../infra/terraform/README.md) |

## 3. Canonical documents updated

overview · backend · data-model · tenancy · jurisdiction-policy · operating-entity (ADR) · capability-map · white-label · sealed-data · secrets · threat-model-adjacent rules · ai · environments · deployment-topology (cloud-neutral ladder; **L3 = dedicated cloud account/project/subscription**, not "GCP project") · **gcp-target reframed as the GCP provider profile** · scenarios A and D · roadmap (Phase 0.5 row; Phase 17 provider-neutral; Phase 1 from fresh `main`) · onboarding (+Q31; greenfield in Q29) · glossary · CONTRIBUTING · MODULE template · `modules/users` and `modules/zakat` ownership docs · ADR README.

## 4. Exit criteria (§35)

| Criterion | Status |
|---|---|
| D1–D6 marked RESOLVED | ✅ §1 |
| Zakat integrated into capability map | ✅ registry table + gates |
| Subject-policy seam canonical | ✅ ADR-0015; mechanism/content split |
| Key custody/recovery canonical | ✅ ADR-0017 |
| White-label data/control plane distinction canonical | ✅ |
| Legal-document transition canonical | ✅ ADR-0024 |
| Data lifecycle canonical | ✅ ADR-0026 |
| 26 architecture tests canonical | ✅ + related DB contract suite pointer |
| 26 ADRs numbered continuously 0001–0026 | ✅ renumbering recorded in ADR README, deltas banner, phase-0-completion notes |
| Greenfield rule documented | ✅ |
| Infrastructure portability documented | ✅ |
| Database portability documented | ✅ |
| DeploymentProfile documented | ✅ |
| Country deployment matrix created | ✅ — unknowns marked, nothing invented |
| Topology ladder cloud-neutral | ✅ ADR-0023 amended |
| Terraform design multi-provider-capable | ✅ structure only; nothing provisioned |
| Control plane cloud-neutral | ✅ infrastructure-portability §13 — provider ops behind adapters, no cloud console through Admin |
| Internal links pass | ✅ see §5 |
| Diagrams render | ✅ mermaid blocks unchanged in kind; new diagram added (§4 of infrastructure-portability) |
| No contradictory rule across canonical documents | ✅ deltas marked historical; stale numbering lines fixed; one-home-per-rule table in [`phase-0-completion.md` §6](phase-0-completion.md) extended by the four new canonical homes |
| `plan-v2-deltas.md` marked RESOLVED / HISTORICAL | ✅ banner with per-delta canonical homes |

## 5. Verification

- **Link check:** all internal markdown links resolve (run at consolidation close; count recorded in the commit message).
- **Token sweep:** no occurrences remain of `ORPHANED_BY_DESIGN`, `ANONYMISE`, bare-`CASCADE` strategy names, `ADR-0027`, `SubjectPolicyProfile`, or "0026 is deliberately unused" outside historical annotations.
- **Cloud-neutrality grep:** no "GCP project" as an L3 definition; no GCP-specific requirement outside the provider profile and provider directories.

## 6. What Phase 0.5 explicitly did not do

| | |
|---|---|
| Redesign anything approved | Consolidation only |
| Write application code | Phase 1 |
| Copy legacy implementation | Greenfield rule |
| Provision GCP or AWS | No account exists; matrix says so |
| Implement provider adapters or the AWS stack | Ports and structure only |
| Build the migration engine | Contract documented only |
| Decide any TBD in the matrix | Decisions require evidence, not imagination |

## 7. Next

Per the Phase 0.5 instruction: commit on the architecture branch, push, **open a PR into `main`** titled *"Karar V2: greenfield architecture foundation and legacy audit"* — and **stop**. The PR is not merged automatically. Phase 1 begins from fresh updated `main` on `claude/karar-v2-phase-1-foundation`, never on the architecture branch.
