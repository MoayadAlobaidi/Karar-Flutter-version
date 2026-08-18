# Phase 4 — Flutter and mobile security foundation

**Branch:** `claude/karar-v2-phase-4-flutter-foundation` · **Started:** 16 August 2026 · **Status:** COMPLETE — PR OPEN, NOT MERGED
**Base:** Phase 3.5 merge commit `e23bbc8` on `main`.

**This is the closeout record, and the branch is not merged.** The implementation and its internal gates are done, the compliance gate has returned PASS_WITH_DOCUMENTED_DEFERRED_ITEMS, the evidence range is reconciled, and CI and Security are linked against the pull-request head. Every result below was executed rather than intended. **COMPLETE here means the implementation and its internal gates are complete. It does not mean merged, deployed, signed, certified, app-store ready, production ready, or reviewed by counsel or a regulator** — none of those has happened, and the deferred items in the gate record say which remain hard pre-release gates. One field is still unfilled and says why: the merge reference, which exists only after a merge.

**What "COMPLETE" will mean when it is eventually claimed.** It will mean exactly two things: the phase's deliverables exist in this repository, and its own internal gates passed with their verification commands executed. It does **not** mean merged, deployed, running anywhere, production ready, app-store ready, signed, certified, penetration-tested, or legally reviewed. No environment is provisioned, no endpoint exists, no signed build has been produced, no store submission has been attempted, and no capability is available to anyone. Where a claim rests on static, source or artifact inspection rather than on a running device, this report says so in the place the claim is made.

Verification sections are filled by the phase lead after running the commands — they record executed results, never intentions.

## Close-out record

