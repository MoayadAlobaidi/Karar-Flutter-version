# Documentation Style Guide

Binding for everything under `docs/` and the root-level documents (`README.md`, `CONTRIBUTING.md`, `SECURITY.md`). A PR that adds or changes documentation is reviewed against this guide the same way code is reviewed against the architecture tests.

---

## 1. Vocabulary

[`glossary.md`](glossary.md) is the canonical vocabulary source. Use its exact spellings and never invent synonyms for a term it defines. The ones most often misspelled or conflated:

| Term | Rule |
|---|---|
| **Karar** | This platform. Never "Karrar" or "Qarar" for V2 |
| **Qarar** | The legacy system only (`MoayadAlobaidi/Qarar`). Read-only reference |
| **Jurisdiction** vs **Country** | Jurisdiction is the policy key; country is an attribute. Do not use them interchangeably |
| **OperatingEntity** | One word, camel case. The legal person, orthogonal to country and jurisdiction |
| **SubjectPolicySelection** | The platform mechanism. Capability-scoped content (e.g. `ZakatMethodologyProfile`) is not called this |
| **DeploymentProfile**, **DeploymentRouter**, **DeploymentDirectory**, **DataSourceResolver** | Four distinct concepts; see the glossary before using any of them |
| **PolicyPack**, **JurisdictionSettings**, **EffectivePolicy**, **PolicyResolutionStrategy** | Code / configuration / merged result / version-selection strategy — keep them apart |
| **`SEALED`**, **`SealAccessGrant`** | `SEALED` is categorically different, not "more confidential". Grant types are `OWNER`, `DISCLOSURE`, `LEGAL_ORDER` only |
| **PostgresPersistenceAdapter** | Singular. There are no per-cloud business persistence adapters |
| Lifecycle declaration | Six fields per persistent dataset; the erasure-strategy field has four values: `CASCADE_DELETE`, `ANONYMIZE_IRREVERSIBLY`, `RETAIN_WITH_BASIS`, `NON_PERSONAL_BY_DESIGN` |
| **Money** | `BIGINT` minor units plus a `Currency` with its ISO 4217 exponent. Not "cents" |

## 2. Ownership

Every document has an owner. Two mechanisms, in priority order:

1. A document may declare an owner explicitly in a short front section ("Owner: …").
2. Otherwise the **directory default** applies: `docs/architecture/`, `docs/adr/`, `docs/security/` — architecture owner; `docs/compliance/`, `docs/policies/` — compliance owner; `docs/phases/`, `docs/roadmap.md`, root `README.md`, `CONTRIBUTING.md` — phase lead; `docs/onboarding/`, `docs/glossary.md`, this guide — documentation owner; `modules/*/MODULE.md` — the module's declared owners.

While the team is a single maintainer, roles collapse onto one person; the ownership model still applies because it names which hat reviews which change.

## 3. Review expectations

**Documentation changes in the same PR as the change it describes.** A PR that alters behaviour, commands, structure, or a rule updates the affected documents in that PR — not in a follow-up. Reviewers reject "docs later". This is the working form of the CONTRIBUTING rule to derive documentation from source, not from the previous version of the document.

## 4. Writing rules

Write like a disciplined engineering team: direct language, natural paragraphs, concrete examples.

- No emojis.
- No AI signatures, no "Generated with …" lines, no tool attribution of any kind in committed documents or commit messages for docs.
- No promotional adjectives — "robust", "world-class", "enterprise-grade", "battle-tested", "cutting-edge" and their relatives. If a property matters, state the mechanism that provides it.
- No self-congratulation. A document reports; it does not celebrate.
- A rule is stated once, in its canonical home, and linked everywhere else. Repetition drifts.
- Bold sparingly — for the load-bearing clause of a paragraph, not decoration.
- Headings only where they aid navigation; tables only where genuinely clearer than prose.
- Never claim compliance, certification, production readiness, regulatory approval, or Sharia approval. The platform's honest status lives in the root README status block and [`compliance/`](compliance/README.md); everything else links there.

## 5. Claim labelling

Every substantive statement about the system is one of five kinds, and the reader must be able to tell which:

| Kind | Signal in text |
|---|---|
| **Verified fact** | Stated plainly, with an evidence label where it is a claim about a running or built system: CODE / RUNTIME / INFRASTRUCTURE / ABSENT (defined in [`../CONTRIBUTING.md`](../CONTRIBUTING.md)) |
| **Decision** | "Decided", with the ADR or document that records it |
| **Assumption** | Marked explicitly — "assumption", `UNVERIFIED`, or `TBD`. Never silently promoted to fact |
| **Risk** | Named as a risk, with its owner or its accepted-risk register entry |
| **Future work** | Marked with its phase, or "future" with no committed phase |

The [country deployment matrix](architecture/country-deployment-matrix.md) statuses (`TBD`, `UNVERIFIED`, `PENDING_LEGAL`, `PENDING_PROVIDER`, `planned`, `future`) are the model: unknowns are recorded, never filled from imagination.

## 6. Document structure and naming

- File names are lowercase and hyphenated (`infrastructure-portability.md`); templates are uppercase (`PHASE_TEMPLATE.md`, `MODULE_TEMPLATE.md`).
- One `H1` per document, matching the file's subject. Canonical documents open with a short bolded metadata line where useful (`**ADR:** … · **Phase:** … · **Canonical for:** …`) followed by a `---` rule — match the existing pattern in `docs/architecture/`.
- A document that is canonical for a rule says so in that opening line; every other document links to it instead of restating the rule.
- Relative links only within the repository, and every link must resolve — link checking is part of `make verify` (`docs-check`).

## 7. Diagram conventions

- **Mermaid**, fenced ` ```mermaid `, so diagrams render on GitHub and stay diffable.
- **One diagram, one mechanism.** A diagram that explains routing does not also explain layering. Split rather than crowd.
- **Both-theme-safe:** if a node sets a `fill`, set a contrasting `color` explicitly (e.g. `style X fill:#e8f4e8,color:#111`) so text survives dark backgrounds. Prefer no fill over an unreadable one.
- Shared palette across `docs/`: green fills (`#e8f4e8`) for pure/framework-free elements, red fills (`#ffe8e8`) for restricted or sealed elements, amber (`#fff4e8`) for audited configuration, **dashed borders for future or gated elements**.
- Label edges where the relationship is not obvious; an unlabeled arrow means "depends on / calls".

## 8. Phase-end updates are mandatory

Every phase closes with one documentation pass, in the closing PR. The fixed update set:

| Document | Update |
|---|---|
| Root `README.md` | Status block — current phase, last completed |
| [`roadmap.md`](roadmap.md) | Phase row status |
| [`phases/phase-NN.md`](phases/README.md) | The phase report, complete per the template |
| [`onboarding/developer.md`](onboarding/developer.md) | Only if commands or workflows changed |
| [`compliance/evidence-register.md`](compliance/evidence-register.md) | New evidence produced by the phase |

The ritual itself is specified in [`phases/README.md`](phases/README.md); the compliance gate it feeds is [`compliance/phase-compliance-gate.md`](compliance/phase-compliance-gate.md).

A phase is not complete while any row of that table is stale.
