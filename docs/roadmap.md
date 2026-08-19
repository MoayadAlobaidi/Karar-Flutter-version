# Roadmap

**The critical path to a shippable Qatar B2C v1 is Phases 0–9.**
Phases 10–21 are an architectural **option, not a schedule**. The seams are what keep that option cheap.

---

## Phases

| Phase | Content | Δ from Plan v1 |
|---|---|---|
| **0** | Architecture, ADRs, capability map, domain map, docs skeleton, **legacy audit** | **COMPLETE** |
| **0.5** | **Final consolidation** — D1–D6 canonical, ADRs continuous 0001–0026, greenfield rule, `DeploymentProfile` + multi-cloud portability, PostgreSQL provider portability, country deployment matrix, cloud-neutral ladder, Assurance Claim Registry | **COMPLETE** |
| **1** | Monorepo, tooling, Compose, CI, **architecture tests**, docs; Terraform `deployments/qa/{dev,staging,production}` compositions | **COMPLETE** (2026-08-15, [report](phases/phase-01.md)) |
| **2** | Config, PostgreSQL, migrations, health, errors, observability, **audit**, event bus + **catalogue**, **outbox**, jobs, `shared-kernel`, **data classification**, **key rotation design** | **COMPLETE** (2026-08-16, [report](phases/phase-02.md)) |
| **3** | Identity, users, tenancy, **operating-entity**, RBAC, consent + **re-consent evaluation**, sessions, kill switches, **PostgreSQL RLS**, adversarial cross-tenant tests | **COMPLETE** (2026-08-16, [report](phases/phase-03.md)) |
| **3.5** | **Jurisdiction & Capability Foundation** — Country/Jurisdiction, PolicyPack `qa/v1`, resolution-strategy registry, **`SubjectPolicySelection` mechanism**, capability registry, availability model, entitlements, **session tenant binding + bootstrap** | **COMPLETE** (2026-08-16, [report](phases/phase-03-5.md)) |
| **4** | **Flutter and mobile security foundation** — app architecture and startup state machine, generated Dart API client with drift detection, authentication and session UX, secure token storage, application lock and biometrics, tenant selection and switching, jurisdiction self-declaration, capability-aware navigation, consent surface, design system, **Arabic RTL first-class**, accessibility, Android and iOS build guards, **runtime response conformance against the contract** | **COMPLETE — merged** ([report](phases/phase-04.md), merge commit `457bd4e`) — implementation, internal gates and merge done; still **no signed build, no deployed endpoint, and biometrics unverified on any device** |
| **5** | Financial data platform — institutions, connectors, accounts, transactions, normalization, dedup, provenance, categorization; **manual + CSV `IMPLEMENTED`**; **erasure strategies enforced** — **IN PROGRESS** ([report](phases/phase-05.md)); six financial modules plus `provider-capabilities` behind migrations 0087-0101, reached by **27 operations over 21 `/financial/*` paths**, with manual entry and CSV statement import both running and `currentPhase` moved to 5 alongside architecture test 24. The Flutter surface was built later in the phase — seven feature folders, every route capability-gated. Still open: **no file picker adapter, so a statement cannot be chosen on a device**, no provider connector, nothing deployed, retention unresolved, and account deletion deliberately not exposed over HTTP | +erasure |
| **6** | **Financial engine** — calculators, rulesets, jurisdiction selection, **VerifiedFinancialFacts**, exhaustive tests — **NOT STARTED** | |
| **7** | AI platform — provider port, mock, orchestrator, **facts-based context**, prompt registry, router, tools, **AiResponseValidator**, audit/usage | |
| **8** | **Control Plane + Super Admin P1** — gateway contract, admin RBAC, navigation shell, **projections**, Overview/Ops/Flags/AI-usage/Users-read | |
| **9** | **Consumer features** — **Zakat**, savings plans and goals, loan tracking, notifications | **+Zakat** |
| **10** | Subscriptions & entitlements — `SubscriptionBillingProvider` port + first implementation | rail deferred |
| **11** | White label — **control plane *and* data plane**: brand config, tokens, flavors, tenant entitlements, branded release pipeline, demo bank tenant | **data plane costed** |
| **12** | API / SDK / partner auth / webhooks | |
| **13** | **Documents + Sealed Vault + state-machine helper** — Amanat prerequisites; **key custody strategy and canary designed** | `ADDED` |
| **14** | **Amanat** — gated on legal clearance; ships `PENDING_LEGAL_REVIEW` until cleared | `ADDED` |
| **15** | Embedded Flutter | |
| **16** | Operations, support, marketing, analytics, privacy flows, data export + erasure surfaces | |
| **17** | Cloud infrastructure — the QA `DeploymentProfile`'s provider (GCP is the candidate; **UNVERIFIED** in the [country deployment matrix](architecture/country-deployment-matrix.md)), when an account exists | provider-neutral |
| **18** | DEV deployment | |
| **19** | **STAGING** — mandatory, precedes production | |
| **20** | Production readiness — see gates below | |
| **21** | Production launch | |

