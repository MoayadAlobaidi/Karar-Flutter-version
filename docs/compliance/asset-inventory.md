# Asset Inventory

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.3 · **Date:** 2026-08-16 · **Review:** every phase gate

**v0.3 (2026-08-16, Phase 3.5):** the `kararfinance.com` domain registration added as a current asset (confirmed facts only, hardening TO_VERIFY — [domain runbook](../operations/domain-and-dns-runbook.md)); the platform database-objects row brought to the Phase 3.5 reality (48 tables); the planned-assets domain row narrowed to what remains planned. All other rows re-checked, unchanged.

**v0.2 (2026-08-15, Phase 2):** platform database objects added (the Phase 2 schemas and tables); all other rows re-checked, unchanged.

Current, real assets only — a Phase-1 project has few, and listing imagined ones would corrupt the register's honesty. Future assets appear as `PLANNED` with the phase that creates them. Serves ISO 27002 5.9 and the ISMS scope statement.

---

## Current assets

| Asset | Type | Owner (role) | Classification (highest) | Location | Notes |
|---|---|---|---|---|---|
| Karar V2 source repository (docs, tooling, CI definitions, Terraform skeleton) | Information / code | Platform Owner | INTERNAL (world-readable) | GitHub (**public** repository), full clones on developer workstation | Read access is public by decision; write access is restricted to the maintainer. Contains no customer data by rule (`SECURITY.md`) and no secrets (KAR-CTL-026) |
| Documentation corpus (`docs/**`) — ADRs, architecture, security, compliance, policies | Information | Platform Owner | INTERNAL | In-repo | The project's canonical decision record; drift risk KAR-RSK-010 |
| CI pipelines (GitHub Actions workflows) | Service / tooling | Engineering Owner | INTERNAL | GitHub | Being authored in Phase 1, in parallel with this register |
| GitHub organization/account (repo admin, settings, Actions) | Account | Security Owner | SECRET (credentials) | GitHub | MFA + settings verification pending (EV-007) |
| Developer workstation (one, held by the person carrying all roles) | Hardware | Operations Owner | Up to SECRET (local `.env`, session credentials) | Off-premises (remote work) | Controls per acceptable-use-policy: FDE, screen lock, updates. No personal data on it by rule |
| Local development environment (Compose: PostgreSQL, Redis, MinIO, OpenTelemetry collector) | Tooling | Engineering Owner | INTERNAL | Developer workstation | Synthetic data only (KAR-CTL-038) |
| Platform database objects (Phases 2–3.5): schemas `platform`, `audit`, and `public`; **48 tables** as of Phase 3.5 — 22 RLS ENABLE+FORCE, 33 allow-listed with written reasons, 7 deliberately both. Highest declared class among them is CONFIDENTIAL (e.g. `audit.audit_events`, `public.subject_policy_selections`, `public.consent_grants`) | Information / schema | Engineering Owner | CONFIDENTIAL (declared ceiling; contents synthetic today) | **Local only** — instantiated from migrations in the Compose PostgreSQL on the developer workstation and in ephemeral CI databases; deployed nowhere | Definition lives in-repo (`packages/platform/db/migrations`, rebuildable from zero — KAR-CTL-054); per-table classification, retention, and erasure declared in `packages/platform/db/DATA_LIFECYCLE.md` and the per-module `MODULE.md` files. Classification is the declared ceiling: only synthetic/test data exists in any instance (KAR-CTL-038). Access split `karar_migrator`/`karar_app` (KAR-CTL-053); append-only tables hold against the owner too (KAR-CTL-056, 082). Allow-list reasons: `packages/platform/db/rls-allow-list.json` (KAR-CTL-011) |
| Domain name `kararfinance.com` — registered, **nothing configured on it** | Information / account-held name | Operations Owner | INTERNAL (the name itself is public; registrar account access is SECRET and is not held here) | Cloudflare Registrar (registrar) and Cloudflare (authoritative DNS) | Purpose: the global Karar master domain. Registration status **USER_CONFIRMED** — the Platform Owner states it is registered and held; the repository verifies nothing about it. Hosting, application traffic, API, email, and Cloudflare proxy/CDN/WAF are all **NOT_CONFIGURED**, and **no DNS record is configured**. MFA, DNSSEC, auto-renew, registrar lock, recovery methods, role separation, and renewal notifications are all **TO_VERIFY** — no repository-verifiable evidence of any of them exists (EV-427, PENDING). Ownership, renewal cadence, hardening checklist, and the one-change-at-a-time DNS rule: [`docs/operations/domain-and-dns-runbook.md`](../operations/domain-and-dns-runbook.md). No account identifiers, credentials, or billing data are recorded anywhere in this repository |
| Package-registry accounts (npm, pub.dev — consumption only) | Account | Engineering Owner | SECRET (credentials, if/when publishing tokens exist) | Vendor | Read/consume today; no packages published |
| Compliance evidence (register + interim artifacts) | Information | Compliance Owner | INTERNAL | In-repo register; interim store per evidence-handling.md | Never contains customer data, credentials, or raw logs |

There are no servers, databases with real data, cloud accounts, mobile store listings, or customer records. One domain name is held (`kararfinance.com`) and **nothing is configured on it** — no hosting, no DNS record, no proxy, no mail — so it carries no traffic and no data. **That absence is the current security posture's main fact.**

## Planned assets

| Asset | Created at phase | Will be owned by | Notes |
|---|---|---|---|
| Cloud account(s) per `DeploymentProfile` (GCP is the unverified candidate) | 17 | Operations Owner | Provider-portable by design |
| Managed PostgreSQL instances (dev/staging/production) | 17–19 | Operations Owner | RLS-bearing; per-environment |
| KMS / key-management service and KEK hierarchy | 17, 13 (design), 20 (custody gates) | Security Owner | ADR-0017 |
| Object storage (statements, documents) | 17 | Operations Owner | Lifecycle-declared per ADR-0026 |
| Secret manager (per environment) | 17 | Security Owner | Replaces `.env` beyond LOCAL |
| Sealed vault deployment (own boundary) | 13 build, 20 extraction | Security Owner | Before any production `SEALED` data |
| AI provider account(s) with capped spend | 7, 17 | Platform Owner | Port-abstracted, ADR-0010 |
| Staging environment | 19 | Operations Owner | Synthetic data only, hard pre-production gate |
| Production environment | 20–21 | Operations Owner | Behind all Phase 20 gates |
| Mobile store accounts (App Store / Play) | 4+ (release phases) | Platform Owner | |
| Billing provider account (`SubscriptionBillingProvider`) | 10 | Platform Owner | Settlement executor external to Karar (AC-011) |
| DNS records, TLS certificates, proxy/CDN/WAF configuration, and email/push providers on `kararfinance.com` (the name itself is already held — see current assets) | 17+ | Operations Owner | Each is a separate reviewed change under the [domain runbook](../operations/domain-and-dns-runbook.md) §4; none exists today |
| Additional domain names (per-market or per-brand, if any) | 17+ | Operations Owner | None decided; recorded so a second registration is a decision, not a drift |

## Rules

1. A new real asset (account, device, service) enters this register in the same PR or gate cycle that creates it.
2. Every asset names an owner role and its highest data classification; handling follows `docs/security/data-classification.md`.
3. Asset disposal (device retirement, account closure) is recorded here and follows the acceptable-use-policy disposal rule.
4. This inventory contains **no personal data** — devices are identified by role, accounts by service, never by person.
