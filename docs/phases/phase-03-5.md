# Phase 3.5 — Jurisdiction and capability foundation

**Branch:** `claude/karar-v2-phase-3-5-jurisdiction-capabilities` · **Started:** 16 August 2026 · **Status:** in progress
**Base:** Phase 3 merge commit `fe3864a` on `main`.

Verification sections are filled by the phase lead after running the commands — they record executed results, never intentions.

---

## Objective

Make "where does this principal operate, and what may this deployment offer them" a typed, versioned, restrict-only question: Country as reference data separate from Jurisdiction as the policy key; explicit audited jurisdiction assignments for users and tenants; pure typed PolicyPacks with a lifecycle and the Qatar `qa/v1` draft (DRAFT / PENDING_LEGAL_REVIEW, never production-activatable, no fabricated legal decisions); an extensible resolution-strategy registry and one `EffectivePolicy` resolution result; the `SubjectPolicySelection` mechanism with capability-owned content; a compile-time capability registry with separated lifecycle/implementation/deployment states and deny-by-default availability resolution; tenant capability entitlements without subscription logic; consent, operating-entity/licence, and provider gates; secure session tenant binding resolving the Phase 3 dormant surface (KAR-RSK-021); and one authenticated client bootstrap endpoint that hides what must not be seen.

## Scope

Country reference model · Jurisdiction model · user and tenant jurisdiction assignments · typed versioned PolicyPacks with lifecycle and provenance · `qa/v1` draft pack · resolution-strategy registry · `EffectivePolicy` resolver · processing-basis declarations and unresolved retention states · identity-requirement and AI-processing policy seams · `SubjectPolicySelection` · capability-owned profile contracts · compile-time Capability Registry · lifecycle/implementation/deployment states · deny-by-default availability · tenant capability entitlements · operating-entity and licence gates · consent/re-consent integration · provider availability seam · environment-aware resolution · session tenant binding, switching, and first-party bootstrap · authenticated client bootstrap API · audit and provenance across all of it.

## Out of scope

Flutter consumer UI (Phase 4) · financial accounts, transaction ingestion, budgeting, goals, financial calculations (Phases 5–6) · AI provider/model integration (Phase 7) · Zakat calculation logic and methodology profile content (Phase 9) · Amanat (Phases 13–14) · subscriptions, prices, plans (Phase 10) · white-label UI/data plane (Phase 11) · Super Admin UI (Phase 8) · cloud provider adapters, Cloudflare DNS records or services, GCP/AWS infrastructure, and any DEV/STAGING/PRODUCTION deployment.

## Agent/workstream ownership

Populated from the lead's ledger; the final table is completed at phase close.

_Remaining sections follow the [phase template](PHASE_TEMPLATE.md) and are completed before this phase closes._