Per-phase completion reports live in [`phases/`](phases/README.md); the Phase 1 report is [`phases/phase-01.md`](phases/phase-01.md).

## Phase 9 scope

Derived from the Phase 0.2 legacy audit — see [`legacy/feature-inventory.md` §18](legacy/feature-inventory.md).

1. **Zakat** — quick estimate, reference values, full assessment engine, asset and liability ledgers, hawl, preferences, jurisprudential settings register, Sadaqah tracker
2. Savings plans, goals, savings planner and affordability
3. Loan tracking
4. Notifications (in-app; push deferred behind `NotificationChannel`)

Everything else in the consumer product is delivered *by* the platform phases: money-in at Phase 5, insight at Phase 6, AI at Phase 7.

**Zakat is the one addition arising from the audit, and it is a Phase 9 consumer capability rather than platform work — it does not move Phases 1–8.**

## Phase 20 production gates

All must hold before launch:

| Gate | |
|---|---|
| Separate staging environment | Provisioned and exercised |
| Separately deployed control plane | Independent credentials |
| **Sealed vault extracted** to its own security boundary | Before any production `SEALED` data |
| **Approved key-custody strategy (ADR-0017)** — recovery/continuity tested, drill rehearsed where applicable | Before any production `SEALED` data |
| **Sealed-integrity canary running** | Staging and production |
| **Independent** security assessment | By a party that did not build the system |
| Penetration test | Executed, not merely scoped |
| Regulatory review | |
| Data-residency determination | |
| DR runbook **executed**, RTO **measured** | |
| SLOs and alert rules live, with **on-call rotation and escalation** | A single recipient is not on-call |
| Risk-acceptance register | Written, with named owners |
| Backup restore including **application recovery** | Not only a data restore |

## Non-engineering gates

These are not made obsolete by a rewrite and belong on the pre-launch list.

| Gate | Blocks | Owner |
|---|---|---|
| **Amanat legal clearance, per jurisdiction** | Phase 14 | Legal |
| Amanat domain terminology review | Phase 14 | Legal + domain |
| **Zakat Sharia review — none exists** | Zakat launch | External |
| Per-capability policy-resolution strategy selection | Phase 13 | **Legal, not engineering** |
| Operating-entity and licensing decision, per market | Each market launch | Legal |
| Data-residency legal opinion | Production | Legal |
| DPAs with every processor | Production | Legal |
| Counsel review of the privacy policy | Production | Legal |
| **Arabic legal translation by a legal translator** | Production | External |
| Retention decision — minimums, maximums, and whether they differ for an original statement file versus derived transactions | Phase 5 policy | Legal + regulator |

## Phase 1 starts from zero, on a fresh branch

Phase 1 begins from an updated `main` after the architecture PR merges — branch `claude/karar-v2-phase-1-foundation`, **not** a continuation of the architecture branch. Its first executable artifacts come from these documents and the ADRs; **no legacy file is copied** ([greenfield rule](architecture/greenfield-rule.md)).

## Solo-capacity honesty

Phases 0–9 are a coherent, shippable product. Phases 10–21 are an option.

**The seams are what keep that option cheap** — and the test for any seam remains *"would retrofitting this be expensive?"*, never *"might we want this?"*
