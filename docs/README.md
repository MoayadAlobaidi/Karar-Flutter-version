# Karar Documentation

**Phase 3 — identity, tenancy and access control in progress.** Backend platform foundation (Phase 2) plus authentication, sessions, users, tenancy, RBAC, consent, and kill switches; no consumer product capability is implemented. Current status lives in the [root README status block](../README.md#status).

---

## Start here

[`architecture/overview.md`](architecture/overview.md) — the entry point. Everything else expands one part of it.

New to the project: [`onboarding/developer.md`](onboarding/developer.md).
Looking up a term: [`glossary.md`](glossary.md).

## Architecture

| Document | Covers |
|---|---|
| [overview](architecture/overview.md) | The whole system in one document |
| [clean-architecture](architecture/clean-architecture.md) | Layers, the dependency rule, enforcement |
| [backend](architecture/backend.md) | NestJS structure, module anatomy, entrypoints |
| [flutter](architecture/flutter.md) | Client architecture, RTL, capability-aware navigation |
| [data-model](architecture/data-model.md) | Schemas, pinning, money, classification |
| [tenancy](architecture/tenancy.md) | Four isolation layers; RLS is the boundary |
| [jurisdiction-policy](architecture/jurisdiction-policy.md) | PolicyPacks, restrict-only settings, resolution, subject profiles |
| [operating-entity](architecture/operating-entity.md) | Legal person, controller/processor, entity migration |
| [capability-registry](architecture/capability-registry.md) | Descriptors, availability, deny-by-default |
| [extension-pattern](architecture/extension-pattern.md) | How to add a capability; the seventeen-point checklist |
| [sealed-data](architecture/sealed-data.md) | `SEALED`, the vault, grants, key custody |
| [disclosure](architecture/disclosure.md) | Disclosure ≠ access; approval policy; safety properties |
| [event-governance](architecture/event-governance.md) | Catalogue, payload rules by classification |
| [financial-engine](architecture/financial-engine.md) | Calculators, rulesets, verified facts |
| [ai](architecture/ai.md) | Provider port, facts-based context, numeric safety |
| [capability-map](architecture/capability-map.md) | Capability × context × owner × availability |
| [white-label](architecture/white-label.md) | Control plane and data plane |
| [sdk-strategy](architecture/sdk-strategy.md) | OpenAPI-first, generated SDKs, capability scoping |
| [environments](architecture/environments.md) | LOCAL → DEV → STAGING → PRODUCTION |
| [deployment-topology](architecture/deployment-topology.md) | The L0–L3 ladder — cloud-neutral |
| [infrastructure-portability](architecture/infrastructure-portability.md) | **DeploymentProfile, provider ports, opaque refs, the definition of portable** |
| [database-portability](architecture/database-portability.md) | **PostgreSQL provider portability — and its honest limit** |
| [country-deployment-matrix](architecture/country-deployment-matrix.md) | **Provider per jurisdiction — decisions, not assumptions** |
| [greenfield-rule](architecture/greenfield-rule.md) | **V2 from scratch; the legacy is knowledge, never code** |
| [gcp-target](architecture/gcp-target.md) | The GCP provider profile — Qatar candidate, not a domain dependency |
| [data-residency](architecture/data-residency.md) | The open question, and the seam that keeps it answerable |
| [plan-v2-deltas](architecture/plan-v2-deltas.md) | **Amendments arising from the legacy audit** |

## Decisions

[`adr/`](adr/README.md) — **26 records**, each with context, decision, consequences, and alternatives rejected.

## Security

| Document | Covers |
|---|---|
| [threat-model](security/threat-model.md) | Assets, boundaries, ten threat classes, accepted risks |
| [data-classification](security/data-classification.md) | Six classes and the handling matrix |
| [access-control](security/access-control.md) | Roles, permissions, enforcement points |
| [secrets](security/secrets.md) | Key hierarchy, custody, rotation, the canary |
| [sealed-access](security/sealed-access.md) | Grant procedures, audit, incident response |
| [assurance-claims](security/assurance-claims.md) | The Assurance Claim Registry behind architecture test 26 |

## Compliance

| Document | Covers |
|---|---|
| [compliance/](compliance/README.md) | SOC 2 / ISO 27001 readiness: control matrix, evidence register, phase compliance gate. **Readiness, not certification** |
| [policies/](policies/README.md) | Written policies backing the control framework |

## Legacy

The Phase 0.2 audit of `MoayadAlobaidi/Qarar`. **Source-verified**, not reported.

| Document | Covers |
|---|---|
| [qarar-audit](legacy/qarar-audit.md) | What the legacy is, and the six findings that change the plan |
| [feature-inventory](legacy/feature-inventory.md) | Every capability, its legacy status, and its Karar disposition. **Phase 9 scope** |
| [reusable-assets](legacy/reusable-assets.md) | What transfers, graded A–F, and what deliberately does not |
| [security-findings](legacy/security-findings.md) | 128 findings, and what each means for Karar |

## Scenarios

Reproducible from the documentation alone — a Phase 0 exit criterion.

| Scenario | Question |
|---|---|
| [A — new country](scenarios/a-new-country.md) | What does a second country cost? |
| [B — add Amanat](scenarios/b-add-amanat.md) | Can a wholly unlike capability be added without touching what exists? |
| [C — white label](scenarios/c-white-label.md) | Can a partner run a branded subset and never see the rest? |
| [D — dedicated deployment](scenarios/d-dedicated-deployment.md) | What does full isolation cost? |

## Delivery

| Document | Covers |
|---|---|
| [roadmap](roadmap.md) | Phases 0–21, gates, and honest scope |
| [testing/architecture-tests](testing/architecture-tests.md) | The 26 CI-blocking tests |
| [documentation-style-guide](documentation-style-guide.md) | Binding rules for everything under `docs/`: vocabulary, ownership, diagrams, claim labelling |
| [phases/](phases/README.md) | Phase reports and the phase-end update ritual |
| [phases/PHASE_TEMPLATE](phases/PHASE_TEMPLATE.md) | The required structure of every phase report |
| [phases/phase-01](phases/phase-01.md) | Phase 1 report — foundation |
| [phases/phase-02](phases/phase-02.md) | Phase 2 report — platform and data foundation |
| [phases/phase-03](phases/phase-03.md) | Phase 3 report — identity, tenancy and access control (in progress) |
| [MODULE_TEMPLATE](MODULE_TEMPLATE.md) | Required for every module |
| [phase-0-completion](phase-0-completion.md) | Phase 0 exit-criteria verification |
| [phase-05-consolidation](phase-05-consolidation.md) | Phase 0.5 consolidation record — D1–D6 resolved, portability canonical |

---

## Conventions

**Evidence labels** on factual claims about a system: **CODE** (a file says so, and it was read) · **RUNTIME** (observed running) · **INFRASTRUCTURE** (a provider claim — *never* to be read as verified) · **ABSENT** (searched for, not found).

**Derive documentation from source**, not from the previous version of the document.
