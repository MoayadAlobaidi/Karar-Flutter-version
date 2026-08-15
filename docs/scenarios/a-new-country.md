# Scenario A — Launch in Saudi Arabia

**Question:** what does it take to operate Karar in a second country?
**Answer:** one code package, configuration rows, an entity decision, and legal clearance.

> **The answer is explicitly not "clone Karar and modify it."**

---

## 1. Configuration — no deploy

Done by an authorized operator through Super Admin, audited, and passed through staging first.

| Item | Where |
|---|---|
| Jurisdiction record `SA` | `jurisdiction-policy` settings |
| Operating-entity assignment | `operating-entity` |
| `CapabilityAvailability` rows per capability | `capability-registry` |
| Legal document versions for `(entity, SA)` | `consent` |
| Provider enablement | `TenantProviderResolver` bindings |
| Plan availability and pricing | `subscriptions` |
| `ar-SA` locale activation | localization |

**Capabilities with no availability row remain `DISABLED`.** Launching SA does not implicitly launch anything.

## 2. Code — reviewed, tested, staged, deployed

```
packages/jurisdiction-policy/src/packs/sa/v1/
```

Containing **deltas only**: consent requirements, retention, identity requirements, **ruleset selection**, currency policy, AI-processing policy, resolution strategy per capability, approval policies, and permitted subject-profile options.

Plus locale resources, and provider adapters where SA-specific.

**Load-time failures if incomplete:** a capability with no named resolution strategy, or a disclosure-bearing capability with no `ApprovalPolicy`, **fails to load**. No silent defaults.

## 3. Financial rules — usually none

| | |
|---|---|
| SAR support | **Already present.** `Money` is currency-agnostic by construction and `Currency` carries the ISO 4217 exponent |
| Ruleset | `SA:v1` **maps to the existing ruleset object** unless business rules genuinely differ |
| Divergence | **Requires evidence, not anticipation** |

The financial engine is not forked, branched, or copied. If a threshold genuinely differs, it enters as a **typed policy input**, never as a branch — architecture test 12 enforces this.

## 4. New providers

Each an adapter under `infrastructure/providers/`, behind an existing port:

- SA bank or aggregator connector **if one exists** — none does in v1
- SA SMS/OTP aggregator
- SA identity verification if required

## 5. Legal and entity — the actual long pole

| Decision | Owner |
|---|---|
| Per-capability legal clearance | Legal |
| **Operating-entity decision** — contract cross-border through the existing entity, or incorporate locally | Legal + business |
| Which entity is controller, and which licences it must hold | Legal |
| Consent and retention obligations | Legal |
| Residency determination | Legal |
| KYC/AML applicability | Legal |
| **Amanat legality, assessed separately** | Legal |
| **Zakat — Sharia review, which does not exist** | External |

**Engineering is not the constraint here.** The code package is days; the clearance is not.

## 6. Deployment

**None for L0.** SA tenants run on the shared platform under the existing `DeploymentProfile`.

If residency findings demand local processing → L2 or L3 — a **new `DeploymentProfile`** on whichever approved provider Saudi availability and regulation select (verified per the [country deployment matrix](../architecture/country-deployment-matrix.md) §3 capability check), provisioned as a Terraform composition, with the database created **from canonical migrations, never by copying Qatar's**. Still **Terraform and IAM work, not code**. See [`../architecture/deployment-topology.md`](../architecture/deployment-topology.md) and [`../architecture/infrastructure-portability.md`](../architecture/infrastructure-portability.md).

## 7. Untouched

| | |
|---|---|
| Financial engine core | |
| Every consumer domain — transactions, budgets, goals, insights, zakat | |
| Flutter shell | |
| Tenancy | |
| Control plane | |
| Generated SDKs | Surface derives from entitlements |

**Verification:**

```bash
git diff --name-only main... | grep -E 'packages/financial-engine/|modules/(transactions|budgets|goals|insights)/|app/lib/app/'
```

Empty output, or the seam is wrong.

## 8. Why it works

Because **use cases never read a country code and never branch on jurisdiction** — they ask `EffectivePolicy` a question. Adding a jurisdiction adds an answer, not a branch.
