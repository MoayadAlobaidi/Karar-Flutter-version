# Scenario C — UAE bank white label, subset of capabilities

**Question:** can a partner bank run a branded Karar with only some capabilities, and never see the rest?
**Answer:** yes — and "never see Amanat" is a **structural guarantee**, not a configuration promise.

---

## 1. Configuration

| Mechanism | Value |
|---|---|
| Tenant | `tenant:uae-bank-x`, `operatingJurisdiction: AE` |
| **Operating entity** | **The bank's own entity** — bank is `CONTROLLER`, **Karar is `PROCESSOR`**. Bank's legal document set, bank's licences. **This role inversion is configuration, not code** |
| Brand | `BrandConfiguration` → design tokens, logo, legal docs, support channels, domains; Flutter flavor |
| Capability entitlements | `AVAILABLE`: accounts, budgets, financial health, goals, AI advisor. **Amanat, marketing, Karar subscriptions: no entitlement row → `DISABLED` by deny-default** |
| Country policy | `ae/v1` PolicyPack |
| Billing | `BankSponsoredEntitlementProvider` — entitlements from the tenant relationship; **no consumer payment rail, no Karar subscription** |
| Deployment | L0 or L1. **No fork, no branch, no separate pipeline** |
| SDK / API | Tenant-scoped client; capability scope derived from entitlements, so **the API surface narrows automatically** |

## 2. Why "never sees Amanat" is structural

> Nothing is switched off. **It was never on.**

A capability with **no availability row is `DISABLED`**. Exposure requires a positive act — creating an entitlement row — and no such row exists. There is no misconfiguration, no stale flag, and no forgotten toggle that could expose it, because absence is the default state rather than a state someone has to maintain.

Additionally, Amanat's `whiteLabelEligible` is `false` and its `declaredJurisdictions` is `[]`, so **two further gates would deny it even if an entitlement row were created by mistake.** Every gate is AND.

Compare the legacy, whose entitlement enforcement flag **defaults to false**, making the paid boundary *"currently not a control"* (API-13). A boundary that must be switched on is a boundary that is off somewhere.

## 3. The controller/processor inversion

The central legal fact of a white-label deal, and the reason `OperatingEntity` exists as a dimension:

| | Karar's own tenants | This tenant |
|---|---|---|
| Controller | Karar's entity | **The bank's entity** |
| Processor | — | **Karar** |
| Legal documents | Karar's | The bank's |
| Data-subject requests | Karar answers | **The bank answers; Karar assists** |
| Breach notification | Karar notifies | **The bank notifies** |
| Disclosure releasing party | Karar's entity | **The bank's entity** |

**No module changes.** A design that could not represent this would require either a code branch or a separate deployment — which is exactly the outcome the dimension prevents.

## 4. Zero code changes — precisely scoped

**True for:** the platform, capability scoping, policy resolution, tenancy, the API contract, the financial engine, and every consumer domain module.

**Not the whole story:** the *data plane* — Flutter theming from tokens, flavors, bundle identifiers, sender identity, and the branded release pipeline — is Phase 11 **delivery work**.

This distinction is drawn because the legacy built a complete control plane and shipped a client consuming none of it, concluding *"Qarar is not white-label ready."* See [`../architecture/white-label.md`](../architecture/white-label.md) and [`../architecture/plan-v2-deltas.md` D3](../architecture/plan-v2-deltas.md).

## 5. What the bank's administrators can see

| | |
|---|---|
| Their own tenant's aggregate metrics | Via projections |
| Their member roster | Tenant-scoped, RLS-enforced |
| Their entitlements and configuration | |
| **Individual customer financial detail** | **Only per explicit entitlement, audited** |
| **Any `SEALED` data** | **Never automatically. No admin role holds a content-read permission at any level** |
| Other tenants' anything | **Never** — RLS, adversarially tested with non-empty expected data |

The non-empty assertion matters: the legacy's tenant roster returns empty for everyone because a policy is missing, and *"an empty roster is indistinguishable from correct isolation."*

## 6. Verification

```bash
git diff --name-only main... | grep -E 'modules/|packages/financial-engine/'
```

Empty output. Onboarding a white-label partner is configuration plus a flavor.