- **Merge status: PENDING — PR open, not merged.** No merge reference exists, and none is written here until one does.
- **Completion date:** 2026-08-18 (implementation and internal gates; the branch is not merged).
- **Final branch:** `claude/karar-v2-phase-4-flutter-foundation`, opened against `main` as [PR #7](https://github.com/MoayadAlobaidi/Karar-Flutter-version/pull/7). **Merge status: PENDING — PR open, not merged**; the merge reference is recorded only after the merge and is not written here.
- **Final implementation head:** `0880746` — the last commit that changed anything but documentation. Everything after it is the close-out record.
- **CI and Security runs:** against PR head `ebdcf99` — CI https://github.com/MoayadAlobaidi/Karar-Flutter-version/actions/runs/32098073101 (**success**: `workspace`, `architecture`, `mobile`, `mobile-android`, `mobile-ios`) and Security https://github.com/MoayadAlobaidi/Karar-Flutter-version/actions/runs/32098073108 (**success**: `codeql`, `secrets`, `dependency-review`, `dependency-audit`, `licenses`, `sbom`, `iac-and-containers`, `mobile-supply-chain`). **13 checks green.** 8 were branch-protection-required when the run executed; `mobile-android` and `mobile-ios` were added immediately afterwards, taking the required set to **10** — so this run proves the lanes pass, and the next PR head is the first at which they gate. The required set is listed in [`../operations/repository-security-settings.md`](../operations/repository-security-settings.md).
- **Final canonical counts:** workspace **1272 passed / 12 skipped (1284)** across **119 passed / 1 skipped (120)** files; the gated readiness and rate-limit-store suite run explicitly **12 passed**; Flutter as CI runs it **1190 passed / 19 skipped (1209)**, reconciled below; Flutter localization gate **36 passed**; golden baselines, local only, **4 passed**; mobile security suite under its artifact gates **113 passed / 1 skipped**; runtime OpenAPI conformance **61 tests**, **82 of 128** declared operation/status pairs validated against real serialized responses, **0** media-type deviations, **0** prose-only operations; generated Dart client in sync at **35 operations / 98 schemas**; architecture **24 passed / 0 failed / 4 deferred by activation phase**, registry errors 0, self-test **56/56**; documentation checks **13/13**, self-test **14/14**; **38 migrations** applied in full sequence from `0001` to `0086` against an empty database, verification clean. The full table with the exact commands is in [Test commands and canonical counts](#test-commands-and-canonical-counts).
- **Clean-clone verification:** PASS, on a fresh clone at the Phase 4 head. Every step exited 0. The 38 migrations ran the full sequence from `0001` to `0086` with verification clean — and one nuance is recorded rather than smoothed over, because it would otherwise read as a stronger claim than it is: `db:create` reported that database `karar` **already existed**, which is the PostgreSQL image's own `initdb` creating it from `POSTGRES_DB` on a brand-new volume, not a database that survived from anywhere. **The from-zero claim rests on the migration sequence running from `0001`, not on a fresh `CREATE DATABASE`.** The Flutter suite was run before any Android or iOS artifact existed, which is what produced the 1190/19 figure above; the Android and iOS lanes then built and asserted their artifacts under the gate variables, and **no provisioning profile was present in the PRODUCTION bundle**. This is maintainer reproducibility verification, not independent organizational testing.
- **Security-suppression review:** **no new suppression was introduced by this phase.** `.gitleaksignore` is byte-identical to its state at the Phase 3.5 base `e23bbc8` — the two exact-fingerprint entries reviewed at the Phase 3 close as EV-318 are unchanged, and no entry was added, widened, or re-scoped. No suppression comment, inline disable, or allow-list was added anywhere in the phase's diff. The code-scanning alert state at the close-out head is **1 alert, 0 open** — CodeQL alert #1, `js/insufficient-password-hash`, dismissed as a false positive in Phase 3 and **re-read at this gate rather than accepted**: the flagged `digest()` in `packages/platform/src/ratelimit/keys.ts` is an HMAC over rate-limit subject material (an e-mail, an IP digest, a token hash — never a human password), and passwords are hashed with argon2id in `modules/identity`. The dismissal stands on inspection.
- **Compliance gate:** recorded in [`../compliance/phase-compliance-gate.md`](../compliance/phase-compliance-gate.md) with its outcome and every deferred item's reason, owner, target, residual risk, and closure condition. The outcome is **PASS_WITH_DOCUMENTED_DEFERRED_ITEMS**, with twelve deferred items; a gate whose result is written before the gate runs is not a gate, and this one was written after.
- **Evidence:** **EV-431 through EV-466** (36 rows; 32 COLLECTED, 4 PENDING — the independent closeout review, the PR CI run, the PR Security run, and the code-scanning suppression review, each stating what has not happened and why), each row carrying its CODE / RUNTIME / ARTIFACT / INFRASTRUCTURE / ABSENT label in the [evidence register](../compliance/evidence-register.md).
- **Independent review:** **0 BLOCKING / 0 HIGH / 2 MEDIUM / 5 LOW.** Both MEDIUM findings were fixed within the phase. The five LOW dispositions are tabulated in [Independent-review result](#independent-review-result) — three fixed, two deferred with their five fields. **Reviewer sign-off: the phase lead, in the reviewing role, against close-out head `ebdcf99`.** That is a maintainer signing off their own phase, which is exactly what EXC-001 records and is not organizational independence. **Agent review is technical review, not organizational independence** — see Known limitations.
- **Carried risks and limitations:** the biometric prompt has not been exercised on any real device, on either platform; no signed build exists and no signing material is in the repository; there is no real Apple Team ID, so cross-platform transfer is unverified on a device; the compound credential-abandonment guarantee is local-only and closes with server-side revocation, which is not in this phase; the golden baselines are not CI-enforced and have never run on Linux; runtime response conformance covers 82 of 128 declared operation/status pairs; the direct Android-to-iOS artifact identity comparison covers one environment pair in CI rather than four; the Dart runtime loopback rule is narrower than the build-time rule; the design system's `ThemeData` is not wired into the shell; the jurisdiction reference list is empty in the client; no offline cache exists; screen capture is not prevented; `requestId` is not populated in the composed application; and every workstream role resolves to a single maintainer. All are stated in full, without softening, in [Known limitations](#known-limitations).
- **Scope confirmation:** no Phase 5 feature was implemented. See the final section.

---

## Objective

Build the first production-quality Flutter client foundation against the real Karar API contracts, and harden the backend contracts it depends on. The client authenticates, restores and refreshes sessions safely, binds and switches tenant context, and renders navigation from what the server actually says is available — never from a hardcoded list. Arabic and RTL are first-class from the start, not a later pass. Every real product capability stays unavailable, and the authenticated home is an honest account and security state rather than a fabricated finance dashboard.

Three backend gaps carried out of Phase 3.5 are closed first, because the client cannot be built honestly on top of them: bootstrap could not distinguish a resolution failure from a legitimate empty capability set, the bootstrap response carried no safe operating-entity summary, and consent acceptance was unreachable in every environment.

## Scope

Backend contract hardening (bootstrap failure semantics, client-safe operating-entity projection, local and test seeding, jurisdiction self-declaration where onboarding requires it) · Flutter feature-first Clean Architecture · app bootstrap and startup state machine · environment profiles · generated internal Dart API client with CI drift detection · network layer with typed failure mapping · authentication, email verification, password recovery and change, MFA · persisted sessions, secure token storage, single-flight refresh coordination, session management · local biometric and app lock · tenant selection and switching · capability-aware navigation from the server bootstrap · operating-entity and legal-document presentation · consent state foundation · English and Arabic localization with first-class RTL · accessibility · design system with the default Karar brand · mobile security controls · Android and iOS build foundations · Flutter CI · compliance records and evidence.

## Out of scope

Financial accounts, bank connections, statement import, transactions, merchants, categorization, budgets, goals, financial dashboards, and any financial calculation (Phases 5–6) · AI (Phase 7) · Zakat calculations and methodology profiles (Phase 9) · Amanat (Phases 13–14) · subscriptions, prices, billing (Phase 10) · white-label product builds and bank-specific branding (Phase 11) · Super Admin UI (Phase 8) · push notifications, external analytics, advertising, external crash reporting · Apple Pay and Google Wallet · cloud deployment, DNS, production API endpoints, app-store publishing, and production signing.

No screen is built for a later capability, and no fabricated balance, account, transaction, sync state, insight, score, or placeholder monetary value appears anywhere.

## Branch and base

The branch history is counted with `git rev-list --count e23bbc8..HEAD` rather than written down, because every remediation round adds to it and a number recorded in prose is stale the moment the commit recording it lands — which has now happened twice, at eighteen and again at twenty-one. The composition is stable even as the count moves: three backend commits (`3383b2f`, `22df3fe`, `6ddf7c0`), one opening the phase, one `.gitignore` correction, and the remainder client work and the fixes that review and execution forced. **No database migration was added, and no permission was declared or seeded** — the phase is read, projection, and presentation work over the Phase 3.5 schema, and every new operation is self-scoped.

## Agent/workstream ownership

Owners are workstream roles; the lead's ledger is authoritative.

| Workstream | Owner | Responsibility |
|---|---|---|
| Lead | Phase lead | Integration, composition-root wiring, OpenAPI merge, verification runs, phase gates, final merge |
| Backend contract | Backend workstream | Bootstrap resolution semantics, the operating-entity summary reader, the three client-facing surfaces, the local consent seed |
| Client architecture | Client-shell workstream | `app/`, `core/`, the startup coordinator, routing, networking, the generated client and its generator |
| Identity features | Identity workstream | Authentication, MFA, email verification, password recovery and change, session directory, application lock |
| Platform features | Platform workstream | Bootstrap presentation, home, jurisdiction, legal context, service-unavailable, profile, settings, tenant selection, consent |
| Design system | Design-system workstream | `shared/design_system`, tokens, the Karar brand palette, accessibility and contrast assertions |
| Localization | Localization workstream | ARB catalogues, the parity and brand-name gates, RTL enforcement, numerals |
| Mobile security | Security workstream | Android and iOS build guards, manifest and ATS posture, dependency pinning, artifact assertions |
| Compliance | Compliance workstream | Control-matrix, risk-register and evidence-register updates for Phase 4 |
| Documentation | Documentation workstream | Architecture and security landed-state updates, onboarding, glossary, README, this report's body |
| Independent review | Reviewer | Reviews the integrated result without having built it |

All workstreams resolve to a single maintainer directing agent workstreams — see Known limitations.

## Deliverables

| Deliverable | Location |
|---|---|
| Application shell: bootstrap sequence, error handlers, the single composition root, the startup state machine, the one router redirect | `apps/mobile/lib/app/` |
| Cross-cutting foundation: sealed `Failure` taxonomy and `Result`, redacting logger, transport, RFC 7807 mapping, refresh coordinator, secure storage, session, application lock, preferences, clock and correlation ids | `apps/mobile/lib/core/` |
| Ten features, each `domain/ data/ presentation/`: authentication, consent, email verification, MFA, password recovery, platform bootstrap, profile, session management, settings, tenant selection | `apps/mobile/lib/features/` |
| Design system: tokens (colour, typography, spacing, radii, sizing, elevation, motion), the Karar brand configuration with light and dark palettes, fourteen components, one interactive primitive | `apps/mobile/lib/shared/design_system/` |
| Localization: English and Arabic ARB catalogues with committed generated Dart, the locale facade, bidi text, Arabic numeral handling and the single formatter | `apps/mobile/lib/l10n/`, `apps/mobile/lib/shared/formatting/` |
| First-party OpenAPI-to-Dart generator and its committed output | `apps/mobile/tool/generate_api_client.dart`, `apps/mobile/lib/core/networking/generated/` |
| Android build environment guard, manifest posture, data-extraction rules, network security configuration, AppCompat themes, signing configuration with no debug fallback | `apps/mobile/android/` |
| iOS packaged-bundle verification build phase, the App Transport Security fragment, xcconfigs, localized purpose strings | `apps/mobile/ios/` |
| Backend: bootstrap resolution outcomes and the 503 problem, the four-column operating-entity summary reader and its use case, jurisdiction self-declaration and the declarable-reference list, own-membership listing, legal-document content with its refusing source | `modules/bootstrap/`, `modules/operating-entity/`, `modules/jurisdiction/`, `modules/tenancy/`, `modules/consent/` |
| Local-and-test-only consent prerequisite seed | `scripts/db/seed-local-consent.mjs` |
| OpenAPI additions and the contract version bump | `packages/api-contracts/openapi/` |
| Flutter CI lanes: analysis, drift, localization, suite, Android debug and release artifact assertions, iOS packaged-bundle assertions across all four environments | `.github/workflows/ci.yml`, `.github/workflows/security.yml` |

## Architecture changes

**None to the approved architecture.** ADR-0007 and ADR-0009 are implemented as written, and ADR-0016's client-exposure rule is consumed rather than reinterpreted. Decisions made within the architecture, recorded explicitly:

1. **The startup decision lives in exactly one place.** A coordinator owns fourteen states; the router carries one redirect driven by it; a feature registers a screen for a state but never decides which state holds. A second redirect is the specific bug the coordinator exists to prevent, and adding one is a review failure rather than a style preference.
2. **Capability navigation is an allowlist, never a denylist.** The client keeps a compile-time set of navigable ids and drops everything else. There is deliberately **no "unrecognised" collection**, because such a collection would itself be a channel for the names it holds — which is exactly what ADR-0016's omission rule exists to prevent.
3. **A resolution failure and an empty result are different types, on the wire and in the client.** The bootstrap response's capability section is discriminated: `RESOLVED` with zero items is an answer, and an unavailable resolution is a 503. Before this phase the enrichment ports returned bare values and could not express failure at all, so a store fault and a user with no services were indistinguishable.
4. **Enrichment failures are not uniform, and the asymmetry is deliberate.** A jurisdiction failure short-circuits before the downstream resolvers run; a PolicyPack or capability failure fails the call; an operating-entity failure degrades that one section and the call still succeeds. The client cannot render *services* without a resolution, but it can render an account without a legal-entity summary.
5. **The client-safe operating-entity projection is enforced by the SELECT, not by a mapper.** The reader selects four columns, so licence evidence, contract references, registration internals, role assignments and administrative metadata never enter the process. Authorization is resolution-scoped: a caller cannot name an entity or enumerate the register, only receive the one derived from their own binding.
6. **Jurisdiction self-declaration changes which denial a subject sees, and nothing else.** Source and verification are module-level constants rather than inputs, the schema constrains the pair independently, and a declaration cannot supersede a verified assignment. It exists because both operator write paths are gated on a deliberately unseeded permission, which left bootstrap permanently reporting no jurisdiction.
7. **The offered set and the accepted set share one predicate.** `declarabilityRefusalAt` decides both what the reference list returns and what the write path accepts, so the two cannot drift into disagreement.
8. **A build refuses to exist rather than shipping misconfigured.** The endpoint guard is a build-time failure on both platforms, before any artifact is produced and, on iOS, before code signing. The runtime loader is a second layer with a different job, not a duplicate.
9. **The localhost transport exception is added, not stripped.** The iOS ATS exception is injected into a packaged bundle only when the configuration is Debug **and** the compiled environment is LOCAL, and removed-then-re-verified otherwise. Absence of an environment is not treated as LOCAL.
10. **User-facing text lives in one catalogue.** Six per-feature Dart string catalogues were deleted and their contents moved into the ARB files, because a message outside the ARB files is outside every localization gate the project runs.

## ADRs added or amended

**None.** The record stands at ADR-0001–0026. Phase 4 implements ADR-0007 (the client computes nothing authoritative), ADR-0009 (OpenAPI-first, generated client), and consumes ADR-0016's client-exposure rule and ADR-0024's operating-entity dimension without changing either.

## Backend contract changes

Additive at the path level, **breaking at the response-shape level in three places**, and the contract version moved to `0.5.0`.

Four new operations:

| Path | Method | What it answers |
|---|---|---|
| `GET /tenancy/memberships` | get | The caller's own active memberships. Deliberately tenantless — mounted through a separate module with a principal source that drops `tenantId`, so it cannot receive the tenant-bound principal |
| `GET /jurisdiction/declarable-references` | get | Which jurisdictions may be self-declared. Authentication required, tenant binding deliberately **not** — onboarding needs the chooser before it can bind. A store failure is a 503, never an empty list |
| `POST /jurisdiction/self-declaration` | post | Records a `USER_DECLARED` / `UNVERIFIED` assignment |
| `GET /consent/documents/{documentId}/content` | get | The published text of a legal document, hash-verified against the version that published it |

Three response-shape changes that break a client written against Phase 3.5:

1. `GET /platform/bootstrap` — `operatingEntity` became a discriminated `{state, entity}` rather than a nullable object. A client reading `operatingEntity.id` directly breaks.
2. `GET /platform/bootstrap` — `capabilities` became `{state, items}` rather than a bare array. A client iterating it as an array breaks.
3. `GET /consent/documents` — `storageRef` was **removed** from the listing. It is a storage locator, and a client has no business holding one.

Additively, the bootstrap problem shape gained `retryable` and `requestId`, and a new `BOOTSTRAP_UNAVAILABLE` code answers 503 for every dependency failure — one code for all five, deliberately, so the response does not disclose which dependency failed. The 503 path carries no `detail`.

**Every problem document now leaves through one writer, and the seventeen `/auth` operations acquired response schemas.** Both were gaps this phase found by binding the running server to the contract rather than by reading either. Twenty-five operation/status pairs across five modules were returning correctly shaped RFC 7807 bodies under `application/json` while the contract declared `application/problem+json`: the media type was set only by the error boundary, which sees thrown failures, and those twenty-five answered by writing to the reply object directly. They now throw, and the boundary supplies the media type — a shared writer imported *by* the modules was not available, because `apps/api` depends on every module and the import would have been a project-reference cycle, so the direction of the dependency decided the design rather than convenience.

The identity fragment separately described all seventeen `/auth` response bodies in prose and attached no schema, which meant the generated Dart client decoded them as untyped JSON and no runtime check could hold the server to anything. They now carry full schemas built from shared components, including the login 200 as a `oneOf` over the authenticated and MFA-required branches. Both ledgers that recorded these as known deviations are now asserted empty, so a new prose-only operation or a new direct-reply problem is a failing test rather than a silent entry.

**The legal-document content endpoint is wired to a source that always refuses in every deployed environment.** `NoContentSourceConfigured` returns null for every version, so the endpoint answers 409 `DOCUMENT_CONTENT_UNAVAILABLE` with reason `NOT_RETRIEVABLE`. LOCAL and TEST bind a synthetic fixture instead, and only there — see [Legal documents and consent](#legal-documents-and-consent). 409 rather than 404 is the point: the document exists and consent is still owed; only the wording is unavailable. Two further honesty properties hold on that endpoint — an unknown document and another entity's document get **byte-identical** answers, so the catalogue is not an oracle; and retrieved content whose SHA-256 does not match the published version is a 503 with nothing served.

## Flutter architecture

Feature-first Clean Architecture, documented as an enforced contract in [`apps/mobile/lib/README.md`](../../apps/mobile/lib/README.md) and mapped in [`../architecture/flutter.md` §3](../architecture/flutter.md).

Ten feature folders, each `domain/ data/ presentation/`, dependencies pointing inward only. **Every one of them is account, identity, or platform state** — there is no feature folder for a product capability, because no product capability exists. Domain purity is scanned rather than reviewed: a file under `features/*/domain/` may not import Flutter, Riverpod, go_router, dio, secure storage, biometric plugins, the generated DTOs, `dart:convert`/`dart:io`/`dart:ui`, or any analytics or fingerprinting package.

Riverpod is the only composition mechanism — no service locator, no static singleton, no global mutable instance. Three provider shapes are used and no others, and exactly one `ChangeNotifier` exists, as the bridge that lets the router listen to the startup coordinator while the coordinator stays pure Dart.

Failures are values, never exceptions: a sealed `Failure` with 25 arms paired with `Result`, so a `switch` is exhaustiveness-checked. `ApiException` exists only inside the data layer, and repository implementations map `FormatException` and `TypeError` into a contract-violation failure — not optional, because a payload the decoder cannot classify must degrade the client rather than crash it.

## Startup state machine

Fourteen states, each mapping to one route and declaring one recovery action: `CONFIG_LOADING`, `CONFIG_INVALID`, `LOCAL_SECURITY_STATE_UNAVAILABLE`, `SECURITY_RECOVERY_BLOCKED`, `APP_LOCKED`, `SESSION_RESTORING`, `UNAUTHENTICATED`, `SESSION_EXPIRED`, `MFA_CHALLENGE_REQUIRED`, `EMAIL_VERIFICATION_REQUIRED`, `TENANT_SELECTION_REQUIRED`, `BOOTSTRAP_LOADING`, `BOOTSTRAP_UNAVAILABLE`, `READY`. **Protected content renders in `READY` and nowhere else.**

The two security states were added in this phase and each exists because the alternative was a fail-open default. `LOCAL_SECURITY_STATE_UNAVAILABLE` is reached when the security-state store cannot be opened or read: the lock choice is unknown, and an unknown lock choice must not be spent as "off". `SECURITY_RECOVERY_BLOCKED` is reached when a session was abandoned but neither the credential deletion nor the durable invalidation could be confirmed. Both offer an explicit retry, and both are siblings of the lock and sign-in routes so the single redirect converges in one hop rather than oscillating.

The order is what makes it fail closed, and each step is terminal for the ones after it. Configuration is validated first, and an invalid build stops there rather than proceeding to a sign-in screen it cannot serve. **The security state is then loaded as its own explicit step, before the lock is evaluated and before any token is read** — the lock cannot be checked against a value nobody managed to read, so a store that will not open stops the launch here instead of further down. Session restore precedes bootstrap, and **a secure-storage failure during restore is treated as unauthenticated, never as an empty store**. Within a successful bootstrap: email verification, then tenant binding, then capability resolution, then operating-entity state — so nobody is asked to choose a tenant before their address is verified, and a degraded dependency never presents itself as a working home screen.

A generation counter drops stale emissions, so a slow resolution that completes after a sign-out cannot move the application back.

## API-client generation

Covered in full in [`../architecture/flutter.md` §8](../architecture/flutter.md). The phase-relevant record:

The generator is first-party rather than `openapi-generator`, because the contract is hand-authored and schema-light in ways a general-purpose generator handles by inventing types. It refuses rather than guesses in three places, each a hard error quoting the contract: no invented response type where the contract gives no schema, no arbitrary choice between two schema-carrying 2xx responses, no union without a declared discriminator. At runtime an unknown **enum** value decodes to `unknown` — a server may add one at any time — while an unrecognised **union branch** is a contract violation, because a branch changes which fields exist.

**A defect found and fixed in this phase:** identifier construction split on a fixed list of separators, so the media type `text/markdown` carried its slash into the emitted source and produced an enum member that would not compile. Every non-alphanumeric character is now a boundary. Three guards landed with the fix, because a naming rule that maps many values onto one name is its own defect: a value reducing to the reserved `unknown` member, a value that cannot form a Dart identifier or collides with a Dart reserved word, and two distinct wire values reducing to the same member each fail generation with the offending contract text named.

Drift is checked contract-to-client by `dart run tool/generate_api_client.dart --check`, which regenerates in memory, needs no working tree, and runs as its own CI step before the suite. A companion test asserts the generated files still declare themselves generated, still carry matching digests, and still document the `--check` command — so the CI step cannot quietly stop proving anything.

## Authentication flows

Sign-in, registration, email verification, password recovery and change, MFA enrolment, challenge, disable and recovery codes, and a session directory with individual and bulk revocation. Every screen is built on the same identity scaffold, in both locales, with every interactive control asserted to carry a name.

Two properties are worth naming. **Pre-auth responses stay neutral** — the client renders a receipt that does not distinguish a known address from an unknown one, matching the server's own enumeration defence. And **the MFA enrolment screen has no golden baseline and must never be given one**, a rule stated in the source and enforced by a scan.

## Session and token behaviour

One in-flight refresh, shared by every concurrent caller, so many requests meeting an expired token produce exactly one refresh call. Four behaviours, each asserted: a caller whose token was already replaced takes the new one and issues nothing; an expired refresh token ends the session **without any network call**; terminal failures (rejection, authorization failure, contract violation) end the session and wipe the credential while transient ones (offline, timeout, rate-limit) leave it intact for a retry; and the refresh call itself is issued over a separate raw transport with no session manager, no coordinator and no retry policy, which makes a refresh storm structurally impossible rather than merely unlikely.

On a 401 the transport refreshes and replays **once**; a second 401 is authoritative. **An unsafe request without an idempotency key is not replayed** — the caller reissues deliberately rather than having the transport send a write twice. Ending a session is idempotent, so a failed refresh and a 401 arriving together cannot double-signal, and the in-memory credential is dropped before storage is wiped so a failed wipe still leaves the process credential-free.

## Secure storage

One secure entry exists: the access and refresh tokens, their expiries, and the session id, under a namespaced key. Options are chosen rather than defaulted, with the reasons recorded beside them — iOS and macOS use `first_unlock_this_device` because a stricter class would break refresh on a device locked in a pocket and because `this_device` keeps the credential out of iCloud Keychain and off any restored backup; Android resets on error so a key-material change forces re-authentication rather than leaving a half-readable store.

**Failure is closed.** Every operation returns a `Result` in which a genuine absence and an unreadable store are different values, and on failure only the key *name* is logged — never the value, and never the platform error message, which can echo the entry. Non-sensitive preferences live in a separate, deliberately unencrypted store whose key type refuses a credential-shaped name at construction.

**A third store exists, and the reason it exists is a defect this phase found in the second one.** Security-relevant flags — whether the application lock is on, and whether a persisted session was abandoned — were being kept in the ordinary preference store. That store is correct for what it was built for and wrong for this: it swallows a failed write and logs it, and when the platform store cannot be opened at all it substitutes an in-memory one. Both behaviours are defensible for a dismissed hint or a theme choice. For the lock flag they compose into a fail-open: an unopenable store reads as absent, absent reads as `false`, and `false` reads as *the user never turned the lock on*.

`LocalSecurityStateStore` is the narrow port that replaces that usage. Its key type is a closed enum of two flags, so no credential-shaped key is expressible at all; its values are booleans. Every operation returns a sealed outcome that keeps the cases apart — a read distinguishes a value, a genuine absence, an unavailable store and a corrupt one; a write distinguishes success, refusal and unavailability; removal likewise. **There is no in-memory fallback**: when the platform store will not open, the port returns an implementation that reports unavailability to every call rather than an empty one that answers "absent". Diagnostics carry the flag name and never the stored value. `KeyValueStore.writeBoolChecked` — the narrower fix attempted earlier in this phase — was deleted with it, so the ordinary preference store now offers no way to ask whether a write landed, which is the honest shape for a store that does not guarantee one.

## App lock and biometrics

`local_auth` is reached through one adapter. No biometric template, image, or derived representation is received, stored, or transmitted; no custom biometric cryptography exists; **an unlock grants no session and never substitutes for signing in.** The failure mapping is fail-closed, including its default arm, because the plugin's error list is explicitly open and an unseen code must not read as success.

**Turning the lock on now requires a confirmed durable write.** It previously did not: the write went to the swallowing preference store and the controller set its state to enabled regardless, so a platform refusal produced a switch that read as on for the rest of the process and was off again at the next cold start — the one moment the lock is supposed to matter. Enabling now applies only on a confirmed write and otherwise leaves the previous durable state alone with a typed, recoverable error surfaced to the caller. Disabling is symmetric and biased the other way: a disable that cannot be confirmed **retains the enabled state**, because the safe end of that failure is a lock the user must open, not one that silently stopped existing.

Two Android build facts follow from that one plugin. The host activity is a `FlutterFragmentActivity`, because `androidx.biometric` requires one. And the launch and normal themes descend from `Theme.AppCompat`, because **below API 28** `androidx.biometric` draws its prompt with an AppCompat dialog that throws under a non-AppCompat theme. **The affected range is Android 8.1 and earlier — API 27 and below; at API 28 the framework's own prompt takes over and the requirement stops.** `minSdk` is 24, so API 24–27 ships inside that range: this is a shipped-configuration control, not a development convenience.

**A defect that only running the application exposed.** The lock screen's "sign in with your password" fallback navigated to the sign-in route while the startup state was still `APP_LOCKED` — and the single redirect maps that state to the lock route and returns any other location to it, so the button rendered, responded, and put the person back where they started. Anyone whose device authenticator had stopped working was **trapped behind a lock they could not open**, which is the exact outcome the screen's own comment promised could not happen. Every unit test passed throughout, including one correctly asserting that the locked state maps to the lock route; the widget test asserted the button *existed*. It now ends the session, so the state leaves `APP_LOCKED` and the same redirect routes to sign-in unaided — which is also the honest behaviour, because the lock is not something to step around into an authenticated session. The new test presses the button and asserts the stored session is gone.

**It has not been exercised on a device.** See Known limitations.

## Tenant selection and switching

Membership listing, first bind, switching, and invitation redemption, consuming the Phase 3.5 binding surface without re-deriving any of its authority. A switch invalidates the tenant-scoped providers explicitly rather than relying on a rebuild, so a screen cannot render the previous tenant's data after the session rotated.

The client never asserts a tenant. Binding comes from the server's own membership read; the client presents choices and sends a selection.

## Jurisdiction declaration

The screen presents the reference list, records a declaration, and states in its own outcome text that the result **remains unverified**. The domain type carries `isVerified` as a method that always returns false — present rather than absent so a reader of the type cannot mistake a recorded declaration for a verified one. The controller has no optimistic transition: a declaration nobody recorded is not a declaration.

**The reference list is empty in this build.** See Known limitations.

## Bootstrap behaviour

The client calls the bootstrap surface once per launch through a gateway that maps the response into a snapshot, and every platform screen derives from that snapshot rather than fetching independently. Three outcomes are kept apart deliberately, in three different files, and the distinction is asserted in both directions:

- A 200 whose capability section is `RESOLVED` with zero items reaches the signed-in surface and renders an honest empty state: the account is in order, and the platform has confirmed nothing is enabled for it.
- A resolution that could not be performed becomes a 503 and renders an outage screen that **names no service, no entitlement and no dependency**, offers a retry, and never navigates onward.
- A binding state that requires a selection routes to tenant selection rather than to either of the above.

## OperatingEntity projection

Four fields cross to the client: id, registered legal name, an optional jurisdiction reference, and an optional published role mailbox. The presentation screen states its own limits in source: it does not state or imply a controller or processor role, a legal obligation, a licence, a regulatory approval, a supervisory relationship, or a lawful basis for processing. There is deliberately no separate display or trading name, and none is constructed.

The mapper refuses one contradiction rather than papering over it: a state that says *assigned* with no summary attached becomes *unavailable*, not an assigned entity with a blank name.

Unassigned is rendered as information, not as an error — a person with no entity binding is in a legitimate state.

## Legal documents and consent

The consent surface resolves each purpose through a pure decision table over the platform's own status, the applicable documents, and three prerequisites read from the bootstrap answer. It draws an action **only when the server said the action can work**: acceptance appears only when the state needs it, a pinnable version exists, and the prerequisites are met; otherwise withdrawal appears only for an active grant; otherwise no control at all.

Three "nothing here" outcomes are kept distinct, because collapsing them would misinform:

1. **No applicable document** — a stated answer, rendered as an empty state with no retry and no error styling.
2. **The applicable-document read failed** — an error state with a retry and a correlation reference.
3. **A document exists but its wording does not** — a neutral notice on the document itself.

**No legal-document content exists in any deployed environment.** A deployed build wires the endpoint to a source that refuses, and the client renders the localized "not available" notice rather than composing substitute wording. A document with no effective version draws no acceptance control at all. This is the honest state: inventing terms of service would be worse than admitting there are none. **No PolicyPack is legally approved, no capability is cleared, and no counsel or regulator has reviewed anything in this repository.**

LOCAL and TEST are the exception, deliberately, so the read-and-accept path can be exercised end to end rather than only asserted around: seed, retrieve the document, retrieve content whose hash is verified against the pinned version, accept that exact version, persist a version-pinned grant, and read the resulting `ACTIVE` status. The text that path serves is a synthetic fixture, and it is not a legal document.

**The fixture is physically absent from a deployed artifact, not merely refused at runtime.** It lives in its own private package that appears in no production `dependencies` block anywhere, so a production install has no copy to serve; the consent module holds only the generic port and names the package in exactly one place, through a guarded runtime resolution rather than an import, so a deployed process that lacks it reports the honest absence instead of failing to boot. The environment gate still exists next to the bytes, as a second and independent control. A test walks the real production dependency closure and the real build output, asserts every fixture marker is absent, and carries a positive control proving the same scanner finds them in the fixture package itself — an absence test that cannot demonstrate its own scanner works proves nothing.

## Design system

Tokens for colour, typography, spacing, radii, sizing, elevation and motion, resolved in one place from a brand, a brightness and a locale. One brand configuration ships — `karar` — with light and dark palettes and a **deliberately null wordmark**: no logo or marketing identity is invented, and no placeholder art is committed. A white-label partner supplies values only; there is no hook for partner-specific widgets, and flavour wiring is Phase 11.

Fourteen components sit on one interactive primitive whose `semanticLabel` is a **required, non-nullable** parameter — a control a screen reader cannot name is unusable — and which republishes its tap and long-press semantics because the underlying ink well's are excluded, so assistive technology gets a button it can actually activate.

Typography is script-aware rather than merely direction-aware: Arabic drops letter spacing, because tracking a cursive script is a defect, and carries extra leading.

The 48px minimum tap target is defined once and expressed as a *minimum constraint* rather than a fixed height, so a control grows under a raised text scale instead of clipping its label.

## Arabic and RTL

**Direction is never set by hand.** It flows from the locale through the framework, and the test harness deliberately refuses to accept a text direction — which is the only way a test proves that Arabic produces an RTL tree rather than proving the author remembered to ask for one. The one place a direction is computed is a bidi text component that resolves paragraph direction from the first strong character of *server-supplied* content, so a legal document or a display name renders in its own direction rather than the interface's.

Icon mirroring is a curated list rather than a wrapper: every member declares `matchTextDirection`, membership is asserted by test, and an icon that merely looks directional is deliberately excluded because the framework does not mirror it.

**The consolidation.** Six per-feature Dart string catalogues held **335 user-facing messages** — every one of them outside the ARB parity gate, the description gate, the placeholder gate, and the plural gate. They were deleted and their contents moved into the ARB files, taking each catalogue from **62 to 395 keys per language**; the fail-closed local security-state work later in the phase added its own user-facing strings, and the catalogues now hold **402 keys per language**. Parity is now exact in both directions, every English message carries a translator description, placeholders match, and any message that is plural in English must be plural in Arabic with the `few`, `many` and `other` arms present — Arabic has six plural categories, and a single form is wrong for most counts.

**The Arabic catalogue was shipping two numeral scripts at once.** Seven Arabic messages spelled quantities as Arabic-Indic literals while every ICU-carried number rendered Western, so the registration screen showed helper text reading `٨ أحرف على الأقل.` directly above the validation error `استخدم 8 أحرف على الأقل.` — one field, one requirement, two alphabets, both visible together. Live, not latent. Separately, six surfaces passed a number straight into a generated localization method, which formats with the intl bundle's own numbering system and never consults the single formatter: the character counter, the spoken tab position, the spoken recovery-code position, both password-length errors, and the revoked-devices notice. Inert while the formatter resolves to Western digits, and wrong the moment it does not.

The value stays an integer on the way in and the **message** goes through the formatter on the way out. Pre-formatting the number instead would have been simpler and wrong: two of these are ICU plurals, ICU selects the arm from the number, and Arabic's six plural categories would have collapsed to `other`. Resolution is against the formatter's own CLDR zero digit rather than a locale string, because the two disagree — the formatter formats against the full locale while the generated catalogue matches the language subtag only, so `ar_EG` reaches the `ar` bundle where the two would otherwise render different scripts on one screen. Three new suites hold it: a source scan requiring every numeric generated message to be wrapped, a prose scan forbidding a literal Arabic-Indic digit in any message, and a rendering suite over the six surfaces.

**The Arabic product name was two names.** The launcher-facing product name, the legal-document language notice, and the iOS Face ID prompt said **قرار**, while twelve in-app messages said **كرار**. كرار is correct: قرار is the ordinary Arabic word for "decision" and is the legacy Qarar system's name, which the style guide reserves. All three were corrected, and a test now holds the ARB catalogue and the iOS purpose string to the same name. **`قراراتك` in `consentScreenDescription` is deliberately unchanged** — it is the ordinary noun "your decisions", not the brand, and it is recorded as a named exception with its reason rather than suppressed. The exception is itself checked: if the message stops containing the word, the exception fails as stale.

## Accessibility

Asserted, not assumed. Across the component and screen suites: every interactive control carries a name; section titles are exposed as headers; a selected navigation destination announces its position; a loading control announces busy and blocks presses; an error is published as a live region; a sensitive subtree leaves the semantics tree when the application backgrounds; controls meet the 48px floor at both 1.0x and 2.0x text scale; every button variant renders without overflow at 2.0x in both locales; dialog actions stack rather than truncate at large text.

**WCAG 2.1 contrast is computed rather than eyeballed** — 4.5:1 for text, 3:1 for component boundaries — over **both** the light and dark palettes, across every reading surface, brand surface, destructive control, status container and focus ring.

## Android configuration

`minSdk` 24, `targetSdk` 36, and **`compileSdk` pinned to 37**, which is `flutter_secure_storage` 11.0.0's floor and nothing else's — independently re-verified at this close against the published package archive rather than against the previous version of the document. The Gradle plugin propagates that floor through AAR metadata and refuses a lower consumer, so the pin is a dependency constraint rather than a preference, and its removal trigger is recorded.

The source manifest declares **one** permission. **The merged manifest inside a real build carries four**, and the fourth had never been reviewed before this phase: an application-defined, `signature`-level permission contributed by `androidx.core` that restricts androidx's runtime-registered receivers to code signed with the same key. It grants no platform capability, and its name carries the environment's applicationId suffix — which is why the assertion matches it by shape rather than literal. The control is not the table in the architecture document; it is an **exact** comparison against a real build's merged manifest, so a dependency that starts contributing a permission fails the build rather than reaching a device unreviewed. A subset check would pass silently when a permission disappeared.

**`allowBackup="false"` does not disable device-to-device transfer at targetSdk 31 and above** — it disables cloud backup only, and a backup mode whose section is missing from the rules resource is *fully enabled*, not off. This build targets 36, so both statements apply to what ships. All three attributes are therefore set, and the data-extraction rules declare every mode and exclude every documented domain from each. Session tokens live in Keystore-backed storage, so a transferred copy would be ciphertext — but "the copy that left the device is useless" is a weaker claim than "no copy left the device", and only the second is a control.

**That same resource then made the release build impossible, and nothing caught it for several commits.** `<cross-platform-transfer>` requires a `platform` attribute; omitting it does not make the section permissive, it makes the *resource invalid*, and `lintVitalRelease` refuses the assembly. The resource whose entire purpose is closing the device-transfer path was what stopped a shippable artifact existing. It survived because a debug assembly parses the same file happily, `lintVitalRelease` runs only on a release assembly, and **the debug APK was the only Android artifact CI produced**. The fix is the attribute; the control is that CI now assembles a release as well, and asserts the result is **unsigned rather than debug-signed** — because no signing material exists here, so a signature would mean the debug key had been substituted.

The lesson is worth more than the fix: a hardening resource that is only ever parsed by the lenient build path is not verified by being present.

Release builds have **no debug-key fallback**: the signing configuration is created only when all four pieces of material are present, and an unsigned release is the intended failure.

### The build environment guard, and three defects it carried

The guard refuses to produce a DEV, STAGING or PRODUCTION package without a usable endpoint. Three defects were found and fixed during the phase, each demonstrating a different failure mode:

1. **The guard originally ran only when dart-defines existed.** A direct `./gradlew assembleRelease -Pkarar.env=PRODUCTION` passed through it untouched — a total bypass. **Absence is now the failure, not the exemption.**
2. **Host extraction used `substringBefore(':')`.** A bracketed IPv6 literal such as `[::1]:8443` therefore yielded `[`, which matched no rule, and a PRODUCTION build with a loopback endpoint succeeded. The IPv6 rules were **unreachable code that a source-presence test reported as present** — the general lesson being that a presence check certifies a rule is written, not that it runs. The extraction now unwraps brackets and strips trailing dots.
3. **`localhost.` — the fully-qualified form, which resolves identically but equals neither `localhost` nor any suffix — escaped both the Gradle and the Dart layer.** It is now refused at build time on both platforms. **It still passes the Dart runtime loader**; see Known limitations.

The behavioural proof runs in CI against real Gradle: nine endpoints must be refused, each **for the stated reason**, so the rules are proven by execution rather than by their presence in a file.

## iOS configuration

**iOS had no build-time endpoint guard at all until late in this phase**, while Android refused the identical build. A packaged-bundle verification script now runs as the Runner target's last build phase — after Xcode writes the plist, after the Flutter phase, and **before code signing** — and applies the same endpoint rules as Gradle, including the bracket unwrap and the trailing-dot strip.

**Every iOS artifact previously carried a localhost App Transport Security exception.** It now exists only in a Debug build whose compiled environment is LOCAL, and it is **added by the build phase rather than stripped**: the fragment is validated against an exact expected value before being merged, and in every other configuration any exception found is removed and the plist **re-read to confirm the removal**, because a rewrite that reported success without taking effect would otherwise ship the exception. Absence of a compiled environment is not treated as LOCAL. On every configuration the script additionally fails the build if arbitrary loads are permitted in any form, and if the Face ID purpose string or either localized variant is missing or empty.

CI exercises this across four environments: a LOCAL simulator build whose packaged bundle is verified to carry the exception, and DEV, STAGING and PRODUCTION builds whose packaged bundles are verified to carry none. It also asserts that a deployed build with no endpoint is refused, and that no code signing was involved.

**Every iOS artifact carried the production bundle identifier until this phase**, whatever environment it was compiled for, while Android had derived a per-environment identifier from the start. The identifiers are now separated on both platforms:

| Environment | Android | iOS |
|---|---|---|
| LOCAL | `com.kararfinance.app.local` | `com.kararfinance.app.local` |
| DEV | `com.kararfinance.app.dev` | `com.kararfinance.app.dev` |
| STAGING | `com.kararfinance.app.staging` | `com.kararfinance.app.staging` |
| PRODUCTION | `com.kararfinance.app` | `com.kararfinance.app` |

The obstacle was real and the earlier note about it was half right: the Flutter tool does forward dart-defines into the Xcode build, as a base64 CSV in `Generated.xcconfig`, but xcconfig has no string functions and cannot decode it. So the rule cannot live in an xcconfig, and it was put where a decoder already existed — the packaged-bundle build phase, which already decodes the compiled environment to gate the transport-security exception. That phase derives the expected identifier, refuses a `PRODUCT_BUNDLE_IDENTIFIER` that is not one of the four issued identifiers, narrows the packaged plist when the configuration default and the compiled environment disagree, and **re-reads to confirm on every branch**. A build with no compiled environment is refused rather than defaulted. The xcconfig values are now per-configuration defaults — Debug to LOCAL, Release and Profile to PRODUCTION — mirroring Android's `-Pkarar.env` default, which keeps the ordinary `flutter run` loop working.

**One consequence worth stating plainly: `flutter run` and Xcode-IDE builds now require `--dart-define=KARAR_ENV`.** A build told nothing about its environment is refused instead of silently becoming a production-identified artifact.

If a development team or provisioning profile is set and narrowing would be required, the **build fails** rather than producing an artifact whose identifier no longer matches its profile.

## Environment and build profiles

Four profiles compiled in as dart-defines. An unrecognised environment stops the build rather than quietly becoming LOCAL. **The client holds no secret**: a define whose *name* looks credential-shaped is a configuration violation reported by key name, never by value.

The runtime loader reports every violation at once rather than the first, and an invalid configuration routes the launch to a configuration-error screen rather than a sign-in screen it could not serve.

**No endpoint exists for any environment, so the only packages this repository can build today are LOCAL ones.** That is not a gap in the guards; it is what the guards produce in the absence of infrastructure.

## Dependency decisions

Every direct non-SDK dependency of the mobile pubspec carries an **exact version — no caret, no range** — with the committed lockfile beside it. A range would not be a weaker rule but its absence: a republished upstream could change what builds without changing what was reviewed.

The rule is asserted rather than reviewed. The pinning test fails on any inexact constraint; on any nested-block dependency (`git:`, `path:`, `hosted:`) that is not one of the three SDK-sourced entries — the bypass an exact-version regex alone would miss; on a missing `flutter_secure_storage`, `local_auth`, `dio`, `go_router`, or `flutter_riverpod`, each named individually so *removing* one is also a failure; on any `dependency_overrides` section; and on a lockfile that does not record hosted sources with checksums. It opens with a guard that the parser found dependencies at all, so a parsing regression cannot make the rest vacuous. The regression that motivated it was real: `local_auth` had drifted to a caret range with nothing failing.

**One workspace dependency override exists, and it is pinned exact.** `deepmerge-ts` reaches this repository only transitively, through `@prisma/config`, and versions below 8.0.0 carry a high advisory (`GHSA-ggr8-5vv4-36mx` / `CVE-2026-40345`, uncontrolled recursion). The override forces the patched line. It names an exact version rather than a range, because a range under a security override is the one place a range actively hurts: it would let a future lockfile refresh pull an unreviewed release in under the authority of a security fix, with nobody looking at it. The reachable severity here is well below the advisory's — what it merges is this repository's own Prisma configuration, not attacker-supplied input — and that argument is recorded next to the pin rather than used to skip it. Owner: Engineering Owner. Removal trigger: a Prisma release whose own dependency moves to a patched line, at which point the override is redundant and must be removed rather than carried.

**The corresponding advisory alert is still OPEN, and it stays open until this lockfile reaches `main`.** `pnpm audit --audit-level high` reports no known vulnerabilities *on this branch*, because the override applies here; the repository-level alert is raised against the default branch's lockfile, which does not yet carry it. The two are not in conflict and neither is wrong — they are answering questions about different trees. **Closing the alert is therefore a consequence of the merge, not a prerequisite for it**, and it is recorded here so that an open alert at merge time is a known state rather than a surprise. If it does not close after the merge, the pin did not reach the default branch and that is the finding.

**Every Flutter step in both workflows now runs `flutter pub get --enforce-lockfile`**, which closes the gap the architecture document carried when the pinning rule first landed and CI ran plain `flutter pub get`. Two dependencies carry their own record with a named owner and review triggers: `flutter_secure_storage` (the only place tokens are written) and `local_auth` (decides whether the lock opens, and contributes two permissions to the shipped manifest).

## Test commands and canonical counts

Commands, exactly as run:

| Suite | Command |
|---|---|
| Workspace (packages, modules, apps) | `pnpm test` |
| Flutter, as CI runs it | `cd apps/mobile && flutter test --exclude-tags golden` |
| Flutter localization gate, run separately in CI ahead of the suite | `cd apps/mobile && flutter test test/l10n` |
| Generated-client drift | `cd apps/mobile && dart run tool/generate_api_client.dart --check` |
| Golden baselines, deliberately not in CI | `cd apps/mobile && flutter test --tags golden` |
| Android artifact assertions (CI lane, after a real build) | `KARAR_VERIFY_ANDROID_ARTIFACT=1 flutter test test/security/platform_hardening_test.dart` |
| iOS packaged-bundle assertions (CI lane, after a real build) | `KARAR_VERIFY_IOS_ARTIFACT=1 flutter test test/security/ios_packaged_bundle_test.dart` |
| Readiness and rate-limit-store recovery, gated and run separately | `KARAR_ENV=local POSTGRES_PORT=5433 REDIS_PORT=6380 KARAR_INTEGRATION=1 pnpm --filter @karar/api exec vitest run src/readiness.integration.test.ts` |
| Architecture tests | `pnpm arch:test` |
| Documentation checks | `pnpm docs:check` |
| Prisma drift | `make prisma-drift` |
| Full local gate | `make verify` |

**Canonical counts**, all produced by one run of the commands above against the tree this report describes, not carried forward from an earlier one:

| Gate | Result |
|---|---|
| Workspace suite (`pnpm test`) | 1272 passed, 12 skipped (1284), across 119 files passed and 1 skipped (120) |
| Runtime OpenAPI conformance (subset of the above) | 61 tests; 82 of 128 declared operation/status pairs validated against real serialized responses; 0 media-type deviations; 0 prose-only operations |
| Readiness and rate-limit-store recovery, run explicitly under its gate | 12 passed |
| Flutter, as CI runs it | 1190 passed, 19 skipped (1209) — see the reconciliation below |
| Flutter localization gate | 36 passed |
| Golden baselines (local only) | 4 passed |
| Mobile security suite, under its artifact gate variables | 113 passed, 1 skipped |
| Generated-client drift | in sync — 35 operations, 98 schemas |
| Architecture tests | 24 passed, 0 failed, 4 skipped by activation phase; 0 registry errors; self-test 56/56 |
| Documentation checks | 13/13; self-test 14/14 |
| Migrations, applied to an empty database | 38 applied, in full sequence from `0001` to `0086`; verification clean |
| Dependency audit (`pnpm audit --audit-level high`) | no known vulnerabilities on this branch; the `deepmerge-ts` advisory alert remains OPEN against `main` until this lockfile lands there — see [Dependency decisions](#dependency-decisions) |

**The Flutter row means one number and is reported by two, so the difference is stated rather than left for a reader to trip over.** The suite holds **1209** tests either way; what moves is how many of them can execute.

- **1190 passed / 19 skipped is what CI produces, and it is the canonical figure.** The `mobile` lane runs `flutter test --exclude-tags golden` on a runner that builds no Android or iOS artifact, so the nineteen artifact-gated assertions in `test/security/platform_hardening_test.dart` and `test/security/ios_packaged_bundle_test.dart` call `markTestSkipped` and report as skips.
- **1208 passed / 1 skipped is the same command in a working tree that already holds built artifacts** — eighteen of the nineteen then execute. Recorded because anyone running the suite locally after a build will see it, and a reader who found the two irreconcilable would be right to distrust both.
- **The nineteen are not lost in either reading.** They run on the `mobile-android` and `mobile-ios` lanes with `KARAR_VERIFY_ANDROID_ARTIFACT` / `KARAR_VERIFY_IOS_ARTIFACT` set, and **under those variables a missing artifact is a failure rather than a skip** — which is the whole point of the gate, and the correction for the defect where those assertions lived on a lane that built nothing and passed by skipping. That run is the 113 passed / 1 skipped row above.

**Platform builds executed, and what was read out of each one.** These are the artifact facts the assertions above were run against, recorded as results rather than as capabilities of the build system.

| Build | Executed result |
|---|---|
| Android LOCAL debug | Assembled |
| Android LOCAL release, unsigned | Assembled; `lintVitalRelease` passes — the check that the invalid data-extraction resource had been failing, and that no debug-only lane could have run |
| Android packaged applicationId | `com.kararfinance.app.local`, read from the built artifact |
| Android release signing | **Unsigned**, asserted as unsigned rather than debug-signed. No signing material exists in this repository, so a signature would mean the debug key had been substituted |
| iOS LOCAL / DEV / STAGING / PRODUCTION | All four built, `--no-codesign`; the **effective `CFBundleIdentifier` was read out of each packaged plist**, not out of an xcconfig or a rule |
| iOS effective identifiers, as packaged | LOCAL `com.kararfinance.app.local` · DEV `com.kararfinance.app.dev` · STAGING `com.kararfinance.app.staging` · PRODUCTION `com.kararfinance.app` |
| iOS provisioning | **No provisioning profile present in the PRODUCTION bundle**, asserted rather than assumed |

**What this does and does not establish.** It establishes that each environment's artifact carries the identifier it should, read from the packaged bundle. It does **not** establish that either application runs, that a prompt appears, that a transfer works, or that anything is distributable — no build was signed, no device was involved, and no store submission was attempted. See [Known limitations](#known-limitations).

**Every skip above is accounted for, because a skip that nobody names is how an assertion stops meaning anything.** The workspace row's twelve skipped tests and its one skipped file are the readiness and rate-limit-store suite, held behind `KARAR_INTEGRATION=1` because it stops and restarts real containers — including the regression test that proves the startup race is closed. It is not run by `pnpm test` or by `make verify`; CI sets the variable in its own step, and the 12-passed row above was produced by running it explicitly. The Flutter row's nineteen skips are the artifact-gated class, reconciled immediately above. The one skip that survives even with artifacts present, and the mobile-security row's single skip, are the same assertion in a third class again: it needs a **device**, which no lane has and no gate variable can conjure. The four skipped architecture tests are deferred by activation phase, not by failure — they turn on at phases 5 and 13.

**The runtime conformance suite is itself infrastructure-gated**: it skips when PostgreSQL and Redis are unreachable, and says so in its own harness. The 82-pair figure and the two empty ledgers are therefore claims about a run with infrastructure present, not properties a bare checkout can demonstrate.

Two structural facts about the suite that are not counts, and that a reader needs:

- **`make test` matches CI exactly**, golden exclusion included. It did not, until this phase closed the gap: the local gate ran goldens CI excludes, so the two disagreed about which tests exist.
- **The artifact assertions are gated on an environment variable that turns a missing artifact into a failure rather than a skip.** Before commit `a8710c5` the Android permission assertions lived on a lane that builds nothing, so they skipped every time — which is precisely how they were passing.
- **CI assembles a release, not only a debug APK.** `lintVitalRelease` runs on a release assembly only, and a debug-only lane certified a resource the release build rejects.

## CI and Security workflows

CI runs five jobs: the TypeScript workspace, architecture and documentation checks, and three mobile lanes. The `mobile` lane analyses, checks client drift, runs the localization gate as its own step, then runs the suite with `--exclude-tags golden`. The `mobile-android` lane builds a debug APK **and a release assembly** — the latter added once the release-only lint failure showed that a debug-only lane verifies the lenient path — drives the Gradle guard through nine refusal cases and one acceptance, verifies the merged manifest against a real build, inspects the built artifact's network policy with `aapt2`, scans the unzipped APK for credential material, and asserts the release artifact is unsigned rather than debug-signed. The `mobile-ios` lane builds for simulator and device across LOCAL, DEV, STAGING and PRODUCTION and verifies each packaged bundle's transport posture and effective bundle identifier.

Three CI gaps were closed in this phase, each of which had been making a real assertion vacuous:

- **The workspace lane started only PostgreSQL.** The rate-limiter suites do not fail when Redis is absent — they print a banner and skip, and that banner says why that is unacceptable. Every distributed rate-limiter assertion had therefore been skipped in CI since it was written. The lane now starts Redis alongside PostgreSQL, which is what makes the startup-race regression test mean anything.
- **DEV was the environment nobody built.** PRODUCTION is the one row of the identity matrix where the wrong answer and the right answer are the same string, so a lane observing only LOCAL, STAGING and PRODUCTION would not have caught every iOS artifact carrying the production identifier. DEV is now built and verified.
- **The cross-platform comparison had nowhere to run.** The Android rules name the iOS counterpart by bundle identifier, and whether that element identifies the application it claims to is a property of two artifacts built on two runners. The Android lane now publishes its merged manifest, the iOS lane fetches it, and the comparison runs there against two real artifacts rather than against a rule and itself. The cost is that the iOS lane is serialised behind the Android one.

The Security workflow adds CodeQL, secret scanning, dependency review, SBOM generation, container and IaC scanning, and a mobile supply-chain job whose **secret scan runs before Flutter is even installed**, deliberately, so a scan cannot be affected by what a package resolution pulled in.

**Not every lane gates a merge.** Required checks are recorded in [`../operations/repository-security-settings.md`](../operations/repository-security-settings.md); the mobile artifact and supply-chain lanes run without gating, which is stated here rather than left for a reader to infer, and is carried as deferred work.

## Independent-review result

**Technical review: 0 BLOCKING / 0 HIGH / 2 MEDIUM / 5 LOW.** Both MEDIUM findings were fixed inside the phase rather than deferred: the security-state platform adapter had no test constructing it, and two fail-open reintroductions survived the whole suite until nineteen tests were added; and every remediation commit carried an AI-attribution trailer against the repository's own style rule, which reaches commit messages.

The five LOW findings and their dispositions, recorded here because CI-010 makes them a precondition of this gate rather than an optional appendix:

| # | Finding | Disposition |
|---|---|---|
| L1 | Fourteen declared responses, all on the consent surface, carry no schema. The "no prose-only operation" assertion filters at operation level, so an operation with *some* schemas hides its schema-less statuses | **Deferred, not fixed.** Recorded as the conformance-coverage risk and in Known limitations; the honest figure is 82 of 128 declared pairs. Closure: extend the suite to the consent surface with the first Phase 5 response work |
| L2 | The report said "three declared statuses are not covered" — true only under a silent narrowing to the `/auth` fragment; across the contract it is 46 of 128 | **Fixed.** The report now states 82 of 128 and names the three unreachable `/auth` statuses as a subset rather than the whole |
| L3 | The local gate skips the readiness and rate-limit-store suite, including the regression test that proves the startup race is closed, because it is `KARAR_INTEGRATION`-gated | **Fixed.** Disclosed in the skip accounting and given its own row in the commands table; CI sets the variable in its own step |
| L4 | Nothing structural stopped a second controller hand-writing a problem content type; the runtime ledger reaches 82 of 128 pairs, so a divergence on the other 46 would pass | **Fixed.** A source scan holds the media type to one writer, verified by injecting the original defect's shape into a controller and watching it fail |
| L5 | The direct artifact-to-artifact identity comparison covers one environment pair in CI, not four, because the two lanes build different environment sets on different runners | **Deferred, with all five fields**, as deferred item 9 in the gate record. Per-environment iOS identity is still verified for all four against the shared rule, and that rule is held equal to the Gradle suffix table |

**A second, independent closeout review** then read the compliance corpus, the documentation and the workflows against the frozen tree and returned **1 BLOCKING / 1 HIGH / 4 MEDIUM / 1 LOW / 2 INFORMATIONAL**. The BLOCKING finding was a real CI defect and is the reason this report can be trusted on the point: the `mobile-ios` lane set the Android artifact gate variable while receiving only the merged manifest, so the generated data-extraction rules it also reads were absent and the lane would have failed the first time it ran. It was reproduced, fixed, and re-verified by simulating the lane's exact tree. The HIGH finding was a claim in this corpus that a pull request was open when none was. Every BLOCKING, HIGH and MEDIUM finding is fixed; the LOW and INFORMATIONAL findings are recorded in the gate record.

**Agent review is technical review, not organizational independence** — see Known limitations.

The review's substantive effect on this phase is recorded above rather than summarised as a count: it produced the endpoint-guard fixes (commit `4f6e4c6`), and it is the reason the Android and iOS guards now agree, the IPv6 and trailing-dot cases are refused, the guard cannot be bypassed by omitting dart-defines, and the enum-naming guards exist. **Agent review is technical review, not organizational independence.**

**Review found what review can find, and execution found the rest.** Three of this phase's defects were invisible to every form of static inspection it ran, and the pattern is worth carrying forward rather than restating as a count: an invalid hardening resource that only the release build path rejects; a navigation dead end whose every unit assertion was individually correct and whose widget test asserted only that the button existed; and a lockfile check that proved a host *appeared* rather than that it was the only one. Each passed a suite that was looking at the right file. **A phase gate that never assembles the shippable artifact, never presses the control, and never asserts exclusivity is a gate with three shapes of hole in it.**

## Security findings and dispositions

Findings raised and closed within the phase, with what each one actually was:

| Finding | Disposition |
|---|---|
| The Android build guard ran only when dart-defines were present, making a direct Gradle invocation a total bypass | **Fixed.** Absence of dart-defines is now the failure |
| Host extraction by `substringBefore(':')` made every IPv6 rule unreachable; a PRODUCTION build with `[::1]:8443` succeeded, and a source-presence test reported the rule as present | **Fixed**, and the behavioural proof moved into CI against real Gradle |
| `localhost.` defeated both the Gradle and the Dart layer | **Fixed at build time on both platforms. Open at runtime** — see Known limitations |
| iOS had no build-time endpoint guard while Android refused the same build | **Fixed.** A packaged-bundle verification build phase now applies the same rules, before signing |
| Every iOS artifact carried a localhost ATS exception | **Fixed.** The exception is added only to a Debug+LOCAL packaged bundle, validated against an exact expected value, and its removal is re-verified elsewhere |
| `allowBackup="false"` does not disable device-to-device transfer at targetSdk 31+ | **Fixed.** Data-extraction rules declare every mode and exclude every domain from each |
| A fourth, application-defined permission in the merged manifest had never been reviewed | **Reviewed and recorded**, and now asserted by shape against a real build |
| A security-critical dependency (`local_auth`) had drifted to a caret range with nothing failing | **Fixed.** Exact pins, `--enforce-lockfile` in CI, and a pinning test that also fails on nested-block bypasses |
| The lockfile check asserted that pub.dev **appeared**, not that it was the only host — an audit that redirected one package to a private mirror left the suite green, because `--enforce-lockfile` faithfully enforces whatever the lockfile says | **Fixed.** Host exclusivity and per-package checksums are both asserted |
| `data_extraction_rules.xml` was an invalid resource, so **the Android release build did not build** — and only the debug APK was ever assembled in CI | **Fixed.** The attribute was added; CI now assembles a release too and asserts the artifact is unsigned rather than debug-signed |
| The lock screen's password fallback navigated into a redirect that returned it to the lock, trapping anyone whose authenticator had failed | **Fixed.** It ends the session, so the state leaves the lock and the same redirect routes onward |
| Five backend safety properties were held by comments and by nothing executable | **Fixed.** The consent listing's `storageRef` omission, the refusal to record an unpinned consent grant, the own-membership response's closed key set, and the invitation responses' absence of the token hash are now asserted on real serialized bytes; the consent controller went from no tests to fourteen, including that its evidence reference is derived from the request identity and cannot be influenced from the body |
| Artifact assertions ran on a lane with no artifact and skipped silently | **Fixed.** Moved to the build lanes, with a gate variable that turns a missing artifact into a failure |
| The rate-limit store was never connected before the server began listening. The client is lazy and does not queue, so the first command lost the handshake and was rejected outright — every fail-closed policy (login, verification, password reset, MFA, invitations) answered 503 on the first request after boot | **Fixed.** The connection is established during composition, before `listen()`, and readiness reports the store rather than ignoring a dependency several identity controls fail closed on. The regression test is gated behind `KARAR_INTEGRATION=1` and is not run by the default local gate |
| The application lock and the session-abandonment marker were kept in the swallowing preference store, which substitutes an in-memory one when the platform store will not open — so an unopenable store read as "the lock was never turned on", and a refused enable reported success until the next cold start | **Fixed.** A dedicated fail-closed port with no in-memory fallback, loaded before the lock is evaluated; enable applies only on a confirmed durable write and a disable that cannot be confirmed retains the safer enabled state |
| Twenty-five operation/status pairs returned RFC 7807 bodies under `application/json` while the contract declared `application/problem+json`, and all seventeen `/auth` operations described their bodies in prose with no schema at all | **Fixed.** Problem documents leave through one writer; the identity surface carries full schemas; both deviation ledgers now assert empty |
| Every iOS artifact carried the production bundle identifier regardless of the environment it was compiled for, while the Android rules named that identifier as the iOS counterpart | **Fixed.** Per-environment identifiers on both platforms, derived from one rule and compared artifact to artifact |
| The synthetic consent fixture shipped inside `@karar/consent`, so the only thing keeping it out of a deployed artifact was a runtime branch inside an artifact that still contained the text | **Fixed.** The bytes live in a package outside every production dependency closure, with a closure test carrying a positive control |
| `make test` ran goldens that CI excludes, so the local gate and CI disagreed about which tests exist | **Fixed.** `make test` now matches CI; `make test-golden` runs them deliberately |
| 335 user-facing messages sat outside every localization gate | **Fixed.** Consolidated into the ARB catalogues |
| The product had two Arabic names, one of them the legacy system's | **Fixed**, with a test that holds the catalogue and the iOS purpose string together |
| The generator emitted invalid Dart for a wire value containing a slash | **Fixed**, with three additional guards against the class of defect |

## SOC 2 mapping

Deferred to the [control matrix](../compliance/control-matrix.md), which the compliance workstream updates for Phase 4 in parallel with this report — mapping is readiness work; **no SOC 2 attestation is claimed and no examination has been performed.**

## ISO mapping

As above: authoritative control IDs live in the [control matrix](../compliance/control-matrix.md); **no ISO/IEC 27001 certification is held, claimed, or sought at this stage.**

## Evidence

**EV-431 through EV-466** — 36 rows, reconciled against the executed runs, each carrying its CODE / RUNTIME / ARTIFACT / INFRASTRUCTURE / ABSENT label in the [evidence register](../compliance/evidence-register.md). **32 are COLLECTED and 4 are PENDING**, and the four say what did not happen rather than carrying a bare status: EV-461 the independent closeout review, EV-463 the PR CI run, EV-464 the PR Security run, EV-465 the code-scanning suppression review. **EV-427 is not in this range and is not closed by it** — the domain and DNS record reaches at this gate the deadline the Phase 3.5 record set for it, with all seven runbook rows still `TO_VERIFY`.

Three labelling notes that belong with the evidence rather than in it, because each is a place where a label one step too strong would misrepresent what was seen.

- The Android and iOS artifact assertions produce **ARTIFACT** evidence — a real build output was read: a merged manifest, an unzipped APK, a packaged bundle and its plist. That is stronger than reading source and **weaker than observing a device**, and it is narrower than RUNTIME rather than a synonym for it.
- The biometric prompt has **ABSENT** runtime evidence. Nothing was executed on a device, on either platform.
- The runtime conformance figures are **RUNTIME** evidence conditional on infrastructure: the suite skips when PostgreSQL and Redis are unreachable and says so in its own harness, so the 82 pairs and the two empty ledgers describe a run with infrastructure present, not a property a bare checkout can demonstrate.

## Known limitations

- **The abandoned-credential guarantee is local-only, and that is a boundary rather than an omission.** When a session is abandoned but neither the credential deletion nor the durable invalidation can be confirmed, the application refuses to present a clean signed-in or signed-out state: it enters a typed blocked recovery state, offers retry, and reaches no protected content. What it cannot do is guarantee the credential is dead, because nothing local can — a device whose secure store refuses both deletion and durable invalidation can only be made safe by revoking the session server-side. The implementation holds an in-process latch so the credential cannot be used for the remainder of the process, and stays blocked rather than claiming success. Server-side revocation on abandonment is the closure, and it is not in this phase.
- **The direct artifact-to-artifact identity comparison covers one environment pair in CI, not four.** The comparison runs only where both platforms built the same environment, and the two lanes do not build the same set: the Android lane produces LOCAL and PRODUCTION, and by the time the comparison step runs the iOS simulator path holds the last environment it built. Per-environment iOS identity *is* verified for all four against the shared rule, and that rule is asserted character-for-character equal to the Gradle suffix table, so the chain holds transitively — but only one pair is checked artifact against artifact. Building all four Android variants on the macOS lane would close it, at the cost of a full Android toolchain on the expensive runner.
- **The cross-platform transfer path is configured but has never been exercised on a device.** The Android and iOS identifiers now agree per environment and are compared artifact to artifact in CI for the environment pair described above. Naming the *owner* of those identifiers still requires a real Apple Team ID, which does not exist, is not invented, and is not committed; every deployed assembly refuses without one. No supported-device export/import test has been run.
- **The biometric prompt has not been verified at runtime on any device, of any kind.** Not on a real Android API 27 device, where the AppCompat theme requirement actually bites; not on a modern Android device, where the framework's own prompt takes over and the code path is therefore *different*; and not on any iOS device, so Face ID has never been invoked. What exists is static, compile-time and artifact verification: the plugin is pinned, the adapter's failure mapping is unit-tested against scripted outcomes, the host activity type and theme parents are asserted by source scan, the merged manifest's biometric permissions are asserted against a real build, and the Face ID purpose string is asserted present and non-empty in the packaged bundle. **None of that proves a prompt appears, on either platform, at any API level.** The application lock is the control that gates a cold start, so the gap is between a mechanism that is fully assembled and a mechanism that has been seen to work.
- **No signed device build has been performed, and no signing material exists in the repository.** iOS builds used `--no-codesign`; the absence of a development team and provisioning profile is itself asserted by test. The Android release configuration has no debug-key fallback, so an unsigned release fails rather than shipping under a debug key.
- **The golden baselines are not CI-enforced and have never run on Linux.** Four baselines, two design-system compositions in two locales, light mode only, rasterised on macOS arm64 under a zero-tolerance comparator. Two in-repo comments contradict each other about whether a Linux runner would fail, and neither has been tested. Full record in [`../architecture/flutter.md` §5](../architecture/flutter.md).
- **Runtime response conformance covers the mobile-consumed surface, not the whole contract.** A suite now drives the composed application and validates real serialized responses and their media types against the OpenAPI document, across 82 operation/status pairs, and both former deviation ledgers assert empty. Coverage is 82 of the 128 declared operation/status pairs, and the 46 that are uncovered are not all of one kind — most are simply outside the mobile-consumed surface this suite was scoped to, and the suite's own header enumerates them. Within the seventeen `/auth` operations the suite does cover, exactly three declared statuses are **not** reachable in process rather than skipped, and the suite header records why: `identityVerifyEmail 200` and `identityResetPassword 200` need a code that is stored as a digest and delivered only by e-mail, and `identityForgotPassword 503` would require failing the shared rate-limit store underneath every other test in the run. The contract validator implements a deliberate subset of JSON Schema and **throws** on any keyword it does not implement, so a schema cannot silently pass unchecked.
- **No legal-document content exists in any deployed environment, and the LOCAL fixture is not a legal document.** A deployed build has no copy of the fixture at all — it lives in a package outside every production dependency closure — so the endpoint reports unavailability rather than serving invented text. The LOCAL and TEST path exists to exercise read-and-accept end to end. No PolicyPack is approved, no capability is cleared, and nothing here has been reviewed by counsel or a regulator.
- **`localhost.`, the expanded IPv6 loopback, `0.0.0.0`, and the `.internal` and `.test` suffixes still pass the Dart runtime configuration loader.** Its loopback rule is exact string equality over four hosts plus two suffixes, and it was not widened when the build-time guards were. The practical exposure is bounded — a package carrying such an endpoint cannot be built for a deployed environment, because the build-time guard refuses it on both platforms — but the two layers now disagree, and the narrower one is the one that runs on a device. Closing it is a loader change plus the matching test cases.
- **The design system's `ThemeData` is not wired into the running application.** The light and dark theme providers resolve to null and nothing overrides them, so `MaterialApp` receives Flutter's default `ThemeData`. Component-level tokens still resolve — the context extension falls back to resolving them directly, so colours, spacing and typography are Karar's — but scaffold background, colour scheme, dividers and snackbars are framework defaults, and the locale-aware typography scope never runs outside tests.
- **`KararLocalization.resolve` has no production call site.** The deterministic English fallback is proven by test; the shipped shell uses the framework's own locale resolution.
- **Four of the fourteen startup states render an unbranded placeholder.** `CONFIG_LOADING`, `SESSION_RESTORING` and `BOOTSTRAP_LOADING` show a progress indicator; `CONFIG_INVALID` shows raw enum text with no action, because its recovery is deliberately not something the application can perform.
- **No widget is ever rendered in dark mode.** The dark palette is verified as colour arithmetic — contrast ratios and token resolution — and never as a rendered tree.
- **The capability navigation set is empty, so no capability is navigable.** This is correct rather than incomplete: nothing is implemented. The consequence is that the resolved-and-non-empty path is exercised only against synthetic fixtures.
- **The jurisdiction reference list is empty in the client.** The `GET /jurisdiction/declarable-references` endpoint was added to the contract in this phase, but the client provider still returns a constant empty list, so the declaration screen always shows its unavailable notice and never offers a control. The server-side path, its shared predicate and its 503-not-empty-list behaviour are complete; the client does not yet consume them.
- **No offline cache exists.** Every read goes to the API.
- **No screenshot or screen-recording prevention.** The sensitive-screen wrapper covers its subtree on backgrounding and states its own limit: `FLAG_SECURE` and the iOS equivalent are not implemented.
- **`requestId` is not populated in the composed application.** The bootstrap and jurisdiction problem documents can carry it, and the tests exercise it, but the wired principal adapter does not set it — so correlation on those problem bodies currently relies on the client's own correlation id.
- **Single maintainer.** Every workstream role resolves to one person; independent review is a role, not yet a separate party.

## Accepted and deferred risks

Carried with named owners; register entries are maintained by the compliance workstream in the [risk register](../compliance/risk-register.md).

| Risk or deferral | Owner | Target |
|---|---|---|
| Biometric behaviour unproven on real hardware, particularly API 24–27 where the AppCompat requirement applies | Security Owner | First device-testing pass |
| No signed build and no signing material; store distribution untested end to end | Engineering Owner | Pre-release phase |
| Golden baselines unenforced and of unknown cross-platform behaviour | Engineering Owner | The first CI job that runs Flutter tests on Linux |
| Runtime conformance covers 82 of 128 declared operation/status pairs; the consent surface and several tenancy operations are not yet bound | Backend workstream | Phase 5, alongside the first substantial response surface |
| The Dart runtime loopback rule is narrower than the build-time rule | Security Owner | Next mobile change |
| Mobile artifact and supply-chain CI lanes run without gating merge | Engineering Owner | Next branch-protection review |
| Certificate pinning deliberately absent (challenge C11, carried from Plan v1) | Platform | Recorded acceptance, unchanged |
| Design-system `ThemeData` and the locale resolver not wired into the shell | Client-shell workstream | Next mobile change |
| Single-maintainer bus factor across all roles (carried from Phases 1–3.5) | Maintainer | Structural |

Deferred to later phases: capability-scoped client narrowing (Phase 11 with flavours); the offline read cache; screen-capture prevention; the operator surfaces that would let a jurisdiction be assigned or a pack activated without the local seed (Phase 8); and legal-document content, which is a legal deliverable rather than an engineering one.

## Documentation updated

Per the [phase-end ritual](README.md):

- Root [`../../README.md`](../../README.md) — status block, the mobile row of the container table, the testing section, and the roadmap paragraph.
- [`../roadmap.md`](../roadmap.md) — the Phase 4 row.
- [`README.md`](README.md) — the Phase 4 row of the report index.
- This report.
- [`../architecture/flutter.md`](../architecture/flutter.md) — brought to landed state: structure, capability-aware navigation and the startup state machine, the RTL enforcement table corrected to what is actually enforced, a new golden-baseline section, storage and application lock, the generated SDK and network layer, environment profiles and the build guards, state management, and dependency governance.
- [`../architecture/overview.md`](../architecture/overview.md), [`backend.md`](../architecture/backend.md), [`tenancy.md`](../architecture/tenancy.md), [`capability-registry.md`](../architecture/capability-registry.md), [`operating-entity.md`](../architecture/operating-entity.md) — updated where Phase 4 made them stale.
- [`../security/access-control.md`](../security/access-control.md), [`secrets.md`](../security/secrets.md), [`threat-model.md`](../security/threat-model.md) — the Phase 4 client surface and its threats.
- [`../onboarding/developer.md`](../onboarding/developer.md) and the new [`../onboarding/flutter.md`](../onboarding/flutter.md).
- [`../glossary.md`](../glossary.md) — Phase 4 terms.
- [`../../apps/mobile/README.md`](../../apps/mobile/README.md) and [`../../apps/mobile/lib/README.md`](../../apps/mobile/lib/README.md).
- [`../operations/domain-and-dns-runbook.md`](../operations/domain-and-dns-runbook.md) — re-read at the gate; nothing about DNS or hosting changed.
- [`../compliance/evidence-register.md`](../compliance/evidence-register.md), the control matrix, and the risk register — compliance workstream, parallel to this report.

## Phase 5 entry criteria

**Phase 5 has not started, and none of the criteria below is a statement that it is about to.** Phase 5 (financial data platform: institutions, connectors, accounts, transactions, normalization, dedup, provenance, categorization — [roadmap row 5](../roadmap.md)) may start when:

- The Phase 4 PR is merged to `main` with required checks green. CI and Security are green on the PR head and the required set now stands at ten, but **the branch is not merged today**, so this criterion is open.
- The Phase 4 compliance gate is passed per [`../compliance/phase-compliance-gate.md`](../compliance/phase-compliance-gate.md).
- The three response-shape changes are understood as **breaking**: `operatingEntity` and `capabilities` on the bootstrap response are discriminated shapes, and `storageRef` is gone from the document listing. Any consumer written against Phase 3.5 needs updating, and the generated client is regenerated rather than patched.
- It is understood that the client renders nothing it cannot attribute to a platform response. Phase 5's first screen must arrive with the endpoint that feeds it; a screen with a fixture behind it is the specific failure the legacy audit documented and this phase was built to prevent.
- The capability navigation set is understood as the gate: a Phase 5 capability becomes reachable in the client by being implemented, deployed, and *then* added to the navigable set — not by adding it to the set first.
- The runtime conformance suite is extended to the first substantial Phase 5 response surface as that surface is written, rather than after. The approach now exists and covers 82 of 128 declared pairs; what must not happen is a new surface landing outside it.

## Scope confirmation — no Phase 5 feature was implemented

Stated explicitly because the client is the surface where a fabricated figure would appear.

**No financial capability exists in any layer.** There is no account, transaction, institution, connector, balance, budget, goal, insight, score, category, merchant, sync state, or monetary value anywhere in `apps/mobile/lib` — not in a screen, not in a fixture, not in a test. The client's authenticated home is an account and security state: services (empty), profile, session, organisation, jurisdiction, legal context, consent, settings. The empty-services state says the platform confirmed nothing is enabled, which is the truth.

No AI, Zakat, Amanat, subscription, billing, white-label flavour, or Super Admin surface was created. No cloud resource, DNS record, or deployment environment was created or configured. Every capability in the registry remains `NOT_IMPLEMENTED` and deployed nowhere; no jurisdiction is approved and no PolicyPack is approved. No legacy Qarar code was copied.
