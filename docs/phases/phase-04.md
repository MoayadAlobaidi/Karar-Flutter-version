# Phase 4 — Flutter and mobile security foundation

**Branch:** `claude/karar-v2-phase-4-flutter-foundation` · **Started:** 16 August 2026 · **Status:** IN PROGRESS
**Base:** Phase 3.5 merge commit `e23bbc8` on `main`.

**This phase is NOT complete, and this report is not a closeout record.** The body below describes what has been built and verified so far; every closeout field is still an unfilled `<<LEAD-FILLS>>` placeholder, the compliance and evidence records do not exist, no clean-clone verification has been run, no pull request has been opened, no CI run exists against a Phase 4 PR head, the independent review is not final, and release-blocking defects were still being corrected when this line was written. Do not read any statement here as a completion claim.

**What "COMPLETE" will mean when it is eventually claimed.** It will mean the phase's deliverables exist in this repository, its own gates passed, and its verification commands were executed. It does **not** mean merged, deployed, production ready, app-store ready, signed, certified, or legally reviewed. No environment is provisioned, no endpoint exists, no signed build has been produced, and no capability is available to anyone. Where a claim rests on static or artifact inspection rather than on a device, this report says so.

Verification sections are filled by the phase lead after running the commands — they record executed results, never intentions.

## Close-out record

- **Completion date:** <<LEAD-FILLS>>.
- **Final branch:** `claude/karar-v2-phase-4-flutter-foundation`, merged into `main` through PR <<LEAD-FILLS>> (merge reference <<LEAD-FILLS>>).
- **Final implementation head:** <<LEAD-FILLS>> — the last commit before the documentation-only close-out commit that completes this report.
- **CI and Security runs:** <<LEAD-FILLS>> (CI run URL, Security run URL, and the count of checks green at the close-out head).
- **Final canonical counts:** <<LEAD-FILLS>> (workspace suite, Flutter suite, architecture tests and self-test, documentation checks, Prisma drift, migration and table totals, merged OpenAPI paths).
- **Clean-clone verification:** <<LEAD-FILLS>>.
- **Security-suppression review:** <<LEAD-FILLS>>.
- **Compliance gate:** recorded in [`../compliance/phase-compliance-gate.md`](../compliance/phase-compliance-gate.md) with its outcome and every deferred item's reason, owner, target, residual risk, and closure condition.
- **Evidence:** <<LEAD-FILLS>> (evidence range reconciled against the executed runs).
- **Independent review:** <<LEAD-FILLS>> (finding counts by severity, and their disposition). Agent review is technical review, not organizational independence.
- **Carried risks and limitations:** the biometric prompt has not been exercised on any real device; no signed build exists and no signing material is in the repository; the golden baselines are not CI-enforced and have never run on Linux; no test binds server responses to the OpenAPI contract; and no legal-document content exists anywhere in the platform. All are stated in full below.
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
| Flutter CI lanes: analysis, drift, localization, suite, Android artifact assertions, iOS packaged-bundle assertions across three environments | `.github/workflows/ci.yml`, `.github/workflows/security.yml` |

## Architecture changes

**None to the approved architecture.** ADR-0007 and ADR-0009 are implemented as written, and ADR-0016's client-exposure rule is consumed rather than reinterpreted. Decisions made within the architecture, recorded explicitly:

1. **The startup decision lives in exactly one place.** A coordinator owns twelve states; the router carries one redirect driven by it; a feature registers a screen for a state but never decides which state holds. A second redirect is the specific bug the coordinator exists to prevent, and adding one is a review failure rather than a style preference.
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

**The legal-document content endpoint is wired to a source that always refuses.** `NoContentSourceConfigured` returns null for every version, so the endpoint answers 409 `DOCUMENT_CONTENT_UNAVAILABLE` with reason `NOT_RETRIEVABLE`. 409 rather than 404 is the point: the document exists and consent is still owed; only the wording is unavailable. Two further honesty properties hold on that endpoint — an unknown document and another entity's document get **byte-identical** answers, so the catalogue is not an oracle; and retrieved content whose SHA-256 does not match the published version is a 503 with nothing served.

