# White Label

**Phase:** 11 · **Related:** [`tenancy.md`](tenancy.md), [`operating-entity.md`](operating-entity.md), [`capability-registry.md`](capability-registry.md)

---

## 1. Two planes — and the legacy's warning

> the **control plane** is the ability to configure a partner tenant. The **data plane** is the ability for that configuration to change what a customer sees.

The legacy built a complete control plane — tenants, contracts, seat allocations, per-tenant branding, feature flags, domains, integrations, legal documents — and shipped a client that consumed **none** of it. Its own conclusion:

> Nothing in the mobile app consumes tenant branding. A bank can be configured in the console and no customer would see any difference. **Qarar is not white-label ready.**

**Phase 11 budgets both planes, and the data plane is the larger half.** See [`plan-v2-deltas.md` D3](plan-v2-deltas.md).

## 2. What a white-label deal actually changes

| Dimension | Change |
|---|---|
| Tenant | A new tenant record |
| **Operating entity** | **The partner's own entity** |
| **Data-protection role** | **Partner = `CONTROLLER`, Karar = `PROCESSOR`** — inverted |
| Legal documents | The partner's set, keyed `(entity, jurisdiction)` |
| Capability entitlements | A subset. Everything else has **no row** ⇒ `DISABLED` |
| Branding | Design tokens, logo, app name, bundle ID, sender identity |
| Billing | Partner-sponsored entitlements; no consumer rail |
| Deployment | L0 or L1. **No fork, no branch, no separate pipeline** |

**The role inversion is the central legal fact**, and it is configuration rather than code because `OperatingEntity` models it as a first-class dimension. A design that could not express it would require either a code branch or a separate deployment.

## 3. Control plane

| Configured | Where |
|---|---|
| Tenant, contract, seat allocation | `tenancy` |
| Operating entity + data-protection role | `operating-entity` |
| Capability entitlements | `capability-registry` |
| Brand configuration | `BrandConfiguration` |
| Legal document set | `consent` |
| Provider bindings | `TenantProviderResolver` |
| Jurisdiction policy | `jurisdiction-policy` pack |

## 4. Data plane — the work

| Item | Notes |
|---|---|
| Flutter theming from design tokens | Tokens, not conditionals. A partner-specific widget is a design failure |
| Flavors | App name, bundle identifier, icons, splash, API base |
| Legal document rendering | From the tenant's set, not a bundled asset |
| Sender identity | Email and notification from-identity |
| Branded release pipeline | Build, sign, and submit per flavor — **the part most often underestimated** |
| Capability-aware navigation | Entitlements narrow the UI automatically |
| SDK surface | Generated per entitlement scope |

**If a partner needs a code change, the theming contract is insufficient and gets fixed — not forked.**

## 5. Deny by default makes the guarantee structural

A partner tenant entitled to accounts, budgets, financial health, goals, and AI advisor has **no entitlement row** for Amanat, marketing, or Karar subscriptions.

> Nothing is switched off. **It was never on.**

There is no configuration mistake that could expose Amanat to a partner, because exposure requires a positive act and absence is the default. This is the difference between a configuration promise and a structural guarantee.

## 6. Billing

`BankSponsoredEntitlementProvider` — entitlements derive from the tenant relationship. **No consumer payment rail, no Karar subscription.**

The `SubscriptionBillingProvider` port remains unimplemented. A white-label deal does not require it.

## 7. What does not change

| | |
|---|---|
| Financial engine | Pure package, deployed identically everywhere |
| Consumer domain code | Never names a database, provider, key, region, or legal entity |
| Tenancy core | |
| Control-plane core | |
| API contract | Surface narrows from entitlements, not from a branch |

**"Zero code changes" means no core-domain fork — not no activation or build work.** The platform, capability scoping, policy resolution, and every domain module are untouched; the flavor configuration, branded build pipeline, and tenant activation are real Phase 11 delivery work. That distinction is the whole of §1.

## 8. Dedicated deployment

If a partner requires more isolation, the topology ladder handles it as **Terraform and IAM work, not a rewrite**:

| Requirement | Mechanism |
|---|---|
| Dedicated database | Tenant→datasource routing at the infrastructure edge |
| Dedicated encryption keys | `KeyRef` resolves a tenant-scoped KEK |
| Own IdP | `TenantProviderResolver` binds tenant → `IdentityProvider` |
| Own bank connector | Same resolver, `FinancialDataConnector` port |
| Restricted AI | `ModelRoutingPolicy`, or remove the `AI_ADVISOR` entitlement entirely |
| Dedicated cloud account / project / subscription | L3 rung — on whichever approved provider the partner's `DeploymentProfile` selects |

See [`deployment-topology.md`](deployment-topology.md) and `../scenarios/d-dedicated-deployment.md`.

## 9. Mandatory staging

White-label configuration changes are on the mandatory-staging list, alongside operating-entity changes and capability availability changes. A branded build that renders wrongly is visible to a partner's customers.
