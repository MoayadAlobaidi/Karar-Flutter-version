# ISMS Scope

**Status:** DRAFT · **Owner:** Compliance Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** Phase 17 (cloud), Phase 20 (production), each gate between

---

## Scope statement

> The information security management system covers **the development of the Karar platform**: the source repository and documentation corpus, the CI/CD pipeline that builds and gates it, the local development environment, the accounts and endpoints used to produce them, and the compliance and evidence apparatus in `docs/compliance/`. It is operated by the roles defined in [control-owners.md](../control-owners.md) under the policies in [`docs/policies/`](../../policies/).

The scope is deliberately a **development-organization scope**, because that is what exists. It widens by explicit amendment as phases deliver more reality — not by silent assumption.

## Context (Clause 4 inputs)

- **The organization:** a solo-founder engineering effort building a Qatar-first fintech platform; roles per control-owners.md; single-person reality stated there.
- **Interested parties and their requirements:** future customers (confidentiality, financial correctness); future regulators (residency, licensing — open questions the roadmap gates); legal counsel (Amanat clearance, Sharia review — pending); vendors (register); a future certification body and auditor.
- **Internal issues:** solo capacity (KAR-RSK-001/002), documentation-first culture (a strength and a drift risk, KAR-RSK-010).
- **External issues:** undetermined data residency (KAR-RSK-006), supply-chain exposure (KAR-RSK-004), single-vendor dependence (KAR-RSK-011).
- **Climate consideration (Amd 1:2024):** assessed as not currently material — a documentation-and-tooling effort with no facilities or infrastructure. Recorded as considered; revisited when physical/cloud operations exist (Phase 17), where provider-region climate resilience becomes a real input.

## Interfaces and dependencies

| Interface | Nature |
|---|---|
| GitHub | SCM, CI execution, interim evidence references — inside scope as used, vendor-operated as a service ([vendor register](../vendor-and-subprocessor-register.md)) |
| Package registries (npm, pub.dev, Docker Hub) | Inbound dependency supply — controlled at the boundary by KAR-CTL-025–028 |
| Legal/external reviewers (counsel, Sharia reviewer, future auditor) | Outbound consultations; their outputs gate phases but they are not ISMS operators |
| Legacy Qarar repository | **Evidence and requirements source only** — read, never executed, never a code source (greenfield rule) |

## Exclusions, with reasons

| Excluded | Reason |
|---|---|
| Production operation of the Karar platform | **No production exists.** Enters scope at Phases 20–21 by amendment, behind the roadmap's hard gates |
| Cloud infrastructure and its facilities | No cloud account exists (Phase 17); when it does, provider facilities are the provider's scope, consumed per the [shared-responsibility model](../shared-responsibility-model.md) |
| Physical premises controls | No offices or facilities are operated; the sole physical asset is one developer workstation, covered by the acceptable-use policy (SoA 7.x records the N/A set) |
| Customer data processing | No customers, no personal data held (KAR-CTL-038); privacy-processing controls activate Phases 3–16 |
| The legacy Qarar system | Outside the organization's V2 boundary; findings feed requirements only |

An exclusion here is a statement that the subject **does not exist to manage**, never that it is managed informally. Each names the phase at which it stops being true, and the scope is re-approved at that phase's gate.