## Flutter architecture

Feature-first Clean Architecture, documented as an enforced contract in [`apps/mobile/lib/README.md`](../../apps/mobile/lib/README.md) and mapped in [`../architecture/flutter.md` §3](../architecture/flutter.md).

Ten feature folders, each `domain/ data/ presentation/`, dependencies pointing inward only. **Every one of them is account, identity, or platform state** — there is no feature folder for a product capability, because no product capability exists. Domain purity is scanned rather than reviewed: a file under `features/*/domain/` may not import Flutter, Riverpod, go_router, dio, secure storage, biometric plugins, the generated DTOs, `dart:convert`/`dart:io`/`dart:ui`, or any analytics or fingerprinting package.

Riverpod is the only composition mechanism — no service locator, no static singleton, no global mutable instance. Three provider shapes are used and no others, and exactly one `ChangeNotifier` exists, as the bridge that lets the router listen to the startup coordinator while the coordinator stays pure Dart.

Failures are values, never exceptions: a sealed `Failure` with 22 arms paired with `Result`, so a `switch` is exhaustiveness-checked. `ApiException` exists only inside the data layer, and repository implementations map `FormatException` and `TypeError` into a contract-violation failure — not optional, because a payload the decoder cannot classify must degrade the client rather than crash it.

## Startup state machine

Twelve states, each mapping to one route and declaring one recovery action: `CONFIG_LOADING`, `CONFIG_INVALID`, `APP_LOCKED`, `SESSION_RESTORING`, `UNAUTHENTICATED`, `SESSION_EXPIRED`, `MFA_CHALLENGE_REQUIRED`, `EMAIL_VERIFICATION_REQUIRED`, `TENANT_SELECTION_REQUIRED`, `BOOTSTRAP_LOADING`, `BOOTSTRAP_UNAVAILABLE`, `READY`. **Protected content renders in `READY` and nowhere else.**

The order is what makes it fail closed, and each step is terminal for the ones after it. Configuration is validated first, and an invalid build stops there rather than proceeding to a sign-in screen it cannot serve. The application lock is checked before any token is read. Session restore precedes bootstrap, and **a secure-storage failure during restore is treated as unauthenticated, never as an empty store**. Within a successful bootstrap: email verification, then tenant binding, then capability resolution, then operating-entity state — so nobody is asked to choose a tenant before their address is verified, and a degraded dependency never presents itself as a working home screen.

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

## App lock and biometrics

`local_auth` is reached through one adapter. No biometric template, image, or derived representation is received, stored, or transmitted; no custom biometric cryptography exists; **an unlock grants no session and never substitutes for signing in.** The failure mapping is fail-closed, including its default arm, because the plugin's error list is explicitly open and an unseen code must not read as success.

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

**No legal-document content exists anywhere in the platform.** The endpoint is wired to a source that refuses, and the client renders the localized "not available" notice rather than composing substitute wording. A document with no effective version draws no acceptance control at all. This is the honest state: inventing terms of service would be worse than admitting there are none.

## Design system

Tokens for colour, typography, spacing, radii, sizing, elevation and motion, resolved in one place from a brand, a brightness and a locale. One brand configuration ships — `karar` — with light and dark palettes and a **deliberately null wordmark**: no logo or marketing identity is invented, and no placeholder art is committed. A white-label partner supplies values only; there is no hook for partner-specific widgets, and flavour wiring is Phase 11.

Fourteen components sit on one interactive primitive whose `semanticLabel` is a **required, non-nullable** parameter — a control a screen reader cannot name is unusable — and which republishes its tap and long-press semantics because the underlying ink well's are excluded, so assistive technology gets a button it can actually activate.

Typography is script-aware rather than merely direction-aware: Arabic drops letter spacing, because tracking a cursive script is a defect, and carries extra leading.

