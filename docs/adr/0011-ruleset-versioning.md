# ADR-0011 — Financial ruleset versioning

**Status:** ACCEPTED · **Phase:** 6

## Context

Financial rules change: thresholds move, methodologies are corrected, jurisdictions diverge, and customers elect different conventions. A recommendation shown in March must remain explainable in October, under the rules that produced it — not under today's.

## Decision

**Rulesets are immutable, versioned objects**, selected per `(capability, jurisdiction, version)` through a registry.

**Every recommendation records its provenance:**

```
rulesetVersion · jurisdiction · operatingEntity · subjectProfileVersion
calculatedAt · inputHash
```

- **A correction is a new version, never an edit.**
- A jurisdiction maps to an **existing** ruleset version unless rules genuinely differ. **Divergence requires evidence, not anticipation.**
- Every published version keeps a test asserting it still reproduces its recorded outputs.

## Consequences

**Positive**

- **Every historical recommendation remains explainable** under the rules, jurisdiction, legal party, and elected conventions that produced it.
- Regulatory and support questions about past advice are answerable from data.
- Divergence between jurisdictions is visible and deliberate rather than accidental.

**Negative — accepted**

- Old ruleset versions live forever and must keep passing their tests.
- The provenance record adds four fields to stored recommendations.
- A correction cannot be applied retroactively without an explicit, audited re-computation.

## Alternatives rejected

**Mutable rulesets, edited in place.** Rejected: it silently rewrites the explanation of every recommendation that used the ruleset, which is the opposite of provenance.

**Rulesets in database configuration.** Rejected: a financial rule change must be reviewed, diffed, tested, and staged. Configuration cannot be diffed in a pull request. This is the same reasoning as ADR-0015's typed/configured split.

**One global ruleset with no jurisdiction key.** Rejected: it would work today, in one market, and would require the retrofit ADR-0014 exists to prevent.

**Provenance recording only the version.** Rejected after the legacy audit: the same ruleset version can produce different results under different subject-elected conventions — Zakat's nisab basis being the concrete case. Recording the version alone would make some historical results unreproducible. See ADR-0015.
