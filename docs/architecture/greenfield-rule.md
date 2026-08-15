# The Greenfield Rule

**Status:** ABSOLUTE — binding on every phase, canonical as of Phase 0.5.

---

## 1. The rule

> **Karar V2 is a new platform built from scratch. No legacy application source code becomes the V2 foundation.**

The legacy repository `MoayadAlobaidi/Qarar` is:

```
READ-ONLY
REFERENCE ONLY
REQUIREMENTS SOURCE
FAILURE-MODE SOURCE
REGULATORY-EVIDENCE SOURCE
TEST-CASE SOURCE
```

It is **not**:

```
architecture source
code foundation
database foundation
migration foundation
deployment foundation
security foundation
```

## 2. Forbidden: mechanical rewriting

Do not port or copy the legacy's architecture, and do not mechanically rewrite:

```
Java → TypeScript
React Native → Flutter
Supabase schema → new schema
Spring controller → NestJS controller
```

A file-by-file translation carries every structural decision of the source — including the 128 audit findings' root causes — into a new syntax. That is a fork wearing a new language, not a rebuild.

## 3. The required sequence

Every piece of legacy behaviour that survives into V2 travels this path, in full:

```
Legacy behaviour / specification
        ↓
Understand the business requirement
        ↓
Decide whether it survives
        ↓
Model the Karar V2 domain
        ↓
Define use case
        ↓
Define contracts / ports
        ↓
Implement clean adapter
        ↓
Expose through API
        ↓
Build Flutter presentation
```

The second step — **decide whether it survives** — is not ceremonial. The legacy's fabricated bank-connection flow and its device-local family-budget mock reached this step and were dropped.

## 4. What may be reused

> **Reuse the knowledge, not the implementation.**

Reusable legacy material includes: business requirements · product terminology · Arabic/English translations · UX behaviour · merchant and category taxonomies · parser edge cases · financial formulas **after review** · Zakat specifications · regulatory documentation lessons · security failure cases · test scenarios · normalization rules · date and number parsing knowledge.

Even then:

| Reusing… | Means |
|---|---|
| A financial rule | **Reimplement** it in the new deterministic financial engine and **independently test** it |
| A parser behaviour | Implement it through the new ingestion architecture, carrying the legacy's edge cases as **test cases** |
| A taxonomy | Migrate it as **reviewed seed/reference data** — reviewed, because the legacy's merchant-rule corpus holds narrative text lifted verbatim from customer statements |
| An operational script | Adapt it — several legacy verification scripts are graded near-verbatim reusable in [`../legacy/reusable-assets.md`](../legacy/reusable-assets.md), because they are shell/Python against PostgreSQL, not application code |

**Do not copy technical debt because it is already written.** The full grading of every asset is in [`../legacy/reusable-assets.md`](../legacy/reusable-assets.md); what must never recur is in [`../legacy/security-findings.md`](../legacy/security-findings.md).

## 5. Phase 1 starts from zero

When Phase 1 begins, the new repository's first executable artifacts come **from the V2 architecture documents and ADRs** — not from any legacy file. Do not copy:

```
legacy package.json          legacy Maven configuration
legacy SQL migrations        legacy React structure
legacy deployment files      legacy Supabase config
```

The new repository begins with a new source tree, new domain model, new migrations, new database schema, new API, new Flutter application, new Admin, new infrastructure, and new tests.

## 6. Enforcement

| Mechanism | |
|---|---|
| The legacy clone lives outside this repository, read-only, permissions stripped | Nothing in-tree to copy from |
| PR review question: *"is this a port of legacy code, or an implementation of a documented requirement?"* | The former is rejected regardless of quality |
| An [Assurance Claim Registry](../security/assurance-claims.md) entry records the no-legacy-code claim | With repository inspection as its evidence |
| Legacy-derived rules arrive as **specifications plus test cases** in `docs/` | The docs are the interface between the two systems — code never is |

## 7. Why this strictness pays

The legacy is a competent system whose audit found 128 findings — **none of them caused by bad engineers, most of them caused by structure**: boundaries that were conventions, controls that were flags, documents that drifted from code. Porting the structure ports the causes.

The audit's value survives the rule fully: every requirement, edge case, formula, and failure mode is captured in [`../legacy/`](../legacy/qarar-audit.md) as knowledge. That is the entire inheritance, and it is the valuable part.