The 48px minimum tap target is defined once and expressed as a *minimum constraint* rather than a fixed height, so a control grows under a raised text scale instead of clipping its label.

## Arabic and RTL

**Direction is never set by hand.** It flows from the locale through the framework, and the test harness deliberately refuses to accept a text direction — which is the only way a test proves that Arabic produces an RTL tree rather than proving the author remembered to ask for one. The one place a direction is computed is a bidi text component that resolves paragraph direction from the first strong character of *server-supplied* content, so a legal document or a display name renders in its own direction rather than the interface's.

Icon mirroring is a curated list rather than a wrapper: every member declares `matchTextDirection`, membership is asserted by test, and an icon that merely looks directional is deliberately excluded because the framework does not mirror it.

**The consolidation.** Six per-feature Dart string catalogues held **335 user-facing messages** — every one of them outside the ARB parity gate, the description gate, the placeholder gate, and the plural gate. They were deleted and their contents moved into the ARB files, taking each catalogue from **62 to 395 keys per language**. Parity is now exact in both directions, every English message carries a translator description, placeholders match, and any message that is plural in English must be plural in Arabic with the `few`, `many` and `other` arms present — Arabic has six plural categories, and a single form is wrong for most counts.

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

CI exercises this on three lanes: a LOCAL simulator build whose packaged bundle is verified to carry the exception, and STAGING and PRODUCTION builds whose packaged bundles are verified to carry none. It also asserts that a deployed build with no endpoint is refused, and that no code signing was involved.

## Environment and build profiles

Four profiles compiled in as dart-defines. An unrecognised environment stops the build rather than quietly becoming LOCAL. **The client holds no secret**: a define whose *name* looks credential-shaped is a configuration violation reported by key name, never by value.

The runtime loader reports every violation at once rather than the first, and an invalid configuration routes the launch to a configuration-error screen rather than a sign-in screen it could not serve.

**No endpoint exists for any environment, so the only packages this repository can build today are LOCAL ones.** That is not a gap in the guards; it is what the guards produce in the absence of infrastructure.

## Dependency decisions

Every direct non-SDK dependency of the mobile pubspec carries an **exact version — no caret, no range** — with the committed lockfile beside it. A range would not be a weaker rule but its absence: a republished upstream could change what builds without changing what was reviewed.

The rule is asserted rather than reviewed. The pinning test fails on any inexact constraint; on any nested-block dependency (`git:`, `path:`, `hosted:`) that is not one of the three SDK-sourced entries — the bypass an exact-version regex alone would miss; on a missing `flutter_secure_storage`, `local_auth`, `dio`, `go_router`, or `flutter_riverpod`, each named individually so *removing* one is also a failure; on any `dependency_overrides` section; and on a lockfile that does not record hosted sources with checksums. It opens with a guard that the parser found dependencies at all, so a parsing regression cannot make the rest vacuous. The regression that motivated it was real: `local_auth` had drifted to a caret range with nothing failing.

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
| Architecture tests | `pnpm arch:test` |
| Documentation checks | `pnpm docs:check` |
| Prisma drift | `make prisma-drift` |
| Full local gate | `make verify` |

**Canonical counts:** <<LEAD-FILLS>> — workspace passed/skipped across files; Flutter passed/skipped; architecture passed/failed/skipped with registry errors and self-test; documentation checks; Prisma mapped-table match; migration and table totals; merged OpenAPI path count.

Two structural facts about the suite that are not counts, and that a reader needs:

- **`make test` matches CI exactly**, golden exclusion included. It did not, until this phase closed the gap: the local gate ran goldens CI excludes, so the two disagreed about which tests exist.
- **The artifact assertions are gated on an environment variable that turns a missing artifact into a failure rather than a skip.** Before commit `a8710c5` the Android permission assertions lived on a lane that builds nothing, so they skipped every time — which is precisely how they were passing.
- **CI assembles a release, not only a debug APK.** `lintVitalRelease` runs on a release assembly only, and a debug-only lane certified a resource the release build rejects.

