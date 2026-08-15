# Module: zakat

## Purpose

Zakat assessment: nisab, hawl, declared asset and liability ledgers, valuation by weight, and the jurisprudential settings register.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 9
- **Capability:** ZAKAT
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `zakat_assets` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE` | intention, basis, grams, purity, doubtful portion |
| `zakat_liabilities` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE` | total and 12-month portion held separately |
| `zakat_assessments` | `HIGHLY_SENSITIVE_FINANCIAL` | `RETAIN_WITH_BASIS` | immutable; SHA-256; settings snapshot |
| `zakat_hawl_states` | `HIGHLY_SENSITIVE_FINANCIAL` | `CASCADE` | Umm al-Qura, 354/355 days |
| `metal_prices` | `PUBLIC` | `RETAIN_WITH_BASIS` | full provenance — see notes |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `ZakatAssessmentCompleted` | `HIGHLY_SENSITIVE_FINANCIAL` | notifications, projections | identifier-only |

## Permissions

| Permission | Role(s) |
|---|---|
| `zakat.assessment.read` | `USER` |
| `zakat.assessment.write` | `USER` |
| `zakat.settings.manage` | `PLATFORM_ADMIN` |

**Permissions deliberately absent:** **Karar executes no payment.** The engine stops at *due*; only the customer's confirmation records payment.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

**This capability is absent from Architecture Plan v2 and was recovered by the Phase 0.2 legacy audit.** See `docs/architecture/plan-v2-deltas.md` D1.

**It is the origin of the fourth policy dimension.** Two customers in the same jurisdiction, with the same operating entity, under the same PolicyPack, can legitimately require different calculations — nisab basis, valuation convention, treatment of doubtful portions, calendar. These are `SubjectPolicyProfile` elections, permitted only within what the pack allows, versioned, and **pinned into every assessment**.

`metal_prices` carries source name, exact URL, quote as published, FX rate applied, trading day, fetch time, automatic-or-manual, and the administrator responsible for a manual entry. **Past the configured maximum age the engine refuses to compute** rather than using a stale price — refusing is the correct default.

**The price source must be stated honestly in-product.** The legacy uses a free public quote service converted at a *pegged*, not live, FX rate — *not a benchmark, not LBMA, not a regulator rate*.

**Multi-currency holdings convert explicitly via `ExchangeRate`.** The legacy adds them as one currency with a warning and performs no conversion.

**A declared-but-unimplemented method fails loudly.** The legacy's Net Invested Funds setting *falls back silently* to a different method.

## Non-engineering gate

**No Sharia review, board, scholar, or certificate exists, and none is implied by any of this work.** This is engineering against a written specification. The gate belongs beside Amanat's legal clearance in the pre-launch list.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
