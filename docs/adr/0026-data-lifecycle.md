# ADR-0026 — Data lifecycle: subject relationship, purpose, retention, export, and erasure

**Status:** ACCEPTED · **Phase:** 5 (enforced), 0.7 (template)
**Origin:** raised as delta D5 by the Phase 0.2 legacy audit; numbered 0027 during Phase 0 and renumbered 0026 in the Phase 0.5 consolidation so the ADR sequence is continuous.

## Context

Erasure designs assume records have owners. That holds for transactions, budgets, goals, and Amanat records. It does not hold for everything a financial platform produces.

The legacy discovered this during an erasure review rather than at design time:

- **P7** — one production table holds statement-derived data **belonging to no user**, and therefore cannot be erased on request.
- **P5** — the data export omits whole categories of the customer's own data *while its coverage block claims to name everything it omits*.
- **P8** — nothing but the raw statement file has a retention schedule; everything else is kept for the life of the account.

Karar's Phase 5 builds normalisation, dedup, provenance, and categorisation; Phase 8 builds projections. All of these routinely produce data derived from a subject without belonging to one — merchant rule corpora, dedup fingerprints, normalisation dictionaries, aggregate projections.

## Decision

**Every persistent dataset declares its lifecycle at design time**, recorded in its module's `MODULE.md` and asserted by **architecture test 25**. The declaration has six fields:

| Field | Declares |
|---|---|
| **Subject relationship** | Whose data this is: `SUBJECT_OWNED`, `SUBJECT_DERIVED`, `AGGREGATE`, or `NON_PERSONAL` |
| **Purpose** | Why it is held — the processing purpose it serves |
| **Classification** | One of the six data classes |
| **Retention** | Duration and its source — **from the PolicyPack, per jurisdiction; never a constant in code** |
| **Export treatment** | Included in the subject's data export, excluded with a stated reason, or not applicable |
| **Erasure strategy** | One of the four below |

**Erasure strategies:**

| Strategy | Meaning |
|---|---|
| `CASCADE_DELETE` | Deleted with the owning subject |
| `ANONYMIZE_IRREVERSIBLY` | Subject linkage severed **irreversibly**; the row survives without it |
| `RETAIN_WITH_BASIS` | Retained, with a stated legal basis and retention period |
| `NON_PERSONAL_BY_DESIGN` | Deliberately holds no personal data from creation, with a stated reason and a demonstration it cannot be re-identified |

> **`NON_PERSONAL_BY_DESIGN` is a decision requiring justification, not a description of an accident.**

**Pseudonymization is not anonymization.** Data whose subject linkage can be restored — via a lookup table, a reversible token, or a join — remains personal data and cannot claim `ANONYMIZE_IRREVERSIBLY` or `NON_PERSONAL_BY_DESIGN`. Claiming either requires a re-identification argument, not a renaming.

**Data export must reconcile with the declared treatments.** A category the export omits must be one whose declaration explains the omission — the legacy's export claimed completeness while omitting whole categories (P5).

## Consequences

**Positive**

- Ownerless data is a deliberate, justified choice made at design time rather than a discovery during a data-subject request.
- Erasure and export are derivable from declarations rather than from an audit of every table.
- Retention becomes a policy decision with a jurisdiction attached.
- The pseudonymization rule closes the most common false-anonymity claim before it is made.

**Negative — accepted**

- Every new dataset needs a six-field declaration, and CI blocks without one.
- Some declarations are genuinely hard — dedup fingerprints derived from a subject's data are the awkward case, and forcing the argument is the point.
- Retention from policy means a jurisdiction without a retention clause blocks, rather than silently defaulting.

## Alternatives rejected

**Implicit erasure by cascading foreign keys.** Rejected: it silently misses every table without an owner FK, which is exactly the legacy's P7.

**A retention constant in code.** Rejected on the legacy's evidence — its 90-day window was *"chosen because a number was needed"*, and whether retention minimums or maximums even apply is still an open regulatory question (legacy M6).

**Erasure strategy alone, without purpose and export treatment (the Phase 0 shape of this ADR).** Superseded in Phase 0.5: erasure answers only one of the questions a data-subject request asks. Purpose and export treatment are the other two, and declaring them in the same place is what lets export completeness be checked rather than claimed.

**Treating pseudonymized data as anonymous.** Rejected explicitly — see the rule above.

**Handling erasure at Phase 16 with the privacy flows.** Rejected: by then Phases 5 and 8 will have created the ownerless shapes. The declaration is cheap at design time and expensive as an audit.

**Extending ADR-0025 (event governance) instead.** Rejected: that ADR governs events; this governs persistent datasets. Different artefacts, different enforcement, different reviewers.
