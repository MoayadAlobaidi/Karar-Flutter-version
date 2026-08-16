# Phase 4 — Flutter and mobile security foundation

**Branch:** `claude/karar-v2-phase-4-flutter-foundation` · **Started:** 16 August 2026 · **Status:** in progress
**Base:** Phase 3.5 merge commit `e23bbc8` on `main`.

Verification sections are filled by the phase lead after running the commands — they record executed results, never intentions.

## Close-out record

_Filled by the phase lead at close, in the shape [`phase-03-5.md`](phase-03-5.md) uses: completion date, final branch and merge reference, final implementation head, CI and Security run URLs, final canonical counts, clean-clone verification, compliance-gate outcome, evidence range, independent-review result, security-suppression review, carried risks, and scope confirmation._

---

## Objective

Build the first production-quality Flutter client foundation against the real Karar API contracts, and harden the backend contracts it depends on. The client authenticates, restores and refreshes sessions safely, binds and switches tenant context, and renders navigation from what the server actually says is available — never from a hardcoded list. Arabic and RTL are first-class from the start, not a later pass. Every real product capability stays unavailable, and the authenticated home is an honest account and security state rather than a fabricated finance dashboard.

Three backend gaps carried out of Phase 3.5 are closed first, because the client cannot be built honestly on top of them: bootstrap could not distinguish a resolution failure from a legitimate empty capability set, the bootstrap response carried no safe operating-entity summary, and consent acceptance was unreachable in every environment.

## Scope

Backend contract hardening (bootstrap failure semantics, client-safe operating-entity projection, local and test seeding, jurisdiction self-declaration where onboarding requires it) · Flutter feature-first Clean Architecture · app bootstrap and startup state machine · environment profiles · generated internal Dart API client with CI drift detection · network layer with typed failure mapping · authentication, email verification, password recovery and change, MFA · persisted sessions, secure token storage, single-flight refresh coordination, session management · local biometric and app lock · tenant selection and switching · capability-aware navigation from the server bootstrap · operating-entity and legal-document presentation · consent state foundation · English and Arabic localization with first-class RTL · accessibility · design system with the default Karar brand · mobile security controls · Android and iOS build foundations · Flutter CI · compliance records and evidence.

## Out of scope

Financial accounts, bank connections, statement import, transactions, merchants, categorization, budgets, goals, financial dashboards, and any financial calculation (Phases 5–6) · AI (Phase 7) · Zakat calculations and methodology profiles (Phase 9) · Amanat (Phases 13–14) · subscriptions, prices, billing (Phase 10) · white-label product builds and bank-specific branding (Phase 11) · Super Admin UI (Phase 8) · push notifications, external analytics, advertising, external crash reporting · Apple Pay and Google Wallet · cloud deployment, DNS, production API endpoints, app-store publishing, and production signing.

No screen is built for a later capability, and no fabricated balance, account, transaction, sync state, insight, score, or placeholder monetary value appears anywhere.

## Agent/workstream ownership

Populated from the lead's ledger; the final table is completed at phase close.

_Remaining sections follow the [phase template](PHASE_TEMPLATE.md) and are completed before this phase closes._
