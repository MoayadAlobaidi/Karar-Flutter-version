# Phase 5 — Financial data platform

**Branch:** `claude/karar-v2-phase-5-financial-foundation` · **Started:** 18 August 2026 · **Status:** IN PROGRESS
**Base:** Phase 4 post-merge record commit `2b0dfca` on `main`.

**This phase has just opened. Nothing in it is built.** Every section below states what the phase is for and what it has produced so far, and what it has produced so far is nothing. No field here is a completion claim, and none may be read as one until the work exists and its gates have run.

---

## Objective

Build the financial data platform named in [roadmap](../roadmap.md) row 5: institutions, connectors, accounts, transactions, normalization, deduplication, provenance and categorization, with manual and CSV entry `IMPLEMENTED` and erasure strategies enforced. It exists so that later phases have verified financial facts to compute on — Phase 6's engine and Phase 7's AI platform both read from what this phase establishes, and neither can be honest about a number this phase has not made traceable.

## Scope

The roadmap row, and nothing beyond it: institution and connector modelling; account and transaction records; normalization and deduplication; provenance for every stored value; categorization; manual and CSV ingestion as the first implemented paths; and the erasure strategies the data-lifecycle ADR requires being enforced rather than declared.

## Out of scope

Bank connections to any real provider. Budgets, goals, insights and scores. The financial engine's calculators and rulesets, which are Phase 6. AI of any kind, which is Phase 7. Zakat and Amanat. Subscriptions and billing. Super Admin and operator surfaces. Cloud, DNS, hosting, signing material and app-store records. Nothing in this list may be started here, and none of it becomes reachable in the client by being written — a capability becomes navigable only by being implemented, deployed, and then added to the navigable set.

## Agent/workstream ownership

Not yet allocated. The ownership ledger is written at the start of implementation, with non-overlapping write paths per workstream and the lead owning shared central files, as in Phases 3.5 and 4.

## Deliverables

None yet. This phase has opened and produced no code, schema, contract or test.

## Architecture changes

None yet. Any change to the protected architecture — Clean Architecture and inward dependencies, feature-first Flutter structure, API-first contracts, the generated Dart client, PostgreSQL as canonical store, RLS as the tenant-isolation boundary, provider-neutral domain and application layers, Country separate from Jurisdiction, OperatingEntity separate from Tenant, deny-by-default capability availability — requires an ADR and an architecture-test update before it is made, not after.

## ADRs added/amended

None yet.

## Code and package changes

None yet.

## Database migrations

None yet. The migration sequence stands at 38 files, `0001` through `0086`, as merged at the end of Phase 4.

## API changes

None yet. The contract stands at 35 operations across 34 merged paths, as merged at the end of Phase 4.

## Security controls

None yet. The controls this phase is expected to add — provenance integrity, erasure enforcement, ingestion input limits, and the tenant scoping of every new financial table — are named here so that their absence at close is visible rather than silent.

## SOC 2 mapping

Deferred to the [control matrix](../compliance/control-matrix.md) at close. **No SOC 2 attestation is claimed and no examination has been performed.**

## ISO 27001 mapping

Deferred to the [control matrix](../compliance/control-matrix.md) and the [statement of applicability](../compliance/iso27001/statement-of-applicability.md) at close. **No ISO/IEC 27001 certification is held, claimed, applied for or sought.**

## Evidence produced

None yet. Phase 5 evidence rows begin at EV-469; the Phase 4 range ended at EV-468.

## Tests executed

None yet for this phase. The inherited baseline at the merge is: workspace 1272 passed / 12 skipped; the `KARAR_INTEGRATION`-gated readiness and rate-limit-store suite 12 passed; runtime OpenAPI conformance 61 tests over 82 of 128 declared operation/status pairs; Flutter 1190 passed / 19 skipped as CI runs it; goldens 4; localization 36; mobile security 113 passed / 1 skipped; architecture 24 passed / 0 failed / 4 phase-deferred; documentation 13/13.

## Build results

None yet for this phase.

## Known limitations

Everything Phase 4 carried forward remains true and unfixed by opening this phase: **no build has run on a device**, so the biometric prompt has never been shown to appear; **no build is signed** and no signing material exists; **no Apple Team ID exists**, so cross-platform transfer is unverified on hardware; the compound credential-abandonment guarantee is local-only and closes with server-side revocation; golden baselines are not CI-enforced; runtime conformance covers 82 of 128 declared pairs; **EV-427 is `PENDING` and overdue**, with no DNS record, no Cloudflare proxy, WAF, Pages, Workers or Access configuration, and all seven registrar hardening rows still `TO_VERIFY`; and one maintainer holds every role.

## Accepted risks

None accepted by this phase yet. The register carries 41 rows at the Phase 4 close; Phase 5 risks are added as its surface is built.

## Deferred work

None deferred by this phase yet. The eleven active deferred items from the Phase 4 gate stand, item 8 having been discharged when the artifact lanes became required checks.

## Documentation updated

This report, the root README status block, the [roadmap](../roadmap.md) row, and the [phases index](README.md) — all as the phase-opening record only.

**The architecture-test registry's `currentPhase` is deliberately still 4, and that is a decision rather than an oversight.** Setting it to 5 makes architecture test 24 (resource limits declared) a live obligation, because the runner treats `currentPhase >= activationPhase` with no implementation as a registry error. Test 24's own activation criterion is that a first ingestion path — manual or CSV — exists, and none does: this phase has opened and built nothing. Implementing the test against an empty tree would make it scan nothing and pass vacuously, which is the exact failure this repository has already been bitten by three times. **`currentPhase` moves to 5 in the same change that lands the first ingestion path**, which is the moment test 24 becomes both required and meaningful.

## Next-phase entry criteria

Phase 6 begins only after this phase's PR merges and a new branch starts from the merge commit. It is not reachable from here, and no Phase 6 control, evidence row or capability is pre-activated by this document.
