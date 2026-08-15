# ADR-0019 — `VerifiedFinancialFacts` as primary AI numeric safety

**Status:** ACCEPTED · **Phase:** 7 · **Supersedes** Plan v1's grounding-guard-as-primary approach

## Context

Plan v1 made a **numeric grounding guard** the primary defence against a model stating a wrong figure: let the model write prose containing numbers, then check those numbers against computed values.

The legacy audit shows why that fails. Its guard *"ignores any number the model does not mark with a currency or percent token, so bare counts are unchecked"* (finding AI-7).

The defect is not in that implementation. **Any output-inspecting guard must decide what counts as a number worth checking, and that decision is where the leak lives.**

Separately, Karar must render figures correctly in Arabic and English: Arabic-Indic vs Western digits, U+066B and U+066C separators, currency placement under RTL, and three-decimal currencies.

## Decision

**The model never writes a number.**

The engine emits `VerifiedFinancialFacts` — typed values with label keys, ruleset version, and calculation timestamp. The model receives facts, never raw transactions, and returns prose containing **placeholders**:

```
{{fact:monthly_surplus}}
```

**Karar substitutes the locale-formatted value.**

Four layers:

| Layer | Role |
|---|---|
| Facts + placeholders | **Primary** |
| `AiResponseValidator` rejects a raw numeral in a monetary position → regenerate once | Secondary |
| `NumericGroundingGuard` on surviving prose numerals | **Tertiary** |
| Deterministic result returned regardless of AI outcome | Always |

## Consequences

**Positive**

- **Removes the class of problem** rather than guarding it — there is no number in the output to check.
- **Solves localization with the same mechanism.** A model asked to emit `١٢٬٣٤٥٫٦٧٨ ر.ع.` correctly in every locale will eventually get it wrong; a formatter will not.
- Every displayed figure is traceable to a ruleset version.
- The user always gets their numbers, even when the model fails.

**Negative — accepted**

- Prompts are more constrained, and models occasionally emit a bare numeral anyway — hence layers 2 and 3.
- A fact must exist for anything the model may reference, so the fact catalogue grows with the product.
- Placeholder-laden prose is harder to read in logs and evaluation sets.

## Alternatives rejected

**Grounding guard as primary (v1).** Rejected on the legacy's direct evidence. Retained as a third net, not as the mechanism.

**Trust the system prompt.** Rejected: the legacy's prompt forbids inventing any amount, and that is necessary but not sufficient — instruction-following is probabilistic.

**Post-hoc human review of AI output.** Rejected: not viable at interactive latency.

**Let the model format numbers with explicit locale instructions.** Rejected: this is the localization half of the same problem. Deterministic formatting is free and correct.

**Suppress AI entirely on numeric content.** Rejected: explanation is the product value. The decision separates *explaining* from *computing*, keeping the first and refusing the second.