## CI and Security workflows

CI runs five jobs: the TypeScript workspace, architecture and documentation checks, and three mobile lanes. The `mobile` lane analyses, checks client drift, runs the localization gate as its own step, then runs the suite with `--exclude-tags golden`. The `mobile-android` lane builds a debug APK **and a release assembly** — the latter added once the release-only lint failure showed that a debug-only lane verifies the lenient path — drives the Gradle guard through nine refusal cases and one acceptance, verifies the merged manifest against a real build, inspects the built artifact's network policy with `aapt2`, scans the unzipped APK for credential material, and asserts the release artifact is unsigned rather than debug-signed. The `mobile-ios` lane builds for simulator and device across LOCAL, STAGING and PRODUCTION and verifies each packaged bundle's transport posture.

The Security workflow adds CodeQL, secret scanning, dependency review, SBOM generation, container and IaC scanning, and a mobile supply-chain job whose **secret scan runs before Flutter is even installed**, deliberately, so a scan cannot be affected by what a package resolution pulled in.

**Not every lane gates a merge.** Required checks are recorded in [`../operations/repository-security-settings.md`](../operations/repository-security-settings.md); the mobile artifact and supply-chain lanes run without gating, which is stated here rather than left for a reader to infer, and is carried as deferred work.

## Independent-review result

<<LEAD-FILLS>> — findings by severity and their disposition.

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
| `make test` ran goldens that CI excludes, so the local gate and CI disagreed about which tests exist | **Fixed.** `make test` now matches CI; `make test-golden` runs them deliberately |
| 335 user-facing messages sat outside every localization gate | **Fixed.** Consolidated into the ARB catalogues |
| The product had two Arabic names, one of them the legacy system's | **Fixed**, with a test that holds the catalogue and the iOS purpose string together |
| The generator emitted invalid Dart for a wire value containing a slash | **Fixed**, with three additional guards against the class of defect |

## SOC 2 mapping

Deferred to the [control matrix](../compliance/control-matrix.md), which the compliance workstream updates for Phase 4 in parallel with this report — mapping is readiness work; **no SOC 2 attestation is claimed and no examination has been performed.**

## ISO mapping

As above: authoritative control IDs live in the [control matrix](../compliance/control-matrix.md); **no ISO/IEC 27001 certification is held, claimed, or sought at this stage.**

## Evidence

<<LEAD-FILLS>> — the evidence range for this phase, reconciled against the executed runs, each row carrying its CODE / RUNTIME / INFRASTRUCTURE / ABSENT label in the [evidence register](../compliance/evidence-register.md).

Two labelling notes that belong with the evidence rather than in it. The Android and iOS artifact assertions produce **RUNTIME** evidence about a *built artifact*, not about a running application on a device. And the biometric prompt has **ABSENT** runtime evidence: nothing was executed on a device.

## Known limitations

