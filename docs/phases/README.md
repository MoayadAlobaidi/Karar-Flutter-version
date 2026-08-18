# Phase Reports

One report per phase, named `phase-NN.md`, written from [`PHASE_TEMPLATE.md`](PHASE_TEMPLATE.md). A phase report is the durable record of what a phase actually did: its scope, what changed, what was tested, what evidence it produced, and what it deliberately left undone. Reports are written during the phase and completed at phase close — never reconstructed later, because reconstruction is where drift starts.

Phase reports state facts with evidence, decisions with their ADRs, and unknowns as unknowns, per the [documentation style guide](../documentation-style-guide.md). A report that says "done" without saying what was executed and what the result was is incomplete.

## The phase-end update ritual

Every phase closes with a single documentation pass, in the phase's closing PR. These files must change at every phase end:

| File | Change |
|---|---|
| Root [`README.md`](../../README.md) | Status block: current phase, last completed phase |
| [`../roadmap.md`](../roadmap.md) | The phase row's status |
| This file's [report index](#reports) | The phase's row, so the index does not disagree with the roadmap about the same phase |
| `phase-NN.md` (this directory) | The report, complete — no template section left empty (write "none" where true) |
| [`../onboarding/developer.md`](../onboarding/developer.md) | Only if commands, workflows, or answers changed |
| [`../compliance/evidence-register.md`](../compliance/evidence-register.md) | Every piece of evidence the phase produced, registered |

A phase is not complete while any of these is stale. The list is also stated in the [style guide §8](../documentation-style-guide.md); this document is its canonical home for *how* the ritual runs.

## Phase gates and the compliance gate

A phase has two gates, and both must pass:

1. **Engineering gate** — the phase's deliverables exist, its tests and builds pass, and the update ritual above is done. The "Next-phase entry criteria" section of the report states what the following phase requires; the following phase does not start until they hold.
2. **Compliance gate** — the phase's control and evidence obligations are met, per [`../compliance/phase-compliance-gate.md`](../compliance/phase-compliance-gate.md). The report's "SOC 2 mapping", "ISO 27001 mapping", and "Evidence produced" sections are the input to that gate; the compliance gate document defines what each phase owes.

The two gates are deliberately separate documents with separate owners: engineering completion does not imply compliance completion, and neither implies any certification — see the honest-status rule in the [style guide §4](../documentation-style-guide.md).

## What "COMPLETE" means on a phase row

Stated once here, because it is the word most easily misread and every phase row and status block relies on it.

**COMPLETE means:** the phase's deliverables exist in this repository, its tests and builds were executed with recorded results, both of its gates passed, and the update ritual above is done.

**COMPLETE does not mean** merged, deployed, running anywhere, production ready, app-store ready, signed, penetration-tested, legally reviewed, or certified against any framework. A phase report that reads as though it does is a defect in the report. Where a phase's claim rests on static or artifact inspection rather than on a running system or a real device, its report says so in its own words — [`phase-04.md`](phase-04.md) is the worked example, because a mobile client is where the gap between "the mechanism exists" and "it was seen to work" is widest.

## Reports

| Report | Phase |
|---|---|
| [`phase-01.md`](phase-01.md) | 1 — Foundation: monorepo, tooling, Compose, CI, architecture tests, docs |
| [`phase-02.md`](phase-02.md) | 2 — Platform and data foundation: PostgreSQL, kernel, audit, events/outbox/jobs, observability |
| [`phase-03.md`](phase-03.md) | 3 — Identity, tenancy and access control: authentication, sessions, users, tenancy, RLS, RBAC, consent, kill switches |
| [`phase-03-5.md`](phase-03-5.md) | 3.5 — Jurisdiction and capability foundation: Country/Jurisdiction, PolicyPacks, availability, entitlements, tenant binding, bootstrap |
| [`phase-05.md`](phase-05.md) | 5 — Financial data platform: institutions, connectors, accounts, transactions, normalization, dedup, provenance, categorization; manual and CSV ingestion; erasure strategies enforced | **IN PROGRESS — just opened, nothing built** |
| [`phase-04.md`](phase-04.md) | 4 — Flutter and mobile security foundation: app architecture and startup state machine, generated API client with drift detection, authentication and session UX, secure storage, application lock, tenant selection, jurisdiction self-declaration, capability-aware navigation, consent surface, design system, Arabic RTL, accessibility, Android and iOS build guards, runtime response conformance. **COMPLETE — merged** |

Phases 0 and 0.5 predate this template; their records are [`../phase-0-completion.md`](../phase-0-completion.md) and [`../phase-05-consolidation.md`](../phase-05-consolidation.md).
