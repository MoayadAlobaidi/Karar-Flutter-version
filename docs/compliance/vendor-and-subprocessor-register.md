# Vendor and Subprocessor Register

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** every phase gate; per-vendor review dates below

Every third party Karar's build or (future) operation depends on. **No vendor processes personal data today, because Karar holds none** — DPA status is therefore N/A across the board, and flips to REQUIRED the moment a vendor would touch personal data (KAR-CTL-048: DPA before data, not after).

---

## Current vendors

| Vendor | Service | Data shared today | Classification | DPA status | Security review | Next review | Notes |
|---|---|---|---|---|---|---|---|
| GitHub | SCM, CI (Actions), interim evidence references | Source code, documentation, CI logs | INTERNAL | N/A — no personal data processed | Baseline: platform 2FA, **public** repo (write-restricted), branch protection on `main` (verified 2026-08-15, EV-007) | Phase 2 gate | Single-vendor concentration risk KAR-RSK-011 |
| npm registry | Node package consumption | Download requests only (package names, IPs inherent to any fetch) | PUBLIC/INTERNAL | N/A | Supply-chain controls KAR-CTL-025–028 apply to what we pull, not what we send | Phase 2 gate | No publishing account in use |
| pub.dev | Dart/Flutter package consumption | Download requests only | PUBLIC/INTERNAL | N/A | Same as npm | Phase 2 gate | Flutter toolchain dependency |
| Docker Hub | Container image pulls (local Compose, CI) | Pull requests only | PUBLIC/INTERNAL | N/A | Version-pinned images; digest pinning target (KAR-CTL-028) | Phase 2 gate | Rate limits also an availability consideration for CI |
| Container base-image publishers (e.g. postgres, node official images) | Upstream images consumed via registry | None | PUBLIC | N/A | Pinning + SCA over resulting dependency tree | Phase 2 gate | Listed separately from the registry because trust attaches to the publisher, not the mirror |

## Planned vendors

Recorded now so their gating conditions are visible before anyone is committed:

| Vendor (class) | Phase | Data that would be shared | Preconditions before adoption |
|---|---|---|---|
| Cloud provider (GCP is the candidate — **UNVERIFIED** per `docs/architecture/country-deployment-matrix.md`) | 17 | Eventually all platform data classes except `SEALED` plaintext (sealed stays sealed; provider stores ciphertext) | Residency posture (KAR-RSK-006), DPA, shared-responsibility mapping, `DeploymentProfile` fit |
| AI provider | 7 (mock first), 17 (real) | Facts-only prompt context; machine identifiers redacted; never `SEALED` | `AIProcessingPolicy` typed clause, consent gate fail-closed, capped spend per environment, DPA |
| Billing provider (`SubscriptionBillingProvider`) | 10 | Subscription/entitlement state; settlement data stays with the provider (AC-011 — Karar does not custody funds) | Contract + DPA, shared-responsibility row, no Zakat/Sadaqah payment execution |
| Bank connectivity / verification providers | 5+ | Per-connector; classification HIGHLY_SENSITIVE_FINANCIAL | Connector review, DPA, jurisdiction check |
| Email / push providers | 16+ | Contact identifiers, notification content (minimized) | DPA, content-minimization rules |
| Independent security assessor / penetration tester | 20 | Access under controlled scope | Engagement terms; ISO 27002 8.34 protections |

## Rules

1. **Adoption:** a vendor is added here with a security review *before* first use (KAR-CTL-047); the review's depth is proportionate to the data shared.
2. **DPA:** required before any personal data flows (KAR-CTL-048, roadmap non-engineering gate "DPAs with every processor").
3. **Review dates** are checked at each phase gate; a lapsed review is a gate finding.
4. **Exit:** removing a vendor records the leaving date and how any held data or credentials were closed out.
5. Subprocessors of our vendors are tracked once Karar has customers whose data those subprocessors could touch — today the chain stops at the vendors above because nothing personal flows at all.