- **The biometric prompt has not been verified at runtime on any device.** Not on a real Android API 27 device, where the AppCompat requirement actually bites, and not on any iOS device. What exists is static, compile-time and artifact verification: the plugin is pinned, the adapter's failure mapping is unit-tested against scripted outcomes, the host activity type and theme parents are asserted by source scan, the merged manifest's biometric permissions are asserted against a real build, and the Face ID purpose string is asserted present and non-empty in the packaged bundle. **None of that proves a prompt appears.**
- **No signed device build has been performed, and no signing material exists in the repository.** iOS builds used `--no-codesign`; the absence of a development team and provisioning profile is itself asserted by test. The Android release configuration has no debug-key fallback, so an unsigned release fails rather than shipping under a debug key.
- **The golden baselines are not CI-enforced and have never run on Linux.** Four baselines, two design-system compositions in two locales, light mode only, rasterised on macOS arm64 under a zero-tolerance comparator. Two in-repo comments contradict each other about whether a Linux runner would fail, and neither has been tested. Full record in [`../architecture/flutter.md` §5](../architecture/flutter.md).
- **No test binds server responses to the OpenAPI contract.** The drift check proves the committed Dart client matches the contract; nothing proves the NestJS application's actual responses do. A server that drifts from its own contract would be caught by a client integration failure, not by a gate.
- **No legal-document content exists anywhere in the platform.** The content endpoint is wired to a source that refuses, so it reports unavailability rather than serving invented text, and the client renders a localized notice rather than composing substitute wording.
- **`localhost.`, the expanded IPv6 loopback, `0.0.0.0`, and the `.internal` and `.test` suffixes still pass the Dart runtime configuration loader.** Its loopback rule is exact string equality over four hosts plus two suffixes, and it was not widened when the build-time guards were. The practical exposure is bounded — a package carrying such an endpoint cannot be built for a deployed environment, because the build-time guard refuses it on both platforms — but the two layers now disagree, and the narrower one is the one that runs on a device. Closing it is a loader change plus the matching test cases.
- **The design system's `ThemeData` is not wired into the running application.** The light and dark theme providers resolve to null and nothing overrides them, so `MaterialApp` receives Flutter's default `ThemeData`. Component-level tokens still resolve — the context extension falls back to resolving them directly, so colours, spacing and typography are Karar's — but scaffold background, colour scheme, dividers and snackbars are framework defaults, and the locale-aware typography scope never runs outside tests.
- **`KararLocalization.resolve` has no production call site.** The deterministic English fallback is proven by test; the shipped shell uses the framework's own locale resolution.
- **Four of the twelve startup states render an unbranded placeholder.** `CONFIG_LOADING`, `SESSION_RESTORING` and `BOOTSTRAP_LOADING` show a progress indicator; `CONFIG_INVALID` shows raw enum text with no action, because its recovery is deliberately not something the application can perform.
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
| No server-to-contract conformance test | Backend workstream | Phase 5, alongside the first substantial response surface |
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

Phase 5 (financial data platform: institutions, connectors, accounts, transactions, normalization, dedup, provenance, categorization — [roadmap row 5](../roadmap.md)) may start when:

- The Phase 4 PR is merged to `main` with required CI checks green, and this report's verification sections are filled.
- The Phase 4 compliance gate is passed per [`../compliance/phase-compliance-gate.md`](../compliance/phase-compliance-gate.md).
- The three response-shape changes are understood as **breaking**: `operatingEntity` and `capabilities` on the bootstrap response are discriminated shapes, and `storageRef` is gone from the document listing. Any consumer written against Phase 3.5 needs updating, and the generated client is regenerated rather than patched.
- It is understood that the client renders nothing it cannot attribute to a platform response. Phase 5's first screen must arrive with the endpoint that feeds it; a screen with a fixture behind it is the specific failure the legacy audit documented and this phase was built to prevent.
- The capability navigation set is understood as the gate: a Phase 5 capability becomes reachable in the client by being implemented, deployed, and *then* added to the navigable set — not by adding it to the set first.
- A server-to-contract conformance approach is decided before the first substantial Phase 5 response surface, so the gap this phase carried does not widen.

## Scope confirmation — no Phase 5 feature was implemented

Stated explicitly because the client is the surface where a fabricated figure would appear.

**No financial capability exists in any layer.** There is no account, transaction, institution, connector, balance, budget, goal, insight, score, category, merchant, sync state, or monetary value anywhere in `apps/mobile/lib` — not in a screen, not in a fixture, not in a test. The client's authenticated home is an account and security state: services (empty), profile, session, organisation, jurisdiction, legal context, consent, settings. The empty-services state says the platform confirmed nothing is enabled, which is the truth.

No AI, Zakat, Amanat, subscription, billing, white-label flavour, or Super Admin surface was created. No cloud resource, DNS record, or deployment environment was created or configured. Every capability in the registry remains `NOT_IMPLEMENTED` and deployed nowhere; no jurisdiction is approved and no PolicyPack is approved. No legacy Qarar code was copied.
