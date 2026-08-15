# Asset Inventory

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** every phase gate

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
| Package-registry accounts (npm, pub.dev — consumption only) | Account | Engineering Owner | SECRET (credentials, if/when publishing tokens exist) | Vendor | Read/consume today; no packages published |
| Compliance evidence (register + interim artifacts) | Information | Compliance Owner | INTERNAL | In-repo register; interim store per evidence-handling.md | Never contains customer data, credentials, or raw logs |

There are no servers, databases with real data, cloud accounts, domains in production use, mobile store listings, or customer records. **That absence is the current security posture's main fact.**

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
| Domain names, TLS certificates, email/push providers | 17+ | Operations Owner | |

## Rules

1. A new real asset (account, device, service) enters this register in the same PR or gate cycle that creates it.
2. Every asset names an owner role and its highest data classification; handling follows `docs/security/data-classification.md`.
3. Asset disposal (device retirement, account closure) is recorded here and follows the acceptable-use-policy disposal rule.
4. This inventory contains **no personal data** — devices are identified by role, accounts by service, never by person.
