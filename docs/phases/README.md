# Phase Reports

One report per phase, named `phase-NN.md`, written from [`PHASE_TEMPLATE.md`](PHASE_TEMPLATE.md). A phase report is the durable record of what a phase actually did: its scope, what changed, what was tested, what evidence it produced, and what it deliberately left undone. Reports are written during the phase and completed at phase close — never reconstructed later, because reconstruction is where drift starts.

Phase reports state facts with evidence, decisions with their ADRs, and unknowns as unknowns, per the [documentation style guide](../documentation-style-guide.md). A report that says "done" without saying what was executed and what the result was is incomplete.

## The phase-end update ritual

Every phase closes with a single documentation pass, in the phase's closing PR. These files must change at every phase end:

| File | Change |
|---|---|
| Root [`README.md`](../../README.md) | Status block: current phase, last completed phase |
| [`../roadmap.md`](../roadmap.md) | The phase row's status |
| `phase-NN.md` (this directory) | The report, complete — no template section left empty (write "none" where true) |
| [`../onboarding/developer.md`](../onboarding/developer.md) | Only if commands, workflows, or answers changed |
| [`../compliance/evidence-register.md`](../compliance/evidence-register.md) | Every piece of evidence the phase produced, registered |

A phase is not complete while any of these is stale. The list is also stated in the [style guide §8](../documentation-style-guide.md); this document is its canonical home for *how* the ritual runs.

## Phase gates and the compliance gate

A phase has two gates, and both must pass:

1. **Engineering gate** — the phase's deliverables exist, its tests and builds pass, and the update ritual above is done. The "Next-phase entry criteria" section of the report states what the following phase requires; the following phase does not start until they hold.
2. **Compliance gate** — the phase's control and evidence obligations are met, per [`../compliance/phase-compliance-gate.md`](../compliance/phase-compliance-gate.md). The report's "SOC 2 mapping", "ISO 27001 mapping", and "Evidence produced" sections are the input to that gate; the compliance gate document defines what each phase owes.

The two gates are deliberately separate documents with separate owners: engineering completion does not imply compliance completion, and neither implies any certification — see the honest-status rule in the [style guide §4](../documentation-style-guide.md).

## Reports

| Report | Phase |
|---|---|
| [`phase-01.md`](phase-01.md) | 1 — Foundation: monorepo, tooling, Compose, CI, architecture tests, docs |
| [`phase-02.md`](phase-02.md) | 2 — Platform and data foundation: PostgreSQL, kernel, audit, events/outbox/jobs, observability |
| [`phase-03.md`](phase-03.md) | 3 — Identity, tenancy and access control: authentication, sessions, users, tenancy, RLS, RBAC, consent, kill switches |
| [`phase-03-5.md`](phase-03-5.md) | 3.5 — Jurisdiction and capability foundation: Country/Jurisdiction, PolicyPacks, availability, entitlements, tenant binding, bootstrap |

Phases 0 and 0.5 predate this template; their records are [`../phase-0-completion.md`](../phase-0-completion.md) and [`../phase-05-consolidation.md`](../phase-05-consolidation.md).
