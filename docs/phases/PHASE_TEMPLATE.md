# Phase NN — Title

Copy this file to `phase-NN.md` at phase start and fill it as the phase runs. Every section is required; write "none" where that is the truth. Delete the guidance lines when the report is written.

---

## Objective

One or two sentences: what this phase exists to achieve, traceable to its [roadmap](../roadmap.md) row.

## Scope

What is in — the concrete workstreams and areas this phase touches.

## Out of scope

What is deliberately not done in this phase, especially things a reader might assume are included.

## Agent/workstream ownership

Table of workstream → owner (person or agent role) → responsibility, so every deliverable has exactly one accountable owner.

## Deliverables

The artifacts the phase produces — files, tools, pipelines, documents — each with its location in the repository.

## Architecture changes

Changes to the approved architecture, with links; "none — foundation/implementation within the approved architecture" when true.

## ADRs added/amended

List new or superseding ADRs by number and title; "none" if the decision record is unchanged.

## Code and package changes

Which apps, packages, and modules gained or changed code, at the level of what a reviewer needs to navigate the diff.

## Database migrations

Migrations added this phase, with their IDs and rollback notes; "none" if the schema is untouched.

## API changes

Endpoints or contract changes, additive vs breaking, with the `api-contracts` diff reference; "none" when the surface is unchanged.

## Security controls

Controls introduced, changed, or activated this phase, each linked to its canonical security document.

## SOC 2 mapping

Which SOC 2 criteria the phase's controls address, by control ID from the [control matrix](../compliance/control-matrix.md) — mapping, not a compliance claim.

## ISO 27001 mapping

Which ISO/IEC 27001 controls the phase addresses, by control ID from the [control matrix](../compliance/control-matrix.md) — mapping, not a certification claim.

## Evidence produced

Each evidence artifact (report, log, screenshot, output) with its [evidence register](../compliance/evidence-register.md) entry and an evidence label (CODE / RUNTIME / INFRASTRUCTURE / ABSENT).

## Tests executed

Which suites ran, where (local / CI), and their results with counts — executed tests only, never planned ones.

## Build results

What was built (apps, images, artifacts), where, and the outcome, including anything that did not build.

## Known limitations

Present-tense honest limits of what was delivered — things that work partially, only locally, or not yet.

## Accepted risks

Risks knowingly carried forward, each with a named owner and, where it exists, its risk-register entry.

## Deferred work

Work identified but deliberately pushed to a later phase, with the target phase where one is known.

## Documentation updated

The phase-end ritual checklist from [`README.md`](README.md): README status block, roadmap, this report, onboarding (if commands changed), evidence register — each marked done.

## Next-phase entry criteria

The conditions the next phase requires before it may start; the next phase's report verifies them.
