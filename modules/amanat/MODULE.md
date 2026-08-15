# Module: amanat

## Purpose

Confidential obligation recording with post-mortem conditional disclosure. Terminology provisional pending domain and legal review.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 14
- **Capability:** AMANAT
- **Highest classification:** SEALED (payload) / CONFIDENTIAL (metadata)

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `amanat_records` | `CONFIDENTIAL` | `RETAIN_WITH_BASIS` | metadata only — projectable |
| `(payload)` | `SEALED` | `RETAIN_WITH_BASIS` | in `sealed.sealed_payloads` — **includes the amount** |
| `disclosure_cases` | `CONFIDENTIAL` | `RETAIN_WITH_BASIS` |  |
| `disclosure_packages` | `CONFIDENTIAL` | `RETAIN_WITH_BASIS` | names its releasing entity |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `AmanatDisclosureAuthorized` | `SEALED` | notifications, audit, projections | **identifiers and status only — mandatory, no exemption** |
| `EligibleRepaymentSupportRequested` | `SEALED` | (future fundraising) | identifiers, jurisdiction, status |

## Permissions

| Permission | Role(s) |
|---|---|
| `amanat.record.create` | `USER` |
| `amanat.record.amend` | `USER` |
| `amanat.record.revoke` | `USER` |
| `amanat.case.review` | `OPERATOR` |
| `amanat.case.approve` | `DISCLOSURE_APPROVER` |

**Permissions deliberately absent:** **No `amanat.content.read` for any admin role, at any level.** Not restricted — absent. `DISCLOSURE_APPROVER` approves a release without seeing what is released.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

**The amount is sealed.** It is tempting to keep it in metadata for reporting; resist it — an amount plus a counterparty reference is most of the sensitive content. Operational dashboards show counts, states, and ages, **never sums**.

`declaredJurisdictions` ships as `[]`; Qatar is `PENDING_LEGAL_REVIEW` and everything else `DISABLED`, so the capability is unreachable regardless of configuration.

**Safety properties tested here:** existence non-disclosure (identical responses **and timings** whether records exist or not); owner supremacy while living; mandatory waiting period with a platform minimum; irreversibility of `Released`; rate limiting on death reports.

**Amanat has no payment-provider dependency, direct or transitive.** Karar is not designed to hold funds.

## Untouched-module contract

Adding this capability must leave `transactions`, `budgets`, `goals`, `zakat`, `insights`, `financial-accounts`, `financial-engine`, the Flutter shell, tenancy core, and control-plane core **unchanged**. If that list shortens during implementation, the seam is wrong and gets fixed before Amanat proceeds.

## Gates

Legal clearance per jurisdiction; domain terminology review; vault extracted; KEK escrow with a rehearsed, timed recovery drill; sealed-integrity canary running. All before production.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
