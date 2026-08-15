# ADR-0027 — Data lifecycle: retention, erasure, and ownerless derived data

**Status:** ACCEPTED · **Phase:** 5 (enforced), 0.7 (template)
**Origin:** raised by the Phase 0.2 legacy audit. See [`../architecture/plan-v2-deltas.md` D5](../architecture/plan-v2-deltas.md).

## Context

Erasure designs assume records have owners. That holds for transactions, budgets, goals, and Amanat records. It does not hold for everything a financial platform produces.

The legacy discovered this during an erasure review rather than at design time:

- **P7** — one production table holds statement-derived data **belonging to no user**, and therefore cannot be erased on request.
- **P5** — the data export omits whole categories of the customer's own data *while its coverage block claims to name everything it omits*.
- **P8** — nothing but the raw statement file has a retention schedule; everything else is kept for the life of the account.

Karar's Phase 5 builds normalisation, dedup, provenance, and categorisation; Phase 8 builds projections. All of these routinely produce data derived from a subject without belonging to one — merchant rule corpora, dedup fingerprints, normalisation dictionaries, aggregate projections.

## Decision

**Every table declares an erasure strategy at design time**, recorded in its module's `MODULE.md` and asserted by **architecture test 25**.

| Strategy | Meaning |
|---|---|
| `CASCADE` | Deleted with the owning subject |
| `ANONYMISE` | Subject linkage severed; the row survives without it |
| `RETAIN_WITH_BASIS` | Retained, with a stated legal basis and retention period |
| `ORPHANED_BY_DESIGN` | Deliberately ownerless from creation, with a stated reason and a demonstration it cannot be re-identified |

> **`ORPHANED_BY_DESIGN` is a decision requiring justification, not a description of an accident.**

**Retention durations come from the PolicyPack**, per jurisdiction — not from a constant in the code.

**Data export must reconcile with the declared strategies.** A category the export omits must be one the strategies explain.

## Consequences

**Positive**

- Ownerless data is a deliberate, justified choice made at design time rather than a discovery during a data-subject request.
- Erasure and export are derivable from declarations rather than from an audit of every table.
- Retention becomes a policy decision with a jurisdiction attached.
- `ORPHANED_BY_DESIGN` requiring a re-identification argument makes the privacy question explicit at the moment the shape is created.

**Negative — accepted**

- Every new table needs a declaration, and CI blocks without one.
- Some declarations are genuinely hard — dedup fingerprints derived from a subject's data are the awkward case, and forcing the argument is the point.
- Retention from policy means a jurisdiction without a retention clause blocks, rather than silently defaulting.

## Alternatives rejected

**Implicit erasure by cascading foreign keys.** Rejected: it silently misses every table without an owner FK, which is exactly the legacy's P7.

**A retention constant in code.** Rejected on the legacy's evidence — its 90-day window was *"chosen because a number was needed"*, and whether retention minimums or maximums even apply is still an open regulatory question.

**Handling erasure at Phase 16 with the privacy flows.** Rejected: by then Phases 5 and 8 will have created the ownerless shapes. The declaration is cheap at design time and expensive as an audit.

**Extending ADR-0025 (event governance) instead.** Rejected: that ADR governs events; this governs tables. Different artefacts, different enforcement, different reviewers.

**Allowing `ORPHANED_BY_DESIGN` without a re-identification argument.** Rejected: without it the strategy becomes a label for "we did not think about this", which is the failure it exists to prevent.
