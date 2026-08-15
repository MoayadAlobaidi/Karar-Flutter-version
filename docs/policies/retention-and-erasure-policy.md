# Retention and Erasure Policy

**Status:** DRAFT · **Owner:** Privacy Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 2 gate

## Scope

Every persistent dataset Karar will hold, plus the records the project holds today (repository, evidence). **The canonical mechanism is [ADR-0026](../adr/0026-data-lifecycle.md)** — the six-field lifecycle declaration (subject relationship, purpose, classification, retention, export treatment, erasure strategy); this policy binds to it and adds the operating rules.

## Purpose

Retention and erasure decided at design time, per dataset, per jurisdiction — because the legacy discovered ownerless data during an erasure review (P7), an export claiming completeness while omitting categories (P5), and retention that existed for exactly one artefact (P8). Karar's rule: no dataset without a declared lifecycle, no erasure design that assumes every record has an owner.

## Requirements

- **R1.** *Not yet operating — Phase 5 (CI-enforced from first persistent dataset):* every persistent dataset declares all six lifecycle fields in its module's `MODULE.md`; architecture test 25 blocks without it (KAR-CTL-037).
- **R2.** Erasure strategies are exactly ADR-0026's four — `CASCADE_DELETE`, `ANONYMIZE_IRREVERSIBLY`, `RETAIN_WITH_BASIS`, `NON_PERSONAL_BY_DESIGN` — and pseudonymized data may not claim the last two: restorable linkage is personal data. A `NON_PERSONAL_BY_DESIGN` claim carries a re-identification argument, not a renaming.
- **R3.** Retention durations come from the PolicyPack per jurisdiction — never a constant in code. A jurisdiction without a retention clause blocks the dataset rather than silently defaulting. *The Qatar retention decision (minimums, maximums, statement files vs. derived transactions) is an open legal item — roadmap non-engineering gate, Phase 5 policy.*
- **R4.** *Not yet operating — Phase 16:* the subject data export is derived from declarations, and its coverage reconciles with them — a category omitted from export must be one whose declaration explains the omission (KAR-CTL-050).
- **R5.** *Not yet operating — Phase 16:* erasure requests execute the declared strategy per dataset, cover subject-derived data (not only subject-owned), and produce a record of what was erased, anonymized, or retained-with-basis.
- **R6.** Sealed data's lifecycle follows its own rules (ADR-0017/0018): disclosure, not access; retention and post-disclosure handling are part of the Amanat legal design (Phase 13/14 gates), and no erasure path unsealed anything on the way out.
- **R7.** Current-phase retention, decided now: repository history is retained indefinitely (it is the project record); compliance evidence follows [evidence-handling.md](../compliance/evidence-handling.md) — 13 months default, gate records for the life of the project. Neither contains personal data, by rule.
- **R8.** Backups participate in erasure design (backup-and-recovery-policy §R7): the erasure strategy for a dataset states how backup copies age out, decided before production data exists.
- **R9.** Logs and analytics containing personal data are datasets with declarations like any other (logging-and-monitoring-policy §R6) — no "exhaust" category exists.

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md). None current.

## Evidence

Later: test-25 output, export-reconciliation results, erasure execution records (redacted). Today: none claimed. Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-037, 050 (deferred), 038, 049 (deferred).
