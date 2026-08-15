# Data Residency

**Status:** **OPEN QUESTION — legal opinion deferred, seam in place**
**Related:** [`deployment-topology.md`](deployment-topology.md), [`gcp-target.md`](gcp-target.md), [`ai.md`](ai.md)

---

## 1. The question, stated plainly

> **Where may Karar process and store customer financial data, for each jurisdiction it operates in, under which legal basis, and with which processors?**

**No answer is asserted anywhere in this documentation.** This document records the question, what makes it urgent, and the mechanisms that keep it answerable without a rewrite.

## 2. The legacy's position — inherited as a warning

The legacy states its own answer without hedging:

> **Customer financial data processed in Qatar: None.**

| Component | Location | Evidence quality |
|---|---|---|
| Compute (Render) | Stated Oregon | **Unverified** — `render.yaml` carries no region key; the region appears nowhere in the repository |
| Database (Supabase) | Stated Frankfurt | **Provider dashboard only** |
| AI provider | United States | Provider claim |
| Email provider | United States | Provider claim |

Five third parties reachable from the running system. **No data-processing agreement signed with any of them.**

This is one of the legacy's seven HIGH findings (**P9**), and its own assessment is that it is *"likely to be QCB's first question."*

**Two lessons carried forward:**

1. **A residency claim that rests on a provider dashboard is not evidence.** Karar's residency posture must be verifiable from configuration under version control, not from a console screenshot.
2. **The AI path is the largest cross-border disclosure**, and it is the one most likely to require an in-region model or a locally-resident provider.

## 3. What the architecture guarantees regardless of the answer

The residency answer is unknown. These properties hold either way, which is what makes deferring the legal opinion safe rather than reckless.

| Property | Mechanism |
|---|---|
| Region is never named in domain code | Ports only ([`gcp-target.md`](gcp-target.md)) |
| Data location is an infrastructure decision | Topology ladder L0–L3 |
| Per-jurisdiction key scoping already exists | `KeyRef` resolves a jurisdiction-scoped KEK |
| Per-tenant provider binding already exists | `TenantProviderResolver` |
| AI model and region are per-tenant configuration | `ModelRoutingPolicy` |
| Processing restrictions are a typed policy clause | `AIProcessingPolicy` in the PolicyPack |
| Cross-border processing requires consent | Consent triple `(entity, purpose, jurisdiction)`, **failing closed** |
| A capability can be disabled per jurisdiction instantly | `CapabilityAvailability`, restrict-only |

**If a jurisdiction requires local processing, the response is L2 or L3 — Terraform and IAM work.** No domain module changes. That is the entire purpose of the ladder.

## 4. What must be decided, and by whom

Engineering cannot answer any of these.

| Question | Owner | Needed before |
|---|---|---|
| Do Qatar's rules require local storage, local processing, or neither? | Legal | Production launch |
| Is cross-border AI processing permissible, and on what basis? | Legal | Phase 7 production use |
| Do the same answers hold for SA, AE, OM? | Legal | Each market launch |
| Which processors require a DPA, and who signs? | Legal | Production launch |
| Does the operating entity's jurisdiction change the answer? | Legal | Entity decision per market |
| Do retention minimums or maximums apply, and do they differ between an original statement file and the derived transactions? | Legal + regulator | Phase 5 retention policy |

The last one is inherited verbatim from the legacy's open worklist, where its 90-day retention window is recorded as having been *"chosen because a number was needed."* Karar sets retention from a policy decision or does not set one.

## 5. `AIProcessingPolicy` — the clause that carries this

A typed PolicyPack clause, per jurisdiction, declaring:

- Whether AI processing is permitted at all
- Which categories of data may enter a prompt
- Whether cross-border transfer is permitted, and the basis
- Which model regions are acceptable
- Which consent is required, and its document version

**A jurisdiction whose pack omits it has AI unavailable** — not permitted-by-default. The resolver fails closed, which is the inversion of legacy finding AI-5.

## 6. Evidence discipline

Adopted from the legacy's own convention, because it is what let the legacy catch and correct its own errors:

| Label | Meaning |
|---|---|
| **CODE** | A file in this repository says so, and it was read |
| **RUNTIME** | Observed on a running system |
| **INFRASTRUCTURE** | A hosting provider or dashboard claim. **Not verified and not verifiable from the repository** |
| **ABSENT** | Searched for and not found. The absence is the evidence |

> **An INFRASTRUCTURE claim must never be read as a verified one.**

Every residency statement Karar makes carries one of these labels. At Phase 0, every one of them is `ABSENT` — no infrastructure exists yet.

## 7. Current status

| Item | Status |
|---|---|
| Legal opinion | **Not obtained** |
| Region selection | **Not made** |
| DPAs | **None** — no processors engaged |
| Residency claims made by Karar | **None** |
| Architecture readiness | Ladder, key scoping, provider resolution, and policy clause all in place |

**Karar makes no residency claim, holds no data, and engages no processor as of Phase 0.**
